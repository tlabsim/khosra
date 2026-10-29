<?php
declare(strict_types=1);
if(!defined('KHOSRA_DEPLOYMENT')){http_response_code(404);exit;}


function proposalEditsTool():array {
 $str=['type'=>'string'];$draft=['type'=>'object','properties'=>['text'=>$str,'section'=>$str],'required'=>['text'],'additionalProperties'=>false];
 $rows=['type'=>'array','maxItems'=>20000,'items'=>$draft];
 return ['save_proposal_edits','Preferred for existing chapters: submit ONLY changed paragraph ranges and insertions against the exact base_revision_id you read. Untouched prose is preserved server-side. replacements use inclusive start_paragraph_id/end_paragraph_id UUIDs in source order; paragraphs=[] deletes the range. Replacement rows reuse source IDs/labels positionally; extra rows get new server IDs/labels. Optional section preserves the corresponding source heading, or defaults empty for new paragraphs. insertions use after_paragraph_id UUID (null prepends). All anchors refer to the base, not intermediate edits. No overlapping ranges, duplicate insertion anchors or insertions inside replaced ranges. Stores a pending proposal only; the author reviews/accepts. Requires durable operation_id.',
  ['operation_id'=>$str,'chapter_id'=>$str,'base_revision_id'=>$str,'title'=>$str,'rationale'=>$str,
   'replacements'=>['type'=>'array','maxItems'=>20000,'items'=>['type'=>'object','properties'=>['start_paragraph_id'=>$str,'end_paragraph_id'=>$str,'paragraphs'=>$rows],'required'=>['start_paragraph_id','end_paragraph_id','paragraphs'],'additionalProperties'=>false]],
   'insertions'=>['type'=>'array','maxItems'=>20000,'items'=>['type'=>'object','properties'=>['after_paragraph_id'=>['type'=>['string','null']],'paragraphs'=>array_replace($rows,['minItems'=>1])],'required'=>['after_paragraph_id','paragraphs'],'additionalProperties'=>false]]],
  ['operation_id','chapter_id','base_revision_id','title','rationale','replacements','insertions']];
}
function proposalEditFields(array $value,array $required,array $optional=[]):void {
 if(array_diff($required,array_keys($value))||array_diff(array_keys($value),array_merge($required,$optional)))fail(422,'Invalid differential proposal fields. Use only the fields in tools/list; do not send paragraph IDs or labels in replacement text rows.');
}
function proposalDraftRows(mixed $rows,bool $allowEmpty):array {
 if(!is_array($rows)||!array_is_list($rows)||count($rows)>20000||(!$allowEmpty&&!$rows))fail(422,'Invalid edit paragraphs. Insertions require at least one paragraph; use an empty replacement to delete a range.');
 foreach($rows as $row){
  if(!is_array($row))fail(422,'Each edit paragraph must be an object with text and optional section.');
  proposalEditFields($row,['text'],['section']);
  if(!text($row['text'])||(array_key_exists('section',$row)&&!materialText($row['section'],200)))fail(422,'Invalid edit text or section. Text is limited to 200000 UTF-8 bytes; section to 200 UTF-16 units.');
 }
 return $rows;
}
/** Resolve every operation against the immutable source, never progressively edited indices. */
function proposalEditParagraphs(array $state,array $base,array $args):array {
 proposalEditFields($args,['operation_id','chapter_id','base_revision_id','title','rationale','replacements','insertions']);
 foreach(['replacements','insertions'] as $key)if(!is_array($args[$key])||!array_is_list($args[$key])||count($args[$key])>20000)fail(422,'replacements and insertions must be arrays (use [] when unused).');
 if(!count($args['replacements'])&&!count($args['insertions']))fail(422,'Include at least one replacement or insertion.');
 if(count($args['replacements'])+count($args['insertions'])>20000)fail(422,'Too many differential edits.');
 $source=$base['paragraphs'];$positions=array_flip(array_column($source,'id'));$ranges=[];
 $position=function(mixed $id)use($positions):int{
  if(!idvalid($id)||!array_key_exists($id,$positions))fail(422,'Paragraph anchor is absent from base_revision_id. Copy its UUID from read_chapter for that exact source; do not use P labels, another chapter, or a newly inserted paragraph.');
  return $positions[$id];
 };
 foreach($args['replacements'] as $r){
  if(!is_array($r))fail(422,'Invalid replacement.');proposalEditFields($r,['start_paragraph_id','end_paragraph_id','paragraphs']);
  $start=$position($r['start_paragraph_id']);$end=$position($r['end_paragraph_id']);
  if($end<$start)fail(422,'Replacement endpoints must follow base paragraph order, not numeric label order.');
  $ranges[]=['start'=>$start,'end'=>$end,'paragraphs'=>proposalDraftRows($r['paragraphs'],true)];
 }
 usort($ranges,fn($a,$b)=>$a['start']<=>$b['start']);$last=-1;$starts=[];$interior=[];
 foreach($ranges as $range){
  if($range['start']<=$last)fail(422,'Replacement ranges overlap. Combine them into one replacement.');
  $starts[$range['start']]=$range;$last=$range['end'];
  for($gap=$range['start']+1;$gap<=$range['end'];$gap++)$interior[$gap]=true;
 }
 $inserts=[];
 foreach($args['insertions'] as $r){
  if(!is_array($r))fail(422,'Invalid insertion.');proposalEditFields($r,['after_paragraph_id','paragraphs']);
  $gap=$r['after_paragraph_id']===null?0:$position($r['after_paragraph_id'])+1;
  if(isset($inserts[$gap]))fail(422,'Duplicate insertion anchor. Combine those paragraphs into one insertion in the intended order.');
  if(isset($interior[$gap]))fail(422,'Insertion falls inside a replacement range. Include it in that replacement, or insert at a range boundary.');
  $inserts[$gap]=proposalDraftRows($r['paragraphs'],false);
 }
 // Include labels reserved by deleted passages and other same-edition history.
 $max=0;foreach($state['revisions'] as $r)if($r['chapterId']===$base['chapterId']&&$r['edition']===$base['edition'])foreach($r['paragraphs'] as $p)$max=max($max,$p['label']);
 $make=function(array $draft,?array $original=null)use(&$max):array{
  if($original!==null)return array_replace($original,['text'=>$draft['text'],'section'=>$draft['section']??$original['section']]);
  if($max>=9007199254740991)fail(422,'Paragraph labels are exhausted. The author must create a new reference edition before inserting paragraphs.');
  return ['id'=>uuid(),'label'=>++$max,'text'=>$draft['text'],'section'=>$draft['section']??''];
 };
 $out=[];$append=function(array $row)use(&$out):void{if(count($out)>=20000)fail(422,'The resulting proposal exceeds 20000 paragraphs.');$out[]=$row;};
 for($i=0,$length=count($source);$i<=$length;){
  foreach($inserts[$i]??[] as $draft)$append($make($draft));
  if($i===$length)break;
  if(isset($starts[$i])){
   $range=$starts[$i];$oldCount=$range['end']-$i+1;
   foreach($range['paragraphs'] as $j=>$draft)$append($make($draft,$j<$oldCount?$source[$i+$j]:null));
   $i=$range['end']+1;
  }else{$append($source[$i]);$i++;}
 }
 if($out===$source)fail(422,'Edits do not change the source. No proposal was saved.');
 return $out;
}
