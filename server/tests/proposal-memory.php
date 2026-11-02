<?php
declare(strict_types=1);
// Isolated synthetic 28 MiB workspace; workers enforce a 128 MiB PHP limit.
require dirname(__DIR__).'/lib.php';
if(($argv[1]??'')==='worker'){
 $meta=json_decode(file_get_contents($argv[3]),true);
 $db=openDatabase(['dsn'=>'sqlite:'.$argv[2]]);
 $args=['operation_id'=>$meta['operation'],'chapter_id'=>$meta['chapter'],'base_revision_id'=>$meta['revision'],'title'=>'Synthetic large chapter','rationale'=>'Memory regression'];
 if($argv[4]==='patch'){$args['replacements']=[['start_paragraph_id'=>$meta['paragraph'],'end_paragraph_id'=>$meta['paragraph'],'paragraphs'=>[['text'=>'সংশোধিত সূত্র।']]]];$args['insertions']=[];$name='save_proposal_edits';}
 else{$args['paragraphs']=$meta['paragraphs'];$args['paragraphs'][0]['text']='সংশোধিত সূত্র।';$name='save_proposal';}
 if($argv[4]==='context'){$name='save_context';$args=['operation_id'=>$meta['operation'],'chapter_id'=>$meta['chapter'],'revision_id'=>$meta['revision'],'summary'=>'Synthetic context','facts'=>[]];}
 diagnosticStart(['dsn'=>'sqlite:'.$argv[2],'origin'=>'https://memory.example']);diagnosticRpc(['method'=>'tools/call','params'=>['name'=>$name,'arguments'=>$args]]);
 $started=microtime(true);$response=mcpToolResult($db,['params'=>['name'=>$name,'arguments'=>$args]],['manuscript.propose']);
 diagnosticFinish(200);
 $result=json_decode($response['content'][0]['text']??'{}',true);
 if(($response['isError']??false)||!($result['saved']??false))throw new RuntimeException('Large tool submission failed.');
 $stored=loadWorkspace($db);
 if($stored['version']!==2||$stored['state']['chapters'][0]['headId']!==$meta['revision'])throw new RuntimeException('Tool changed current manuscript.');
 if($argv[4]==='context'){if(count($stored['state']['contexts'])!==1)throw new RuntimeException('Missing context.');}
 else{
  if(count($stored['state']['proposals'])!==1||$stored['state']['proposals'][0]['paragraphs'][0]['text']!=='সংশোধিত সূত্র।')throw new RuntimeException('Missing review snapshot.');
  if($stored['state']['revisions'][0]['paragraphs'][0]['text']!==$meta['paragraphs'][0]['text'])throw new RuntimeException('Source history was changed.');
 }
 unset($stored);
 $again=callTool($db,$name,$args);
 if(!($again['duplicate']??false)||$again['workspaceVersion']!==2)throw new RuntimeException('Lost-response retry was not idempotent.');
 $changed=$args;$changed['operation_id']=uuid();$changed['chapter_id']=uuid();
 try{callTool($db,$name,$changed);throw new RuntimeException('Unknown chapter accepted.');}catch(ApiError $e){if($e->status!==404)throw $e;}
 if($db->inTransaction()||loadWorkspace($db,false,false)['version']!==2)throw new RuntimeException('Rejected operation changed workspace or left a transaction.');
 echo json_encode(['saved'=>true,'retry'=>true,'historyPreserved'=>true,'peakMiB'=>round(memory_get_peak_usage(true)/1048576,1),'seconds'=>round(microtime(true)-$started,2)]).PHP_EOL;exit;
}
$root=sys_get_temp_dir().'/khosra-proposal-memory-'.bin2hex(random_bytes(5));mkdir($root);
try{
 $s=blank();$bid=uuid();$cid=uuid();$rid=uuid();$blocks=[];
 for($i=1;$i<=381;$i++)$blocks[]=['id'=>uuid(),'label'=>$i,'text'=>str_repeat('একটি রহস্যময় ঘটনা ঘটল। ',45),'section'=>''];
 $s['books'][]=['id'=>$bid,'title'=>'Synthetic mystery','premise'=>'','language'=>'bn','createdAt'=>stamp()];
 $s['chapters'][]=['id'=>$cid,'bookId'=>$bid,'code'=>1,'title'=>'Synthetic chapter','position'=>0,'headId'=>$rid,'approvedId'=>null,'synopsis'=>''];
 $parent=null;
 do{$rid=uuid();$s['revisions'][]=['id'=>$rid,'chapterId'=>$cid,'parentId'=>$parent,'createdAt'=>stamp(),'source'=>'author','paragraphs'=>$blocks,'edition'=>1,'message'=>'Synthetic history'];$parent=$rid;$s['chapters'][0]['headId']=$rid;$payload=json_encode($s,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);}while(strlen($payload)<28*1024*1024);
 echo 'Fixture '.round(strlen($payload)/1048576,2).' MiB, '.count($s['revisions']).' revisions, 381 paragraphs.'.PHP_EOL;
 $db=openDatabase(['dsn'=>'sqlite:'.$root.'/fixture.sqlite']);$db->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');$db->exec('CREATE TABLE operations(operation_id TEXT PRIMARY KEY,payload_hash TEXT,result_version INTEGER)');$q=$db->prepare('INSERT INTO workspace VALUES(1,1,?)');$q->execute([$payload]);unset($q,$db,$payload,$s);
 file_put_contents($root.'/meta.json',json_encode(['operation'=>uuid(),'chapter'=>$cid,'revision'=>$rid,'paragraph'=>$blocks[0]['id'],'paragraphs'=>$blocks],JSON_UNESCAPED_UNICODE));unset($blocks);
 foreach(['patch','full','context','fatal'] as $kind){copy($root.'/fixture.sqlite',$root.'/'.$kind.'.sqlite');$pipes=[];$p=proc_open([PHP_BINARY,'-d','xdebug.mode=off','-d','memory_limit='.($kind==='fatal'?'32M':'128M'),'-d','error_log='.$root.'/'.$kind.'.log',__FILE__,'worker',$root.'/'.$kind.'.sqlite',$root.'/meta.json',$kind],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fclose($pipes[0]);$output=stream_get_contents($pipes[1]);$errors=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$exit=proc_close($p);if($kind==='fatal'){if($exit===0||((diagnosticReport(['dsn'=>'sqlite:'.$root.'/'.$kind.'.sqlite'])['requests'][0]['reason']??'')!=='memory_exhausted'||(diagnosticReport(['dsn'=>'sqlite:'.$root.'/'.$kind.'.sqlite'])['requests'][0]['memoryLimit']??'')!=='32M'))throw new RuntimeException('Fatal memory failure was not diagnosed safely.');$check=openDatabase(['dsn'=>'sqlite:'.$root.'/'.$kind.'.sqlite']);if((int)$check->query('SELECT version FROM workspace WHERE id=1')->fetchColumn()!==1)throw new RuntimeException('Fatal failure changed the workspace.');unset($check);echo 'PASS: Fatal memory exhaustion records a safe request reference without saving'.PHP_EOL;continue;}if($exit!==0)throw new RuntimeException($kind.' failed at 128 MiB: '.$output.substr($errors,-1200));$result=json_decode(trim($output),true);if(!($result['saved']??false)||!($result['historyPreserved']??false))throw new RuntimeException('Missing worker result.');echo 'PASS: '.$kind.' saves/retries without changing source at 128 MiB; peak='.$result['peakMiB'].' MiB'.PHP_EOL;}

 copy($root.'/fixture.sqlite',$root.'/race.sqlite');$workers=[];
 for($i=0;$i<2;$i++){
  $pipes=[];$process=proc_open([PHP_BINARY,'-d','xdebug.mode=off','-d','memory_limit=128M','-d','error_log='.$root.'/race-'.$i.'.log',__FILE__,'worker',$root.'/race.sqlite',$root.'/meta.json','patch'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
  if(!is_resource($process))throw new RuntimeException('Cannot start isolated race worker.');fclose($pipes[0]);$workers[]=[$process,$pipes];
 }
 foreach($workers as [$process,$pipes]){$out=stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$status=proc_close($process);if($status!==0||!(json_decode(trim($out),true)['saved']??false))throw new RuntimeException('Concurrent identical save failed: '.$error.$out);}
 $check=openDatabase(['dsn'=>'sqlite:'.$root.'/race.sqlite']);if((int)$check->query('SELECT version FROM workspace WHERE id=1')->fetchColumn()!==2||(int)$check->query('SELECT COUNT(*) FROM operations')->fetchColumn()!==1)throw new RuntimeException('Concurrent save duplicated an operation.');unset($check);
 echo 'PASS: Concurrent identical large submissions commit one proposal and return consistent retries'.PHP_EOL;

}finally{foreach($workers??[] as [$worker])if(is_resource($worker)){if(proc_get_status($worker)['running'])proc_terminate($worker);proc_close($worker);}foreach(glob($root.'/*') as $file)unlink($file);rmdir($root);}
