<?php
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
require dirname(__DIR__).'/sharing.php';
$count=0;
function check(bool $condition,string $message):void{global $count;if(!$condition)throw new RuntimeException('FAIL: '.$message);$count++;echo 'PASS: '.$message.PHP_EOL;}
function rejects(callable $fn,int $code,string $label):void{try{$fn();throw new RuntimeException('Expected failure: '.$label);}catch(ApiError $e){check($e->status===$code,$label);}}
$s=blank();$bid=uuid();$cid=uuid();$rid=uuid();$pid=uuid();$s['books'][]=['id'=>$bid,'title'=>'রহস্য','premise'=>'চার বন্ধু','language'=>'bn','createdAt'=>stamp()];$s['chapters'][]=['id'=>$cid,'bookId'=>$bid,'code'=>1,'title'=>'অধ্যায় এক','position'=>0,'headId'=>$rid,'approvedId'=>null,'synopsis'=>''];$s['revisions'][]=['id'=>$rid,'chapterId'=>$cid,'parentId'=>null,'createdAt'=>stamp(),'source'=>'author','paragraphs'=>[['id'=>$pid,'label'=>1,'text'=>'ঈশান বলল, “চলো।”','section'=>'']],'edition'=>1,'message'=>'Initial'];validate($s);check(true,'Bengali workspace validates');
$bad=$s;$bad['revisions'][0]['paragraphs'][]=$bad['revisions'][0]['paragraphs'][0];rejects(fn()=>validate($bad),422,'Duplicate paragraph IDs rejected');
$bad=$s;$bad['chapters'][0]['headId']=uuid();rejects(fn()=>validate($bad),422,'Missing revision rejected');
$bad=$s;$bad['revisions'][0]['paragraphs'][0]['text']='Changed';rejects(fn()=>preserveHistory($s,$bad),409,'Historical prose cannot be changed');
$bad=$s;$bad['revisions']=[];rejects(fn()=>preserveHistory($s,$bad),409,'Historical records cannot disappear');
$bad=$s;$bad['contexts'][]=['id'=>uuid(),'chapterId'=>$cid,'revisionId'=>$rid,'summary'=>'Summary','facts'=>[['kind'=>'clue','text'=>'Clue','paragraphIds'=>[uuid()]]],'createdAt'=>stamp()];rejects(fn()=>validate($bad),422,'Context evidence must reference source paragraphs');
check(count(tools())===11,'Eleven tools exposed');check(!in_array('accept_proposal',array_column(tools(),'name'),true),'No model approval tool');
$deleted=$s;$deleted['chapters'][0]['deletedAt']='2026-10-26T12:00:00.000Z';validate($deleted);preserveHistory($s,$deleted);check(true,'Soft deletion retains history and validates');
$restored=$deleted;unset($restored['chapters'][0]['deletedAt']);validate($restored);preserveHistory($deleted,$restored);check($restored===$s,'Restoration preserves original chapter and source');
$bad=$deleted;$bad['chapters'][0]['deletedAt']='yesterday';rejects(fn()=>validate($bad),422,'Invalid deletion timestamp rejected');
$bad=$s;$bad['chapters']=[];rejects(fn()=>preserveHistory($s,$bad),409,'Physical chapter deletion rejected');
$shareBody=['bookId'=>$bid,'title'=>$s['books'][0]['title'],'language'=>'bn','chapters'=>[['id'=>$cid,'headId'=>$rid,'title'=>$s['chapters'][0]['title']]]];
$fixed=shareSnapshot($s,$shareBody);rejects(fn()=>shareSnapshot($deleted,$shareBody),409,'Trashed chapter excluded from new reading invitations');check($fixed['chapters'][0]['paragraphs'][0]['text']===$s['revisions'][0]['paragraphs'][0]['text'],'Existing shared snapshot unchanged by deletion');
if(in_array('sqlite',PDO::getAvailableDrivers(),true)){
 $memory=new PDO('sqlite::memory:');$memory->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$memory->exec('CREATE TABLE workspace(id INTEGER,version INTEGER,payload TEXT)');$memory->exec('CREATE TABLE operations(operation_id TEXT,payload_hash TEXT,result_version INTEGER)');$q=$memory->prepare('INSERT INTO workspace VALUES(1,1,?)');$q->execute([json_encode($deleted)]);
 check(callTool($memory,'list_books',[])['chapters']===[],'Tool list excludes chapters in Trash');
 check(callTool($memory,'read_chapter',['chapter_id'=>$cid])['chapter']['deletedAt']===$deleted['chapters'][0]['deletedAt'],'Explicit source reads retain deletion metadata');
 rejects(fn()=>callTool($memory,'save_proposal',['chapter_id'=>$cid]),409,'Tool cannot propose changes to a trashed chapter');
 rejects(fn()=>callTool($memory,'save_context',['chapter_id'=>$cid]),409,'Tool cannot index a trashed chapter');
 $retryArgs=['chapter_id'=>$cid,'operation_id'=>uuid()];$q=$memory->prepare('INSERT INTO operations VALUES(?,?,?)');$q->execute([$retryArgs['operation_id'],hash('sha256',json_encode(['save_proposal',$retryArgs],JSON_THROW_ON_ERROR)),1]);check(callTool($memory,'save_proposal',$retryArgs)['duplicate']===true,'Completed tool operation remains idempotent after chapter deletion');
}
$guideTool=array_values(array_filter(tools(),fn($t)=>$t['name']==='get_khosra_guide'))[0];
check($guideTool['annotations']['readOnlyHint']===true&&$guideTool['annotations']['destructiveHint']===false&&$guideTool['securitySchemes'][0]['scopes']===['manuscript.read'],'Guide is read-only and uses manuscript.read');
check($guideTool['inputSchema']['required']===[]&&$guideTool['inputSchema']['additionalProperties']===false,'Guide takes no arguments');
check(str_contains(khosraInstructions(),'get_khosra_guide'),'Initialize directs clients to the guide');
$guide=khosraGuide();$guideText=json_encode($guide,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
check(array_column($guide['tools'],'name')===array_column(tools(),'name'),'Guide tool inventory matches live tool definitions');
check(!str_contains($guideText,$bid)&&!str_contains($guideText,$pid)&&!str_contains($guideText,$s['books'][0]['title']),'Guide excludes workspace identities and prose');
foreach($guide['examples'] as $example){if(!is_array($example)||!isset($example['tool']))continue;$definition=array_values(array_filter(tools(),fn($t)=>$t['name']===$example['tool']))[0];check(array_diff($definition['inputSchema']['required'],array_keys($example['arguments']))===[]&&array_diff(array_keys($example['arguments']),array_keys($definition['inputSchema']['properties']))===[],'Guide example matches '.$example['tool'].' input fields');}
if(in_array('sqlite',PDO::getAvailableDrivers(),true)){
 $noWorkspace=new PDO('sqlite::memory:');check(callTool($noWorkspace,'get_khosra_guide',[])===$guide,'Guide works without any workspace tables');
 rejects(fn()=>callTool($noWorkspace,'get_khosra_guide',['chapter_id'=>$cid]),422,'Guide rejects unexpected arguments without workspace lookup');
}
if(getenv('KHOSRA_TEST_MYSQL')==='1'||in_array('--mysql',$argv,true)){
$db=new PDO('mysql:host=127.0.0.1;port=33319;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('CREATE DATABASE IF NOT EXISTS khosra_test');$db->exec('USE khosra_test');$db->exec(file_get_contents(dirname(__DIR__).'/schema.sql'));foreach(['oauth_codes','oauth_tokens','oauth_clients','auth_attempts'] as $table)$db->exec('DELETE FROM '.$table);$db->exec('DELETE FROM operations');$db->exec('DELETE FROM workspace');$q=$db->prepare('INSERT INTO workspace(id,version,payload) VALUES(1,0,?)');$q->execute([json_encode(blank())]);
$op=uuid();$v=writeWorkspace($db,$s,0,$op,'hash1');check($v===1,'Atomic first upload');check(writeWorkspace($db,$s,0,$op,'hash1')===1,'Retry deduplicated');rejects(fn()=>writeWorkspace($db,$s,0,$op,'hash2'),409,'Operation ID cannot be reused with different payload');rejects(fn()=>writeWorkspace($db,$s,0,uuid(),'hash3'),409,'Concurrent stale upload rejected');
$proposal=['operation_id'=>uuid(),'chapter_id'=>$cid,'base_revision_id'=>$rid,'title'=>'Rewrite','rationale'=>'Tone','paragraphs'=>$s['revisions'][0]['paragraphs']];$result=callTool($db,'save_proposal',$proposal);check($result['saved']===true,'Proposal saved through tool');$loaded=loadWorkspace($db);check($loaded['state']['chapters'][0]['headId']===$rid,'Tool did not change manuscript head');check(callTool($db,'save_proposal',$proposal)['duplicate']===true,'Tool retry deduplicated');$proposal['operation_id']=uuid();$proposal['base_revision_id']=uuid();rejects(fn()=>callTool($db,'save_proposal',$proposal),409,'Stale tool proposal rejected');
$context=['operation_id'=>uuid(),'chapter_id'=>$cid,'revision_id'=>$rid,'summary'=>'একটি সংক্ষিপ্তসার।','facts'=>[['kind'=>'event','text'=>'ঈশান কথা বলল।','paragraphIds'=>[$pid]]]];check(callTool($db,'save_context',$context)['saved']===true,'Context graph saved');check(callTool($db,'read_context',['chapter_id'=>$cid])['stale']===false,'Fresh context detected');check(callTool($db,'read_chapter',['chapter_id'=>$cid,'paragraph_ids'=>[$pid]])['revision']['paragraphs'][0]['text']==='ঈশান বলল, “চলো।”','Targeted Bengali passage retrieval');rejects(fn()=>callTool($db,'read_chapter',['chapter_id'=>$cid,'paragraph_ids'=>[uuid()]]),404,'Unknown paragraph fails safely');check(callTool($db,'resolve_reference',['book_id'=>$bid,'reference'=>'R1:C1-P1'])['revision']['paragraphs'][0]['id']===$pid,'Readable reference resolves to permanent paragraph');
}
echo "$count checks passed.".PHP_EOL;
