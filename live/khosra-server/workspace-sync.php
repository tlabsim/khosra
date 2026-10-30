<?php
declare(strict_types=1);
if(!defined('KHOSRA_DEPLOYMENT')){http_response_code(404);exit;}


const SYNC_COLLECTIONS=['books','chapters','revisions','flags','proposals','contexts','chapterProposals','materials','files','materialDeletions','chapterCleanups'];
const SYNC_FIELDS=[
 'books'=>['title','premise','language','createdAt'],
 'chapters'=>['bookId','code','title','position','headId','approvedId','synopsis'],
 'revisions'=>['chapterId','parentId','createdAt','source','paragraphs','edition','message'],
 'flags'=>['number','chapterId','revisionId','paragraphIds','quote','note','kind','status','createdAt'],
 'proposals'=>['chapterId','baseRevisionId','title','rationale','paragraphs','status','createdAt'],
 'contexts'=>['chapterId','revisionId','summary','facts','createdAt'],
 'chapterProposals'=>['bookId','title','synopsis','rationale','afterChapterId','paragraphs','status','createdAt'],
 'materials'=>['itemId','parentId','bookId','kind','title','body','chapterIds','status','url','fileId','source','createdAt'],
 'files'=>['bookId','name','mime','size','data'],
 'materialDeletions'=>['itemId','bookId','createdAt'],
 'chapterCleanups'=>['chapterId','createdAt','proposalIds','contextIds','chapterProposalIds'],
];
const SYNC_OPTIONAL=['chapters'=>['deletedAt'],'flags'=>['audio'],'proposals'=>['review'],'chapterProposals'=>['review']];
function syncFields(array $value,array $required,array $optional=[]):void {
 if(array_diff($required,array_keys($value))||array_diff(array_keys($value),array_merge($required,$optional)))fail(422,'Invalid differential sync fields.');
}
function syncList(mixed $value):array {
 if(!is_array($value)||!array_is_list($value)||count($value)>100000)fail(422,'Invalid differential sync list.');return $value;
}
function syncManifest(array $state):array {
 $collections=[];foreach(SYNC_COLLECTIONS as $key)$collections[$key]=array_map(fn($r)=>['id'=>$r['id'],'hash'=>hash('sha256',json_encode($r,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR))],$state[$key]??[]);
 return ['schemaVersion'=>1,'collections'=>$collections];
}
function syncParagraphs(array $rows,?array $base):array {
 if($base===null)return $rows;
 $old=array_column($base['paragraphs'],null,'id');$upserts=[];
 foreach($rows as $row)if(!isset($old[$row['id']])||$old[$row['id']]!=$row)$upserts[]=$row;
 $result=['format'=>'paragraph-delta-v1','baseRevisionId'=>$base['id'],'upserts'=>$upserts];
 if(array_column($rows,'id')!==array_column($base['paragraphs'],'id'))$result['order']=array_column($rows,'id');
 return $result;
}
function syncEncodeRecord(string $collection,array $record,array $revisions):array {
 if(in_array($collection,['revisions','proposals'],true)){
  $baseId=$collection==='revisions'?$record['parentId']:$record['baseRevisionId'];$base=$revisions[$baseId??'']??null;
  $record['paragraphs']=syncParagraphs($record['paragraphs'],$base);
  if(isset($record['review']['paragraphs']))$record['review']['paragraphs']=syncParagraphs($record['review']['paragraphs'],$base);
 }
 return $record;
}
function syncExpandParagraphs(mixed $wire,array $base):array {
 if(!is_array($wire))fail(422,'Invalid paragraph delta.');syncFields($wire,['format','baseRevisionId','upserts'],['order']);
 if($wire['format']!=='paragraph-delta-v1'||$wire['baseRevisionId']!==$base['id'])fail(422,'Paragraph delta source does not match its record.');
 $rows=array_column($base['paragraphs'],null,'id');$seen=[];
 foreach(syncList($wire['upserts']) as $row){if(!is_array($row)||!idvalid($row['id']??null)||isset($seen[$row['id']]))fail(422,'Invalid or duplicate paragraph update.');$seen[$row['id']]=true;$rows[$row['id']]=$row;}
 $order=array_key_exists('order',$wire)?syncList($wire['order']):array_column($base['paragraphs'],'id');$out=[];$seen=[];
 foreach($order as $id){if(!idvalid($id)||!isset($rows[$id])||isset($seen[$id]))fail(422,'Invalid paragraph order.');$seen[$id]=true;$out[]=$rows[$id];}
 foreach($wire['upserts'] as $row)if(!isset($seen[$row['id']]))fail(422,'A paragraph update is missing from the resulting order.');
 return $out;
}
/** Iterative dependency resolution supports deep histories and rejects cycles/missing sources. */
function syncExpandState(array $state):array {
 $revisions=array_column($state['revisions'],null,'id');$waiting=[];$children=[];$ready=[];
 foreach($revisions as $id=>$record){
  $wire=$record['paragraphs']??null;if(!is_array($wire))fail(422,'Invalid revision paragraphs.');
  if(is_array($wire)&&!array_is_list($wire)){
   $baseId=$record['parentId']??null;
   if(!is_string($baseId)||!isset($revisions[$baseId])||$revisions[$baseId]['chapterId']!==$record['chapterId'])fail(422,'Missing paragraph delta source.');
   $waiting[$id]=$wire;$children[$baseId][]=$id;
  }else $ready[]=$id;
 }
 for($i=0;$i<count($ready);$i++)foreach($children[$ready[$i]]??[] as $id){$revisions[$id]['paragraphs']=syncExpandParagraphs($waiting[$id],$revisions[$ready[$i]]);unset($waiting[$id]);$ready[]=$id;}
 if($waiting)fail(422,'Cyclic paragraph delta sources.');
 foreach($state['revisions'] as &$record)$record=$revisions[$record['id']];unset($record);
 foreach($state['proposals'] as &$record){
  $base=$revisions[$record['baseRevisionId']??'']??null;
  foreach(['paragraphs','review'] as $key){
   $wire=$key==='review'?($record['review']['paragraphs']??null):($record['paragraphs']??null);
   if(is_array($wire)&&!array_is_list($wire)){
    if(!$base||$base['chapterId']!==$record['chapterId'])fail(422,'Missing proposal delta source.');
    $rows=syncExpandParagraphs($wire,$base);if($key==='review')$record['review']['paragraphs']=$rows;else $record['paragraphs']=$rows;
   }
  }
 }unset($record);return $state;
}
function syncApply(array $old,array $delta):array {
 syncFields($delta,['schemaVersion','collections']);
 if($delta['schemaVersion']!==1||!is_array($delta['collections'])||array_diff(array_keys($delta['collections']),SYNC_COLLECTIONS))fail(422,'Unsupported differential sync schema or collection.');
 foreach($delta['collections'] as $key=>$change){
  if(!is_array($change))fail(422,'Invalid collection changes.');syncFields($change,['upserts','remove'],['order']);
  $rows=array_column($old[$key]??[],null,'id');$removed=[];$updated=[];
  foreach(syncList($change['remove']) as $id){if(!idvalid($id)||isset($removed[$id])||!isset($rows[$id]))fail(422,'Invalid removal source.');$removed[$id]=true;unset($rows[$id]);}
  foreach(syncList($change['upserts']) as $patch){
   if(!is_array($patch))fail(422,'Invalid record update.');syncFields($patch,['id','set','unset']);$id=$patch['id'];
   if(!idvalid($id)||isset($updated[$id])||isset($removed[$id])||!is_array($patch['set']))fail(422,'Invalid or duplicate record update.');
   $updated[$id]=true;$row=$rows[$id]??['id'=>$id];
   foreach($patch['set'] as $field=>$value){if(!is_string($field)||!in_array($field,array_merge(SYNC_FIELDS[$key],SYNC_OPTIONAL[$key]??[]),true))fail(422,'Invalid record field.');$row[$field]=$value;}
   $unset=[];foreach(syncList($patch['unset']) as $field){if(!is_string($field)||!in_array($field,SYNC_OPTIONAL[$key]??[],true)||isset($unset[$field])||array_key_exists($field,$patch['set']))fail(422,'Invalid removed field.');$unset[$field]=true;unset($row[$field]);}
   if(array_diff(SYNC_FIELDS[$key],array_keys($row)))fail(422,'Required differential record fields are missing.');
   $rows[$id]=$row;
  }
  $order=$change['order']??array_keys($rows);$out=[];$seen=[];
  foreach(syncList($order) as $id){if(!idvalid($id)||!isset($rows[$id])||isset($seen[$id]))fail(422,'Invalid collection order.');$seen[$id]=true;$out[]=$rows[$id];}
  if(count($seen)!==count($rows))fail(422,'Collection order omits records.');$old[$key]=$out;
 }
 return syncExpandState($old);
}
function workspaceSyncRoute(PDO $db,string $method,array $body):never {
 if($method==='GET'){
  $current=loadWorkspace($db,false,false);
  if((string)($_GET['version']??'')===(string)$current['version']&&($_GET['fingerprint']??'')===$current['fingerprint'])respond(['mode'=>'unchanged']+$current);
  $current=loadWorkspace($db);respond(['mode'=>'manifest','version'=>$current['version'],'fingerprint'=>$current['fingerprint'],'manifest'=>syncManifest($current['state'])]);
 }
 if($method!=='POST')fail(405,'GET or POST required.');
 if(($body['action']??null)==='pull'){
  syncFields($body,['action','version','fingerprint','ids']);$current=loadWorkspace($db);
  if($body['version']!==$current['version']||$body['fingerprint']!==$current['fingerprint'])fail(409,'Workspace changed during differential download. Retry from the latest manifest.');
  if(!is_array($body['ids'])||array_diff(array_keys($body['ids']),SYNC_COLLECTIONS))fail(422,'Invalid requested collections.');
  $records=[];$revisions=array_column($current['state']['revisions'],null,'id');
  foreach($body['ids'] as $key=>$ids){$rows=array_column($current['state'][$key]??[],null,'id');$records[$key]=[];$seen=[];
   foreach(syncList($ids) as $id){if(!idvalid($id)||isset($seen[$id])||!isset($rows[$id]))fail(422,'Invalid requested record.');$seen[$id]=true;$records[$key][]=syncEncodeRecord($key,$rows[$id],$revisions);}
  }
  respond(['mode'=>'records','version'=>$current['version'],'fingerprint'=>$current['fingerprint'],'records'=>$records]);
 }
 if(($body['action']??null)!=='push')fail(422,'Differential sync action required.');
 syncFields($body,['action','baseVersion','baseFingerprint','operationId','delta']);
 if(!is_int($body['baseVersion'])||!is_string($body['baseFingerprint'])||!preg_match('/^[a-f0-9]{64}$/D',$body['baseFingerprint'])||!is_array($body['delta']))fail(422,'Invalid differential save precondition.');
 $saved=null;$version=writeWorkspace($db,function($old)use($body,&$saved){return $saved=syncApply($old,$body['delta']);},$body['baseVersion'],(string)$body['operationId'],hash('sha256',json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)),$body['baseFingerprint']);
 // A duplicate may be acknowledged after newer commits; never attach their fingerprint.
 if($saved===null)respond(['version'=>$version,'duplicate'=>true]);
 $hashes=[];$manifest=syncManifest($saved);
 foreach($body['delta']['collections'] as $key=>$change){$all=array_column($manifest['collections'][$key],'hash','id');foreach($change['upserts'] as $patch)$hashes[$key][$patch['id']]=$all[$patch['id']];}
 respond(['version'=>$version,'fingerprint'=>hash('sha256',json_encode($saved,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)),'hashes'=>$hashes?:new stdClass()]);
}
