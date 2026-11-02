<?php
declare(strict_types=1);
require __DIR__.'/run.php';
$db=openDatabase(['dsn'=>'sqlite::memory:']);
$db->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');
$db->exec('CREATE TABLE operations(operation_id TEXT PRIMARY KEY,payload_hash TEXT,result_version INTEGER)');
$original=$s['revisions'][0];$extra=uuid();$newer=$original;
$newer['id']=uuid();$newer['parentId']=$rid;$newer['edition']=2;
$newer['paragraphs']=[['id'=>$extra,'label'=>1,'text'=>'Author introduction','section'=>''],array_replace($original['paragraphs'][0],['label'=>2])];
$s['revisions'][]=$newer;$s['chapters'][0]['headId']=$newer['id'];$s['chapters'][0]['approvedId']=$rid;
validate($s);check(true,'Automatic numbering edition validates without changing immutable source');
$q=$db->prepare('INSERT INTO workspace VALUES(1,1,?)');$q->execute([json_encode($s)]);
check(proposalSource($s,$newer,$rid)===$original,'Exact ancestor remains eligible across numbering editions');
$unknown=$original;$unknown['id']=uuid();$branched=$s;$branched['revisions'][]=$unknown;
rejects(fn()=>proposalSource($branched,$newer,$unknown['id']),409,'Unrelated branch is still rejected');
foreach([
 ['reference'=>'C1-P1','expected'=>$extra],
 ['reference'=>'R1:C1-P1','expected'=>$pid],
 ['reference'=>'R2:C1-P2','expected'=>$pid],
 ['reference'=>'C1-P1','revision_id'=>$rid,'expected'=>$pid],
] as $case){$expected=$case['expected'];unset($case['expected']);$result=callTool($db,'resolve_reference',array_merge(['book_id'=>$bid],$case));check($result['revision']['paragraphs'][0]['id']===$expected,'Reference resolves correct UUID: '.$case['reference'].(isset($case['revision_id'])?' with exact source':''));}
$read=callTool($db,'read_chapter',['chapter_id'=>$cid,'paragraph_ids'=>[$pid]]);
check($read['revision']['paragraphs'][0]['label']===2,'Targeted MCP read retains full-snapshot position P2');
$full=['operation_id'=>uuid(),'chapter_id'=>$cid,'base_revision_id'=>$rid,'title'=>'Before renumbering','rationale'=>'Exact UUID source','paragraphs'=>[array_replace($original['paragraphs'][0],['text'=>'Proposed text'])]];
$result=callTool($db,'save_proposal',$full);check($result['saved']&&$result['stale']&&$result['baseRevisionId']===$rid,'Full proposal saves against source from earlier numbering edition');
$args=['operation_id'=>uuid(),'chapter_id'=>$cid,'base_revision_id'=>$rid,'title'=>'Differential before renumbering','rationale'=>'Exact UUID source','replacements'=>[['start_paragraph_id'=>$pid,'end_paragraph_id'=>$pid,'paragraphs'=>[['text'=>'Proposed differential text']]]],'insertions'=>[]];
$result=callTool($db,'save_proposal_edits',$args);$loaded=loadWorkspace($db);$proposal=record($loaded['state']['proposals'],$result['id']);
check($result['saved']&&$result['stale']&&$proposal['paragraphs'][0]['id']===$pid&&$proposal['paragraphs'][0]['label']===1,'Differential proposal preserves immutable source addresses across numbering editions');
check($loaded['state']['chapters'][0]['headId']===$newer['id']&&$loaded['state']['chapters'][0]['approvedId']===$rid&&$loaded['state']['revisions']===$s['revisions'],'MCP submissions never change working prose, approval or earlier numbers');
check(callTool($db,'save_proposal_edits',$args)['duplicate']===true,'Cross-edition differential retry remains idempotent');
check(khosraGuide()['guideVersion']===11,'Discovery guide advertises automatic numbering and UUID anchors');
echo "Paragraph numbering and MCP checks passed.\n";
