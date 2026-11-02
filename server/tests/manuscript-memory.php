<?php
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
if(($argv[1]??'')==='worker'){
 $meta=json_decode(file_get_contents($argv[3]),true);$db=openDatabase(['dsn'=>'sqlite:'.$argv[2]]);$start=microtime(true);ensureManuscriptStorage($db);$migrationPeak=memory_get_peak_usage(true);$migrationSeconds=microtime(true)-$start;
 if(manuscriptMeta($db)['fingerprint']!==$meta['fingerprint'])throw new RuntimeException('Migration changed its cursor.');
 $before=$db->query('SELECT book_id,version,fingerprint FROM manuscript_units ORDER BY book_id')->fetchAll(PDO::FETCH_ASSOC);
 $read=callTool($db,'read_chapter',['chapter_id'=>$meta['chapter']]);$paragraphs=$read['revision']['paragraphs'];foreach($paragraphs as &$p)$p['id']=uuid();unset($p);
 $args=['operation_id'=>uuid(),'book_id'=>$meta['book'],'title'=>'Proposed new chapter','synopsis'=>'A clue','rationale'=>'Memory regression','after_chapter_id'=>$meta['chapter'],'paragraphs'=>$paragraphs];unset($paragraphs);
 $config=['dsn'=>'sqlite:'.$argv[2],'origin'=>'https://memory.example'];diagnosticStart($config);diagnosticRpc(['method'=>'tools/call','params'=>['name'=>'save_chapter_proposal','arguments'=>$args]]);$result=callTool($db,'save_chapter_proposal',$args);diagnosticFinish(200);if(!($result['saved']??false)||!callTool($db,'save_chapter_proposal',$args)['duplicate'])throw new RuntimeException('Proposal failed or retry duplicated.');
 $source=$read['revision'];$next=$source;$next['id']=uuid();$next['parentId']=$source['id'];$next['paragraphs'][0]['text']='A revised clue';$next['source']='author';$set=$next;unset($set['id']);$set['paragraphs']=syncParagraphs($next['paragraphs'],$source);$cursor=manuscriptMeta($db);
 $body=['action'=>'push','baseVersion'=>$cursor['version'],'baseFingerprint'=>$cursor['fingerprint'],'operationId'=>uuid(),'delta'=>['schemaVersion'=>1,'collections'=>['revisions'=>['upserts'=>[['id'=>$next['id'],'set'=>$set,'unset'=>[]]],'remove'=>[]],'chapters'=>['upserts'=>[['id'=>$meta['chapter'],'set'=>['headId'=>$next['id']],'unset'=>[]]],'remove'=>[]]]]];
 manuscriptPush($db,$body);if(!manuscriptPush($db,$body)['duplicate'])throw new RuntimeException('Differential retry failed.');
 foreach($before as $row)if($row['book_id']!==$meta['book']&&manuscriptMeta($db,$row['book_id'])!==['version'=>(int)$row['version'],'fingerprint'=>$row['fingerprint']])throw new RuntimeException('Unrelated manuscript was touched.');
 if(manuscriptRecord($db,'revisions',$source['id'])!==$source)throw new RuntimeException('Source history changed.');
 if((int)$db->query('SELECT LENGTH(CAST(payload AS BLOB)) FROM workspace_storage_backup WHERE id=1')->fetchColumn()!==$meta['bytes'])throw new RuntimeException('Legacy recovery copy incomplete.');
 echo json_encode(['migrationPeakMiB'=>round($migrationPeak/1048576,1),'peakMiB'=>round(memory_get_peak_usage(true)/1048576,1),'migrationSeconds'=>round($migrationSeconds,2),'saved'=>true,'units'=>count($before),'bytes'=>$meta['bytes']]).PHP_EOL;exit;
}
$root=sys_get_temp_dir().'/khosra-unit-memory-'.bin2hex(random_bytes(5));mkdir($root);
try{
 $s=blank();$first=null;$firstChapter=null;
 for($n=0;$n<12;$n++){$bid=uuid();$cid=uuid();$rid=uuid();$blocks=[];for($i=1;$i<=200;$i++)$blocks[]=['id'=>uuid(),'label'=>$i,'text'=>str_repeat('রহস্যময় ঘটনা। ',80),'section'=>''];$s['books'][]=['id'=>$bid,'title'=>'Synthetic manuscript '.$n,'premise'=>'','language'=>'bn','createdAt'=>stamp()];$s['chapters'][]=['id'=>$cid,'bookId'=>$bid,'code'=>1,'title'=>'Chapter','position'=>0,'headId'=>$rid,'approvedId'=>null,'synopsis'=>''];$parent=null;for($j=0;$j<15;$j++){$rid=uuid();$s['revisions'][]=['id'=>$rid,'chapterId'=>$cid,'parentId'=>$parent,'createdAt'=>stamp(),'source'=>'author','paragraphs'=>$blocks,'edition'=>1,'message'=>'Synthetic history'];$parent=$rid;}$s['chapters'][$n]['headId']=$rid;if($n===0){$first=$bid;$firstChapter=$cid;}}
 $raw=json_encode($s,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);$meta=['book'=>$first,'chapter'=>$firstChapter,'bytes'=>strlen($raw),'fingerprint'=>hash('sha256',$raw)];
 echo 'Fixture '.round(strlen($raw)/1048576,2).' MiB across 12 manuscripts.'.PHP_EOL;$db=openDatabase(['dsn'=>'sqlite:'.$root.'/fixture.sqlite']);$db->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');$db->exec('CREATE TABLE operations(operation_id TEXT PRIMARY KEY,payload_hash TEXT,result_version INTEGER)');$q=$db->prepare('INSERT INTO workspace VALUES(1,1,?)');$q->execute([$raw]);unset($q,$raw,$s,$blocks,$db);file_put_contents($root.'/meta.json',json_encode($meta));
 $pipes=[];$worker=proc_open([PHP_BINARY,'-d','xdebug.mode=off','-d','memory_limit=128M','-d','error_log='.$root.'/worker.log',__FILE__,'worker',$root.'/fixture.sqlite',$root.'/meta.json'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fclose($pipes[0]);$out=stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$exit=proc_close($worker);if($exit!==0||!(json_decode(trim($out),true)['saved']??false))throw new RuntimeException('Unit memory worker failed: '.$out.$error);
 echo 'PASS: Streaming migration, new-chapter save, differential owner edit, retries and history preservation at 128 MiB: '.$out;
}finally{foreach(glob($root.'/*') as $file)unlink($file);rmdir($root);}
