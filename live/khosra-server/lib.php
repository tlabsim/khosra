<?php
declare(strict_types=1);
if(!defined('KHOSRA_DEPLOYMENT')){http_response_code(404);exit;}

require_once __DIR__.'/guide.php';
require_once __DIR__.'/materials.php';
final class ApiError extends RuntimeException { public function __construct(public int $status,string $message){parent::__construct($message);} }
function fail(int $status,string $message):never {throw new ApiError($status,$message);}
function uuid():string {$d=random_bytes(16);$d[6]=chr((ord($d[6])&15)|64);$d[8]=chr((ord($d[8])&63)|128);return vsprintf('%s%s-%s-%s-%s-%s%s%s',str_split(bin2hex($d),4));}
function stamp():string{return gmdate('Y-m-d\TH:i:s\Z');}
final class SQLiteConnection extends PDO {
 private bool $writing=false;
 public function beginTransaction():bool{if($this->writing)throw new PDOException('Transaction already active.');$this->exec('BEGIN IMMEDIATE');$this->writing=true;return true;}
 public function commit():bool{$this->exec('COMMIT');$this->writing=false;return true;}
 public function rollBack():bool{$this->exec('ROLLBACK');$this->writing=false;return true;}
 public function inTransaction():bool{return $this->writing;}
}
function openDatabase(array $config):PDO {
 $class=str_starts_with($config['dsn'],'sqlite:')?SQLiteConnection::class:PDO::class;
 $db=new $class($config['dsn'],$config['db_user']??null,$config['db_password']??null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
 if($db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite'){$db->exec('PRAGMA busy_timeout=5000');$db->exec('PRAGMA foreign_keys=ON');}
 return $db;
}
function databaseLock(PDO $db):string{return $db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':'';}
function beginWrite(PDO $db):void {
 $db->beginTransaction();
 // Acquire SQLite's writer reservation before any read, avoiding deferred lock-upgrade races.
 if($db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite'&&!($db instanceof SQLiteConnection))try{$db->exec('UPDATE workspace SET version=version WHERE id=1');}catch(Throwable $e){$db->rollBack();throw $e;}
}
function throttleIdentity(PDO $db,string $identity,int $limit,string $message):void {
 beginWrite($db);try{
 $sql=$db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite'?'INSERT OR IGNORE INTO auth_attempts(identity_hash,attempts,window_start) VALUES(?,0,?)':'INSERT INTO auth_attempts(identity_hash,attempts,window_start) VALUES(?,0,?) ON DUPLICATE KEY UPDATE identity_hash=identity_hash';
 $q=$db->prepare($sql);$q->execute([$identity,time()]);$q=$db->prepare('SELECT attempts,window_start FROM auth_attempts WHERE identity_hash=?'.databaseLock($db));$q->execute([$identity]);$a=$q->fetch(PDO::FETCH_ASSOC);$reset=time()-(int)$a['window_start']>900;
 if(!$reset&&(int)$a['attempts']>=$limit){$db->commit();fail(429,$message);}
 $q=$db->prepare('UPDATE auth_attempts SET attempts=?,window_start=? WHERE identity_hash=?');$q->execute([$reset?1:(int)$a['attempts']+1,$reset?time():$a['window_start'],$identity]);$db->commit();
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function ownerPasswordMatches(string $password,array $config):bool {
 $hash=$config['owner_password_hash']??'';
 if(is_string($hash)&&$hash!=='')return password_verify($password,$hash);
 $configured=$config['owner_password']??null;
 return is_string($configured)&&strlen($configured)>=16&&hash_equals(hash('sha256',$configured),hash('sha256',$password));
}
function blank():array{return ['schemaVersion'=>1,'books'=>[],'chapters'=>[],'revisions'=>[],'flags'=>[],'proposals'=>[],'contexts'=>[],'chapterProposals'=>[],'materials'=>[],'files'=>[],'materialDeletions'=>[],'chapterCleanups'=>[]];}
function idvalid(mixed $v):bool{return is_string($v)&&preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',$v)===1;}
function text(mixed $v,int $max=200000):bool{return is_string($v)&&strlen($v)<=$max;}
function record(array $rows,string $id):array{foreach($rows as $r)if(($r['id']??null)===$id)return $r;fail(404,'Record not found.');}
function paragraphs(mixed $ps):void{if(!is_array($ps)||!array_is_list($ps)||count($ps)>20000)fail(422,'Invalid paragraphs.');$ids=[];$labels=[];foreach($ps as $p){if(!is_array($p)||!idvalid($p['id']??null)||!is_int($p['label']??null)||$p['label']<1||!text($p['text']??null)||!text($p['section']??null,800)||isset($ids[$p['id']])||isset($labels[$p['label']]))fail(422,'Invalid or duplicate paragraph identifiers.');$ids[$p['id']]=true;$labels[$p['label']]=true;}}
function validate(array $s):void {
 if(($s['schemaVersion']??null)!==1)fail(422,'Unsupported workspace schema.');foreach(['books','chapters','revisions','flags','proposals','contexts'] as $key){if(!isset($s[$key])||!is_array($s[$key])||!array_is_list($s[$key])||count($s[$key])>100000)fail(422,'Invalid collection.');$seen=[];foreach($s[$key] as $r){if(!is_array($r)||!idvalid($r['id']??null)||isset($seen[$r['id']]))fail(422,'Invalid or duplicate record ID.');$seen[$r['id']]=true;}}
 validateMaterials($s);
 cleanupTargets($s);
 validateChapterProposals($s);
 $books=array_column($s['books'],null,'id');$chapters=array_column($s['chapters'],null,'id');$revisions=array_column($s['revisions'],null,'id');
 foreach($books as $b)if(!text($b['title']??null,1200)||trim($b['title'])===''||!text($b['premise']??null)||!in_array($b['language']??null,['bn','en'],true)||!text($b['createdAt']??null,100))fail(422,'Invalid book.');
 $codes=[];foreach($chapters as $c){if(!isset($books[$c['bookId']??''])||!is_int($c['code']??null)||$c['code']<1||!is_numeric($c['position']??null)||!text($c['title']??null,1200)||!text($c['synopsis']??null)||!isset($revisions[$c['headId']??''])||$revisions[$c['headId']]['chapterId']!==$c['id'])fail(422,'Invalid chapter.');if(($c['approvedId']??null)!==null&&(!isset($revisions[$c['approvedId']])||$revisions[$c['approvedId']]['chapterId']!==$c['id']))fail(422,'Invalid approved revision.');if(array_key_exists('deletedAt',$c)&&(!is_string($c['deletedAt'])||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/D',$c['deletedAt'])||strtotime($c['deletedAt'])===false))fail(422,'Invalid chapter deletion date.');$key=$c['bookId'].':'.$c['code'];if(isset($codes[$key]))fail(422,'Duplicate chapter code.');$codes[$key]=true;}
 foreach($revisions as $r){if(!isset($chapters[$r['chapterId']??''])||!is_int($r['edition']??null)||$r['edition']<1||!in_array($r['source']??null,['author','proposal','restore','reindex'],true)||!text($r['createdAt']??null,100)||!text($r['message']??null,2000))fail(422,'Invalid revision.');if(($r['parentId']??null)!==null&&(!isset($revisions[$r['parentId']])||$revisions[$r['parentId']]['chapterId']!==$r['chapterId']))fail(422,'Invalid parent revision.');paragraphs($r['paragraphs']??null);}
 $indexes=[];$visiting=[];$indexRevision=function(array $r)use(&$indexRevision,&$indexes,&$visiting,$revisions):array{if(isset($indexes[$r['id']]))return $indexes[$r['id']];if(isset($visiting[$r['id']]))fail(422,'Cyclic revision history.');$visiting[$r['id']]=true;$parent=$revisions[$r['parentId']??'']??null;$index=$parent&&$parent['edition']===$r['edition']?$indexRevision($parent):['addresses'=>[],'identities'=>[]];foreach($r['paragraphs'] as $p){if((isset($index['addresses'][$p['label']])&&$index['addresses'][$p['label']]!==$p['id'])||(isset($index['identities'][$p['id']])&&$index['identities'][$p['id']]!==$p['label']))fail(422,'Stable paragraph references cannot change within an edition.');$index['addresses'][$p['label']]=$p['id'];$index['identities'][$p['id']]=$p['label'];}unset($visiting[$r['id']]);$indexes[$r['id']]=$index;return $index;};foreach($revisions as $r)$indexRevision($r);
 foreach($s['flags'] as $f){$r=$revisions[$f['revisionId']??'']??null;if(isset($f['audio'])&&(!is_string($f['audio'])||!preg_match('#^data:audio/[a-zA-Z0-9.+-]+;base64,#',$f['audio'])))fail(422,'Invalid audio attachment.');if(!$r||$r['chapterId']!==($f['chapterId']??null)||!is_int($f['number']??null)||$f['number']<1||!is_array($f['paragraphIds']??null)||!text($f['quote']??null)||!text($f['note']??null)||trim($f['note'])===''||!in_array($f['kind']??null,['rewrite','discussion','reference'],true)||!in_array($f['status']??null,['open','resolved'],true)||!text($f['createdAt']??null,100))fail(422,'Invalid flag.');foreach($f['paragraphIds'] as $id)if(!in_array($id,array_column($r['paragraphs'],'id'),true))fail(422,'Invalid flag anchor.');}
 foreach($s['proposals'] as $p){$r=$revisions[$p['baseRevisionId']??'']??null;if(!$r||$r['chapterId']!==($p['chapterId']??null)||!text($p['title']??null,2000)||!text($p['rationale']??null)||!in_array($p['status']??null,['pending','accepted','partially-accepted','rejected'],true)||!text($p['createdAt']??null,100))fail(422,'Invalid proposal.');paragraphs($p['paragraphs']??null);validateProposalReview($p,$revisions);foreach(array_merge($p['paragraphs'],$p['review']['paragraphs']??[]) as $block){$index=$indexRevision($r);$a=$block['label'];$i=$block['id'];if((isset($index['addresses'][$a])&&$index['addresses'][$a]!==$block['id'])||(isset($index['identities'][$i])&&$index['identities'][$i]!==$block['label']))fail(422,'Proposal changes stable paragraph references.');}}
 foreach($s['contexts'] as $x){$r=$revisions[$x['revisionId']??'']??null;if(!$r||$r['chapterId']!==($x['chapterId']??null)||!text($x['summary']??null)||!is_array($x['facts']??null)||!text($x['createdAt']??null,100))fail(422,'Invalid context.');foreach($x['facts'] as $f){if(!in_array($f['kind']??null,['event','character','clue','thread','timeline','interpretation'],true)||!text($f['text']??null)||!is_array($f['paragraphIds']??null))fail(422,'Invalid context fact.');foreach($f['paragraphIds'] as $id)if(!in_array($id,array_column($r['paragraphs'],'id'),true))fail(422,'Invalid evidence.');}}
}
// Review receipts are additive for older archives, mandatory for partial decisions.
function validateProposalReview(array $p,array $revisions):void {
 $v=$p['review']??null;
 if($v===null){if($p['status']==='partially-accepted')fail(422,'Partial acceptance requires a review record.');return;}
 if(!is_array($v)||!in_array($p['status'],['accepted','partially-accepted'],true))fail(422,'Invalid proposal review.');
 $reviewed=$revisions[$v['reviewedRevisionId']??'']??null;$result=$revisions[$v['resultRevisionId']??'']??null;
 if(!$reviewed||!$result||$reviewed['chapterId']!==$p['chapterId']||$result['chapterId']!==$p['chapterId']||$result['parentId']!==$reviewed['id']||$result['source']!=='proposal'||!text($v['createdAt']??null,100))fail(422,'Invalid reviewed revision.');
 paragraphs($v['paragraphs']??null);
 $before=$revisions[$p['baseRevisionId']]['paragraphs'];$after=$v['paragraphs'];$b=array_column($before,null,'id');$a=array_column($after,null,'id');$changed=[];
 foreach($after as $row)if(!isset($b[$row['id']])||$b[$row['id']]['text']!==$row['text']||$b[$row['id']]['section']!==$row['section']||$b[$row['id']]['label']!==$row['label'])$changed[$row['id']]=true;
 foreach($before as $row)if(!isset($a[$row['id']]))$changed[$row['id']]=true;
 $left=array_values(array_filter($before,fn($r)=>isset($a[$r['id']])));$right=array_values(array_filter($after,fn($r)=>isset($b[$r['id']])));$reordered=false;
 foreach($left as $i=>$row)if($row['id']!==$right[$i]['id']){$changed[$row['id']]=true;$changed[$right[$i]['id']]=true;$reordered=true;}
 foreach(['selectedChangeIds','declinedChangeIds'] as $key){$ids=$v[$key]??null;if(!is_array($ids)||!array_is_list($ids)||count(array_unique($ids))!==count($ids))fail(422,'Invalid review selections.');foreach($ids as $id)if(!idvalid($id)||!isset($changed[$id]))fail(422,'Unknown selected change.');}
 $selected=array_fill_keys($v['selectedChangeIds'],true);$declined=array_fill_keys($v['declinedChangeIds'],true);
 if(array_intersect_key($selected,$declined)||count($selected)+count($declined)!==count($changed)||($p['status']==='partially-accepted')!==(count($declined)>0)||($p['status']==='partially-accepted'&&!$selected))fail(422,'Inconsistent review decision.');
 if($reordered&&$selected&&$declined)fail(422,'Reordered changes must be selected together.');
 // Structural hunks between unchanged anchors are indivisible.
 $bi=0;$ai=0;$bp=array_flip(array_column($before,'id'));$ap=array_flip(array_column($after,'id'));
 $anchors=array_values(array_filter($after,fn($r)=>!isset($changed[$r['id']])));$anchors[]=null;
 if(!$reordered)foreach($anchors as $anchor){$eb=$anchor?$bp[$anchor['id']]:count($before);$ea=$anchor?$ap[$anchor['id']]:count($after);$l=array_slice($before,$bi,$eb-$bi);$r=array_slice($after,$ai,$ea-$ai);$struct=false;$ids=[];foreach($l as $row){$ids[$row['id']]=true;if(!isset($a[$row['id']]))$struct=true;}foreach($r as $row){$ids[$row['id']]=true;if(!isset($b[$row['id']]))$struct=true;}if($struct&&array_intersect_key($ids,$selected)&&array_intersect_key($ids,$declined))fail(422,'Linked changes must be selected together.');$bi=$eb+1;$ai=$ea+1;}
 if(!is_array($v['choices']??null)||!array_is_list($v['choices']))fail(422,'Invalid conflict choices.');$seen=[];foreach($v['choices'] as $choice){$id=$choice['id']??'';if(($id!=='paragraph-order'&&!idvalid($id))||isset($seen[$id])||!in_array($choice['choice']??null,['current','proposal'],true))fail(422,'Invalid conflict choice.');$seen[$id]=true;}
}
// Author-only cleanup receipts contain identifiers, never discarded prose.
function cleanupTargets(array $s):array {
 $rows=array_key_exists('chapterCleanups',$s)?$s['chapterCleanups']:[];
 if(!is_array($rows)||!array_is_list($rows)||count($rows)>100000)fail(422,'Invalid chapter cleanup collection.');
 $chapters=array_column($s['chapters'],null,'id');$seen=[];$targets=['proposals'=>[],'contexts'=>[],'chapterProposals'=>[]];
 foreach($rows as $r){
  if(!is_array($r)||!idvalid($r['id']??null)||isset($seen[$r['id']])||!isset($chapters[$r['chapterId']??''])||!is_string($r['createdAt']??null)||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/D',$r['createdAt'])||strtotime($r['createdAt'])===false)fail(422,'Invalid chapter cleanup receipt.');
  $seen[$r['id']]=true;
  foreach(['proposals'=>'proposalIds','contexts'=>'contextIds','chapterProposals'=>'chapterProposalIds'] as $key=>$field){
   $ids=$r[$field]??null;if(!is_array($ids)||!array_is_list($ids)||count($ids)>100000)fail(422,'Invalid cleanup targets.');$unique=[];
   foreach($ids as $id){if(!idvalid($id)||isset($unique[$id]))fail(422,'Invalid or duplicate cleanup target.');$unique[$id]=true;if(isset($targets[$key][$id])&&$targets[$key][$id]!==$r['chapterId'])fail(422,'Cleanup target belongs to another chapter.');$targets[$key][$id]=$r['chapterId'];}
  }
 }
 foreach($targets as $key=>$ids)foreach($s[$key]??[] as $r)if(isset($ids[$r['id']]))fail(422,'Cleaned records cannot be restored by an older workspace.');
 return $targets;
}
function preserveHistory(array $old,array $new):void {
 $cleaned=cleanupTargets($new);
 $oldDeletes=array_column($old['materialDeletions']??[],null,'id');
 $deleted=[];
 foreach($new['materialDeletions']??[] as $d){
  if(!isset($oldDeletes[$d['id']])){
   // An offline-created item may be deleted before its first upload.
   foreach($old['materials']??[] as $m)if($m['itemId']===$d['itemId']&&$m['bookId']!==$d['bookId'])fail(409,'Material deletion belongs to another manuscript.');
  }
  $deleted[$d['itemId']]=$d['bookId'];
 }
 $removableFiles=[];
 foreach($old['materials']??[] as $m)if(($deleted[$m['itemId']]??null)===$m['bookId']&&$m['fileId']!==null)$removableFiles[$m['fileId']]=true;
 foreach($new['materials']??[] as $m)if($m['fileId']!==null)unset($removableFiles[$m['fileId']]);
 foreach(['books','chapters','revisions','flags','proposals','contexts','chapterProposals','materials','files','materialDeletions','chapterCleanups'] as $key){
  $lookup=array_column($new[$key]??[],null,'id');
  foreach($old[$key]??[] as $r){
   if(!isset($lookup[$r['id']])){
    if(isset($cleaned[$key][$r['id']])){
     $chapterId=$key==='chapterProposals'?($r['review']['chapterId']??null):($r['chapterId']??null);
     if($chapterId!==$cleaned[$key][$r['id']])fail(409,'Cleanup record belongs to another chapter.');
     if(in_array($key,['proposals','chapterProposals'],true)&&$r['status']==='pending')fail(409,'Pending proposals cannot be cleaned. Sync completed reviews before cleanup.');
     if($key==='contexts'){
      $remaining=array_filter($new['contexts'],fn($x)=>$x['chapterId']===$chapterId);
      if(!$remaining)fail(409,'Keep the latest context index when cleaning a chapter.');
      $original=array_values(array_filter($old['contexts'],fn($x)=>$x['chapterId']===$chapterId));
      $last=end($original);
      if($last['id']===$r['id']&&!array_filter($remaining,fn($x)=>!in_array($x['id'],array_column($original,'id'),true)))fail(409,'Latest context index cannot be cleaned.');
     }
     continue;
    }
    if($key==='materials'&&($deleted[$r['itemId']]??null)===$r['bookId'])continue;
    if($key==='files'&&isset($removableFiles[$r['id']]))continue;
    fail(409,'Server records are missing locally. Download the latest workspace before uploading.');
   }
   if(in_array($key,['revisions','contexts','materials','files','materialDeletions','chapterCleanups'],true)&&$lookup[$r['id']]!=$r)fail(409,'Historical records are immutable.');
   if(in_array($key,['proposals','chapterProposals'],true)){
    $incoming=$lookup[$r['id']];unset($incoming['status'],$incoming['review']);$previous=$r;unset($previous['status'],$previous['review']);
    if($incoming!=$previous||($r['status']!=='pending'&&($lookup[$r['id']]['status']!==$r['status']||($lookup[$r['id']]['review']??null)!=($r['review']??null))))fail(409,'Proposal content and completed decisions are immutable.');
   }
  }
 }
}
function loadWorkspace(PDO $db,bool $lock=false):array {$q=$db->query('SELECT version,payload FROM workspace WHERE id=1'.($lock?databaseLock($db):''));$row=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();return $row?['version'=>(int)$row['version'],'state'=>json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR)]:['version'=>0,'state'=>blank()];}
function writeWorkspace(PDO $db,array $s,int $base,string $op,string $hash):int {
 if(!idvalid($op))fail(422,'A durable operation UUID is required.');validate($s);beginWrite($db);try{$q=$db->prepare('SELECT payload_hash,result_version FROM operations WHERE operation_id=?');$q->execute([$op]);$known=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();if($known){if(!hash_equals($known['payload_hash'],$hash))fail(409,'Operation ID reused for different content.');$db->commit();return (int)$known['result_version'];}
 // The singleton row must exist before SELECT FOR UPDATE; installer inserts it.
 $old=loadWorkspace($db,true);if($old['version']!==$base)fail(409,'Server workspace changed. Download it and reconcile with your local safety backup; nothing was overwritten.');preserveHistory($old['state'],$s);$v=$base+1;$q=$db->prepare('UPDATE workspace SET version=?,payload=? WHERE id=1 AND version=?');$q->execute([$v,json_encode($s,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$base]);if($q->rowCount()!==1)fail(409,'Workspace not initialized or changed.');$q=$db->prepare('INSERT INTO operations(operation_id,payload_hash,result_version) VALUES(?,?,?)');$q->execute([$op,$hash,$v]);$db->commit();return $v;}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}}
function tools():array {
 $str=['type'=>'string'];$props=['chapter_id'=>$str,'revision_id'=>$str];$definitions=[
 ['get_khosra_guide','Read this first: what Khosra is, safe author/LLM workflows, permanent references, proposal/context examples, history, retries and limitations. Static product documentation; no manuscript content or credentials. Takes no arguments.',[],[]],
 ['list_books','List books and current chapters with stable IDs. No manuscript text.',[],[]],
 ['resolve_reference','Resolve a short human address such as R2:C3-P17 in a book. Returns exact historical source or latest passage and permanent IDs.',['book_id'=>$str,'reference'=>$str,'revision_id'=>$str],['book_id','reference']],
 ['read_chapter','Read latest chapter or an exact historical revision. Optionally restrict to paragraph_ids. Returns paragraph UUIDs, stable labels, full revision ID, and reference edition.',array_merge($props,['paragraph_ids'=>['type'=>'array','items'=>$str]]),['chapter_id']],
 ['read_context','Read the latest saved chapter summary and evidence graph. Reports stale status; source manuscript is authoritative.',['chapter_id'=>$str],['chapter_id']],
 ['list_flags','Read chapter flags, exact original quotes and original revision IDs.',['chapter_id'=>$str],['chapter_id']],
 ['list_proposals','List chapter proposal metadata and review status without full replacement text.',['chapter_id'=>$str],['chapter_id']],
 ['read_proposal','Read an exact saved proposal, including author review status, without treating it as the current manuscript.',['chapter_id'=>$str,'proposal_id'=>$str],['chapter_id','proposal_id']],
 ['list_history','List chapter revisions for comparing or reincorporating older passages.',['chapter_id'=>$str],['chapter_id']],
 ['save_proposal','Save a NEW proposal against the exact revision you read. An earlier ancestor in the current reference edition is allowed; author review reconciles later edits. Never modifies the current manuscript. Pass the COMPLETE resulting paragraph array, preserving existing paragraph UUIDs and labels; use new UUIDs and unused labels for insertions. Author reviews in Khosra. Requires durable operation_id.', ['operation_id'=>$str,'chapter_id'=>$str,'base_revision_id'=>$str,'title'=>$str,'rationale'=>$str,'paragraphs'=>['type'=>'array','items'=>['type'=>'object','properties'=>['id'=>$str,'label'=>['type'=>'integer'],'text'=>$str,'section'=>$str],'required'=>['id','label','text','section'],'additionalProperties'=>false]]],['operation_id','chapter_id','base_revision_id','title','rationale','paragraphs']],
 ['save_context','Reindex: save summary at about 20% of source length with evidence-linked facts. Read the source first; only latest revision may be indexed. Distinguish interpretation from explicit facts; describe author, reader and character knowledge in fact text. Requires durable operation_id.', ['operation_id'=>$str,'chapter_id'=>$str,'revision_id'=>$str,'summary'=>$str,'facts'=>['type'=>'array','items'=>['type'=>'object','properties'=>['kind'=>['type'=>'string','enum'=>['event','character','clue','thread','timeline','interpretation']],'text'=>$str,'paragraphIds'=>['type'=>'array','items'=>$str]],'required'=>['kind','text','paragraphIds'],'additionalProperties'=>false]]],['operation_id','chapter_id','revision_id','summary','facts']],
 ];$definitions=array_merge($definitions,materialTools(),chapterProposalTools());$out=[];foreach($definitions as [$name,$desc,$properties,$required])$out[]=['name'=>$name,'description'=>$desc,'inputSchema'=>['type'=>'object','properties'=>$properties?:new stdClass(),'required'=>$required,'additionalProperties'=>false],'securitySchemes'=>[['type'=>'oauth2','scopes'=>[str_starts_with($name,'save_')?'manuscript.propose':'manuscript.read']]],'annotations'=>['readOnlyHint'=>!str_starts_with($name,'save_'),'destructiveHint'=>false,'idempotentHint'=>true,'openWorldHint'=>false]];return $out;
}
// Keep the exact source snapshot even when the author saves while the model drafts.
// Only the current same-edition ancestry is eligible; never silently rebase prose.
function proposalSource(array $state,array $head,mixed $baseId):array {
 if(!idvalid($baseId))fail(422,'base_revision_id must be the exact revision UUID returned by read_chapter.');
 $revisions=array_column($state['revisions'],null,'id');$cursor=$head;$seen=[];
 while($cursor['chapterId']===$head['chapterId']&&$cursor['edition']===$head['edition']&&!isset($seen[$cursor['id']])){
  if($cursor['id']===$baseId)return $cursor;
  $seen[$cursor['id']]=true;$parent=$revisions[$cursor['parentId']??'']??null;if(!$parent)break;$cursor=$parent;
 }
 fail(409,'Source revision is not in the current chapter ancestry/reference edition. Read the latest chapter and reconcile a fresh proposal; do not just replace base_revision_id.');
}
function callTool(PDO $db,string $name,array $args):array {
 if($name==='get_khosra_guide'){if($args!==[])fail(422,'get_khosra_guide takes no arguments.');return khosraGuide();}
 $loaded=loadWorkspace($db);$s=$loaded['state'];if($name==='list_books')return ['books'=>$s['books'],'chapters'=>array_values(array_filter($s['chapters'],fn($c)=>empty($c['deletedAt']))),'workspaceVersion'=>$loaded['version']];
 if($name==='resolve_reference'){if(!preg_match('/^(?:R(\d+):)?C(\d+)(?:-P(\d+))?$/i',(string)($args['reference']??''),$m))fail(422,'Use R2:C3-P17 or C3-P17.');record($s['books'],(string)($args['book_id']??''));$cs=array_values(array_filter($s['chapters'],fn($c)=>$c['bookId']===$args['book_id']&&$c['code']===(int)$m[2]));if(!$cs)fail(404,'Chapter address not found.');$c=$cs[0];$r=record($s['revisions'],$c['headId']);if(($m[1]??'')!==''){$matches=array_values(array_filter($s['revisions'],fn($r)=>$r['chapterId']===$c['id']&&$r['edition']===(int)$m[1]&&(!isset($m[3])||in_array((int)$m[3],array_column($r['paragraphs'],'label'),true))));if(isset($args['revision_id']))$matches=array_values(array_filter($matches,fn($x)=>$x['id']===$args['revision_id']));if(!$matches)fail(404,'Historical reference not found.');if(isset($m[3])&&!isset($args['revision_id'])){$ids=[];foreach($matches as $x)foreach($x['paragraphs'] as $p)if($p['label']===(int)$m[3])$ids[$p['id']]=true;if(count($ids)>1)fail(409,'Address appears on divergent branches. Supply revision_id from history.');}$r=end($matches);}if(isset($m[3])){$r['paragraphs']=array_values(array_filter($r['paragraphs'],fn($p)=>$p['label']===(int)$m[3]));if(!$r['paragraphs'])fail(404,'Passage absent from current edition; specify original R edition or read history.');}return ['chapter'=>$c,'revision'=>$r,'isLatest'=>$r['id']===$c['headId']];}
 if(in_array($name,['save_chapter_proposal','list_chapter_proposals','read_chapter_proposal'],true))return chapterProposalTool($db,$name,$args,$loaded);
 if(in_array($name,['list_materials','read_material','save_idea','save_artifact'],true))return materialTool($db,$name,$args,$loaded);
 $c=record($s['chapters'],(string)($args['chapter_id']??''));$r=record($s['revisions'],$c['headId']);
 if($name==='read_chapter'){if(isset($args['revision_id'])){$r=record($s['revisions'],$args['revision_id']);if($r['chapterId']!==$c['id'])fail(422,'Revision belongs to another chapter.');}if(isset($args['paragraph_ids'])){if(!is_array($args['paragraph_ids']))fail(422,'Invalid paragraph IDs.');$ids=$args['paragraph_ids'];$r['paragraphs']=array_values(array_filter($r['paragraphs'],fn($p)=>in_array($p['id'],$ids,true)));if(count($r['paragraphs'])!==count(array_unique($ids)))fail(404,'One or more paragraphs are absent from this revision.');}return ['chapter'=>$c,'revision'=>$r,'reference'=>'R'.$r['edition'].':C'.$c['code'],'isLatest'=>$r['id']===$c['headId']];}
 if($name==='read_context'){$xs=array_values(array_filter($s['contexts'],fn($x)=>$x['chapterId']===$c['id']));$x=$xs?end($xs):null;return ['context'=>$x,'stale'=>$x?$x['revisionId']!==$r['id']:true,'currentRevisionId'=>$r['id']];}
 if($name==='list_flags')return ['flags'=>array_values(array_filter($s['flags'],fn($f)=>$f['chapterId']===$c['id']))];
 if($name==='list_proposals')return ['proposals'=>array_map(fn($p)=>array_diff_key($p,['paragraphs'=>true,'review'=>true]),array_values(array_filter($s['proposals'],fn($p)=>$p['chapterId']===$c['id'])))];
 if($name==='read_proposal'){$p=record($s['proposals'],(string)($args['proposal_id']??''));if($p['chapterId']!==$c['id'])fail(422,'Proposal belongs to another chapter.');return ['proposal'=>$p,'currentRevisionId'=>$r['id'],'stale'=>$p['baseRevisionId']!==$r['id']];}
 if($name==='list_history')return ['revisions'=>array_map(fn($x)=>array_diff_key($x,['paragraphs'=>true]),array_values(array_filter($s['revisions'],fn($x)=>$x['chapterId']===$c['id'])))];
 if(!in_array($name,['save_proposal','save_context'],true))fail(404,'Unknown tool.');
 $op=(string)($args['operation_id']??'');$hash=hash('sha256',json_encode([$name,$args],JSON_THROW_ON_ERROR));$q=$db->prepare('SELECT payload_hash,result_version FROM operations WHERE operation_id=?');$q->execute([$op]);if($known=$q->fetch(PDO::FETCH_ASSOC)){if(!hash_equals($known['payload_hash'],$hash))fail(409,'Operation ID reused.');return ['saved'=>true,'workspaceVersion'=>(int)$known['result_version'],'duplicate'=>true];}
 if(!empty($c['deletedAt']))fail(409,'Chapter is in Trash. The author must restore it before adding proposals or context.');
 if($name==='save_proposal'){$base=proposalSource($s,$r,$args['base_revision_id']??null);$item=['id'=>uuid(),'chapterId'=>$c['id'],'baseRevisionId'=>$base['id'],'title'=>$args['title']??null,'rationale'=>$args['rationale']??null,'paragraphs'=>$args['paragraphs']??null,'status'=>'pending','createdAt'=>stamp()];$s['proposals'][]=$item;}else{if(($args['revision_id']??null)!==$r['id'])fail(409,'Chapter changed. Reindex latest source.');$item=['id'=>uuid(),'chapterId'=>$c['id'],'revisionId'=>$r['id'],'summary'=>$args['summary']??null,'facts'=>$args['facts']??null,'createdAt'=>stamp()];$s['contexts'][]=$item;}
 $v=writeWorkspace($db,$s,$loaded['version'],$op,$hash);$result=['saved'=>true,'id'=>$item['id'],'workspaceVersion'=>$v,'message'=>$name==='save_proposal'?'Proposal saved for author review. Current manuscript unchanged.':'Context saved.'];if($name==='save_proposal'){$result['baseRevisionId']=$base['id'];$result['currentRevisionId']=$r['id'];$result['stale']=$base['id']!==$r['id'];if($result['stale'])$result['message']='Proposal saved against the exact source you read. The chapter has newer edits; author review must reconcile overlapping changes. Current manuscript unchanged.';}return $result;
}

// New chapters remain separate from manuscript chapters until owner confirmation.
function validateChapterProposals(array $s):void {
 $rows=array_key_exists('chapterProposals',$s)?$s['chapterProposals']:[];
 if(!is_array($rows)||!array_is_list($rows)||count($rows)>100000)fail(422,'Invalid new-chapter proposal collection.');
 $books=array_column($s['books'],null,'id');$chapters=array_column($s['chapters'],null,'id');$revisions=array_column($s['revisions'],null,'id');$ids=[];
 foreach($rows as $p){
  if(!is_array($p)||!idvalid($p['id']??null)||isset($ids[$p['id']])||!isset($books[$p['bookId']??''])||!materialText($p['title']??null,300)||trim($p['title'])===''||!materialText($p['synopsis']??null,200000)||!materialText($p['rationale']??null,200000)||!in_array($p['status']??null,['pending','accepted','rejected'],true)||!is_string($p['createdAt']??null)||strtotime($p['createdAt'])===false||!array_key_exists('afterChapterId',$p))fail(422,'Invalid new-chapter proposal.');
  $ids[$p['id']]=true;
  $anchor=$p['afterChapterId'];if($anchor!==null&&(!idvalid($anchor)||!isset($chapters[$anchor])||$chapters[$anchor]['bookId']!==$p['bookId']))fail(422,'New-chapter position belongs to another manuscript.');
  paragraphs($p['paragraphs']??null);if(count($p['paragraphs'])===0)fail(422,'A proposed chapter needs at least one paragraph.');
  foreach($p['paragraphs'] as $block)if(!materialText($block['text'],200000)||!materialText($block['section'],200))fail(422,'Proposed paragraph exceeds browser limits.');
  $v=$p['review']??null;if((array_key_exists('review',$p)&&!is_array($p['review']))||($p['status']==='accepted')!==is_array($v))fail(422,'Invalid chapter creation receipt.');
  if($v!==null){
   $c=$chapters[$v['chapterId']??'']??null;$r=$revisions[$v['revisionId']??'']??null;
   if(!$c||$c['id']!==$p['id']||$c['bookId']!==$p['bookId']||!$r||$r['chapterId']!==$c['id']||$r['parentId']!==null||$r['source']!=='proposal'||!$r['paragraphs']||!materialText($v['title']??null,300)||trim($v['title'])===''||!materialText($v['synopsis']??null,200000)||!is_string($v['createdAt']??null)||strtotime($v['createdAt'])===false||!array_key_exists('afterChapterId',$v))fail(422,'Invalid created chapter references.');
   $a=$v['afterChapterId'];if($a!==null&&(!idvalid($a)||!isset($chapters[$a])||$chapters[$a]['bookId']!==$p['bookId']||$a===$c['id']))fail(422,'Invalid reviewed chapter position.');
  }
 }
}
function chapterProposalTools():array {
 $str=['type'=>'string'];$paragraph=['type'=>'object','properties'=>['id'=>$str,'label'=>['type'=>'integer','minimum'=>1],'text'=>$str,'section'=>$str],'required'=>['id','label','text','section'],'additionalProperties'=>false];
 return [
 ['save_chapter_proposal','Propose a NEW chapter with title, synopsis, rationale and complete draft. Does not create a chapter or change the manuscript until the author confirms in Khosra Proposals. after_chapter_id must be an active chapter UUID in this book, or null to place first. Use fresh paragraph UUIDs, unique positive labels, and a durable operation_id for identical retries.',['operation_id'=>$str,'book_id'=>$str,'title'=>$str,'synopsis'=>$str,'rationale'=>$str,'after_chapter_id'=>['type'=>['string','null']],'paragraphs'=>['type'=>'array','minItems'=>1,'maxItems'=>20000,'items'=>$paragraph]],['operation_id','book_id','title','synopsis','rationale','after_chapter_id','paragraphs']],
 ['list_chapter_proposals','List NEW-chapter proposal metadata for a manuscript, newest first, up to 100 per page. Separate from existing-chapter revisions; pending proposals are not manuscript chapters.',['book_id'=>$str,'status'=>['type'=>'string','enum'=>['pending','accepted','rejected']],'page'=>['type'=>'integer','minimum'=>1]],['book_id']],
 ['read_chapter_proposal','Read an exact NEW-chapter proposal and its creation receipt if accepted. This is a suggestion, not current manuscript text. Read the created chapter separately after author acceptance.',['book_id'=>$str,'proposal_id'=>$str],['book_id','proposal_id']],
 ];
}
function chapterProposalTool(PDO $db,string $name,array $args,array $loaded):array {
 $s=$loaded['state'];$bid=(string)($args['book_id']??'');record($s['books'],$bid);
 $rows=array_values(array_filter($s['chapterProposals']??[],fn($p)=>$p['bookId']===$bid));
 if($name==='list_chapter_proposals'){
  if(array_diff(array_keys($args),['book_id','status','page']))fail(422,'Unexpected chapter discovery argument.');
  $page=$args['page']??1;if(!is_int($page)||$page<1)fail(422,'Invalid page.');
  if(isset($args['status'])){if(!in_array($args['status'],['pending','accepted','rejected'],true))fail(422,'Invalid proposal status.');$rows=array_values(array_filter($rows,fn($p)=>$p['status']===$args['status']));}
  usort($rows,fn($a,$b)=>strcmp($b['createdAt'],$a['createdAt'])?:strcmp($b['id'],$a['id']));
  return ['proposals'=>array_map(fn($p)=>array_diff_key($p,['paragraphs'=>true]),array_slice($rows,($page-1)*100,100)),'total'=>count($rows),'page'=>$page,'pageSize'=>100];
 }
 if($name==='read_chapter_proposal'){
  if(array_diff(array_keys($args),['book_id','proposal_id']))fail(422,'Unexpected proposal read argument.');
  return ['proposal'=>record($rows,(string)($args['proposal_id']??''))];
 }
 if(array_diff(array_keys($args),['operation_id','book_id','title','synopsis','rationale','after_chapter_id','paragraphs']))fail(422,'Unexpected chapter proposal argument.');
 $op=(string)($args['operation_id']??'');if(!idvalid($op))fail(422,'A durable operation UUID is required.');
 $hash=hash('sha256',json_encode([$name,$args],JSON_THROW_ON_ERROR));$q=$db->prepare('SELECT payload_hash,result_version FROM operations WHERE operation_id=?');$q->execute([$op]);$known=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();
 if($known){if(!hash_equals($known['payload_hash'],$hash))fail(409,'Operation ID reused for different content.');return ['saved'=>true,'id'=>$op,'duplicate'=>true,'workspaceVersion'=>(int)$known['result_version']];}
 if(!array_key_exists('after_chapter_id',$args))fail(422,'Choose an after_chapter_id or null for the first position.');
 $anchor=$args['after_chapter_id'];if($anchor!==null){$c=record($s['chapters'],(string)$anchor);if($c['bookId']!==$bid||!empty($c['deletedAt']))fail(422,'Choose an active chapter in this manuscript.');}
 $item=['id'=>$op,'bookId'=>$bid,'title'=>$args['title']??null,'synopsis'=>$args['synopsis']??null,'rationale'=>$args['rationale']??null,'afterChapterId'=>$anchor,'paragraphs'=>$args['paragraphs']??null,'status'=>'pending','createdAt'=>stamp()];
 $s['chapterProposals'][]=$item;$v=writeWorkspace($db,$s,$loaded['version'],$op,$hash);
 return ['saved'=>true,'id'=>$op,'workspaceVersion'=>$v,'message'=>'New chapter proposed for author confirmation in Proposals. No chapter has been created.'];
}
