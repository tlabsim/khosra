<?php
declare(strict_types=1);
require __DIR__.'/run.php';
$original=$s;
$preface=uuid();$prefaceRevision=uuid();$prefaceParagraph=uuid();
$s['chapters'][0]['position']=1;
$s['chapters'][]=['id'=>$preface,'bookId'=>$bid,'code'=>0,'title'=>'ভূমিকা','position'=>0,'headId'=>$prefaceRevision,'approvedId'=>null,'synopsis'=>''];
$s['revisions'][]=['id'=>$prefaceRevision,'chapterId'=>$preface,'parentId'=>null,'createdAt'=>stamp(),'source'=>'author','edition'=>1,'message'=>'Preface created','paragraphs'=>[['id'=>$prefaceParagraph,'label'=>1,'text'=>'পাঠকের জন্য।','section'=>'']]];
validate($s);preserveHistory($original,$s);check(true,'New C0 validates and preserves existing history');
$body=['bookId'=>$bid,'title'=>$s['books'][0]['title'],'language'=>'bn','chapters'=>array_map(fn($c)=>['id'=>$c['id'],'headId'=>$c['headId'],'title'=>$c['title']],$s['chapters'])];
$snapshot=shareSnapshot($s,$body);
check(array_column($snapshot['chapters'],'number')===[0,1],'Guest snapshot orders preface before regular chapter one');
$body['chapters']=[$body['chapters'][0]];
check(shareSnapshot($s,$body)['chapters'][0]['number']===1,'Sharing only a regular chapter retains its manuscript number');
$bad=$s;$bad['chapters'][1]['code']=-1;rejects(fn()=>validate($bad),422,'Negative chapter codes rejected');
$bad=$s;$bad['chapters'][0]['code']=0;rejects(fn()=>validate($bad),422,'Duplicate C0 rejected');
if(in_array('sqlite',PDO::getAvailableDrivers(),true)){
 $memory=new PDO('sqlite::memory:');$memory->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
 $memory->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');
 $memory->exec('CREATE TABLE operations(operation_id TEXT PRIMARY KEY,payload_hash TEXT,result_version INTEGER)');
 $memory->prepare('INSERT INTO workspace VALUES(1,1,?)')->execute([json_encode($s,JSON_UNESCAPED_UNICODE)]);
 $result=callTool($memory,'resolve_reference',['book_id'=>$bid,'reference'=>'C0-P1']);
 check($result['chapter']['id']===$preface&&$result['revision']['paragraphs'][0]['id']===$prefaceParagraph,'MCP resolves C0-P1 to preface UUID');
 check(callTool($memory,'read_chapter',['chapter_id'=>$preface])['reference']==='R1:C0','MCP reads preface with stable C0 reference');
 $proposal=callTool($memory,'save_proposal_edits',['operation_id'=>uuid(),'chapter_id'=>$preface,'base_revision_id'=>$prefaceRevision,'title'=>'Revised preface','rationale'=>'Author request','replacements'=>[['start_paragraph_id'=>$prefaceParagraph,'end_paragraph_id'=>$prefaceParagraph,'paragraphs'=>[['text'=>'নতুন ভূমিকা।']]]],'insertions'=>[]]);
 check($proposal['saved']===true,'MCP can propose a preface revision');
}
echo "Preface checks passed.\n";
