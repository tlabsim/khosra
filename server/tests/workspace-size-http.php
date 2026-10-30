<?php
// Self-contained loopback HTTP + SQLite fixture; no production config, data or account.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';require dirname(__DIR__).'/oauth.php';
$root=sys_get_temp_dir().'/khosra-chapter-http-'.bin2hex(random_bytes(5));mkdir($root.'/public/api',0700,true);mkdir($root.'/sessions',0700);
$socket=stream_socket_server('tcp://127.0.0.1:0');$address=stream_socket_get_name($socket,false);fclose($socket);$origin='http://'.$address;
$process=null;$count=0;
function checkChapterHttp(bool $ok,string $label):void{global $count;if(!$ok)throw new RuntimeException('FAIL: '.$label);echo 'PASS: '.$label.PHP_EOL;$count++;}
function chapterHttp(string $path,string $method='GET',?array $body=null,array $headers=[]):array{
 global $origin;$options=['http'=>['method'=>$method,'ignore_errors'=>true,'follow_location'=>0,'timeout'=>10,'header'=>implode("\r\n",array_merge(['Content-Type: application/json'],$headers))]];if($body!==null)$options['http']['content']=json_encode($body,JSON_THROW_ON_ERROR);
 $raw=file_get_contents($origin.$path,false,stream_context_create($options));preg_match('/\s(\d{3})\s/',$http_response_header[0]??'',$m);return ['status'=>(int)($m[1]??0),'body'=>json_decode($raw?:'',true),'raw'=>$raw,'headers'=>$http_response_header??[]];
}
function chapterRpc(string $name,array $args=[],?string $token=null,string $method='tools/call'):array{
 return chapterHttp('/api/mcp','POST',['jsonrpc'=>'2.0','id'=>1,'method'=>$method,'params'=>$method==='tools/call'?['name'=>$name,'arguments'=>$args?:new stdClass()]:new stdClass()],$token===null?[]:['Authorization: Bearer '.$token]);
}
function rpcChapterValue(array $r):array{return json_decode($r['body']['result']['content'][0]['text']??'{}',true)??[];}
try{
 foreach(['lib.php','oauth.php','guide.php','materials.php','proposal-edits.php','sharing.php'] as $file)copy(dirname(__DIR__).'/'.$file,$root.'/'.$file);
 copy(dirname(__DIR__).'/public/api/index.php',$root.'/public/api/index.php');
 file_put_contents($root.'/router.php',"<?php require __DIR__.'/public/api/index.php';");
 $config=['dsn'=>'sqlite:'.$root.'/fixture.sqlite','origin'=>$origin,'owner_password'=>'isolated-chapter-test-password','tool_token_hash'=>''];file_put_contents($root.'/config.php','<?php return '.var_export($config,true).';');
 $db=openDatabase($config);$db->exec(file_get_contents(dirname(__DIR__).'/schema.sqlite.sql'));$state=blank();$bid=uuid();$state['books'][]=['id'=>$bid,'title'=>'Private HTTP mystery','premise'=>'Private premise','language'=>'bn','createdAt'=>stamp()];$q=$db->prepare('INSERT INTO workspace(id,version,payload) VALUES(1,0,?)');$q->execute([json_encode($state)]);$q=null;
 $read=issueTokens($db,uuid(),oauthResource($config),'manuscript.read')['access_token'];$propose=issueTokens($db,uuid(),oauthResource($config),'manuscript.propose')['access_token'];
 $pipes=[];$process=proc_open([PHP_BINARY,'-d','xdebug.mode=off','-d','memory_limit=512M','-d','post_max_size=64M','-d','session.save_path='.$root.'/sessions','-S',$address,'-t',$root.'/public',$root.'/router.php'],[0=>['pipe','r'],1=>['file',$root.'/server.log','a'],2=>['file',$root.'/server.log','a']],$pipes);if(!is_resource($process))throw new RuntimeException('Cannot start isolated PHP server.');fclose($pipes[0]);
 for($i=0;$i<100;$i++){$connection=@fsockopen('127.0.0.1',(int)substr(strrchr($address,':'),1),$errno,$error,0.1);if($connection){fclose($connection);break;}usleep(20000);}

 function largeRequest(string $raw,array $headers=[]):array{
  global $origin;$options=['http'=>['method'=>'POST','ignore_errors'=>true,'timeout'=>60,'header'=>implode("\r\n",array_merge(['Content-Type: application/json'],$headers)),'content'=>$raw]];
  $response=file_get_contents($origin.'/api/workspace',false,stream_context_create($options));preg_match('/\s(\d{3})\s/',$http_response_header[0]??'',$m);return ['status'=>(int)($m[1]??0),'body'=>json_decode($response?:'',true)];
 }
 $r=chapterHttp('/api/login','POST',['password'=>$config['owner_password']]);checkChapterHttp($r['status']===200,'Owner signs in');$csrf=$r['body']['csrf'];$cookie='';foreach($r['headers'] as $h)if(str_starts_with(strtolower($h),'set-cookie:'))$cookie=explode(';',trim(substr($h,11)))[0];
 checkChapterHttp($r['body']['workspaceTransport']===['gzip'=>true,'maxDecodedBytes'=>64*1024*1024],'Login advertises gzip and 64 MiB decoded workspace limit');
 $headers=['Cookie: '.$cookie,'X-CSRF-Token: '.$csrf,'Origin: '.$origin];
 $r=chapterHttp('/api/session','GET',null,['Cookie: '.$cookie]);checkChapterHttp($r['body']['workspaceTransport']['gzip'],'Existing sessions discover upload capability');
 $cid=uuid();$rid=uuid();$state['chapters'][]=['id'=>$cid,'bookId'=>$bid,'code'=>1,'title'=>'Large Bengali chapter','position'=>0,'headId'=>$rid,'approvedId'=>null,'synopsis'=>''];
 $paragraphs=[];for($i=1;$i<=180;$i++)$paragraphs[]=['id'=>uuid(),'label'=>$i,'text'=>str_repeat('গল্প',12500),'section'=>''];
 $state['revisions'][]=['id'=>$rid,'chapterId'=>$cid,'parentId'=>null,'source'=>'author','edition'=>1,'createdAt'=>stamp(),'message'=>'Initial large chapter','paragraphs'=>$paragraphs];
 $body=['state'=>$state,'baseVersion'=>0,'operationId'=>uuid()];$raw=json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);$gzip=gzencode($raw);
 checkChapterHttp(strlen($raw)>25*1024*1024&&strlen($gzip)<1024*1024,'Valid workspace above 25 MiB fits under a 1 MiB compressed upload');
 $r=largeRequest($gzip,['Content-Encoding: gzip']);checkChapterHttp($r['status']===401,'Anonymous compressed upload cannot reach decompression/write');
 $r=largeRequest($gzip,['Cookie: '.$cookie,'Content-Encoding: gzip']);checkChapterHttp($r['status']===403,'Compressed writes require CSRF');
 $r=largeRequest('not gzip',array_merge($headers,['Content-Encoding: gzip']));checkChapterHttp($r['status']===400,'Malformed gzip rejected without writes');
 $r=largeRequest($gzip,array_merge($headers,['Content-Encoding: gzip']));checkChapterHttp($r['status']===200&&$r['body']['version']===1,'Authenticated compressed workspace above old ceiling commits');
 $stored=loadWorkspace($db);checkChapterHttp($stored['state']===$state,'All Bengali prose, paragraph references and history survive exact round trip');unset($stored);
 $r=largeRequest($gzip,array_merge($headers,['Content-Encoding: gzip']));checkChapterHttp($r['status']===200&&$r['body']['version']===1,'Compressed retry is idempotent');
 $r=largeRequest($raw,$headers);checkChapterHttp($r['status']===200&&$r['body']['version']===1,'Plain JSON retry shares the same decoded request identity above old ceiling');
 $body['operationId']=uuid();$r=largeRequest(gzencode(json_encode($body,JSON_UNESCAPED_UNICODE)),array_merge($headers,['Content-Encoding: gzip']));checkChapterHttp($r['status']===409,'Stale compressed save still conflicts rather than overwriting');
 $body['baseVersion']=1;$body['operationId']=uuid();$body['state']['revisions'][0]['paragraphs'][0]['text']='Attempted rewrite of history';
 $r=largeRequest(gzencode(json_encode($body,JSON_UNESCAPED_UNICODE)),array_merge($headers,['Content-Encoding: gzip']));checkChapterHttp($r['status']===409,'Compressed transport cannot bypass immutable-history validation');
 $bomb=gzencode(str_repeat(' ',64*1024*1024+2));$r=largeRequest($bomb,array_merge($headers,['Content-Encoding: gzip']));checkChapterHttp(in_array($r['status'],[400,413],true),'Decoded-size ceiling rejects compressed expansion beyond 64 MiB');unset($bomb);
 $r=chapterHttp('/api/login','POST',null,['Content-Encoding: gzip']);checkChapterHttp($r['status']===415,'Compression is not accepted on login or model endpoints');
 $r=largeRequest(gzencode('null'),array_merge($headers,['Content-Encoding: gzip']));checkChapterHttp($r['status']===422,'Compressed JSON must still be a workspace object');
 $stored=loadWorkspace($db);checkChapterHttp($stored['version']===1&&$stored['state']===$state,'All failed requests preserve version, history and current prose');
 $state['books'][0]['title']='Owner saved again';$next=['state'=>$state,'baseVersion'=>1,'operationId'=>uuid()];
 $r=largeRequest(gzencode(json_encode($next,JSON_UNESCAPED_UNICODE)),array_merge($headers,['Content-Encoding: gzip']));checkChapterHttp($r['status']===200&&$r['body']['version']===2,'A subsequent large owner save validates against existing server history and commits');
 $stored=loadWorkspace($db);checkChapterHttp($stored['state']===$state,'Subsequent sync preserves every paragraph and source reference');
 echo "$count large-workspace HTTP checks passed; ".strlen($raw).' bytes JSON -> '.strlen($gzip)." bytes gzip.\n";
}finally{
 if(is_resource($process)){proc_terminate($process);proc_close($process);}unset($q,$db);
 $delete=function(string $dir)use(&$delete):void{foreach(scandir($dir)?:[] as $name){if($name==='.'||$name==='..')continue;$path=$dir.'/'.$name;if(is_dir($path))$delete($path);else unlink($path);}rmdir($dir);};$delete($root);
}
