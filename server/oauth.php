<?php
declare(strict_types=1);
const KHOSRA_AUTH_REVISION='2026-11-02b';
function oauthOriginAllowed(array $config,string $path,string $method,?string $origin,bool $discovery=false):bool{
 if($origin===null||$origin===$config['origin'])return true;
 if($path==='oauth/authorize'&&$method==='GET')return true;
 $machine=$path==='mcp'||in_array($path,['oauth/register','oauth/token','oauth/revoke'],true)||($discovery&&$method==='GET');
 $allowed=$config['oauth_client_origins']??['https://chatgpt.com','https://chat.openai.com'];
 return $machine&&is_array($allowed)&&in_array($origin,$allowed,true);
}
function oauthBearer(array $server):?string{
 foreach(['HTTP_AUTHORIZATION','REDIRECT_HTTP_AUTHORIZATION','REDIRECT_REDIRECT_HTTP_AUTHORIZATION'] as $key){
  $value=$server[$key]??'';if(!is_string($value)||trim($value)==='')continue;
  return strlen($value)<=4096&&preg_match('/^[ \t]*Bearer[ \t]+([A-Za-z0-9._~+\/-]+=*)[ \t]*$/iD',$value,$m)?$m[1]:null;
 }
 return null;
}
/** Logs contain only fixed categories and a random correlation ID, never request values. */
function oauthFailureDiagnostic(string $path,int $status,string $message):string{
 $message=strtolower($message);
 $reason=match(true){
  $message==='origin is not allowed.'=>'origin_not_allowed',
  str_contains($message,'already used')=>'refresh_already_used',
  str_contains($message,'retry parameters')=>'refresh_retry_changed',
  str_contains($message,'replacement')=>'refresh_replacement_unavailable',
  str_contains($message,'revoked')=>'connection_revoked',
  str_contains($message,'refresh')&&str_contains($message,'expired')=>'refresh_expired',
  str_contains($message,'refresh')&&str_contains($message,'client')=>'refresh_client_mismatch',
  str_contains($message,'resource')=>'audience_mismatch',
  str_contains($message,'scope')=>'scope_not_granted',
  str_contains($message,'refresh')=>'invalid_refresh_grant',
  str_contains($message,'expired')=>'access_expired',
  str_contains($message,'unknown')=>'access_unknown',
  $status===429=>'rate_limited',
  $status>=500=>'server_failure',
  default=>'invalid_auth_request',
 };
 $id=bin2hex(random_bytes(8));
 $endpoint=in_array($path,['mcp','oauth/token','oauth/authorize','oauth/register','oauth/revoke'],true)?$path:'discovery';
 if($path!=='mcp'||($GLOBALS['khosra_mcp_diagnostics_enabled']??true))try{@error_log('[Khosra auth '.KHOSRA_AUTH_REVISION.'] request='.$id.' endpoint='.$endpoint.' status='.$status.' reason='.$reason);}catch(Throwable){}
 return $id;
}
function oauthResource(array $config):string{return rtrim($config['origin'],'/').'/api/mcp';}
function oauthChallenge(array $config,bool $invalid=false):string{return 'Bearer resource_metadata="'.rtrim($config['origin'],'/').'/.well-known/oauth-protected-resource", scope="manuscript.read manuscript.propose"'.($invalid?', error="invalid_token", error_description="The access token is expired or invalid."':'');}
function throttle(PDO $db,string $bucket,int $limit):void{throttleIdentity($db,hash('sha256',$bucket.':'.($_SERVER['REMOTE_ADDR']??'unknown')),$limit,'Too many attempts. Try again in 15 minutes.');}
function oauthMetadata(array $config,string $kind):array{$origin=rtrim($config['origin'],'/');if($kind==='oauth-protected-resource')return ['resource'=>oauthResource($config),'authorization_servers'=>[$origin],'scopes_supported'=>['manuscript.read','manuscript.propose'],'bearer_methods_supported'=>['header']];return ['khosra_auth_revision'=>KHOSRA_AUTH_REVISION,'issuer'=>$origin,'authorization_endpoint'=>$origin.'/api/oauth/authorize','token_endpoint'=>$origin.'/api/oauth/token','registration_endpoint'=>$origin.'/api/oauth/register','revocation_endpoint'=>$origin.'/api/oauth/revoke','response_types_supported'=>['code'],'grant_types_supported'=>['authorization_code','refresh_token'],'token_endpoint_auth_methods_supported'=>['none'],'code_challenge_methods_supported'=>['S256'],'scopes_supported'=>['manuscript.read','manuscript.propose'],'authorization_response_iss_parameter_supported'=>true];}
function allowedRedirect(array $config,string $uri):bool{return in_array($uri,$config['oauth_redirect_allowlist']??['https://chatgpt.com/connector_platform_oauth_redirect'],true);}
function issueTokens(PDO $db,string $client,string $resource,string $scope):array{$access=bin2hex(random_bytes(32));$refresh=bin2hex(random_bytes(32));$q=$db->prepare('INSERT INTO oauth_tokens(access_hash,refresh_hash,client_id,resource,scope,expires_at,refresh_expires_at,revoked) VALUES(?,?,?,?,?,?,?,0)');$q->execute([hash('sha256',$access),hash('sha256',$refresh),$client,$resource,$scope,time()+3600,time()+30*86400]);return ['access_token'=>$access,'token_type'=>'Bearer','expires_in'=>3600,'refresh_token'=>$refresh,'scope'=>$scope,'resource'=>$resource];}
function oauthAccess(PDO $db,array $config,string $token):array{$q=$db->prepare('SELECT * FROM oauth_tokens WHERE access_hash=?');$q->execute([hash('sha256',$token)]);$row=$q->fetch(PDO::FETCH_ASSOC);if(!$row)fail(401,'OAuth access token is unknown.');if((int)$row['revoked']!==0)fail(401,'OAuth connection was revoked.');if((int)$row['expires_at']<=time())fail(401,'OAuth access token expired.');if($row['resource']!==oauthResource($config))fail(401,'OAuth access token has the wrong resource audience.');return explode(' ',$row['scope']);}
// Rotation records contain hashes and a nonce, never plaintext credentials.
const KHOSRA_REFRESH_RETRY_SECONDS=120;
function oauthRotationSchema(PDO $db):string{
 $sql='CREATE TABLE IF NOT EXISTS oauth_refresh_rotations (parent_access_hash CHAR(64) PRIMARY KEY, successor_access_hash CHAR(64) UNIQUE NOT NULL, family_hash CHAR(64) NOT NULL, nonce CHAR(64) NOT NULL, rotated_at BIGINT NOT NULL)';
 return $db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?substr($sql,0,-1).', INDEX oauth_refresh_family (family_hash)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4':$sql;
}
function oauthRotationStorage(PDO $db,bool $create=false):bool{
 try{$q=$db->query('SELECT parent_access_hash FROM oauth_refresh_rotations WHERE 1=0');$q->closeCursor();return true;}
 catch(PDOException $e){
  $missing=($e->errorInfo[0]??'')==='42S02'||(($e->errorInfo[0]??'')==='HY000'&&str_contains($e->getMessage(),'no such table: oauth_refresh_rotations'));
  if(!$missing)throw $e;if(!$create)return false;
  // Called outside a transaction, after authenticating the existing refresh credential.
  $db->exec(oauthRotationSchema($db));if($db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite')$db->exec('CREATE INDEX IF NOT EXISTS oauth_refresh_family ON oauth_refresh_rotations(family_hash)');return true;
 }
}
function oauthFamily(PDO $db,string $accessHash):string{
 $q=$db->prepare('SELECT family_hash FROM oauth_refresh_rotations WHERE parent_access_hash=? OR successor_access_hash=?');$q->execute([$accessHash,$accessHash]);$family=$q->fetchColumn();$q->closeCursor();return $family?:$accessHash;
}
function oauthTokenByRefresh(PDO $db,string $refresh):array{
 $q=$db->prepare('SELECT * FROM oauth_tokens WHERE refresh_hash=?');$q->execute([hash('sha256',$refresh)]);$row=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();if(!$row)fail(400,'Invalid refresh token.');return $row;
}
function oauthValidateRefresh(array $row,array $config,array $body):string{
 if((int)$row['revoked']!==0)fail(400,'OAuth connection was revoked.');
 if((int)$row['refresh_expires_at']<=time())fail(400,'Refresh token expired.');
 if(!is_string($body['client_id']??null)||$row['client_id']!==$body['client_id'])fail(400,'Refresh client does not match.');
 if($row['resource']!==oauthResource($config)||(array_key_exists('resource',$body)&&$body['resource']!==$row['resource']))fail(400,'Invalid refresh resource audience.');
 $scope=$body['scope']??$row['scope'];if(!is_string($scope))fail(400,'Invalid refresh scope.');
 $scopes=array_values(array_unique(preg_split('/\s+/',trim($scope))));
 if(in_array('',$scopes,true)||array_diff($scopes,explode(' ',$row['scope'])))fail(400,'Refresh scope exceeds the original grant.');sort($scopes);return implode(' ',$scopes);
}
function oauthLockFamily(PDO $db,string $family):void{
 $q=$db->prepare('SELECT revoked FROM oauth_tokens WHERE access_hash=?'.databaseLock($db));$q->execute([$family]);$revoked=$q->fetchColumn();$q->closeCursor();if($revoked===false||(int)$revoked!==0)fail(400,'OAuth connection was revoked.');
}
function oauthRefresh(PDO $db,array $config,array $body):array{
 $refresh=$body['refresh_token']??null;if(!is_string($refresh)||!preg_match('/^[a-f0-9]{64}$/D',$refresh))fail(400,'Invalid refresh token.');
 $row=oauthTokenByRefresh($db,$refresh);oauthValidateRefresh($row,$config,$body);
 oauthRotationStorage($db,true);$family=oauthFamily($db,$row['access_hash']);
 beginWrite($db);try{
  // One canonical lock serializes refresh/revocation across every generation.
  oauthLockFamily($db,$family);$row=oauthTokenByRefresh($db,$refresh);$scope=oauthValidateRefresh($row,$config,$body);
  $q=$db->prepare('SELECT * FROM oauth_refresh_rotations WHERE parent_access_hash=?'.databaseLock($db));$q->execute([$row['access_hash']]);$rotation=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();$now=time();
  if($rotation){
   if($now-(int)$rotation['rotated_at']>KHOSRA_REFRESH_RETRY_SECONDS)fail(400,'Refresh token was already used.');
   $nonce=$rotation['nonce'];
  }else{$nonce=bin2hex(random_bytes(32));}
  $context=json_encode([$row['access_hash'],$row['client_id'],$row['resource'],$scope,$nonce],JSON_THROW_ON_ERROR);
  $access=hash_hmac('sha256','khosra-access-v1:'.$context,$refresh);$nextRefresh=hash_hmac('sha256','khosra-refresh-v1:'.$context,$refresh);
  $accessHash=hash('sha256',$access);
  if($rotation){
   if(!hash_equals($rotation['successor_access_hash'],$accessHash))fail(400,'Refresh retry parameters changed.');
   $q=$db->prepare('SELECT * FROM oauth_tokens WHERE access_hash=?'.databaseLock($db));$q->execute([$accessHash]);$child=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();
   if(!$child||(int)$child['revoked']!==0||(int)$child['expires_at']<=$now||$child['scope']!==$scope||!hash_equals($child['refresh_hash'],hash('sha256',$nextRefresh)))fail(400,'Refresh replacement is no longer available.');
   // A delayed retry must not return a refresh credential already consumed by a newer generation.
   for($depth=0;$depth<128;$depth++){
    $q=$db->prepare('SELECT * FROM oauth_refresh_rotations WHERE parent_access_hash=?'.databaseLock($db));$q->execute([$child['access_hash']]);$later=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();if(!$later)break;
    if($depth===127||$now-(int)$later['rotated_at']>KHOSRA_REFRESH_RETRY_SECONDS||$later['family_hash']!==$family)fail(400,'Refresh replacement is no longer available.');
    $q=$db->prepare('SELECT * FROM oauth_tokens WHERE access_hash=?'.databaseLock($db));$q->execute([$later['successor_access_hash']]);$latest=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();
    if(!$latest||(int)$latest['revoked']!==0||(int)$latest['expires_at']<=$now||$latest['client_id']!==$row['client_id']||$latest['resource']!==$row['resource']||array_diff(explode(' ',$latest['scope']),explode(' ',$child['scope'])))fail(400,'Refresh replacement is no longer available.');
    $context=json_encode([$child['access_hash'],$child['client_id'],$child['resource'],$latest['scope'],$later['nonce']],JSON_THROW_ON_ERROR);
    $access=hash_hmac('sha256','khosra-access-v1:'.$context,$nextRefresh);$nextRefresh=hash_hmac('sha256','khosra-refresh-v1:'.$context,$nextRefresh);
    if(!hash_equals($latest['access_hash'],hash('sha256',$access))||!hash_equals($latest['refresh_hash'],hash('sha256',$nextRefresh)))fail(400,'Invalid refresh replacement.');
    $child=$latest;
   }
   $scope=$child['scope'];$expires=(int)$child['expires_at'];
  }else{
   $expires=$now+3600;$q=$db->prepare('INSERT INTO oauth_tokens(access_hash,refresh_hash,client_id,resource,scope,expires_at,refresh_expires_at,revoked) VALUES(?,?,?,?,?,?,?,0)');
   $q->execute([$accessHash,hash('sha256',$nextRefresh),$row['client_id'],$row['resource'],$scope,$expires,$now+30*86400]);
   $q=$db->prepare('INSERT INTO oauth_refresh_rotations(parent_access_hash,successor_access_hash,family_hash,nonce,rotated_at) VALUES(?,?,?,?,?)');$q->execute([$row['access_hash'],$accessHash,$family,$nonce,$now]);
  }
  // The parent access token keeps its original expiry, protecting overlapping calls.
  $db->commit();return ['access_token'=>$access,'token_type'=>'Bearer','expires_in'=>$expires-time(),'refresh_token'=>$nextRefresh,'scope'=>$scope,'resource'=>$row['resource']];
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function oauthRevoke(PDO $db,string $client,string $token):void{
 $hash=hash('sha256',$token);$q=$db->prepare('SELECT access_hash FROM oauth_tokens WHERE (access_hash=? OR refresh_hash=?) AND client_id=?');$q->execute([$hash,$hash,$client]);$accessHash=$q->fetchColumn();$q->closeCursor();if(!$accessHash)return;
 $hasRotations=oauthRotationStorage($db,true);$family=oauthFamily($db,$accessHash);
 beginWrite($db);try{
  // Revocation remains idempotent, including already-revoked families.
  $q=$db->prepare('SELECT access_hash FROM oauth_tokens WHERE access_hash=?'.databaseLock($db));$q->execute([$family]);$q->fetchColumn();$q->closeCursor();
  $sql='UPDATE oauth_tokens SET revoked=1 WHERE access_hash=?';$args=[$family];
  if($hasRotations){$sql.=' OR access_hash IN (SELECT parent_access_hash FROM oauth_refresh_rotations WHERE family_hash=?) OR access_hash IN (SELECT successor_access_hash FROM oauth_refresh_rotations WHERE family_hash=?)';$args[]=$family;$args[]=$family;}
  $db->prepare($sql)->execute($args);$db->commit();
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function oauthConsentHtml(array $scopes,string $nonce,string $client):string{
 $escape=fn(string $value):string=>htmlspecialchars($value,ENT_QUOTES,'UTF-8');
 $permissions='';
 if(in_array('manuscript.read',$scopes,true))$permissions.='<li><span class="permission-icon" aria-hidden="true">↗</span><div><strong>Read your writing</strong><p>Retrieve manuscripts, reference materials and revision history.</p></div></li>';
 if(in_array('manuscript.propose',$scopes,true))$permissions.='<li><span class="permission-icon" aria-hidden="true">+</span><div><strong>Save proposals and planning material</strong><p>Suggest revisions and chapters, and save context, ideas and artifacts.</p></div></li>';
 $nonce=$escape($nonce);$client=$escape($client);
 return <<<HTML
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="same-origin"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect Khosra</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root{color-scheme:light;--ink:#314338;--muted:#687361;--line:#d8dccf;--green:#2e594a}*{box-sizing:border-box}body{margin:0;background:#f8f7f0;color:var(--ink);font:15px/1.6 system-ui,-apple-system,sans-serif}main{width:min(100% - 40px,480px);margin:clamp(24px,7vh,72px) auto}.brand{display:flex;align-items:center;gap:10px;margin-bottom:28px;font-weight:600;font-size:18px}.brand img{width:40px;height:40px}.consent-card{background:#fffefa;border:1px solid var(--line);border-radius:18px;padding:32px;box-shadow:0 12px 40px #31433806}h1{font:400 clamp(30px,5vw,38px)/1.15 Georgia,serif;letter-spacing:-.02em;margin:0 0 14px}.intro{color:var(--muted);margin:0 0 24px}.permissions{list-style:none;margin:0;padding:0 0 22px;border-bottom:1px solid var(--line)}.permissions li{display:flex;gap:12px;align-items:flex-start;margin:20px 0}.permissions li:last-child{margin-bottom:0}.permission-icon{background:#eaf0e3;color:var(--green);border-radius:8px;display:grid;place-items:center;flex-shrink:0;width:30px;height:30px;font-size:20px;line-height:1}.permissions strong{font-size:14px;font-weight:600}.permissions p{font-size:13px;color:var(--muted);line-height:1.6;margin:3px 0 0}.approval{font-size:13px;margin:18px 0 24px;color:var(--muted)}label{display:block;font-size:14px;font-weight:600;margin-bottom:8px}input,button{font:inherit}input{width:100%;height:50px;border:1px solid #b8c4ae;border-radius:7px;background:#fffefa;color:var(--ink);padding:12px 80px 12px 14px}.password-field{position:relative}.password-reveal{position:absolute;inset:1px 1px 1px auto;width:68px;border:0;background:transparent;color:var(--green);border-radius:6px;font-size:13px;font-weight:600}.form-actions{display:flex;flex-direction:column;gap:10px;margin-top:20px}button{cursor:pointer;min-height:46px;border:1px solid var(--line);border-radius:7px;padding:10px 16px;font-weight:600;color:var(--ink);background:transparent}.allow{background:var(--green);border-color:var(--green);color:white;display:flex;align-items:center;justify-content:center;gap:10px}.allow .spinner{display:none}form[data-decision="allow"][aria-busy="true"] .allow .spinner{display:inline-block;width:16px;height:16px;border:2px solid #ffffff55;border-top-color:currentColor;border-radius:50%;animation:spin .8s linear infinite}button:disabled{opacity:.65;cursor:wait}input:focus-visible,button:focus-visible{outline:2px solid var(--green);outline-offset:3px}#connection-status{font-size:13px;color:var(--muted);margin:16px 0 0}.privacy{text-align:center;font-size:12px;color:var(--muted);margin:20px 14px;line-height:1.7}[hidden]{display:none!important}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}@media(max-width:480px){main{width:calc(100% - 24px);margin:24px auto}.brand{margin:0 12px 20px}.consent-card{padding:24px 20px;border-radius:14px}.privacy{margin-inline:12px}}
</style><script src="/oauth-consent.js?v=3" defer></script></head>
<body><main><header class="brand"><img src="/favicon.svg" alt="" width="40" height="40"><span>Khosra</span></header>
<section class="consent-card" aria-labelledby="consent-title"><h1 id="consent-title">Connect to Khosra</h1><p class="intro"><strong>{$client}</strong> is requesting access to your private workspace.</p>
<ul class="permissions" aria-label="Requested permissions">{$permissions}</ul><p class="approval">You stay in control. Manuscript changes need your approval in Khosra.</p>
<form method="post" action="/api/oauth/authorize"><input type="hidden" name="nonce" value="{$nonce}"><label for="consent-password">Owner password</label><div class="password-field"><input id="consent-password" type="password" name="password" autocomplete="current-password" required><button id="reveal-password" class="password-reveal" type="button" aria-controls="consent-password" aria-label="Show password" aria-pressed="false" hidden>Show</button></div>
<div class="form-actions"><button class="allow" name="decision" value="allow"><span class="spinner" aria-hidden="true"></span><span data-decision-label>Allow connection</span></button><button name="decision" value="deny" formnovalidate><span data-decision-label>Cancel</span></button></div><p id="connection-status" role="status" hidden></p></form></section>
<p class="privacy">Your owner password is verified by Khosra and is never shared with {$client}.</p></main></body></html>
HTML;
}
function oauthRoute(PDO $db,array $config,string $path,string $method,array $body):never{
 if($path==='oauth/register'&&$method==='POST'){throttle($db,'register',30);$redirects=$body['redirect_uris']??[];if(!is_array($redirects)||count($redirects)<1||count($redirects)>5)fail(400,'Allowed redirect_uris required.');foreach($redirects as $uri)if(!is_string($uri)||!allowedRedirect($config,$uri))fail(400,'Redirect URI is not allowlisted by the owner.');if(($body['token_endpoint_auth_method']??'none')!=='none')fail(400,'Only public PKCE clients are supported.');$client=uuid();$q=$db->prepare('INSERT INTO oauth_clients(client_id,redirect_uris,created_at) VALUES(?,?,?)');$q->execute([$client,json_encode($redirects,JSON_THROW_ON_ERROR),time()]);respond(['client_id'=>$client,'client_id_issued_at'=>time(),'redirect_uris'=>$redirects,'token_endpoint_auth_method'=>'none','grant_types'=>['authorization_code','refresh_token'],'response_types'=>['code']],201);}
 if($path==='oauth/authorize'){
  ini_set('session.use_strict_mode','1');session_name('khosra_consent');session_set_cookie_params(['httponly'=>true,'secure'=>true,'samesite'=>'Lax','path'=>'/api/oauth']);if(!session_start())fail(503,'Could not start the connection session. Ask your host to check PHP session storage.');
  if($method==='GET'){
   $a=$_GET;if(($a['response_type']??'')!=='code'||($a['code_challenge_method']??'')!=='S256'||!preg_match('/^[A-Za-z0-9_-]{43}$/',$a['code_challenge']??'')||($a['resource']??'')!==oauthResource($config)||!text($a['state']??null,2000))fail(400,'Authorization requires code, S256 PKCE, resource and state.');$q=$db->prepare('SELECT redirect_uris FROM oauth_clients WHERE client_id=?');$q->execute([$a['client_id']??'']);$row=$q->fetchColumn();if(!$row||!in_array($a['redirect_uri']??'',json_decode($row,true),true)||!allowedRedirect($config,$a['redirect_uri']))fail(400,'Unknown client or redirect.');$scopes=array_values(array_unique(explode(' ',trim($a['scope']??'manuscript.read manuscript.propose'))));if(!$scopes||array_diff($scopes,['manuscript.read','manuscript.propose']))fail(400,'Unsupported scope.');$a['scope']=implode(' ',$scopes);// Keep independent forms valid when a client retries or opens another tab.
   $pending=array_filter($_SESSION['consents']??[],fn($item)=>is_array($item)&&($item['expires']??0)>=time());
   $pending=array_slice($pending,-9,null,true);$nonce=bin2hex(random_bytes(24));$pending[$nonce]=['args'=>$a,'expires'=>time()+600];$_SESSION['consents']=$pending;
   if(!session_write_close())fail(503,'Could not save the connection session. Ask your host to check PHP session storage.');
   $redirectParts=parse_url($a['redirect_uri']);$redirectOrigin=$redirectParts['scheme'].'://'.$redirectParts['host'].(isset($redirectParts['port'])?':'.$redirectParts['port']:'');header('Content-Type: text/html; charset=utf-8');header('Referrer-Policy: same-origin');header("Content-Security-Policy: default-src 'none'; script-src 'self'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self' ".$redirectOrigin."; frame-ancestors 'none'; base-uri 'none'");$client=in_array($redirectParts['host'],['chatgpt.com','chat.openai.com'],true)?'ChatGPT':$redirectParts['host'];echo oauthConsentHtml($scopes,$nonce,$client);exit;
  }
  if($method!=='POST')fail(405,'GET or POST required.');
  if(empty($_COOKIE[session_name()])||empty($_SESSION['consents']))fail(403,'Connection session is missing. Restart from ChatGPT. If this repeats, check browser cookies and PHP session storage.');
  $nonce=$body['nonce']??'';if(!is_string($nonce)||!preg_match('/^[a-f0-9]{48}$/',$nonce)||!isset($_SESSION['consents'][$nonce]))fail(403,'Connection form is invalid or already used. Restart from ChatGPT.');
  $pending=$_SESSION['consents'][$nonce];unset($_SESSION['consents'][$nonce]);if($pending['expires']<time())fail(403,'Connection form expired. Restart from ChatGPT.');$a=$pending['args'];$location=$a['redirect_uri'].(str_contains($a['redirect_uri'],'?')?'&':'?').http_build_query(['state'=>$a['state'],'iss'=>rtrim($config['origin'],'/')]);if(($body['decision']??'')!=='allow'){header('Location: '.$location.'&error=access_denied',true,303);exit;}throttle($db,'consent',8);if(!text($body['password']??null,1000)||!ownerPasswordMatches($body['password'],$config))fail(401,'Incorrect owner password. Restart connection.');$code=bin2hex(random_bytes(32));$q=$db->prepare('INSERT INTO oauth_codes(code_hash,client_id,redirect_uri,resource,scope,challenge,expires_at) VALUES(?,?,?,?,?,?,?)');$q->execute([hash('sha256',$code),$a['client_id'],$a['redirect_uri'],$a['resource'],$a['scope'],$a['code_challenge'],time()+120]);session_regenerate_id(true);header('Location: '.$location.'&code='.urlencode($code),true,303);exit;
 }
 if($path==='oauth/token'&&$method==='POST'){
  throttle($db,'token',120);
  if(($body['grant_type']??'')==='refresh_token')respond(oauthRefresh($db,$config,$body));
  if(array_key_exists('resource',$body)&&$body['resource']!==oauthResource($config))fail(400,'Invalid resource audience.');beginWrite($db);try{
   if(($body['grant_type']??'')==='authorization_code'){$q=$db->prepare('SELECT * FROM oauth_codes WHERE code_hash=?'.databaseLock($db));$q->execute([hash('sha256',(string)($body['code']??''))]);$row=$q->fetch(PDO::FETCH_ASSOC);$verifier=(string)($body['code_verifier']??'');if(!preg_match('/^[A-Za-z0-9._~-]{43,128}$/',$verifier)||!$row||(int)$row['expires_at']<=time()||$row['client_id']!==($body['client_id']??'')||$row['redirect_uri']!==($body['redirect_uri']??'')||$row['resource']!==($body['resource']??oauthResource($config))||!hash_equals($row['challenge'],rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'=')))fail(400,'Invalid authorization grant or PKCE verifier.');$q=$db->prepare('DELETE FROM oauth_codes WHERE code_hash=?');$q->execute([$row['code_hash']]);
   }else fail(400,'Unsupported grant type.');$result=issueTokens($db,$row['client_id'],$row['resource'],$row['scope']);$db->commit();respond($result);
  }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 }
 if($path==='oauth/revoke'&&$method==='POST'){throttle($db,'revoke',120);oauthRevoke($db,(string)($body['client_id']??''),(string)($body['token']??''));respond(['revoked'=>true]);}
 fail(404,'OAuth endpoint not found.');
}
