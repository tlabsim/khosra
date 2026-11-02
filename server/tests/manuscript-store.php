<?php
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
$count=0;
function verifyUnits(bool $ok,string $message):void{global $count;if(!$ok)throw new RuntimeException('FAIL: '.$message);$count++;echo 'PASS: '.$message.PHP_EOL;}
function rejectUnits(callable $call,int $status,string $message):void{try{$call();}catch(ApiError $e){verifyUnits($e->status===$status,$message);return;}throw new RuntimeException('Expected rejection: '.$message);}
function unitFixture():array{
 $s=blank();for($i=1;$i<=2;$i++){$b=uuid();$c=uuid();$r=uuid();$p=uuid();$s['books'][]=['id'=>$b,'title'=>'Manuscript '.$i,'premise'=>$i===1?str_repeat('বাংলা "\\,[]{}',2000):'','language'=>'bn','createdAt'=>stamp()];$s['chapters'][]=['id'=>$c,'bookId'=>$b,'code'=>1,'title'=>'Opening '.$i,'position'=>0,'headId'=>$r,'approvedId'=>null,'synopsis'=>''];$s['revisions'][]=['id'=>$r,'chapterId'=>$c,'parentId'=>null,'createdAt'=>stamp(),'source'=>'author','paragraphs'=>[['id'=>$p,'label'=>1,'text'=>'Original prose '.$i,'section'=>'']],'edition'=>1,'message'=>'Initial'];}return $s;
}
function unitDatabase(array $s):PDO{$dsn=getenv('KHOSRA_MANUSCRIPT_TEST_MYSQL')?:'sqlite::memory:';$db=openDatabase(['dsn'=>$dsn,'db_user'=>'root','db_password'=>'']);$mysql=$db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql';if($mysql)foreach(['manuscript_records','manuscript_units','workspace_storage_backup','workspace','operations'] as $table)$db->exec('DROP TABLE IF EXISTS '.$table);$db->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload '.($mysql?'LONGTEXT':'TEXT').')');$db->exec('CREATE TABLE operations(operation_id VARCHAR(36) PRIMARY KEY,payload_hash CHAR(64),result_version INTEGER)');$db->prepare('INSERT INTO workspace VALUES(1,7,?)')->execute([json_encode($s,JSON_THROW_ON_ERROR)]);return $db;}
$s=unitFixture();$db=unitDatabase($s);$raw=$db->query('SELECT payload FROM workspace')->fetchColumn();ensureManuscriptStorage($db);
verifyUnits(manuscriptStorage($db)&&strlen($db->query('SELECT payload FROM workspace')->fetchColumn())<200,'Workspace row becomes small metadata after streaming migration');
verifyUnits($db->query('SELECT payload FROM workspace_storage_backup')->fetchColumn()===$raw,'Migration retains an exact private recovery copy');
verifyUnits(loadWorkspace($db)['state']===$s&&loadWorkspace($db)['version']===8&&loadWorkspace($db,false,false)['fingerprint']===hash('sha256',$raw),'Migration preserves records/order/source fingerprint and fences legacy writes with a new cursor');
rejectUnits(fn()=>writeWorkspace($db,$s,7,uuid(),'legacy-inflight'),409,'Pre-migration owner saves cannot overwrite the migrated store');
ensureManuscriptStorage($db);verifyUnits((int)$db->query('SELECT COUNT(*) FROM workspace_storage_backup')->fetchColumn()===1,'Migration is idempotent');
$a=$s['books'][0]['id'];$b=$s['books'][1]['id'];$chapter=$s['chapters'][0];$revision=$s['revisions'][0];
verifyUnits(count(loadWorkspace($db,false,true,$a)['state']['books'])===1&&count(loadWorkspace($db,false,true,$a)['state']['revisions'])===1,'A manuscript read loads only its own records');
$other=$s['revisions'][1];$db->prepare("UPDATE manuscript_records SET payload='{' WHERE collection='revisions' AND record_id=?")->execute([$other['id']]);
verifyUnits(callTool($db,'read_chapter',['chapter_id'=>$chapter['id']])['revision']['id']===$revision['id'],'Reading one manuscript does not decode an unrelated manuscript');
$idea=['operation_id'=>uuid(),'book_id'=>$a,'title'=>'A clue','body'=>'Speculative'];$saved=callTool($db,'save_idea',$idea);verifyUnits($saved['saved']&&count(manuscriptState($db,$a)['materials'])===1,'A model write ignores unrelated manuscript prose');
$db->prepare("UPDATE manuscript_records SET payload=? WHERE collection='revisions' AND record_id=?")->execute([json_encode($other,JSON_UNESCAPED_UNICODE),$other['id']]);
verifyUnits(callTool($db,'save_idea',$idea)['duplicate'],'Normalized model saves retain durable retries');
$tools=[
 ['save_proposal',['chapter_id'=>$chapter['id'],'base_revision_id'=>$revision['id'],'title'=>'Full edit','rationale'=>'Synthetic','paragraphs'=>[array_replace($revision['paragraphs'][0],['text'=>'Suggested prose'])]]],
 ['save_proposal_edits',['chapter_id'=>$chapter['id'],'base_revision_id'=>$revision['id'],'title'=>'Sparse edit','rationale'=>'Synthetic','replacements'=>[['start_paragraph_id'=>$revision['paragraphs'][0]['id'],'end_paragraph_id'=>$revision['paragraphs'][0]['id'],'paragraphs'=>[['text'=>'Sparse suggestion']]]],'insertions'=>[]]],
 ['save_context',['chapter_id'=>$chapter['id'],'revision_id'=>$revision['id'],'summary'=>'Synthetic summary','facts'=>[]]],
 ['save_artifact',['book_id'=>$a,'title'=>'Reference','body'=>'Synthetic reference']],
 ['save_chapter_proposal',['book_id'=>$a,'title'=>'New chapter','synopsis'=>'An arrival','rationale'=>'Synthetic','after_chapter_id'=>$chapter['id'],'paragraphs'=>[array_replace($revision['paragraphs'][0],['id'=>uuid()])]]],
];
foreach($tools as [$name,$arguments]){$arguments['operation_id']=uuid();$result=callTool($db,$name,$arguments);verifyUnits(($result['saved']??false)&&callTool($db,$name,$arguments)['duplicate'],'Scoped '.$name.' saves and retries without changing another manuscript');}
verifyUnits(manuscriptState($db,$a)['chapters'][0]['headId']===$revision['id']&&count(manuscriptState($db,$a)['chapters'])===1,'Model saves retain current manuscript and author review gates');
$beforeB=manuscriptMeta($db,$b);$base=manuscriptMeta($db,$a);callTool($db,'save_idea',['operation_id'=>uuid(),'book_id'=>$b,'title'=>'Other clue','body'=>'Speculative']);
$op=uuid();writeWorkspace($db,fn($state)=>appendModelMaterial($state,'save_idea',['book_id'=>$a,'title'=>'Independent','body'=>'Speculative'],$op),$base['version'],$op,'independent',$base['fingerprint'],$a);
verifyUnits(manuscriptMeta($db,$b)['version']===$beforeB['version']+1,'An unrelated manuscript change does not invalidate a scoped save');
rejectUnits(fn()=>writeWorkspace($db,fn($x)=>$x,$base['version'],uuid(),'stale',$base['fingerprint'],$a),409,'Same-manuscript stale saves still conflict');
$global=manuscriptMeta($db);$otherVersion=manuscriptMeta($db,$b);$new=$revision;$new['id']=uuid();$new['parentId']=$revision['id'];$new['paragraphs'][0]['text']='Author edit';
$set=$new;unset($set['id']);$body=['action'=>'push','baseVersion'=>$global['version'],'baseFingerprint'=>$global['fingerprint'],'operationId'=>uuid(),'delta'=>['schemaVersion'=>1,'collections'=>[
 'revisions'=>['upserts'=>[['id'=>$new['id'],'set'=>$set,'unset'=>[]]],'remove'=>[],'order'=>[$revision['id'],$other['id'],$new['id']]],
 'chapters'=>['upserts'=>[['id'=>$chapter['id'],'set'=>['headId'=>$new['id']],'unset'=>[]]],'remove'=>[]],
]]];
$result=manuscriptPush($db,$body);verifyUnits($result['version']===$global['version']+1&&manuscriptState($db,$a)['chapters'][0]['headId']===$new['id'],'Owner differential saves update only the affected manuscript');
verifyUnits(manuscriptMeta($db,$b)===$otherVersion&&manuscriptState($db,$b)['revisions'][0]===$other,'Unrelated manuscript versions and content remain unchanged');
verifyUnits(manuscriptPush($db,$body)['duplicate'],'Owner differential retries are idempotent');
$meta=manuscriptMeta($db);$pulled=manuscriptPull($db,['action'=>'pull','version'=>$meta['version'],'fingerprint'=>$meta['fingerprint'],'ids'=>['revisions'=>[$new['id']]]]);
verifyUnits($pulled['records']['revisions'][0]['paragraphs']['format']==='paragraph-delta-v1','Record downloads retain paragraph differential encoding');
$bad=$body;$bad['operationId']=uuid();$bad['baseVersion']=$meta['version'];$bad['baseFingerprint']=$meta['fingerprint'];$bad['delta']['collections']=['chapters'=>['upserts'=>[['id'=>$chapter['id'],'set'=>['bookId'=>$b],'unset'=>[]]],'remove'=>[]]];
rejectUnits(fn()=>manuscriptPush($db,$bad),422,'Differential records cannot cross manuscript boundaries');
verifyUnits(manuscriptMeta($db)===$meta&&!$db->inTransaction(),'Rejected unit updates roll back every affected record');
$foreign=manuscriptState($db,$b)['materials'][0];$bad=$body;$bad['operationId']=uuid();$bad['baseVersion']=$meta['version'];$bad['baseFingerprint']=$meta['fingerprint'];$bad['delta']['collections']=['materialDeletions'=>['upserts'=>[['id'=>uuid(),'set'=>['itemId'=>$foreign['itemId'],'bookId'=>$a,'createdAt'=>stamp()],'unset'=>[]]],'remove'=>[]]];
rejectUnits(fn()=>manuscriptPush($db,$bad),422,'A tombstone cannot invalidate a different manuscript');
$catalog=callTool($db,'list_books',[]);verifyUnits(count($catalog['books'])===2&&count($catalog['chapters'])===2,'MCP discovery lists the library using metadata only');
$badDb=unitDatabase($s);$badDb->exec("UPDATE workspace SET payload='{\"schemaVersion\":1,\"books\":['");$before=$badDb->query('SELECT payload FROM workspace')->fetchColumn();
try{ensureManuscriptStorage($badDb);throw new RuntimeException('Malformed migration succeeded');}catch(ApiError|JsonException $e){verifyUnits($badDb->query('SELECT payload FROM workspace')->fetchColumn()===$before&&!$badDb->inTransaction(),'Malformed migration preserves the original workspace and rolls back');}
echo $count.' manuscript storage checks passed.'.PHP_EOL;
