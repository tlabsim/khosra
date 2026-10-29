<?php
declare(strict_types=1);
require __DIR__.'/run.php';
$db=openDatabase(['dsn'=>'sqlite::memory:']);$db->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');$db->exec('CREATE TABLE operations(operation_id TEXT PRIMARY KEY,payload_hash TEXT,result_version INTEGER)');
$state=$s;$blocks=[];
for($i=1;$i<=1000;$i++)$blocks[]=['id'=>$i===1?$pid:uuid(),'label'=>$i,'text'=>'রহস্যের সূত্র '.$i.'। গ্রামের পথে তারা এগিয়ে গেল।','section'=>$i===1?'প্রথম দৃশ্য':''];
$state['revisions'][0]['paragraphs']=array_merge($blocks,[['id'=>uuid(),'label'=>5000,'text'=>'Deleted passage','section'=>'']]);
$base=$state['revisions'][0];$base['id']=uuid();$base['parentId']=$rid;$base['paragraphs']=$blocks;$state['revisions'][]=$base;$state['chapters'][0]['headId']=$base['id'];$state['chapters'][0]['approvedId']=$rid;
$q=$db->prepare('INSERT INTO workspace VALUES(1,1,?)');$q->execute([json_encode($state)]);
$common=['operation_id'=>uuid(),'chapter_id'=>$cid,'base_revision_id'=>$base['id'],'title'=>'A targeted revision','rationale'=>'The next clue','replacements'=>[],'insertions'=>[]];
$request=fn(array $patch=[])=>array_replace($common,['operation_id'=>uuid()],$patch);
$replace=fn(int $a,int $b,array $rows)=>['start_paragraph_id'=>$blocks[$a]['id'],'end_paragraph_id'=>$blocks[$b]['id'],'paragraphs'=>array_map(fn($text)=>is_array($text)?$text:['text'=>$text],$rows)];
$single=$request(['replacements'=>[$replace(0,0,['নতুন সূচনা।'])]]);$saved=callTool($db,'save_proposal_edits',$single);$loaded=loadWorkspace($db);$p=record($loaded['state']['proposals'],$saved['id']);
check($saved['saved']&&$saved['id']===$single['operation_id']&&$p['baseRevisionId']===$base['id'],'Differential tool saves a pending proposal with durable identity and exact source');
check(count($p['paragraphs'])===1000&&$p['paragraphs'][0]===array_replace($blocks[0],['text'=>'নতুন সূচনা।'])&&array_slice($p['paragraphs'],1)===array_slice($blocks,1),'One changed paragraph retains all 999 untouched paragraphs and preserves its heading/identity');
check($loaded['state']['chapters']===$state['chapters']&&$loaded['state']['revisions']===$state['revisions'],'Tool never changes manuscript, approval or source history');
$full=['operation_id'=>uuid(),'chapter_id'=>$cid,'base_revision_id'=>$base['id'],'title'=>$single['title'],'rationale'=>$single['rationale'],'paragraphs'=>$p['paragraphs']];
check(strlen(json_encode($single))<strlen(json_encode($full))/100,'Single-paragraph payload is over 99 percent smaller than this 1000-paragraph full snapshot');
$again=callTool($db,'save_proposal_edits',$single);check($again['duplicate']&&$again['id']===$saved['id']&&loadWorkspace($db)['version']===$loaded['version'],'Identical retry returns stable proposal ID without duplication');
$bad=$single;$bad['title']='Changed';rejects(fn()=>callTool($db,'save_proposal_edits',$bad),409,'Changed request cannot reuse operation ID');
$removed=proposalEditParagraphs($state,$base,$request(['replacements'=>[$replace(2,4,[])]]));check(count($removed)===997&&$removed[2]===$blocks[5],'Inclusive range deletion preserves following identities and labels without renumbering');
$fewer=proposalEditParagraphs($state,$base,$request(['replacements'=>[$replace(2,4,['Joined'])]]));check(count($fewer)===998&&$fewer[2]===array_replace($blocks[2],['text'=>'Joined'])&&$fewer[3]===$blocks[5],'Many-to-one replacement retains first source identity and removes trailing source blocks');
$moreArgs=$request(['replacements'=>[$replace(0,0,['First','Second','Third'])]]);$more=proposalEditParagraphs($state,$base,$moreArgs);
check(count($more)===1002&&$more[0]['id']===$pid&&$more[0]['section']==='প্রথম দৃশ্য'&&$more[1]['section']===''&&$more[1]['label']===5001&&$more[2]['label']===5002,'One-to-many replacement allocates server references above historically reserved labels');
check($more[1]['id']!==$more[2]['id']&&idvalid($more[1]['id'])&&$more[3]===$blocks[1],'Split paragraphs receive unique UUIDs and preserve subsequent source');
$clear=proposalEditParagraphs($state,$base,$request(['replacements'=>[$replace(0,0,[['text'=>'Changed','section'=>'']])]]));check($clear[0]['section']==='','Explicit empty section removes a source heading');
$inserts=$request(['insertions'=>[['after_paragraph_id'=>$blocks[999]['id'],'paragraphs'=>[['text'=>'End']]],['after_paragraph_id'=>null,'paragraphs'=>[['text'=>'Start']]],['after_paragraph_id'=>$blocks[4]['id'],'paragraphs'=>[['text'=>'Middle A'],['text'=>'Middle B','section'=>'দ্বিতীয় দৃশ্য']]]]]);
$inserted=proposalEditParagraphs($state,$base,$inserts);check(count($inserted)===1004&&$inserted[0]['text']==='Start'&&$inserted[6]['text']==='Middle A'&&$inserted[7]['section']==='দ্বিতীয় দৃশ্য'&&end($inserted)['text']==='End','Prepend, middle and append insertions resolve against the source regardless of request order');
$multiple=proposalEditParagraphs($state,$base,$request(['replacements'=>[$replace(8,8,['Late']),$replace(1,2,['Early'])]]));check($multiple[1]['text']==='Early'&&$multiple[7]['text']==='Late'&&$multiple[8]===$blocks[9],'Multiple range edits use source indices rather than shifting output positions');
$boundaries=proposalEditParagraphs($state,$base,$request(['replacements'=>[$replace(2,4,[])],'insertions'=>[['after_paragraph_id'=>$blocks[1]['id'],'paragraphs'=>[['text'=>'Before range']]],['after_paragraph_id'=>$blocks[4]['id'],'paragraphs'=>[['text'=>'After range']]]]]));check($boundaries[2]['text']==='Before range'&&$boundaries[3]['text']==='After range'&&$boundaries[4]===$blocks[5],'Insertions at replacement boundaries have unambiguous order even when anchor is deleted');
$emptyBase=array_replace($base,['paragraphs'=>[]]);$empty=proposalEditParagraphs($state,$emptyBase,$request(['insertions'=>[['after_paragraph_id'=>null,'paragraphs'=>[['text'=>'First passage']]]]]));check(count($empty)===1&&$empty[0]['label']===5001,'Prepending works on an existing empty chapter');
check(proposalEditParagraphs($state,$base,$request(['replacements'=>[$replace(0,999,[])]]))===[],'Explicit complete-range deletion is supported');
$badRequests=[
 $request(),
 $request(['replacements'=>null]),
 $request(['replacements'=>[$replace(0,2,['A']),$replace(2,3,['B'])]]),
 $request(['replacements'=>[$replace(3,2,['Reverse'])]]),
 $request(['replacements'=>[$replace(2,4,[])],'insertions'=>[['after_paragraph_id'=>$blocks[2]['id'],'paragraphs'=>[['text'=>'Interior']]]]]),
 $request(['insertions'=>[['after_paragraph_id'=>null,'paragraphs'=>[['text'=>'A']]],['after_paragraph_id'=>null,'paragraphs'=>[['text'=>'B']]]]]),
 $request(['insertions'=>[['after_paragraph_id'=>uuid(),'paragraphs'=>[['text'=>'Unknown']]]]]),
 $request(['insertions'=>[['after_paragraph_id'=>'P1','paragraphs'=>[['text'=>'Label']]]]]),
 $request(['insertions'=>[['after_paragraph_id'=>null,'paragraphs'=>[]]]]),
 $request(['replacements'=>[$replace(0,0,[['id'=>uuid(),'label'=>5,'text'=>'Bad reference']])]]),
 $request(['replacements'=>[$replace(0,0,[['text'=>null]])]]),
 $request(['replacements'=>[$replace(0,0,[['text'=>'Bad section','section'=>null]])]]),
 $request(['replacements'=>[$replace(0,0,[['text'=>'Bad section','section'=>str_repeat('অ',201)]])]]),
 $request(['replacements'=>[$replace(0,0,[$blocks[0]['text']])]]),
 $request(['replacements'=>[$replace(0,0,[['text'=>str_repeat('x',200001)]])]]),
 $request(['replacements'=>[$replace(0,0,['Changed'])],'status'=>'accepted']),
 $request(['replacements'=>[$replace(0,0,['Changed'])],'paragraphs'=>[]]),
 $request(['insertions'=>[['paragraphs'=>[['text'=>'Missing anchor']]]]]),
];
$version=loadWorkspace($db)['version'];foreach($badRequests as $bad)rejects(fn()=>callTool($db,'save_proposal_edits',$bad),422,'Malformed, overlapping, ambiguous or unchanged patch is rejected');check(loadWorkspace($db)['version']===$version,'All rejected patches leave workspace version/content untouched');
$noArray=$request(['replacements'=>[$replace(0,0,['Changed'])]]);unset($noArray['insertions']);rejects(fn()=>callTool($db,'save_proposal_edits',$noArray),422,'Unused edit lists must be explicitly empty');
$tooMany=$request(['insertions'=>[['after_paragraph_id'=>null,'paragraphs'=>array_fill(0,20000,['text'=>'Extra'])]]]);rejects(fn()=>proposalEditParagraphs($state,$base,$tooMany),422,'Result paragraph count is bounded');
$limitState=$state;$limitState['revisions'][0]['paragraphs'][1000]['label']=9007199254740991;rejects(fn()=>proposalEditParagraphs($limitState,$base,$inserts),422,'Exhausted safe labels never overflow silently');
// A later owner edit does not invalidate a proposal prepared from a known ancestor.
$later=$loaded['state'];$new=$base;$new['id']=uuid();$new['parentId']=$base['id'];$new['paragraphs'][999]['text']='Author ending';$later['revisions'][]=$new;$later['chapters'][0]['headId']=$new['id'];writeWorkspace($db,$later,$version,uuid(),'author-newer');
$old=$request(['replacements'=>[$replace(0,0,['Older-source proposal'])]]);$r=callTool($db,'save_proposal_edits',$old);check($r['stale']&&$r['baseRevisionId']===$base['id']&&$r['currentRevisionId']===$new['id'],'Differential proposals retain exact earlier source for three-way author review');
check(record(loadWorkspace($db)['state']['revisions'],$new['id'])['paragraphs'][999]['text']==='Author ending','Later author changes remain untouched at submission');
$bad=$request(['base_revision_id'=>uuid(),'replacements'=>[$replace(0,0,['Changed'])]]);rejects(fn()=>callTool($db,'save_proposal_edits',$bad),409,'Unknown source rejected');
check(callTool($db,'save_proposal',$full)['saved'],'Full-snapshot submission remains supported alongside differential submission');
$loaded=loadWorkspace($db);$trash=$loaded['state'];$trash['chapters'][0]['deletedAt']=stamp();writeWorkspace($db,$trash,$loaded['version'],uuid(),'trash-patch');rejects(fn()=>callTool($db,'save_proposal_edits',$request(['replacements'=>[$replace(0,0,['Changed'])]])),409,'New patches cannot target Trash');check(callTool($db,'save_proposal_edits',$single)['duplicate'],'A successful patch retry remains idempotent after Trash');
$tool=array_column(tools(),null,'name')['save_proposal_edits'];check(count(tools())===19&&$tool['securitySchemes'][0]['scopes']===['manuscript.propose']&&!$tool['annotations']['readOnlyHint']&&$tool['annotations']['idempotentHint'],'MCP exposes 19 tools and correct patch scope/annotations');
check(khosraGuide()['guideVersion']===10&&str_contains(khosraInstructions(),'save_proposal_edits'),'Guide and initialization advertise differential proposals');
// The reconstructed proposal uses the existing author review boundary unchanged.
$reviewState=$loaded['state'];$reviewProposal=$p;$reviewProposal['paragraphs']=proposalEditParagraphs($state,$base,$request(['replacements'=>[$replace(0,0,['Accepted opening']),$replace(5,5,['Declined passage'])]]));$reviewState['proposals']=[$reviewProposal];
$partial=$reviewState;$result=$base;$result['id']=uuid();$result['parentId']=$base['id'];$result['source']='proposal';$result['paragraphs'][0]['text']='Accepted opening';$partial['revisions'][]=$result;$partial['chapters'][0]['headId']=$result['id'];$partial['proposals'][0]['status']='partially-accepted';$partial['proposals'][0]['review']=['reviewedRevisionId'=>$base['id'],'resultRevisionId'=>$result['id'],'createdAt'=>stamp(),'selectedChangeIds'=>[$blocks[0]['id']],'declinedChangeIds'=>[$blocks[5]['id']],'choices'=>[],'paragraphs'=>$reviewProposal['paragraphs']];
validate($partial);preserveHistory($reviewState,$partial);check($partial['revisions'][count($partial['revisions'])-1]['paragraphs'][5]===$blocks[5],'Ordinary partial review accepts sparse output and preserves declined prose');
$complete=$reviewState;$result['id']=uuid();$result['paragraphs']=$reviewProposal['paragraphs'];$complete['revisions'][]=$result;$complete['chapters'][0]['headId']=$result['id'];$complete['proposals'][0]['status']='accepted';$complete['proposals'][0]['review']=array_replace($partial['proposals'][0]['review'],['resultRevisionId'=>$result['id'],'selectedChangeIds'=>[$blocks[0]['id'],$blocks[5]['id']],'declinedChangeIds'=>[]]);validate($complete);preserveHistory($reviewState,$complete);check(true,'Ordinary complete acceptance validates reconstructed sparse review snapshot');
$reordered=$base;$reordered['paragraphs']=[$blocks[2],$blocks[0],$blocks[1]];$ordered=proposalEditParagraphs($state,$reordered,$request(['replacements'=>[['start_paragraph_id'=>$blocks[2]['id'],'end_paragraph_id'=>$blocks[0]['id'],'paragraphs'=>[['text'=>'Joined source order']]]]]));check(count($ordered)===2&&$ordered[0]['id']===$blocks[2]['id']&&$ordered[1]===$blocks[1],'Replacement endpoints follow array order even when numeric labels are out of order');
echo "$count total proposal edit checks passed.\n";
