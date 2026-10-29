<?php
// Isolated in-memory SQLite; no production data or credentials.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
$count=0;
function chapterCheck(bool $ok,string $label):void {global $count;if(!$ok)throw new RuntimeException('FAIL: '.$label);echo 'PASS: '.$label.PHP_EOL;$count++;}
function chapterReject(callable $f,int $status,string $label):void {try{$f();}catch(ApiError $e){chapterCheck($e->status===$status,$label);return;}throw new RuntimeException('Expected rejection: '.$label);}
$db=openDatabase(['dsn'=>'sqlite::memory:']);$db->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');$db->exec('CREATE TABLE operations(operation_id TEXT PRIMARY KEY,payload_hash TEXT,result_version INTEGER)');
$s=blank();$bid=uuid();$other=uuid();foreach([$bid,$other] as $b)$s['books'][]=['id'=>$b,'title'=>'Mystery','premise'=>'','language'=>'bn','createdAt'=>stamp()];$q=$db->prepare('INSERT INTO workspace VALUES(1,0,?)');$q->execute([json_encode($s)]);
$args=['operation_id'=>uuid(),'book_id'=>$bid,'title'=>'  নতুন অধ্যায়  ','synopsis'=>'A clue','rationale'=>'Continue the story','after_chapter_id'=>null,'paragraphs'=>[['id'=>uuid(),'label'=>1,'text'=>'একটি নতুন সূত্র।','section'=>'']]];
$r=callTool($db,'save_chapter_proposal',$args);$id=$r['id'];$loaded=loadWorkspace($db);$pending=$loaded['state'];
chapterCheck($r['saved']&&$pending['chapters']===[]&&$pending['revisions']===[],'Model suggestion never creates a manuscript chapter or revision');
chapterCheck($pending['chapterProposals'][0]['status']==='pending','New-chapter proposal waits for author confirmation');
chapterCheck(callTool($db,'save_chapter_proposal',$args)['duplicate']&&loadWorkspace($db)['version']===$loaded['version'],'Identical retries deduplicate without another write');
$changed=$args;$changed['title']='Changed';chapterReject(fn()=>callTool($db,'save_chapter_proposal',$changed),409,'Operation ID cannot be reused with different content');
chapterCheck(callTool($db,'read_chapter_proposal',['book_id'=>$bid,'proposal_id'=>$id])['proposal']['paragraphs']===$args['paragraphs'],'Exact read returns original suggested paragraphs');
chapterReject(fn()=>callTool($db,'read_chapter_proposal',['book_id'=>$other,'proposal_id'=>$id]),404,'Proposal reads are scoped to the correct manuscript');
$list=callTool($db,'list_chapter_proposals',['book_id'=>$bid]);chapterCheck($list['total']===1&&!isset($list['proposals'][0]['paragraphs']),'Metadata discovery omits draft prose');
foreach([['status'=>'accepted'],['review'=>[]],['chapter_id'=>uuid()],['paragraphs'=>[]],['title'=>str_repeat('😀',151)],['after_chapter_id'=>uuid()]] as $patch){$bad=array_replace($args,$patch,['operation_id'=>uuid()]);chapterReject(fn()=>callTool($db,'save_chapter_proposal',$bad),in_array('after_chapter_id',array_keys($patch),true)?404:422,'Malformed or unauthorized chapter proposal is rejected');}
$bad=$args;unset($bad['after_chapter_id']);$bad['operation_id']=uuid();chapterReject(fn()=>callTool($db,'save_chapter_proposal',$bad),422,'Position must be explicit');
$bad=$args;$bad['operation_id']=uuid();$bad['paragraphs'][]=$bad['paragraphs'][0];chapterReject(fn()=>callTool($db,'save_chapter_proposal',$bad),422,'Duplicate draft references rejected');
$bad=$pending;$bad['chapterProposals']=null;chapterReject(fn()=>validate($bad),422,'Malformed optional collection rejected');
$old=$s;unset($old['chapterProposals']);validate($old);chapterCheck(true,'Old workspaces without new collection still validate');
$accepted=$pending;$p=$accepted['chapterProposals'][0];$rid=$id;
$accepted['chapters'][]=['id'=>$id,'bookId'=>$bid,'code'=>1,'title'=>'Author title','position'=>0,'headId'=>$rid,'approvedId'=>null,'synopsis'=>'Author synopsis'];
$accepted['revisions'][]=['id'=>$rid,'chapterId'=>$id,'parentId'=>null,'createdAt'=>stamp(),'source'=>'proposal','paragraphs'=>$p['paragraphs'],'edition'=>1,'message'=>'New chapter accepted'];
$accepted['chapterProposals'][0]['status']='accepted';$accepted['chapterProposals'][0]['review']=['chapterId'=>$id,'revisionId'=>$rid,'title'=>'Author title','synopsis'=>'Author synopsis','afterChapterId'=>null,'createdAt'=>stamp()];
validate($accepted);preserveHistory($pending,$accepted);$v=writeWorkspace($db,$accepted,$loaded['version'],uuid(),'owner-accept');
chapterCheck($v===$loaded['version']+1&&count(callTool($db,'list_books',[])['chapters'])===1,'Confirmed owner acceptance creates exactly one working chapter');
chapterCheck(loadWorkspace($db)['state']['chapterProposals'][0]['paragraphs']===$p['paragraphs'],'Acceptance preserves the immutable proposed draft');
chapterCheck(callTool($db,'save_chapter_proposal',$args)['duplicate']&&count(loadWorkspace($db)['state']['chapters'])===1,'Retry after acceptance still cannot create another chapter');
$bad=$accepted;$bad['chapterProposals'][0]['status']='pending';unset($bad['chapterProposals'][0]['review']);chapterReject(fn()=>preserveHistory($accepted,$bad),409,'Completed chapter decision cannot be reopened');
$bad=$accepted;$bad['chapterProposals'][0]['review']['title']='Changed receipt';chapterReject(fn()=>preserveHistory($accepted,$bad),409,'Completed creation receipt is immutable');
$bad=$accepted;$bad['chapterProposals'][0]['paragraphs'][0]['text']='Changed source';chapterReject(fn()=>preserveHistory($accepted,$bad),409,'Original chapter proposal is immutable');
$bad=$accepted;unset($bad['chapterProposals']);chapterReject(fn()=>preserveHistory($accepted,$bad),409,'Older clients cannot erase new-chapter proposals');
$bad=$pending;$bad['chapterProposals'][0]['status']='accepted';chapterReject(fn()=>validate($bad),422,'Acceptance without a created chapter receipt rejected');
$foreign=$args;$foreign['operation_id']=uuid();$foreign['book_id']=$other;$foreign['after_chapter_id']=$id;chapterReject(fn()=>callTool($db,'save_chapter_proposal',$foreign),422,'Cross-manuscript placement blocked');
$trashed=$accepted;$trashed['chapters'][0]['deletedAt']=stamp();writeWorkspace($db,$trashed,$v,uuid(),'trash-anchor');$bad=$args;$bad['operation_id']=uuid();$bad['after_chapter_id']=$id;chapterReject(fn()=>callTool($db,'save_chapter_proposal',$bad),422,'Trashed placement blocked at submission');
$rejected=$pending;$rejected['chapterProposals'][0]['status']='rejected';validate($rejected);preserveHistory($pending,$rejected);chapterCheck($rejected['chapters']===[]&&$rejected['revisions']===[],'Rejection records decision without creating a chapter');
$many=$trashed;for($i=0;$i<101;$i++){$copy=$p;$copy['id']=uuid();$copy['createdAt']=gmdate('Y-m-d\TH:i:s\Z',time()+$i+1);$many['chapterProposals'][]=$copy;}
writeWorkspace($db,$many,loadWorkspace($db)['version'],uuid(),'pagination');$first=callTool($db,'list_chapter_proposals',['book_id'=>$bid]);$second=callTool($db,'list_chapter_proposals',['book_id'=>$bid,'page'=>2]);chapterCheck(count($first['proposals'])===100&&count($second['proposals'])===2&&$first['total']===102,'New-chapter metadata paginates at 100');chapterCheck($first['proposals'][0]['createdAt']>$first['proposals'][99]['createdAt'],'Newest chapter proposals appear first');
chapterCheck(callTool($db,'list_chapter_proposals',['book_id'=>$bid,'status'=>'accepted'])['total']===1,'Discovery filters by review status');chapterReject(fn()=>callTool($db,'list_chapter_proposals',['book_id'=>$bid,'page'=>0]),422,'Invalid page rejected');
$tools=array_column(tools(),null,'name');chapterCheck(count($tools)===18&&$tools['save_chapter_proposal']['securitySchemes'][0]['scopes']===['manuscript.propose']&&!$tools['save_chapter_proposal']['annotations']['readOnlyHint'],'Discovery exposes 18 tools with write scope for chapter suggestions');
chapterCheck($tools['read_chapter_proposal']['securitySchemes'][0]['scopes']===['manuscript.read']&&khosraGuide()['guideVersion']===8,'Read scope and updated guide expose the new workflow');
echo "$count chapter proposal checks passed.\n";
