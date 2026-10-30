<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/lib.php';
require dirname(__DIR__,2).'/oauth.php';
require dirname(__DIR__,2).'/sharing.php';
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('X-Robots-Tag: noindex, nofollow');header('Referrer-Policy: no-referrer');
function respond(mixed $value,int $status=200):never{http_response_code($status);echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);exit;}
const KHOSRA_WORKSPACE_BYTES=64*1024*1024;
function workspaceTransportInfo():array{return ['gzip'=>function_exists('gzdecode'),'maxDecodedBytes'=>KHOSRA_WORKSPACE_BYTES];}
$rpc=null;
try{
 $file=dirname(__DIR__,2).'/config.php';if(!is_file($file))respond(['error'=>'Private server is not configured. Local workspace remains available.','code'=>'server_not_configured'],503);$config=require $file;
 $db=openDatabase($config);
 $method=$_SERVER['REQUEST_METHOD']??'GET';$path=trim(substr(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH),strlen('/api/')),'/');
 // OAuth authorization is entered by navigation from the external client.
 // Consent POSTs and all other API requests retain the same-origin check.
 if(isset($_SERVER['HTTP_ORIGIN'])&&$_SERVER['HTTP_ORIGIN']!==$config['origin']&&!($path==='oauth/authorize'&&$method==='GET'))fail(403,'Origin is not allowed.');
 $workspacePost=$path==='workspace'&&$method==='POST';
 $encoding=strtolower(trim($_SERVER['HTTP_CONTENT_ENCODING']??''));$gzip=$encoding==='gzip';
 if($encoding!==''&&$encoding!=='identity'&&!($workspacePost&&$gzip))fail(415,'This content encoding is not supported for this endpoint.');
 $limit=$workspacePost?KHOSRA_WORKSPACE_BYTES:20*1024*1024;
 if((int)($_SERVER['CONTENT_LENGTH']??0)>$limit)fail(413,$workspacePost?'Workspace upload exceeds the supported size. Export a device backup; your local changes are retained.':'Request too large.');
 $raw=file_get_contents('php://input',false,null,0,$limit+1);if(strlen($raw)>$limit)fail(413,'Request too large.');
 // Workspace JSON is parsed (and gzip expanded) only after owner authentication and CSRF.
 $body=[];if(!$workspacePost){if(str_contains($_SERVER['CONTENT_TYPE']??'','application/x-www-form-urlencoded'))parse_str($raw,$body);else $body=$raw!==''?json_decode($raw,true,128,JSON_THROW_ON_ERROR):[];if(!is_array($body))fail(422,'JSON object required.');}
 if(isset($_GET['discovery'])&&in_array($_GET['discovery'],['oauth-protected-resource','oauth-authorization-server'],true))respond(oauthMetadata($config,$_GET['discovery']));
 if(str_starts_with($path,'guest/'))guestRoute($db,$config,$path,$method,$body);
 if(str_starts_with($path,'oauth/'))oauthRoute($db,$config,$path,$method,$body);
 if($path==='mcp'){
  $auth=$_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'';$scopes=['manuscript.read','manuscript.propose'];header('WWW-Authenticate: '.oauthChallenge($config));if(!preg_match('/^Bearer (.+)$/',$auth,$m))fail(401,'Tool authentication required.');if(empty($config['tool_token_hash'])||!hash_equals($config['tool_token_hash'],hash('sha256',$m[1])))$scopes=oauthAccess($db,$config,$m[1]);
  if($method==='GET'){http_response_code(405);header('Allow: POST');exit;}if($method!=='POST')fail(405,'POST required.');$rpc=$body;$id=$rpc['id']??null;if(($rpc['jsonrpc']??'')!=='2.0')fail(422,'JSON-RPC 2.0 required.');if(str_starts_with($rpc['method']??'','notifications/')){http_response_code(202);exit;}
  $result=match($rpc['method']??''){
   'initialize'=>['protocolVersion'=>'2025-03-26','capabilities'=>['tools'=>new stdClass()],'serverInfo'=>['name'=>'khosra','version'=>'0.2.0'],'instructions'=>khosraInstructions()],
   'ping'=>new stdClass(),
   'tools/list'=>['tools'=>tools()],
   'tools/call'=>(function()use($db,$rpc,$scopes){try{$params=$rpc['params']??[];$required=str_starts_with($params['name']??'','save_')?'manuscript.propose':'manuscript.read';if(!in_array($required,$scopes,true))fail(403,'Token scope does not permit this tool.');$value=callTool($db,(string)($params['name']??''),$params['arguments']??[]);return ['content'=>toolContent($value)];}catch(ApiError $e){return ['isError'=>true,'content'=>[['type'=>'text','text'=>$e->getMessage()]]];}})(),
   default=>null
  };if($result===null)respond(['jsonrpc'=>'2.0','id'=>$id,'error'=>['code'=>-32601,'message'=>'Method not found']]);respond(['jsonrpc'=>'2.0','id'=>$id,'result'=>$result]);
 }
 ini_set('session.use_strict_mode','1');session_name('khosra_owner');session_set_cookie_params(['httponly'=>true,'secure'=>true,'samesite'=>'Strict','path'=>'/api']);session_start();
 if($path==='login'&&$method==='POST'){
  throttleIdentity($db,hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown'),8,'Too many login attempts. Try again in 15 minutes.');
  if(!text($body['password']??null,1000)||!ownerPasswordMatches($body['password'],$config))fail(401,'Incorrect owner password.');session_regenerate_id(true);$_SESSION=['owner'=>true,'last'=>time(),'csrf'=>bin2hex(random_bytes(24))];respond(['csrf'=>$_SESSION['csrf'],'workspaceTransport'=>workspaceTransportInfo()]);
 }
 if(empty($_SESSION['owner'])||time()-(int)($_SESSION['last']??0)>1800){$_SESSION=[];fail(401,'Owner session required.');}$_SESSION['last']=time();
 if($method==='POST'&&!hash_equals($_SESSION['csrf']??'',$_SERVER['HTTP_X_CSRF_TOKEN']??''))fail(403,'CSRF validation failed.');
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
 if($path==='shares'||str_starts_with($path,'shares/'))shareOwner($db,$config,$path,$method,$body);
 if($path==='session'&&$method==='GET')respond(['csrf'=>$_SESSION['csrf'],'workspaceTransport'=>workspaceTransportInfo()]);
 if($path==='logout'&&$method==='POST'){$_SESSION=[];session_destroy();respond(['ok'=>true]);}
 if($path==='workspace'&&$method==='GET')respond(loadWorkspace($db));
 if($path==='workspace'&&$method==='POST'){if(!is_array($body['state']??null)||!is_int($body['baseVersion']??null))fail(422,'Workspace and baseVersion required.');$version=writeWorkspace($db,$body['state'],$body['baseVersion'],(string)($body['operationId']??''),hash('sha256',$raw));respond(['version'=>$version]);}
 fail(404,'Endpoint not found.');
}catch(ApiError $e){if(str_starts_with($path??'','oauth/'))respond(['error'=>$e->status===429?'temporarily_unavailable':(($path??'')==='oauth/token'?'invalid_grant':'invalid_request'),'error_description'=>$e->getMessage()],$e->status);respond(['error'=>$e->getMessage()],$e->status);}catch(JsonException){respond(['error'=>'Invalid JSON.'],400);}catch(Throwable){respond(['error'=>'Server operation failed. No manuscript content was logged.'],500);}
