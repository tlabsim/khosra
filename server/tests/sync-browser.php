<?php
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
$root=sys_get_temp_dir().'/khosra-sync-browser-'.bin2hex(random_bytes(5));mkdir($root.'/public/api',0700,true);mkdir($root.'/sessions',0700);$origin='http://127.0.0.1:18084';
 foreach(['lib.php','oauth.php','guide.php','materials.php','proposal-edits.php','workspace-sync.php','sharing.php'] as $file)copy(dirname(__DIR__).'/'.$file,$root.'/'.$file);
 copy(dirname(__DIR__).'/public/api/index.php',$root.'/public/api/index.php');
 file_put_contents($root.'/router.php',"<?php require __DIR__.'/public/api/index.php';");
 $config=['dsn'=>'sqlite:'.$root.'/fixture.sqlite','origin'=>$origin,'owner_password'=>'isolated-browser-sync-password','tool_token_hash'=>''];file_put_contents($root.'/config.php','<?php return '.var_export($config,true).';');
 $db=openDatabase($config);$db->exec(file_get_contents(dirname(__DIR__).'/schema.sqlite.sql'));$state=blank();$bid=uuid();$state['books'][]=['id'=>$bid,'title'=>'Private HTTP mystery','premise'=>'Private premise','language'=>'bn','createdAt'=>stamp()];$q=$db->prepare('INSERT INTO workspace(id,version,payload) VALUES(1,0,?)');$q->execute([json_encode($state)]);$q=null;

$cid=uuid();$rid=uuid();$paragraphs=[];for($i=1;$i<=180;$i++)$paragraphs[]=['id'=>uuid(),'label'=>$i,'text'=>str_repeat('গল্প',12500),'section'=>''];
$state['chapters'][]=['id'=>$cid,'bookId'=>$bid,'code'=>1,'title'=>'Large chapter','position'=>0,'headId'=>$rid,'approvedId'=>null,'synopsis'=>''];
$state['revisions'][]=['id'=>$rid,'chapterId'=>$cid,'parentId'=>null,'source'=>'author','edition'=>1,'createdAt'=>stamp(),'message'=>'Large initial source','paragraphs'=>$paragraphs];
$q=$db->prepare('UPDATE workspace SET version=1,payload=? WHERE id=1');$q->execute([json_encode($state,JSON_UNESCAPED_UNICODE)]);$q=null;unset($db);
echo json_encode(['root'=>$root,'origin'=>$origin],JSON_THROW_ON_ERROR);
