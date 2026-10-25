<?php
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
require dirname(__DIR__).'/oauth.php';
$cfg=require dirname(__DIR__).'/config.php';
$origin=rtrim($cfg['origin'],'/');
$resource=oauthResource($cfg);
$checks=0;
function verify(bool $v,string $label):void{global $checks;if(!$v)throw new RuntimeException('FAIL: '.$label);$checks++;echo 'PASS: '.$label.PHP_EOL;}
function http(string $path,string $method='GET',?array $body=null,array $headers=[],bool $form=false):array{
 $options=['http'=>['method'=>$method,'ignore_errors'=>true,'follow_location'=>0,'timeout'=>10,'header'=>implode("\r\n",array_merge($body===null?[]:['Content-Type: '.($form?'application/x-www-form-urlencoded':'application/json')],$headers))]];if($body!==null)$options['http']['content']=$form?http_build_query($body):json_encode($body,JSON_THROW_ON_ERROR);$text=file_get_contents('http://127.0.0.1:8081'.$path,false,stream_context_create($options));$hs=$http_response_header??[];preg_match('/\s(\d{3})\s/',$hs[0]??'',$m);return ['status'=>(int)($m[1]??0),'text'=>$text,'json'=>json_decode($text?:'',true),'headers'=>$hs];
}
function cookie(array $r):string{$value='';foreach($r['headers'] as $h)if(str_starts_with(strtolower($h),'set-cookie:'))$value=explode(';',trim(substr($h,11)))[0];return $value;}
$r=http('/api/workspace');verify($r['status']===401,'Unauthenticated workspace denied');
$r=http('/.well-known/oauth-protected-resource');verify($r['json']['resource']===$resource,'Protected resource discovery');
$r=http('/.well-known/oauth-authorization-server');verify($r['json']['code_challenge_methods_supported']===['S256'],'PKCE discovery');
$r=http('/api/login','POST',['password'=>'khosra-test-only']);verify($r['status']===200,'Owner login');$ownerCookie=cookie($r);$csrf=$r['json']['csrf'];
$r=http('/api/workspace','POST',[],['Cookie: '.$ownerCookie]);verify($r['status']===403,'Owner write without CSRF denied');
$r=http('/api/workspace','GET',null,['Cookie: '.$ownerCookie]);verify($r['status']===200,'Authenticated owner read');
$r=http('/api/oauth/register','POST',['redirect_uris'=>['https://attacker.invalid/callback'],'token_endpoint_auth_method'=>'none']);verify($r['status']===400,'Unapproved redirect rejected');
$redirect='https://chatgpt.com/connector_platform_oauth_redirect';$r=http('/api/oauth/register','POST',['redirect_uris'=>[$redirect],'token_endpoint_auth_method'=>'none']);verify($r['status']===201,'OAuth dynamic client registration');$client=$r['json']['client_id'];
$verifier=str_repeat('a',64);$challenge=rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'=');$args=['response_type'=>'code','client_id'=>$client,'redirect_uri'=>$redirect,'code_challenge_method'=>'S256','code_challenge'=>$challenge,'resource'=>$resource,'scope'=>'manuscript.read manuscript.propose','state'=>'test-state'];
$r=http('/api/oauth/authorize?'.http_build_query($args));verify($r['status']===200&&str_contains($r['text'],'Allow connection'),'Owner consent page');$consentCookie=cookie($r);preg_match('/name="nonce" value="([^"]+)"/',$r['text'],$matches);$nonce=$matches[1];
$r=http('/api/oauth/authorize','POST',['nonce'=>$nonce,'password'=>'khosra-test-only','decision'=>'allow'],['Cookie: '.$consentCookie],true);verify($r['status']===303,'Owner consent redirect');$location='';foreach($r['headers'] as $h)if(str_starts_with($h,'Location: '))$location=substr($h,10);parse_str(parse_url($location,PHP_URL_QUERY),$query);verify($query['state']==='test-state'&&$query['iss']===$origin,'OAuth state and issuer preserved');
$exchange=['grant_type'=>'authorization_code','client_id'=>$client,'redirect_uri'=>$redirect,'resource'=>$resource,'code'=>$query['code'],'code_verifier'=>$verifier];$bad=$exchange;$bad['code_verifier']=str_repeat('b',64);$r=http('/api/oauth/token','POST',$bad,[],true);verify($r['status']===400,'Wrong PKCE verifier rejected');
$r=http('/api/oauth/token','POST',$exchange,[],true);verify($r['status']===200&&isset($r['json']['access_token']),'Authorization code exchanged');$token=$r['json']['access_token'];$refresh=$r['json']['refresh_token'];
$r=http('/api/oauth/token','POST',$exchange,[],true);verify($r['status']===400,'Authorization code replay rejected');
$rpc=['jsonrpc'=>'2.0','id'=>1,'method'=>'initialize','params'=>['protocolVersion'=>'2025-03-26','capabilities'=>[],'clientInfo'=>['name'=>'test','version'=>'1']]];$r=http('/api/mcp','POST',$rpc,['Authorization: Bearer '.$token]);verify($r['status']===200&&$r['json']['result']['serverInfo']['name']==='khosra','Authenticated MCP initialize');
$r=http('/api/mcp','POST',['jsonrpc'=>'2.0','id'=>2,'method'=>'tools/list'],['Authorization: Bearer '.$token]);verify(count($r['json']['result']['tools'])===11,'Authenticated MCP tool discovery');
$r=http('/api/mcp','POST',['jsonrpc'=>'2.0','id'=>3,'method'=>'tools/call','params'=>['name'=>'list_books','arguments'=>[]]],['Authorization: Bearer '.$token]);verify(isset($r['json']['result']['content'][0]['text']),'MCP book retrieval');
$r=http('/api/oauth/token','POST',['grant_type'=>'refresh_token','client_id'=>$client,'resource'=>$resource,'refresh_token'=>$refresh],[],true);verify($r['status']===200&&$r['json']['access_token']!==$token,'Refresh token rotation');$newToken=$r['json']['access_token'];
$r=http('/api/mcp','POST',$rpc,['Authorization: Bearer '.$token]);verify($r['status']===401,'Rotated old access token denied');
$pdo=new PDO($cfg['dsn'],$cfg['db_user'],$cfg['db_password']);$limited=issueTokens($pdo,$client,$resource,'manuscript.read');$r=http('/api/mcp','POST',['jsonrpc'=>'2.0','id'=>5,'method'=>'tools/call','params'=>['name'=>'save_proposal','arguments'=>[]]],['Authorization: Bearer '.$limited['access_token']]);verify(($r['json']['result']['isError']??false)===true,'Read-only OAuth scope cannot save proposals');
$wrongAudience=issueTokens($pdo,$client,'https://other.invalid/mcp','manuscript.read');$r=http('/api/mcp','POST',$rpc,['Authorization: Bearer '.$wrongAudience['access_token']]);verify($r['status']===401,'Wrong token audience rejected');
$r=http('/api/workspace','GET',null,['Cookie: '.$ownerCookie,'Origin: https://evil.invalid']);verify($r['status']===403,'Cross-origin owner request rejected');
$r=http('/api/oauth/revoke','POST',['client_id'=>$client,'token'=>$newToken],[],true);verify($r['status']===200,'OAuth revocation');$r=http('/api/mcp','POST',$rpc,['Authorization: Bearer '.$newToken]);verify($r['status']===401,'Revoked token denied');
$r=http('/api/logout','POST',[],['Cookie: '.$ownerCookie,'X-CSRF-Token: '.$csrf]);verify($r['status']===200,'Owner logout');$r=http('/api/workspace','GET',null,['Cookie: '.$ownerCookie]);verify($r['status']===401,'Logged-out session denied');
echo "$checks HTTP checks passed.".PHP_EOL;
