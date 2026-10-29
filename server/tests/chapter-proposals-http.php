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
 foreach(['lib.php','oauth.php','guide.php','materials.php','sharing.php'] as $file)copy(dirname(__DIR__).'/'.$file,$root.'/'.$file);
 copy(dirname(__DIR__).'/public/api/index.php',$root.'/public/api/index.php');
 file_put_contents($root.'/router.php',"<?php require __DIR__.'/public/api/index.php';");
 $config=['dsn'=>'sqlite:'.$root.'/fixture.sqlite','origin'=>$origin,'owner_password'=>'isolated-chapter-test-password','tool_token_hash'=>''];file_put_contents($root.'/config.php','<?php return '.var_export($config,true).';');
 $db=openDatabase($config);$db->exec(file_get_contents(dirname(__DIR__).'/schema.sqlite.sql'));$state=blank();$bid=uuid();$state['books'][]=['id'=>$bid,'title'=>'Private HTTP mystery','premise'=>'Private premise','language'=>'bn','createdAt'=>stamp()];$q=$db->prepare('INSERT INTO workspace(id,version,payload) VALUES(1,0,?)');$q->execute([json_encode($state)]);$q=null;
 $read=issueTokens($db,uuid(),oauthResource($config),'manuscript.read')['access_token'];$propose=issueTokens($db,uuid(),oauthResource($config),'manuscript.propose')['access_token'];
 $pipes=[];$process=proc_open([PHP_BINARY,'-d','xdebug.mode=off','-d','session.save_path='.$root.'/sessions','-S',$address,'-t',$root.'/public',$root.'/router.php'],[0=>['pipe','r'],1=>['file',$root.'/server.log','a'],2=>['file',$root.'/server.log','a']],$pipes);if(!is_resource($process))throw new RuntimeException('Cannot start isolated PHP server.');fclose($pipes[0]);
 for($i=0;$i<100;$i++){$connection=@fsockopen('127.0.0.1',(int)substr(strrchr($address,':'),1),$errno,$error,0.1);if($connection){fclose($connection);break;}usleep(20000);}
 $r=chapterRpc('',[],null,'tools/list');checkChapterHttp($r['status']===401,'Anonymous discovery denied');
 $r=chapterRpc('',[],$read,'tools/list');$tools=array_column($r['body']['result']['tools']??[],null,'name');checkChapterHttp(count($tools)===18&&isset($tools['save_chapter_proposal'],$tools['list_chapter_proposals'],$tools['read_chapter_proposal']),'Live tools/list exposes all 18 capabilities');
 checkChapterHttp(!isset($tools['accept_chapter_proposal'])&&$tools['save_chapter_proposal']['securitySchemes'][0]['scopes']===['manuscript.propose'],'Models have propose scope and no chapter approval tool');
 $r=chapterRpc('get_khosra_guide',[],$read);$guide=rpcChapterValue($r);checkChapterHttp(($guide['guideVersion']??0)===8&&isset($guide['newChapterProposals']),'Authenticated guide describes the real new-chapter workflow');
 $args=['operation_id'=>uuid(),'book_id'=>$bid,'title'=>'New arrival','synopsis'=>'An arrival','rationale'=>'A new opening','after_chapter_id'=>null,'paragraphs'=>[['id'=>uuid(),'label'=>1,'text'=>'স্টেশনে কেউ ছিল না।','section'=>'']]];
 $r=chapterRpc('save_chapter_proposal',$args,$read);checkChapterHttp(($r['body']['result']['isError']??false)&&str_contains($r['raw'],'Token scope'),'Read-only token cannot propose a chapter');
 $r=chapterRpc('save_chapter_proposal',$args,$propose);$saved=rpcChapterValue($r);checkChapterHttp(($saved['saved']??false)&&$saved['id']===$args['operation_id'],'Propose token stores a chapter suggestion over HTTP');
 checkChapterHttp(loadWorkspace($db)['state']['chapters']===[]&&loadWorkspace($db)['state']['revisions']===[],'MCP write leaves manuscript chapter and revision lists unchanged');
 $r=chapterRpc('save_chapter_proposal',$args,$propose);checkChapterHttp((rpcChapterValue($r)['duplicate']??false)&&loadWorkspace($db)['version']===1,'HTTP retries deduplicate');
 $r=chapterRpc('list_chapter_proposals',['book_id'=>$bid],$read);$list=rpcChapterValue($r);checkChapterHttp($list['total']===1&&!isset($list['proposals'][0]['paragraphs']),'HTTP metadata omits draft prose');
 $r=chapterRpc('read_chapter_proposal',['book_id'=>$bid,'proposal_id'=>$saved['id']],$propose);checkChapterHttp(($r['body']['result']['isError']??false)&&str_contains($r['raw'],'Token scope'),'Propose-only token cannot read private draft prose');
 $r=chapterRpc('read_chapter_proposal',['book_id'=>$bid,'proposal_id'=>$saved['id']],$read);checkChapterHttp(rpcChapterValue($r)['proposal']['paragraphs'][0]['text']===$args['paragraphs'][0]['text'],'Read token retrieves the pending suggestion');
 $bad=$args;$bad['operation_id']=uuid();$bad['status']='accepted';$r=chapterRpc('save_chapter_proposal',$bad,$propose);checkChapterHttp(($r['body']['result']['isError']??false)&&loadWorkspace($db)['version']===1,'Model cannot smuggle an acceptance status into a save');
 $r=chapterHttp('/api/login','POST',['password'=>$config['owner_password']]);checkChapterHttp($r['status']===200,'Owner signs in to confirm creation');$csrf=$r['body']['csrf'];$cookie='';foreach($r['headers'] as $h)if(str_starts_with(strtolower($h),'set-cookie:'))$cookie=explode(';',trim(substr($h,11)))[0];
 $loaded=loadWorkspace($db);$accepted=$loaded['state'];$id=$saved['id'];$accepted['chapters'][]=['id'=>$id,'bookId'=>$bid,'code'=>1,'position'=>0,'title'=>'Author approved title','headId'=>$id,'approvedId'=>null,'synopsis'=>'Author outline'];$accepted['revisions'][]=['id'=>$id,'chapterId'=>$id,'parentId'=>null,'createdAt'=>stamp(),'source'=>'proposal','edition'=>1,'message'=>'Accepted new chapter','paragraphs'=>$args['paragraphs']];$accepted['chapterProposals'][0]['status']='accepted';$accepted['chapterProposals'][0]['review']=['chapterId'=>$id,'revisionId'=>$id,'title'=>'Author approved title','synopsis'=>'Author outline','afterChapterId'=>null,'createdAt'=>stamp()];
 $body=['state'=>$accepted,'baseVersion'=>$loaded['version'],'operationId'=>uuid()];$r=chapterHttp('/api/workspace','POST',$body,['Cookie: '.$cookie]);checkChapterHttp($r['status']===403,'Owner acceptance requires CSRF');
 $headers=['Cookie: '.$cookie,'X-CSRF-Token: '.$csrf,'Origin: '.$origin];$r=chapterHttp('/api/workspace','POST',$body,$headers);checkChapterHttp($r['status']===200,'Confirmed owner creation persists through actual workspace endpoint');
 $r=chapterHttp('/api/workspace','POST',$body,$headers);checkChapterHttp($r['status']===200&&count(loadWorkspace($db)['state']['chapters'])===1,'Repeated owner write creates exactly one chapter');
 $r=chapterRpc('read_chapter',['chapter_id'=>$id],$read);checkChapterHttp(rpcChapterValue($r)['chapter']['title']==='Author approved title','Accepted chapter is now discoverable as current manuscript');
 $r=chapterRpc('read_chapter_proposal',['book_id'=>$bid,'proposal_id'=>$id],$read);checkChapterHttp(rpcChapterValue($r)['proposal']['review']['chapterId']===$id,'MCP receipt links suggestion to the created chapter');
 // A real MCP call drafted before the next owner save must retain that source.
 $loaded=loadWorkspace($db);$changed=$loaded['state'];$base=$changed['revisions'][0];$newer=$base;$newer['id']=uuid();$newer['parentId']=$base['id'];$newer['source']='author';$newer['paragraphs'][0]['text']='Newer author wording';$changed['revisions'][]=$newer;$changed['chapters'][0]['headId']=$newer['id'];
 writeWorkspace($db,$changed,$loaded['version'],uuid(),'http-author-edit');
 $rewrite=['operation_id'=>uuid(),'chapter_id'=>$id,'base_revision_id'=>$base['id'],'title'=>'Earlier-source rewrite','rationale'=>'Author will review overlap','paragraphs'=>$base['paragraphs']];$rewrite['paragraphs'][0]['text']='Suggested wording';
 $r=chapterRpc('save_proposal',$rewrite,$read);checkChapterHttp(($r['body']['result']['isError']??false),'Read-only token cannot submit an earlier-source rewrite');
 $r=chapterRpc('save_proposal',$rewrite,$propose);$value=rpcChapterValue($r);checkChapterHttp(($value['saved']??false)&&$value['stale']&&$value['baseRevisionId']===$base['id']&&$value['currentRevisionId']===$newer['id'],'Actual MCP submission accepts exact ancestor and reports newer head');
 $stored=loadWorkspace($db);checkChapterHttp($stored['state']['chapters'][0]['headId']===$newer['id']&&$stored['state']['proposals'][0]['baseRevisionId']===$base['id'],'MCP proposal preserves author head and original source');
 $r=chapterRpc('save_proposal',$rewrite,$propose);checkChapterHttp(rpcChapterValue($r)['duplicate']&&loadWorkspace($db)['version']===$stored['version'],'HTTP ancestor submission retries without duplication');
 $rewrite['operation_id']=uuid();$rewrite['base_revision_id']=uuid();$r=chapterRpc('save_proposal',$rewrite,$propose);checkChapterHttp(($r['body']['result']['isError']??false)&&loadWorkspace($db)['version']===$stored['version'],'HTTP unknown source remains rejected without mutation');
 // Author cleanup goes through normal owner authentication, CSRF and version checks.
 $loaded=loadWorkspace($db);$done=$loaded['state'];$done['proposals'][0]['status']='rejected';writeWorkspace($db,$done,$loaded['version'],uuid(),'owner-reject-for-cleanup');
 $loaded=loadWorkspace($db);$compacted=$loaded['state'];$removed=$compacted['proposals'][0]['id'];$compacted['proposals']=[];$compacted['chapterCleanups']=[['id'=>uuid(),'chapterId'=>$id,'createdAt'=>stamp(),'proposalIds'=>[$removed],'contextIds'=>[],'chapterProposalIds'=>[]]];
 $cleanupBody=['state'=>$compacted,'baseVersion'=>$loaded['version'],'operationId'=>uuid()];
 $r=chapterHttp('/api/workspace','POST',$cleanupBody);checkChapterHttp($r['status']===401,'Anonymous cleanup is denied');
 $r=chapterHttp('/api/workspace','POST',$cleanupBody,['Cookie: '.$cookie]);checkChapterHttp($r['status']===403,'Chapter cleanup requires CSRF');
 $r=chapterHttp('/api/workspace','POST',$cleanupBody,$headers);checkChapterHttp($r['status']===200&&loadWorkspace($db)['state']===$compacted,'Owner cleanup persists through actual workspace endpoint');
 $r=chapterHttp('/api/workspace','POST',$cleanupBody,$headers);checkChapterHttp($r['status']===200,'Identical cleanup retry is idempotent');
 $r=chapterRpc('read_proposal',['chapter_id'=>$id,'proposal_id'=>$removed],$read);checkChapterHttp(($r['body']['result']['isError']??false),'Removed proposal is absent from exact MCP read');
 $r=chapterRpc('save_proposal',array_replace($rewrite,['operation_id'=>$compacted['chapterCleanups'][0]['id']]),$propose);checkChapterHttp(($r['body']['result']['isError']??false),'Models cannot reuse a cleanup operation to change state');
 $oldBody=['state'=>$done,'baseVersion'=>loadWorkspace($db)['version'],'operationId'=>uuid()];$r=chapterHttp('/api/workspace','POST',$oldBody,$headers);checkChapterHttp($r['status']===409,'Older client cannot erase cleanup receipt or resurrect prose copies');
 echo "$count chapter HTTP checks passed.\n";
}finally{
 if(is_resource($process)){proc_terminate($process);proc_close($process);}unset($q,$db);
 $delete=function(string $dir)use(&$delete):void{foreach(scandir($dir)?:[] as $name){if($name==='.'||$name==='..')continue;$path=$dir.'/'.$name;if(is_dir($path))$delete($path);else unlink($path);}rmdir($dir);};$delete($root);
}
