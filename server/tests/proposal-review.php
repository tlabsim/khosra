<?php
declare(strict_types=1);
require __DIR__.'/run.php';
// Validate a browser-authored partial receipt through the same PHP boundary as sync.
$original=$s['revisions'][0];$second=['id'=>uuid(),'label'=>2,'text'=>'Second passage','section'=>''];$original['paragraphs'][]=$second;
$state=$s;$state['revisions']=[$original];$proposal=['id'=>uuid(),'chapterId'=>$cid,'baseRevisionId'=>$rid,'title'=>'Two changes','rationale'=>'Review independently','status'=>'pending','createdAt'=>stamp(),'paragraphs'=>$original['paragraphs']];$proposal['paragraphs'][0]['text']='Proposed opening';$proposal['paragraphs'][1]['text']='Proposed ending';$state['proposals']=[$proposal];validate($state);
$done=$state;$result=$original;$result['id']=uuid();$result['parentId']=$rid;$result['source']='proposal';$result['paragraphs'][0]['text']='Proposed opening';$done['revisions'][]=$result;$done['chapters'][0]['headId']=$result['id'];
$done['proposals'][0]['status']='partially-accepted';$done['proposals'][0]['review']=['reviewedRevisionId'=>$rid,'resultRevisionId'=>$result['id'],'createdAt'=>stamp(),'selectedChangeIds'=>[$pid],'declinedChangeIds'=>[$second['id']],'choices'=>[],'paragraphs'=>$proposal['paragraphs']];
validate($done);preserveHistory($state,$done);check(true,'Partial receipt validates and advances pending proposal');
$roundtrip=json_decode(json_encode($done),true);validate($roundtrip);check($roundtrip===$done,'Review choices survive JSON round trip as arrays');
$bad=$done;unset($bad['proposals'][0]['review']);rejects(fn()=>validate($bad),422,'Partial decision requires receipt');
$bad=$done;$bad['proposals'][0]['status']='accepted';rejects(fn()=>validate($bad),422,'Full decision cannot include declined changes');
$bad=$done;$bad['proposals'][0]['review']['selectedChangeIds'][]=$second['id'];rejects(fn()=>validate($bad),422,'Selected and declined sets cannot overlap');
$bad=$done;$bad['proposals'][0]['review']['resultRevisionId']=$rid;rejects(fn()=>validate($bad),422,'Review must reference a resulting proposal revision');
$bad=$done;$bad['proposals'][0]['review']['paragraphs'][0]['text']='Tampered';rejects(fn()=>preserveHistory($done,$bad),409,'Completed review receipt is immutable');
$bad=$done;unset($bad['proposals'][0]['review']);rejects(fn()=>preserveHistory($done,$bad),409,'Completed receipt cannot disappear');
$bad=$done;$bad['proposals'][0]['status']='rejected';rejects(fn()=>preserveHistory($done,$bad),409,'Completed decision cannot be changed');
$bad=$done;$bad['proposals'][0]['paragraphs'][0]['text']='Tampered';rejects(fn()=>preserveHistory($state,$bad),409,'Original proposed prose remains immutable during review');
// Replacing two blocks with one is a linked structural change.
$bad=$done;$bad['proposals'][0]['review']['paragraphs']=[$proposal['paragraphs'][0]];rejects(fn()=>validate($bad),422,'Partial structural replacement is rejected');
$legacy=$state;$legacy['proposals'][0]['status']='accepted';validate($legacy);preserveHistory($state,$legacy);check(true,'Previously completed proposals without receipts remain compatible');
if(in_array('sqlite',PDO::getAvailableDrivers(),true)){
 $db=new PDO('sqlite::memory:');$db->exec('CREATE TABLE workspace(id INTEGER,version INTEGER,payload TEXT)');$q=$db->prepare('INSERT INTO workspace VALUES(1,1,?)');$q->execute([json_encode($done)]);
 $metadata=callTool($db,'list_proposals',['chapter_id'=>$cid])['proposals'][0];check($metadata['status']==='partially-accepted'&&!isset($metadata['review']),'MCP list exposes partial status without full receipt prose');
 $read=callTool($db,'read_proposal',['chapter_id'=>$cid,'proposal_id'=>$proposal['id']]);check(str_contains(json_encode($read),'selectedChangeIds'),'MCP exact read exposes immutable receipt');
}
echo "$count total checks passed.".PHP_EOL;
