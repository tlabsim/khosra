<?php
// Runs only against the explicitly created local sharing fixture; never production.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
require dirname(__DIR__).'/oauth.php';
$config=require __DIR__.'/.sharing-runtime/config.php';
if(!str_starts_with($config['dsn'],'sqlite:')||$config['origin']!=='http://127.0.0.1:8081')throw new RuntimeException('Use the local SQLite sharing fixture.');
$db=new PDO($config['dsn'],null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE TABLE IF NOT EXISTS oauth_tokens(access_hash TEXT PRIMARY KEY,refresh_hash TEXT,client_id TEXT,resource TEXT,scope TEXT,expires_at INTEGER,refresh_expires_at INTEGER,revoked INTEGER)');
$read=issueTokens($db,uuid(),oauthResource($config),'manuscript.read')['access_token'];
$propose=issueTokens($db,uuid(),oauthResource($config),'manuscript.propose')['access_token'];
$before=$db->query('SELECT version,payload FROM workspace WHERE id=1')->fetch(PDO::FETCH_ASSOC);
$count=0;
function checkGuide(bool $ok,string $label):void{global $count;if(!$ok)throw new RuntimeException('FAIL: '.$label);$count++;echo 'PASS: '.$label.PHP_EOL;}
function rpcGuide(string $method,array $params=[],?string $token=null,string $verb='POST'):array{
 $headers=['Content-Type: application/json'];if($token!==null)$headers[]='Authorization: Bearer '.$token;
 $context=stream_context_create(['http'=>['method'=>$verb,'ignore_errors'=>true,'follow_location'=>0,'timeout'=>10,'header'=>implode("\r\n",$headers),'content'=>json_encode(['jsonrpc'=>'2.0','id'=>1,'method'=>$method,'params'=>$params],JSON_THROW_ON_ERROR)]]);
 $body=file_get_contents('http://127.0.0.1:8081/api/mcp',false,$context);$responseHeaders=$http_response_header??[];preg_match('/\\s(\\d{3})\\s/',$responseHeaders[0]??'',$m);
 return ['status'=>(int)($m[1]??0),'json'=>json_decode($body?:'',true),'text'=>$body,'headers'=>implode("\n",$responseHeaders)];
}
$r=rpcGuide('tools/call',['name'=>'get_khosra_guide','arguments'=>new stdClass()]);checkGuide($r['status']===401&&!str_contains($r['text'],'startHere'),'Anonymous guide access requires authentication');
$r=rpcGuide('initialize',[],$read);checkGuide($r['status']===200&&str_contains($r['json']['result']['instructions']??'','get_khosra_guide'),'Read-only initialize directs clients to guide');
$r=rpcGuide('tools/list',[],$read);$tools=$r['json']['result']['tools']??[];checkGuide(count($tools)===18&&$tools[0]['name']==='get_khosra_guide','Guide is discoverable alongside existing tools');
checkGuide($tools[0]['annotations']['readOnlyHint']===true&&$tools[0]['securitySchemes'][0]['scopes']===['manuscript.read'],'Guide discovery advertises read-only scope');
$r=rpcGuide('tools/call',['name'=>'get_khosra_guide','arguments'=>new stdClass()],$read);$guide=json_decode($r['json']['result']['content'][0]['text']??'',true);
checkGuide($r['status']===200&&empty($r['json']['result']['isError'])&&$guide===khosraGuide(),'Read-only OAuth token retrieves complete guide');
checkGuide(stripos($r['headers'],'Cache-Control: no-store')!==false,'Guide response is not cached');
$workspace=json_decode($before['payload'],true);$private=$workspace['books'][0];
checkGuide(!str_contains($r['text'],$private['title'])&&!str_contains($r['text'],$private['premise'])&&!str_contains($r['text'],$private['id']),'Guide contains no private book title, premise or IDs');
$r=rpcGuide('tools/call',['name'=>'get_khosra_guide','arguments'=>['chapter_id'=>$workspace['chapters'][0]['id']]],$read);checkGuide(($r['json']['result']['isError']??false)===true,'Unexpected guide arguments produce a tool error');
$r=rpcGuide('tools/call',['name'=>'get_khosra_guide','arguments'=>new stdClass()],$propose);checkGuide(($r['json']['result']['isError']??false)===true&&str_contains($r['text'],'Token scope'),'Propose-only token cannot bypass read scope');
$r=rpcGuide('tools/call',['name'=>'save_proposal','arguments'=>[]],$read);checkGuide(($r['json']['result']['isError']??false)===true&&str_contains($r['text'],'Token scope'),'Read-only guide access does not enable proposal writes');
$r=rpcGuide('tools/call',['name'=>'get_khosra_guide','arguments'=>new stdClass()],'invalid-guide-token');checkGuide($r['status']===401,'Invalid token cannot retrieve the guide');
$after=$db->query('SELECT version,payload FROM workspace WHERE id=1')->fetch(PDO::FETCH_ASSOC);checkGuide($before===$after,'Guide calls leave workspace payload and version unchanged');
echo "$count guide HTTP checks passed.".PHP_EOL;
