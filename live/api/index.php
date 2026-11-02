<?php
declare(strict_types=1);
define('KHOSRA_DEPLOYMENT',true);
require dirname(__DIR__).'/khosra-server/lib.php';
require dirname(__DIR__).'/khosra-server/bootstrap.php';
require dirname(__DIR__).'/khosra-server/oauth.php';
require dirname(__DIR__).'/khosra-server/sharing.php';
header('X-Khosra-MCP-Revision: '.KHOSRA_MCP_REVISION);header('X-Khosra-Auth-Revision: '.KHOSRA_AUTH_REVISION);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('X-Robots-Tag: noindex, nofollow');header('Referrer-Policy: no-referrer');
function respond(mixed $value,int $status=200):never{http_response_code($status);echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);diagnosticFinish($status);exit;}
const KHOSRA_WORKSPACE_BYTES=64*1024*1024;
function workspaceTransportInfo():array{return ['gzip'=>function_exists('gzdecode'),'maxDecodedBytes'=>KHOSRA_WORKSPACE_BYTES,'differential'=>1,'manuscriptUnits'=>1];}
$rpc=null;
try{
 $file=dirname(__DIR__).'/khosra.config.php';$config=khosraDeploymentConfig($file);
 $method=$_SERVER['REQUEST_METHOD']??'GET';$path=trim(substr(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH),strlen('/api/')),'/');
 if($path==='mcp')diagnosticStart($config);
 $db=in_array($path,['diagnostics/mcp','diagnostics/mcp/purge','diagnostics/mcp/settings'],true)?null:openDatabase($config);
 // OAuth authorization is entered by navigation from the external client.
 // Consent POSTs and owner APIs retain same-origin checks; machine routes use exact client origins.
 if(!oauthOriginAllowed($config,$path,$method,$_SERVER['HTTP_ORIGIN']??null,isset($_GET['discovery'])))fail(403,'Origin is not allowed.');
 $workspacePost=in_array($path,['workspace','workspace/sync'],true)&&$method==='POST';
 $encoding=strtolower(trim($_SERVER['HTTP_CONTENT_ENCODING']??''));$gzip=$encoding==='gzip';
 if($encoding!==''&&$encoding!=='identity'&&!($workspacePost&&$gzip))fail(415,'This content encoding is not supported for this endpoint.');
 $limit=$workspacePost?KHOSRA_WORKSPACE_BYTES:20*1024*1024;
 if((int)($_SERVER['CONTENT_LENGTH']??0)>$limit)fail(413,$workspacePost?'Workspace upload exceeds the supported size. Export a device backup; your local changes are retained.':'Request too large.');
 $raw=file_get_contents('php://input',false,null,0,$limit+1);if(strlen($raw)>$limit)fail(413,'Request too large.');
 if($path==='mcp'){if(isset($GLOBALS['khosra_mcp_trace']))$GLOBALS['khosra_mcp_trace']['bytes']=strlen($raw);diagnosticEvent('body_read');}
 // Workspace JSON is parsed (and gzip expanded) only after owner authentication and CSRF.
 $body=[];if(!$workspacePost){if(str_contains($_SERVER['CONTENT_TYPE']??'','application/x-www-form-urlencoded'))parse_str($raw,$body);else $body=$raw!==''?json_decode($raw,true,128,JSON_THROW_ON_ERROR):[];if(!is_array($body))fail(422,'JSON object required.');}
 if($path==='mcp')diagnosticRpc($body);
 if($db!==null)khosraPrepareDatabase($db,$config,$path,$method,$body);
 if(isset($_GET['discovery'])&&in_array($_GET['discovery'],['oauth-protected-resource','oauth-authorization-server'],true))respond(oauthMetadata($config,$_GET['discovery']));
 if(str_starts_with($path,'guest/'))guestRoute($db,$config,$path,$method,$body);
 if(str_starts_with($path,'oauth/'))oauthRoute($db,$config,$path,$method,$body);
 if($path==='mcp'){
  $token=oauthBearer($_SERVER);$scopes=['manuscript.read','manuscript.propose'];if($token===null)fail(401,'Tool authentication required.');if(empty($config['tool_token_hash'])||!hash_equals($config['tool_token_hash'],hash('sha256',$token)))$scopes=oauthAccess($db,$config,$token);
  diagnosticEvent('authenticated');
  if($method==='GET'){diagnosticFinish(405);http_response_code(405);header('Allow: POST');exit;}if($method!=='POST')fail(405,'POST required.');$rpc=$body;$id=$rpc['id']??null;if(($rpc['jsonrpc']??'')!=='2.0')fail(422,'JSON-RPC 2.0 required.');if(str_starts_with($rpc['method']??'','notifications/')){diagnosticFinish(202);http_response_code(202);exit;}
  if(($rpc['method']??'')==='tools/call'&&($rpc['params']['name']??'')!=='get_khosra_guide')ensureManuscriptStorage($db);
  $result=match($rpc['method']??''){
   'initialize'=>['protocolVersion'=>'2025-03-26','capabilities'=>['tools'=>new stdClass()],'serverInfo'=>['name'=>'khosra','version'=>'0.2.0'],'instructions'=>khosraInstructions()],
   'ping'=>new stdClass(),
   'tools/list'=>['tools'=>tools()],
   'tools/call'=>mcpToolResult($db,$rpc,$scopes),
   default=>null
  };if($result===null)respond(['jsonrpc'=>'2.0','id'=>$id,'error'=>['code'=>-32601,'message'=>'Method not found']]);respond(['jsonrpc'=>'2.0','id'=>$id,'result'=>$result]);
 }
 ini_set('session.use_strict_mode','1');session_name('khosra_owner');session_set_cookie_params(['httponly'=>true,'secure'=>true,'samesite'=>'Strict','path'=>'/api']);session_start();
 if($path==='login'&&$method==='POST'){
  throttleIdentity($db,hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown'),8,'Too many login attempts. Try again in 15 minutes.');
  if(!text($body['password']??null,1000)||!ownerPasswordMatches($body['password'],$config))fail(401,'Incorrect owner password.');ensureManuscriptStorage($db);session_regenerate_id(true);$_SESSION=['owner'=>true,'last'=>time(),'csrf'=>bin2hex(random_bytes(24))];respond(['csrf'=>$_SESSION['csrf'],'workspaceTransport'=>workspaceTransportInfo()]);
 }
 if(empty($_SESSION['owner'])||time()-(int)($_SESSION['last']??0)>1800){$_SESSION=[];fail(401,'Owner session required.');}$_SESSION['last']=time();
 if($method==='POST'&&!hash_equals($_SESSION['csrf']??'',$_SERVER['HTTP_X_CSRF_TOKEN']??''))fail(403,'CSRF validation failed.');
 if($db!==null)ensureManuscriptStorage($db);
 if($workspacePost){
  if($gzip){
   if(!function_exists('gzdecode'))fail(415,'Compressed workspace uploads require the PHP zlib extension.');
   $decoded=@gzdecode($raw,KHOSRA_WORKSPACE_BYTES+1);
   if($decoded===false)fail(400,'Compressed workspace is invalid or exceeds the 64 MiB decoded limit.');
   if(strlen($decoded)>KHOSRA_WORKSPACE_BYTES)fail(413,'Workspace exceeds the 64 MiB decoded limit. Export a backup before reducing retained data.');
   $raw=$decoded;unset($decoded);
  }
  $body=json_decode($raw,true,128,JSON_THROW_ON_ERROR);if(!is_array($body))fail(422,'JSON object required.');
 }
 if($path==='diagnostics/mcp'&&$method==='GET'){if(isset($_GET['page'])&&(!is_string($_GET['page'])||!preg_match('/^[1-9][0-9]{0,3}$/D',$_GET['page'])))fail(422,'Invalid diagnostic page.');respond(diagnosticReport($config,(int)($_GET['page']??1),array_intersect_key($_GET,array_flip(['outcome','tool','search']))));}
 if($path==='diagnostics/mcp/settings'&&$method==='POST')respond(diagnosticSetEnabled($config,$body));
 if($path==='diagnostics/mcp/purge'&&$method==='POST')respond(diagnosticPurge($config,$body));
 if($path==='shares'||str_starts_with($path,'shares/'))shareOwner($db,$config,$path,$method,$body);
 if($path==='session'&&$method==='GET')respond(['csrf'=>$_SESSION['csrf'],'workspaceTransport'=>workspaceTransportInfo()]);
 if($path==='logout'&&$method==='POST'){$_SESSION=[];session_destroy();respond(['ok'=>true]);}
 if($path==='workspace/sync')workspaceSyncRoute($db,$method,$body);
 if($path==='workspace'&&$method==='GET')respond(loadWorkspace($db));
 if($path==='workspace'&&$method==='POST'){if(!is_array($body['state']??null)||!is_int($body['baseVersion']??null))fail(422,'Workspace and baseVersion required.');$version=writeWorkspace($db,$body['state'],$body['baseVersion'],(string)($body['operationId']??''),hash('sha256',$raw));respond(['version'=>$version]);}
 fail(404,'Endpoint not found.');
}catch(ApiError $e){diagnosticEvent('rejected',$e->status,diagnosticReason($e));$authFailureId=null;if(str_starts_with($path??'','oauth/')||(($path??'')==='mcp'&&(isset($token)||$e->status===403))){$authFailureId=oauthFailureDiagnostic($path,$e->status,$e->getMessage());header('X-Khosra-Request-Id: '.$authFailureId);}if(($path??'')==='mcp'&&$e->status===401)header('WWW-Authenticate: '.oauthChallenge($config,isset($token)&&$token!==null));if(str_starts_with($path??'','oauth/'))respond(['error'=>$e->status===429?'temporarily_unavailable':(($path??'')==='oauth/token'?'invalid_grant':'invalid_request'),'error_description'=>$e->getMessage()],$e->status);respond(['error'=>$e->getMessage()],$e->status);}catch(JsonException $e){diagnosticEvent('rejected',400,'invalid_json');respond(['error'=>'Invalid JSON.'],400);}catch(Throwable $e){diagnosticEvent('failed',500,diagnosticReason($e));if(($path??'')==='mcp'||str_starts_with($path??'','oauth/')){$failureId=oauthFailureDiagnostic($path,500,'Server operation failed.');header('X-Khosra-Request-Id: '.$failureId);}respond(['error'=>'Server operation failed. No manuscript content was logged.'],500);}
