<?php
// Run after --prepare and the isolated Apache fixture; never contacts production.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';require dirname(__DIR__).'/oauth.php';
$root='C:/wamp64/tmp/khosra-materials-regression';$url='http://127.0.0.1:18083';
if(in_array('--prepare',$argv,true)){
 if(!is_dir($root.'/public/api'))mkdir($root.'/public/api',0777,true);if(!is_dir($root.'/sessions'))mkdir($root.'/sessions');
 foreach(['lib.php','materials.php','oauth.php','sharing.php','guide.php'] as $f)copy(dirname(__DIR__).'/'.$f,$root.'/'.$f);
 copy(dirname(__DIR__).'/public/api/index.php',$root.'/public/api/index.php');
 file_put_contents($root.'/public/.htaccess',"RewriteEngine On\nRewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]\nRewriteRule ^api(?:/.*)?$ api/index.php [L,QSA]\n");
 $config=['dsn'=>'sqlite:'.$root.'/fixture.sqlite','origin'=>$url,'owner_password'=>'materials-http-test-only','tool_token_hash'=>''];file_put_contents($root.'/config.php','<?php return '.var_export($config,true).';');
 $db=openDatabase($config);$db->exec(file_get_contents(dirname(__DIR__).'/schema.sqlite.sql'));$s=blank();$bid=uuid();$s['books'][]=['id'=>$bid,'title'=>'HTTP test manuscript','premise'=>'Private premise','language'=>'bn','createdAt'=>stamp()];$q=$db->prepare('INSERT INTO workspace(id,version,payload) VALUES(1,0,?) ON CONFLICT(id) DO UPDATE SET version=0,payload=excluded.payload');$q->execute([json_encode($s)]);$db->exec('DELETE FROM operations');$db->exec('DELETE FROM oauth_tokens');
 echo "Isolated HTTP fixture prepared on port 18083.\n";exit;
}
$config=require $root.'/config.php';if($config['origin']!==$url||$config['dsn']!=='sqlite:'.$root.'/fixture.sqlite')throw new RuntimeException('Wrong fixture.');$db=openDatabase($config);$bid=loadWorkspace($db)['state']['books'][0]['id'];$read=issueTokens($db,uuid(),oauthResource($config),'manuscript.read')['access_token'];$write=issueTokens($db,uuid(),oauthResource($config),'manuscript.propose')['access_token'];$count=0;
function checkHttpMaterial(bool $ok,string $label):void{global $count;if(!$ok)throw new RuntimeException('FAIL: '.$label);$count++;echo 'PASS: '.$label.PHP_EOL;}
function materialRpc(string $name,array $args,?string $token=null,string $method='tools/call'):array{
 global $url;$headers=['Content-Type: application/json'];if($token)$headers[]='Authorization: Bearer '.$token;
 $c=stream_context_create(['http'=>['method'=>'POST','ignore_errors'=>true,'timeout'=>10,'header'=>implode("\r\n",$headers),'content'=>json_encode(['jsonrpc'=>'2.0','id'=>1,'method'=>$method,'params'=>$method==='tools/call'?['name'=>$name,'arguments'=>$args?:new stdClass()]:new stdClass()])]]);
 $text=file_get_contents($url.'/api/mcp',false,$c);preg_match('/\s(\d{3})\s/',$http_response_header[0]??'',$m);return ['status'=>(int)($m[1]??0),'body'=>json_decode($text?:'',true),'text'=>$text,'headers'=>implode("\n",$http_response_header)];
}
$r=materialRpc('list_materials',['book_id'=>$bid]);checkHttpMaterial($r['status']===401&&!str_contains($r['text'],'HTTP test manuscript'),'Anonymous material reads blocked');$r=materialRpc('',[],$read,'tools/list');checkHttpMaterial(count($r['body']['result']['tools'])===18,'Live MCP discovery includes 18 tools');
foreach(['save_idea','save_artifact'] as $name){$r=materialRpc($name,['book_id'=>$bid,'operation_id'=>uuid(),'title'=>'Denied','body'=>'Never stored'],$read);checkHttpMaterial(($r['body']['result']['isError']??false)&&str_contains($r['text'],'Token scope'),'Read-only token cannot '.$name);}
$args=['book_id'=>$bid,'operation_id'=>uuid(),'title'=>'Private possible twist','body'=>'Only a suggestion'];$r=materialRpc('save_idea',$args,$write);$saved=json_decode($r['body']['result']['content'][0]['text'],true);checkHttpMaterial($saved['saved']===true,'Propose token creates an idea over HTTP');$id=$saved['id'];$r=materialRpc('save_idea',$args,$write);checkHttpMaterial(json_decode($r['body']['result']['content'][0]['text'],true)['duplicate']===true,'HTTP save retry is idempotent');
$r=materialRpc('list_materials',['book_id'=>$bid],$read);$list=json_decode($r['body']['result']['content'][0]['text'],true);checkHttpMaterial($list['total']===1&&!str_contains($r['text'],'Only a suggestion'),'Lists omit note bodies');
$r=materialRpc('read_material',['book_id'=>$bid,'material_id'=>$id],$read);checkHttpMaterial(str_contains($r['text'],'Only a suggestion')&&str_contains($r['headers'],'no-store'),'Authenticated exact reads are private and not cached');
$raw=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=');$args=['book_id'=>$bid,'operation_id'=>uuid(),'title'=>'Private map','body'=>'Map notes','file'=>['name'=>'map.png','mime'=>'image/png','size'=>strlen($raw),'data'=>base64_encode($raw)]];$r=materialRpc('save_artifact',$args,$write);$artifact=json_decode($r['body']['result']['content'][0]['text'],true)['id'];$r=materialRpc('read_material',['book_id'=>$bid,'material_id'=>$artifact,'include_file'=>true],$read);$content=$r['body']['result']['content'];checkHttpMaterial($content[1]['type']==='image'&&$content[1]['data']===base64_encode($raw)&&!str_contains($content[0]['text'],base64_encode($raw)),'HTTP MCP sends native image separately from text');
$r=materialRpc('read_material',['book_id'=>$bid,'material_id'=>$artifact],$write);checkHttpMaterial(($r['body']['result']['isError']??false)===true,'Propose-only token cannot read private artifact bytes');
// Two simultaneous clients retry the same logical creation.
$op=uuid();$args=['book_id'=>$bid,'operation_id'=>$op,'title'=>'One concurrent idea','body'=>'Store once'];
$multi=curl_multi_init();$handles=[];
for($i=0;$i<2;$i++){$h=curl_init($url.'/api/mcp');curl_setopt_array($h,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10,CURLOPT_HTTPHEADER=>['Content-Type: application/json','Authorization: Bearer '.$write],CURLOPT_POSTFIELDS=>json_encode(['jsonrpc'=>'2.0','id'=>$i,'method'=>'tools/call','params'=>['name'=>'save_idea','arguments'=>$args]])]);curl_multi_add_handle($multi,$h);$handles[]=$h;}
do{curl_multi_exec($multi,$running);if($running)curl_multi_select($multi,1);}while($running);
foreach($handles as $h){$reply=json_decode(curl_multi_getcontent($h),true);$result=json_decode($reply['result']['content'][0]['text']??'',true);checkHttpMaterial(($result['saved']??false)&&(!isset($result['id'])||$result['id']===$op),'Concurrent save returns the committed material identity');curl_multi_remove_handle($multi,$h);curl_close($h);}curl_multi_close($multi);
$items=loadWorkspace($db)['state']['materials'];checkHttpMaterial(count(array_filter($items,fn($m)=>$m['id']===$op))===1,'Simultaneous retries persist exactly one material');
echo "$count material HTTP checks passed.\n";
