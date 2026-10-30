<?php
declare(strict_types=1);
require __DIR__.'/run.php';
$patch=fn(string $key,array $upserts=[],array $remove=[],?array $order=null)=>['schemaVersion'=>1,'collections'=>[$key=>['upserts'=>$upserts,'remove'=>$remove]+($order===null?[]:['order'=>$order])]];
$change=fn(string $id,array $set=[],array $unset=[])=>['id'=>$id,'set'=>$set,'unset'=>$unset];
$updated=syncApply($s,$patch('books',[$change($bid,['title'=>'Owner title'])]));validate($updated);preserveHistory($s,$updated);check($updated['books'][0]['title']==='Owner title','Mutable metadata fields update without resending a record snapshot');
$trash=syncApply($s,$patch('chapters',[$change($cid,['deletedAt'=>stamp()])]));validate($trash);preserveHistory($s,$trash);
$restored=syncApply($trash,$patch('chapters',[$change($cid,[],['deletedAt'])]));validate($restored);preserveHistory($trash,$restored);check(!isset($restored['chapters'][0]['deletedAt']),'Explicit optional-field removal supports chapter restoration');
$cyclic=uuid();$header=$s['revisions'][0];unset($header['id']);$header['parentId']=$cyclic;$header['paragraphs']=['format'=>'paragraph-delta-v1','baseRevisionId'=>$cyclic,'upserts'=>[]];rejects(fn()=>syncApply($s,$patch('revisions',[$change($cyclic,$header)])),422,'Cyclic paragraph sources rejected without recursive expansion');
$missingParent=$s['revisions'][0];unset($missingParent['id'],$missingParent['parentId']);rejects(fn()=>syncApply($s,$patch('revisions',[$change(uuid(),$missingParent)])),422,'New differential records require explicit nullable source fields');
$badCases=[
 ['schemaVersion'=>2,'collections'=>[]],['schemaVersion'=>1,'collections'=>['__proto__'=>[]]],
 $patch('books',[$change($bid,['id'=>uuid()])]),$patch('books',[$change($bid),$change($bid)]),
 $patch('books',[],[$bid,$bid]),$patch('books',[$change($bid)],[$bid]),$patch('books',[],[],[]),
 $patch('books',[],[],[$bid,$bid]),$patch('books',[$change($bid,['title'=>'A'],['title'])]),
 $patch('books',[$change($bid,[],['id'])]),$patch('books',[$change($bid,['__proto__'=>[]])]),
];
foreach($badCases as $bad)rejects(fn()=>syncApply($s,$bad),422,'Malformed identities, fields, order or schema rejected');
// Legitimate permanent removals still require the existing author cleanup/deletion receipts.
$old=$s;$proposalId=uuid();$contextA=uuid();$contextB=uuid();$old['proposals'][]=['id'=>$proposalId,'chapterId'=>$cid,'baseRevisionId'=>$rid,'title'=>'Reviewed','rationale'=>'','paragraphs'=>$s['revisions'][0]['paragraphs'],'status'=>'rejected','createdAt'=>stamp()];
foreach([$contextA,$contextB] as $id)$old['contexts'][]=['id'=>$id,'chapterId'=>$cid,'revisionId'=>$rid,'summary'=>'Context','facts'=>[],'createdAt'=>stamp()];
$receiptId=uuid();$receipt=['chapterId'=>$cid,'createdAt'=>stamp(),'proposalIds'=>[$proposalId],'contextIds'=>[$contextA],'chapterProposalIds'=>[]];
$cleanup=['schemaVersion'=>1,'collections'=>['proposals'=>['upserts'=>[],'remove'=>[$proposalId]],'contexts'=>['upserts'=>[],'remove'=>[$contextA]],'chapterCleanups'=>['upserts'=>[$change($receiptId,$receipt)],'remove'=>[]]]];
$clean=syncApply($old,$cleanup);validate($clean);preserveHistory($old,$clean);check(!$clean['proposals']&&count($clean['contexts'])===1&&$clean['revisions']===$old['revisions'],'Cleanup receipts remove only terminal copies while preserving all manuscript history');
$pending=$old;$pending['proposals'][0]['status']='pending';rejects(fn()=>preserveHistory($pending,$clean),409,'Differential cleanup cannot discard a pending server proposal');
$bad=$cleanup;$bad['collections']['contexts']['remove']=[$contextB];$bad['collections']['chapterCleanups']['upserts'][0]['set']['contextIds']=[$contextB];$noLatest=syncApply($old,$bad);validate($noLatest);rejects(fn()=>preserveHistory($old,$noLatest),409,'Differential cleanup cannot discard the latest context');
$item=uuid();$material=['id'=>$item,'itemId'=>$item,'parentId'=>null,'bookId'=>$bid,'kind'=>'idea','title'=>'Speculation','body'=>'Possible ending','chapterIds'=>[],'status'=>'idea','url'=>'','fileId'=>null,'source'=>'author','createdAt'=>stamp()];$old=$s;$old['materials']=[$material];validate($old);
$delete=['schemaVersion'=>1,'collections'=>['materials'=>['upserts'=>[],'remove'=>[$item]],'materialDeletions'=>['upserts'=>[$change(uuid(),['itemId'=>$item,'bookId'=>$bid,'createdAt'=>stamp()])],'remove'=>[]]]];$deleted=syncApply($old,$delete);validate($deleted);preserveHistory($old,$deleted);check(!$deleted['materials']&&count($deleted['materialDeletions'])===1,'Author-confirmed idea deletion works through atomic record removals');
$missing=syncApply($old,$patch('materials',[],[$item]));rejects(fn()=>preserveHistory($old,$missing),409,'Material removal without its immutable tombstone fails');
// Accepted review receipts use the same paragraph codec as new manuscript snapshots.
$before=$s;$pId=uuid();$edited=array_replace($s['revisions'][0]['paragraphs'][0],['text'=>'Reviewed suggestion']);$before['proposals'][]=['id'=>$pId,'chapterId'=>$cid,'baseRevisionId'=>$rid,'title'=>'Review','rationale'=>'','status'=>'pending','createdAt'=>stamp(),'paragraphs'=>[$edited]];
$acceptedId=uuid();$wire=['format'=>'paragraph-delta-v1','baseRevisionId'=>$rid,'upserts'=>[$edited]];$new=$s['revisions'][0];unset($new['id']);$new['parentId']=$rid;$new['source']='proposal';$new['paragraphs']=$wire;
$review=['reviewedRevisionId'=>$rid,'resultRevisionId'=>$acceptedId,'createdAt'=>stamp(),'selectedChangeIds'=>[$pid],'declinedChangeIds'=>[],'choices'=>[],'paragraphs'=>$wire];
$accept=['schemaVersion'=>1,'collections'=>['chapters'=>['upserts'=>[$change($cid,['headId'=>$acceptedId])],'remove'=>[]],'revisions'=>['upserts'=>[$change($acceptedId,$new)],'remove'=>[]],'proposals'=>['upserts'=>[$change($pId,['status'=>'accepted','review'=>$review])],'remove'=>[]]]];
$after=syncApply($before,$accept);validate($after);preserveHistory($before,$after);check($after['proposals'][0]['review']['paragraphs']===[$edited]&&$after['proposals'][0]['paragraphs']===$before['proposals'][0]['paragraphs'],'Accepted differential receipts reconstruct author choices without altering original proposed prose');
// Reverse dependency order across 1000 new snapshots.
$chain=[];$previous=$rid;for($i=0;$i<1000;$i++){$id=uuid();$r=$s['revisions'][0];unset($r['id']);$r['parentId']=$previous;$r['paragraphs']=['format'=>'paragraph-delta-v1','baseRevisionId'=>$previous,'upserts'=>[]];$chain[]=$change($id,$r);$previous=$id;}
$deep=syncApply($s,$patch('revisions',array_reverse($chain)));validate($deep);check(count($deep['revisions'])===1001&&end($deep['revisions'])['paragraphs']===$s['revisions'][0]['paragraphs'],'Deep out-of-order paragraph dependencies reconstruct without recursive codec calls');
echo "$count total differential validation checks passed.\n";
