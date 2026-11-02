<?php
declare(strict_types=1);

const MANUSCRIPT_STORAGE='manuscript-records-v1';
function manuscriptStorage(PDO $db):bool {
 return str_starts_with((string)$db->query('SELECT SUBSTR(payload,1,64) FROM workspace WHERE id=1')->fetchColumn(),'{"storage":"'.MANUSCRIPT_STORAGE.'"');
}
function manuscriptSchema(PDO $db):void {
 $mysql=$db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql';$text=$mysql?'LONGTEXT':'TEXT';$suffix=$mysql?' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin':'';
 $db->exec('CREATE TABLE IF NOT EXISTS manuscript_records (collection VARCHAR(32) NOT NULL, record_id CHAR(36) NOT NULL, book_id CHAR(36) NOT NULL, position BIGINT NOT NULL, payload '.$text.' NOT NULL, record_hash CHAR(64) NOT NULL, payload_bytes BIGINT NOT NULL, item_id CHAR(36) NULL, PRIMARY KEY(collection,record_id)'.($mysql?', INDEX manuscript_book_records(book_id,collection,position), INDEX manuscript_item_lookup(collection,item_id,book_id)':'').')'.$suffix);
 if(!$mysql){$db->exec('CREATE INDEX IF NOT EXISTS manuscript_book_records ON manuscript_records(book_id,collection,position)');$db->exec('CREATE INDEX IF NOT EXISTS manuscript_item_lookup ON manuscript_records(collection,item_id,book_id)');}
 $db->exec('CREATE TABLE IF NOT EXISTS manuscript_units (book_id CHAR(36) PRIMARY KEY, version BIGINT NOT NULL, fingerprint CHAR(64) NOT NULL)'.$suffix);
 $db->exec('CREATE TABLE IF NOT EXISTS workspace_storage_backup (id INTEGER PRIMARY KEY, version BIGINT NOT NULL, payload '.$text.' NOT NULL, created_at VARCHAR(40) NOT NULL)'.$suffix);
}
/** Reads legacy JSON in binary chunks; migration never holds the entire workspace. */
final class LegacyWorkspaceReader {
 private string $buffer='';private int $at=0;private int $offset=1;private bool $end=false;private PDOStatement $query;private mixed $hash;private mixed $stream=null;private mixed $sqlite=null;
 public function __construct(PDO $db,?string $snapshot=null){$cast=$db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?'BINARY':'BLOB';$this->query=$db->prepare('SELECT SUBSTR(CAST(payload AS '.$cast.'),?,1048576) FROM workspace WHERE id=1');$this->hash=hash_init('sha256');
  if($snapshot!==null){$this->stream=fopen($snapshot,'rb');if(!is_resource($this->stream))fail(503,'Private migration snapshot could not be read.');return;}
  // A native SQLite blob stream avoids rescanning the legacy TEXT value per chunk.
  if($cast==='BLOB'&&class_exists('SQLite3'))try{$list=$db->query('PRAGMA database_list')->fetchAll(PDO::FETCH_ASSOC);foreach($list as $database)if($database['name']==='main'&&$database['file']!==''){$this->sqlite=new SQLite3($database['file'],SQLITE3_OPEN_READONLY);$stream=@$this->sqlite->openBlob('workspace','payload',1,'main',SQLITE3_OPEN_READONLY);if(is_resource($stream))$this->stream=$stream;break;}}catch(Throwable){$this->stream=null;$this->sqlite=null;}
 }
 public function __destruct(){if(is_resource($this->stream))fclose($this->stream);if($this->sqlite!==null)$this->sqlite->close();}
 public function copyTo(mixed $output):string {
  while($this->peek()!==''){$part=substr($this->buffer,$this->at);$written=0;while($written<strlen($part)){$n=fwrite($output,substr($part,$written));if($n===false||$n===0)fail(503,'Private migration snapshot could not be written.');$written+=$n;}$this->at=strlen($this->buffer);}
  return $this->fingerprint();
 }
 private function peek():string {
  if($this->at>=strlen($this->buffer)&&!$this->end){if(is_resource($this->stream)){$read=fread($this->stream,65536);if($read===false)fail(503,'Legacy workspace stream could not be read.');$this->buffer=$read;}else{$this->query->execute([$this->offset]);$this->buffer=(string)$this->query->fetchColumn();$this->query->closeCursor();}$this->at=0;$this->offset+=strlen($this->buffer);$this->end=$this->buffer==='';hash_update($this->hash,$this->buffer);}
  return $this->buffer[$this->at]??'';
 }
 private function take():string{$c=$this->peek();if($c!=='')$this->at++;return $c;}
 private function space():void{while(($c=$this->peek())!==''&&str_contains(" \t\r\n",$c))$this->take();}
 private function expect(string $value):void{$this->space();if($this->take()!==$value)fail(422,'Legacy workspace JSON is malformed.');}
 private function value():string {
  $this->space();$first=$this->peek();if($first==='')fail(422,'Legacy workspace JSON is incomplete.');$out='';$depth=0;$quoted=false;$escaped=false;$structured=in_array($first,['{','[','"'],true);
  while(($c=$this->peek())!==''){
   if($quoted&&!$escaped&&$c!=='"'&&$c!=='\\'){$length=strcspn($this->buffer,"\"\\",$this->at);$out.=substr($this->buffer,$this->at,$length);$this->at+=$length;continue;}
   if(!$structured&&($c===','||$c===']'||$c==='}'||str_contains(" \t\r\n",$c)))break;
   $c=$this->take();$out.=$c;
   if($quoted){if($escaped)$escaped=false;elseif($c==='\\')$escaped=true;elseif($c==='"'){$quoted=false;if($depth===0)break;}continue;}
   if($c==='"')$quoted=true;elseif($c==='{'||$c==='['){$depth++;if($depth>512)fail(422,'Legacy workspace JSON is too deeply nested.');}elseif($c==='}'||$c===']'){if(--$depth===0)break;}
  }
  if($quoted||$depth!==0||$out==='')fail(422,'Legacy workspace JSON is incomplete.');return $out;
 }
 public function records():Generator {
  $this->expect('{');$seen=[];$schema=false;
  while(true){$this->space();if($this->peek()==='}'){$this->take();break;}
   $key=json_decode($this->value(),true,512,JSON_THROW_ON_ERROR);if(!is_string($key)||isset($seen[$key]))fail(422,'Invalid legacy workspace field.');$seen[$key]=true;$this->expect(':');
   if($key==='schemaVersion'){if(json_decode($this->value(),true,512,JSON_THROW_ON_ERROR)!==1)fail(422,'Unsupported workspace schema.');$schema=true;}
   else{if(!in_array($key,SYNC_COLLECTIONS,true))fail(422,'Unknown legacy workspace field; migration was cancelled without changing content.');$this->expect('[');$position=0;
    while(true){$this->space();if($this->peek()===']'){$this->take();break;}$raw=$this->value();if($position>=100000)fail(422,'Legacy collection is too large.');yield [$key,$raw,$position++];$this->space();if($this->peek()===']'){$this->take();break;}$this->expect(',');$this->space();if($this->peek()===']')fail(422,'Invalid trailing collection comma.');}
   }
   $this->space();if($this->peek()==='}'){$this->take();break;}$this->expect(',');$this->space();if($this->peek()==='}')fail(422,'Invalid trailing workspace comma.');
  }
  $this->space();if($this->peek()!==''||!$schema||array_diff(['books','chapters','revisions','flags','proposals','contexts'],array_keys($seen)))fail(422,'Incomplete legacy workspace.');
 }
 public function fingerprint():string{return hash_final(hash_copy($this->hash));}
}
function manuscriptOwner(PDO $db,string $collection,string $id):?string {
 $q=$db->prepare('SELECT book_id FROM manuscript_records WHERE collection=? AND record_id=?');$q->execute([$collection,$id]);$book=$q->fetchColumn();$q->closeCursor();return $book===false?null:(string)$book;
}
function manuscriptRecord(PDO $db,string $collection,string $id):array {
 $q=$db->prepare('SELECT payload FROM manuscript_records WHERE collection=? AND record_id=?');$q->execute([$collection,$id]);$raw=$q->fetchColumn();$q->closeCursor();if($raw===false)fail(404,'Record not found.');return json_decode($raw,true,512,JSON_THROW_ON_ERROR);
}
function manuscriptRowBook(PDO $db,string $collection,array $row,array $chapters=[]):string {
 $bid=$collection==='books'?($row['id']??null):($row['bookId']??($chapters[$row['chapterId']??'']??manuscriptOwner($db,'chapters',(string)($row['chapterId']??''))));
 if(!idvalid($bid))fail(422,'Record has no manuscript owner.');
 if($collection!=='books'&&manuscriptOwner($db,'books',$bid)!==$bid)fail(422,'Record belongs to a missing manuscript.');return $bid;
}
function manuscriptInsert(PDO $db,string $collection,array $row,string $bid,int $position):void {
 if(!idvalid($row['id']??null))fail(422,'Invalid record ID.');$raw=json_encode($row,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
 $q=$db->prepare('INSERT INTO manuscript_records(collection,record_id,book_id,position,payload,record_hash,payload_bytes,item_id) VALUES(?,?,?,?,?,?,?,?)');$q->execute([$collection,$row['id'],$bid,$position,$raw,hash('sha256',$raw),strlen($raw),$row['itemId']??null]);$q->closeCursor();
}
function manuscriptManifest(PDO $db,?string $book=null):array {
 $collections=array_fill_keys(SYNC_COLLECTIONS,[]);$q=$db->prepare('SELECT collection,record_id,record_hash,book_id,payload_bytes FROM manuscript_records'.($book===null?'':' WHERE book_id=?').' ORDER BY collection,position,record_id');$q->execute($book===null?[]:[$book]);
 while($row=$q->fetch(PDO::FETCH_ASSOC)){$collections[$row['collection']][]=['id'=>$row['record_id'],'hash'=>$row['record_hash'],'bookId'=>$row['book_id'],'bytes'=>(int)$row['payload_bytes']];}$q->closeCursor();return ['schemaVersion'=>1,'collections'=>$collections];
}
function manuscriptState(PDO $db,?string $book=null):array {
 $s=blank();$q=$db->prepare('SELECT collection,payload FROM manuscript_records'.($book===null?'':' WHERE book_id=?').' ORDER BY collection,position,record_id');$q->execute($book===null?[]:[$book]);while($row=$q->fetch(PDO::FETCH_ASSOC))$s[$row['collection']][]=json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR);$q->closeCursor();return $s;
}
function manuscriptMeta(PDO $db,?string $book=null,bool $lock=false):array {
 if($book!==null){$q=$db->prepare('SELECT version,fingerprint FROM manuscript_units WHERE book_id=?'.($lock?databaseLock($db):''));$q->execute([$book]);$row=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();if(!$row)fail(404,'Manuscript not found.');return ['version'=>(int)$row['version'],'fingerprint'=>$row['fingerprint']];}
 $q=$db->query('SELECT version,payload FROM workspace WHERE id=1'.($lock?databaseLock($db):''));$row=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();$marker=json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR);if(($marker['storage']??null)!==MANUSCRIPT_STORAGE||!preg_match('/^[a-f0-9]{64}$/D',$marker['fingerprint']??''))fail(503,'Invalid manuscript storage metadata.');return ['version'=>(int)$row['version'],'fingerprint'=>$marker['fingerprint']];
}
function manuscriptMigrationSnapshot(PDO $db):array {
 $version=$db->query('SELECT version FROM workspace WHERE id=1')->fetchColumn();if($version===false)fail(503,'Workspace is not initialized.');
 $base=realpath(sys_get_temp_dir());if($db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite')foreach($db->query('PRAGMA database_list')->fetchAll(PDO::FETCH_ASSOC) as $database)if($database['name']==='main'&&$database['file']!=='')$base=realpath(dirname($database['file']));
 $public=realpath($_SERVER['DOCUMENT_ROOT']??'');$normalize=fn(string $p)=>strtolower(str_replace('\\','/',rtrim($p,'/\\')));
 if($base===false)fail(503,'Private migration temporary storage is unavailable.');
 if($public){$roots=[$public];for($p=$public;dirname($p)!==$p;$p=dirname($p))if(in_array(strtolower(basename($p)),['public_html','htdocs','httpdocs','wwwroot','www'],true))$roots[]=$p;foreach($roots as $root)if($normalize($base)===$normalize($root)||str_starts_with($normalize($base).'/', $normalize($root).'/'))fail(503,'Migration requires temporary storage outside public document roots.');}
 $directory=$base.'/khosra-migrate-'.bin2hex(random_bytes(12));if(!mkdir($directory,0700))fail(503,'Private migration temporary storage is unavailable.');$file=$directory.'/snapshot.json';$output=null;
 try{$mask=umask(0077);try{$output=fopen($file,'x+b');}finally{umask($mask);}if(!is_resource($output))fail(503,'Private migration snapshot could not be created.');$reader=new LegacyWorkspaceReader($db);$fingerprint=$reader->copyTo($output);unset($reader);fclose($output);$output=null;return [$file,$directory,$fingerprint,(int)$version];}
 catch(Throwable $e){if(is_resource($output))fclose($output);@unlink($file);@rmdir($directory);throw $e;}
}
function ensureManuscriptStorage(PDO $db):void {
 if(manuscriptStorage($db))return;manuscriptSchema($db);if(manuscriptStorage($db))return;
 [$snapshot,$directory,$snapshotHash,$expectedVersion]=manuscriptMigrationSnapshot($db);
 try{
  beginWrite($db);
  if(manuscriptStorage($db)){$db->commit();return;}
  $q=$db->query('SELECT version FROM workspace WHERE id=1'.databaseLock($db));$version=$q->fetchColumn();$q->closeCursor();if($version===false)fail(503,'Workspace is not initialized.');if((int)$version!==$expectedVersion)fail(409,'Workspace changed while preparing migration. Retry; no content was changed.');
  $db->exec('DELETE FROM manuscript_records');$db->exec('DELETE FROM manuscript_units');
  // Keep the exact original JSON in the private database for recovery, without a PHP copy.
  $q=$db->prepare('INSERT INTO workspace_storage_backup(id,version,payload,created_at) SELECT 1,version,payload,? FROM workspace WHERE id=1 AND NOT EXISTS(SELECT 1 FROM workspace_storage_backup WHERE id=1)');$q->execute([stamp()]);$q->closeCursor();
  $reader=new LegacyWorkspaceReader($db,$snapshot);$chapters=[];
  foreach($reader->records() as [$key,$raw,$position])if(in_array($key,['books','chapters'],true)){
   $row=json_decode($raw,true,512,JSON_THROW_ON_ERROR);if(!is_array($row))fail(422,'Invalid legacy record.');if($key==='chapters')$chapters[$row['id']]=$row['bookId'];
   // Ownership is validated after both metadata collections have been read.
   manuscriptInsert($db,$key,$row,$key==='books'?$row['id']:$row['bookId'],$position);
  }
  $fingerprint=$reader->fingerprint();if($fingerprint!==$snapshotHash)fail(503,'Private migration snapshot is incomplete.');unset($reader);
  $reader=new LegacyWorkspaceReader($db,$snapshot);
  foreach($reader->records() as [$key,$raw,$position])if(!in_array($key,['books','chapters'],true)){$row=json_decode($raw,true,512,JSON_THROW_ON_ERROR);if(!is_array($row))fail(422,'Invalid legacy record.');manuscriptInsert($db,$key,$row,manuscriptRowBook($db,$key,$row,$chapters),$position);}
  if($reader->fingerprint()!==$fingerprint)fail(409,'Workspace changed during migration.');unset($reader,$raw,$row,$chapters);
  $books=$db->query("SELECT record_id FROM manuscript_records WHERE collection='books' ORDER BY position")->fetchAll(PDO::FETCH_COLUMN);
  foreach($books as $bid){$state=manuscriptState($db,$bid);validate($state);manuscriptValidateReferences($db,$bid,$state);unset($state);$hash=hash('sha256',json_encode(manuscriptManifest($db,$bid),JSON_THROW_ON_ERROR));$db->prepare('INSERT INTO manuscript_units(book_id,version,fingerprint) VALUES(?,?,?)')->execute([$bid,0,$hash]);}
  $q=$db->query("SELECT COUNT(*) FROM manuscript_records WHERE collection='chapters' AND book_id NOT IN(SELECT record_id FROM manuscript_records WHERE collection='books')");if((int)$q->fetchColumn())fail(422,'Legacy chapter has no manuscript.');$q->closeCursor();
  // Fence legacy writes already in flight; version zero is the uncommitted initial workspace.
  $nextVersion=(int)$version===0?0:(int)$version+1;$db->prepare('UPDATE workspace SET version=?,payload=? WHERE id=1')->execute([$nextVersion,json_encode(['storage'=>MANUSCRIPT_STORAGE,'fingerprint'=>$fingerprint],JSON_THROW_ON_ERROR)]);$db->commit();
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}finally{unset($reader);@unlink($snapshot);@rmdir($directory);}
}
function manuscriptBookForTool(PDO $db,array $args):?string {
 if(!manuscriptStorage($db))return null;
 if(isset($args['book_id'])){$book=$args['book_id'];if(!idvalid($book)||manuscriptOwner($db,'books',$book)!==$book)fail(404,'Manuscript not found.');return $book;}
 $chapter=$args['chapter_id']??null;if(!idvalid($chapter)||!($book=manuscriptOwner($db,'chapters',$chapter)))fail(404,'Chapter not found.');return $book;
}
/** Only records belonging to this manuscript are encoded/updated. */
function manuscriptPersist(PDO $db,string $book,array $state):void {
 $previous=manuscriptManifest($db,$book)['collections'];
 foreach(SYNC_COLLECTIONS as $key){$old=array_column($previous[$key],'hash','id');$kept=[];$next=(int)$db->query("SELECT COALESCE(MAX(position),-1)+1 FROM manuscript_records WHERE collection=".$db->quote($key))->fetchColumn();
  foreach($state[$key]??[] as $row){$id=$row['id'];$kept[$id]=true;$owner=manuscriptOwner($db,$key,$id);if($owner!==null&&$owner!==$book)fail(409,'Record ID already belongs to another manuscript.');$raw=json_encode($row,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);$hash=hash('sha256',$raw);
   if($owner===null)manuscriptInsert($db,$key,$row,$book,$next++);
   elseif(($old[$id]??null)!==$hash)$db->prepare('UPDATE manuscript_records SET payload=?,record_hash=?,payload_bytes=?,item_id=? WHERE collection=? AND record_id=? AND book_id=?')->execute([$raw,$hash,strlen($raw),$row['itemId']??null,$key,$id,$book]);
  }
  foreach($old as $id=>$hash)if(!isset($kept[$id]))$db->prepare('DELETE FROM manuscript_records WHERE collection=? AND record_id=? AND book_id=?')->execute([$key,$id,$book]);
 }
 $hash=hash('sha256',json_encode(manuscriptManifest($db,$book),JSON_THROW_ON_ERROR));$q=$db->prepare('SELECT version FROM manuscript_units WHERE book_id=?');$q->execute([$book]);$version=$q->fetchColumn();$q->closeCursor();
 if($version===false)$db->prepare('INSERT INTO manuscript_units(book_id,version,fingerprint) VALUES(?,1,?)')->execute([$book,$hash]);else $db->prepare('UPDATE manuscript_units SET version=?,fingerprint=? WHERE book_id=?')->execute([(int)$version+1,$hash,$book]);
}
function manuscriptGlobalOrder(mixed $ids):array {if(!is_array($ids)||!array_is_list($ids))fail(422,'Invalid collection order.');return $ids;}
function manuscriptOrder(PDO $db,string $key,array $ids):array {
 $q=$db->prepare('SELECT record_id,book_id,position FROM manuscript_records WHERE collection=?');$q->execute([$key]);$existing=array_column($q->fetchAll(PDO::FETCH_ASSOC),null,'record_id');$changed=[];$q->closeCursor();$seen=[];
 foreach(manuscriptGlobalOrder($ids) as $position=>$id){if(!idvalid($id)||!isset($existing[$id])||isset($seen[$id]))fail(422,'Invalid manuscript collection order.');$seen[$id]=true;if((int)$existing[$id]['position']!==$position){$changed[$existing[$id]['book_id']]=true;$db->prepare('UPDATE manuscript_records SET position=? WHERE collection=? AND record_id=?')->execute([$position,$key,$id]);}}
 if(count($seen)!==count($existing))fail(422,'Collection order omits records.');return array_keys($changed);
}
function manuscriptCommit(PDO $db,array $global,string $op,string $hash):int {
 $version=$global['version']+1;$fingerprint=hash('sha256',$global['fingerprint'].':'.$version.':'.$hash);
 $q=$db->prepare('UPDATE workspace SET version=?,payload=? WHERE id=1 AND version=?');$q->execute([$version,json_encode(['storage'=>MANUSCRIPT_STORAGE,'fingerprint'=>$fingerprint],JSON_THROW_ON_ERROR),$global['version']]);if($q->rowCount()!==1)fail(409,'Workspace changed during save.');
 $db->prepare('INSERT INTO operations(operation_id,payload_hash,result_version) VALUES(?,?,?)')->execute([$op,$hash,$version]);return $version;
}
function manuscriptKnown(PDO $db,string $op,string $hash):?int {
 if(!idvalid($op))fail(422,'A durable operation UUID is required.');$q=$db->prepare('SELECT payload_hash,result_version FROM operations WHERE operation_id=?');$q->execute([$op]);$known=$q->fetch(PDO::FETCH_ASSOC);$q->closeCursor();if(!$known)return null;if(!hash_equals($known['payload_hash'],$hash))fail(409,'Operation ID reused for different content.');return (int)$known['result_version'];
}
function manuscriptWrite(PDO $db,array|callable $incoming,int $base,string $op,string $hash,?string $fingerprint,?string $book):int {
 beginWrite($db);try{
  $global=manuscriptMeta($db,null,true);$known=manuscriptKnown($db,$op,$hash);if($known!==null){$db->commit();return $known;}
  $meta=$book===null?$global:manuscriptMeta($db,$book,true);if($meta['version']!==$base||($fingerprint!==null&&!hash_equals($meta['fingerprint'],$fingerprint)))fail(409,'Manuscript or workspace changed. Download the latest state and reconcile; nothing was overwritten.');
  $old=manuscriptState($db,$book);$state=is_array($incoming)?$incoming:$incoming($old);validate($state);if($book!==null)manuscriptValidateReferences($db,$book,$state);preserveHistory($old,$state);
  if($book!==null){if(count($state['books'])!==1||$state['books'][0]['id']!==$book)fail(422,'A manuscript operation cannot change another manuscript.');manuscriptPersist($db,$book,$state);}
  else{
   $chapterBooks=array_column($state['chapters'],'bookId','id');foreach($state['books'] as $b){$unit=blank();foreach(SYNC_COLLECTIONS as $key)foreach($state[$key]??[] as $row)if(($key==='books'?$row['id']:($row['bookId']??($chapterBooks[$row['chapterId']??'']??null)))===$b['id'])$unit[$key][]=$row;manuscriptPersist($db,$b['id'],$unit);unset($unit);}
   foreach(SYNC_COLLECTIONS as $key)manuscriptOrder($db,$key,array_column($state[$key]??[],'id'));foreach($state['books'] as $b)manuscriptRefreshUnit($db,$b['id'],false);
  }
  $version=manuscriptCommit($db,$global,$op,$hash);$db->commit();return $version;
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}

function manuscriptRefreshUnit(PDO $db,string $book,bool $bump=true):void {
 $hash=hash('sha256',json_encode(manuscriptManifest($db,$book),JSON_THROW_ON_ERROR));$db->prepare('UPDATE manuscript_units SET fingerprint=?,version=version+? WHERE book_id=?')->execute([$hash,$bump?1:0,$book]);
}
/** Owner differential saves validate each changed manuscript separately, in one transaction. */
function manuscriptPush(PDO $db,array $body):array {
 $delta=$body['delta'];syncFields($delta,['schemaVersion','collections']);if($delta['schemaVersion']!==1||!is_array($delta['collections'])||array_diff(array_keys($delta['collections']),SYNC_COLLECTIONS))fail(422,'Unsupported differential schema.');
 $op=(string)$body['operationId'];$hash=hash('sha256',json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));beginWrite($db);
 try{
  $global=manuscriptMeta($db,null,true);$known=manuscriptKnown($db,$op,$hash);if($known!==null){$db->commit();return ['version'=>$known,'duplicate'=>true];}
  if($body['baseVersion']!==$global['version']||!hash_equals($global['fingerprint'],$body['baseFingerprint']))fail(409,'Workspace changed. Pull the latest changes before saving.');
  foreach($delta['collections'] as $change){if(!is_array($change))fail(422,'Invalid collection changes.');syncFields($change,['upserts','remove'],['order']);syncList($change['upserts']);syncList($change['remove']);}
  $routes=[];$chapters=[];
  foreach($delta['collections']['chapters']['upserts']??[] as $patch)if(is_array($patch)&&is_array($patch['set']??null)&&isset($patch['set']['bookId']))$chapters[$patch['id']??'']=$patch['set']['bookId'];
  foreach($delta['collections'] as $key=>$change){
   if(!is_array($change))fail(422,'Invalid collection changes.');syncFields($change,['upserts','remove'],['order']);
   foreach(syncList($change['upserts']) as $patch){
    if(!is_array($patch))fail(422,'Invalid record update.');syncFields($patch,['id','set','unset']);if(!idvalid($patch['id'])||!is_array($patch['set']))fail(422,'Invalid record update.');
    $id=$patch['id'];$old=manuscriptOwner($db,$key,$id);foreach(['bookId','chapterId'] as $field)if(array_key_exists($field,$patch['set'])&&!idvalid($patch['set'][$field]))fail(422,'Invalid manuscript ownership reference.');
    if($key==='books')$book=$id;
    elseif(isset($patch['set']['bookId']))$book=$patch['set']['bookId'];
    elseif(isset($patch['set']['chapterId']))$book=$chapters[$patch['set']['chapterId']]??manuscriptOwner($db,'chapters',(string)$patch['set']['chapterId']);
    else $book=$old;
    if(!idvalid($book)||($old!==null&&$old!==$book))fail(422,'Record ownership cannot move between manuscripts.');
    $routes[$book][$key]['upserts'][]=$patch;
   }
   foreach(syncList($change['remove']) as $id){if(!idvalid($id)||!($book=manuscriptOwner($db,$key,$id)))fail(422,'Invalid removal source.');$routes[$book][$key]['remove'][]=$id;}
  }
  foreach($routes as $book=>$changes){
   $old=manuscriptState($db,$book);$part=['schemaVersion'=>1,'collections'=>[]];
   foreach($changes as $key=>$change){$part['collections'][$key]=['upserts'=>$change['upserts']??[],'remove'=>$change['remove']??[]];
    if(isset($delta['collections'][$key]['order'])){
     $ids=array_fill_keys(array_column($old[$key]??[],'id'),true);foreach($change['remove']??[] as $id)unset($ids[$id]);foreach($change['upserts']??[] as $patch)$ids[$patch['id']]=true;
     $part['collections'][$key]['order']=array_values(array_filter(manuscriptGlobalOrder($delta['collections'][$key]['order']),fn($id)=>is_string($id)&&isset($ids[$id])));
    }
   }
   $new=syncApply($old,$part);validate($new);manuscriptValidateReferences($db,$book,$new);preserveHistory($old,$new);if(count($new['books'])!==1||$new['books'][0]['id']!==$book)fail(422,'A manuscript must retain its own book record.');manuscriptPersist($db,$book,$new);unset($new,$old,$part);
  }
  $ordered=[];foreach($delta['collections'] as $key=>$change)if(isset($change['order']))foreach(manuscriptOrder($db,$key,$change['order']) as $book)$ordered[$book]=true;
  foreach($ordered as $book=>$unused)manuscriptRefreshUnit($db,$book,!isset($routes[$book]));
  $version=manuscriptCommit($db,$global,$op,$hash);$meta=manuscriptMeta($db);$hashes=[];
  foreach($delta['collections'] as $key=>$change)foreach($change['upserts'] as $patch){$q=$db->prepare('SELECT record_hash FROM manuscript_records WHERE collection=? AND record_id=?');$q->execute([$key,$patch['id']]);$hashes[$key][$patch['id']]=$q->fetchColumn();$q->closeCursor();}
  $db->commit();return ['version'=>$version,'fingerprint'=>$meta['fingerprint'],'hashes'=>$hashes?:new stdClass()];
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function manuscriptPull(PDO $db,array $body):array {
 syncFields($body,['action','version','fingerprint','ids']);$meta=manuscriptMeta($db);if($body['version']!==$meta['version']||$body['fingerprint']!==$meta['fingerprint'])fail(409,'Workspace changed during download. Retry from the latest manifest.');
 if(!is_array($body['ids'])||array_diff(array_keys($body['ids']),SYNC_COLLECTIONS))fail(422,'Invalid requested collections.');$records=[];
 foreach($body['ids'] as $key=>$ids){$records[$key]=[];$seen=[];foreach(syncList($ids) as $id){if(!idvalid($id)||isset($seen[$id]))fail(422,'Invalid requested record.');$seen[$id]=true;$row=manuscriptRecord($db,$key,$id);$bases=[];
   if(in_array($key,['revisions','proposals'],true)){$base=$key==='revisions'?($row['parentId']??null):$row['baseRevisionId'];if($base!==null)$bases[$base]=manuscriptRecord($db,'revisions',$base);}
   $records[$key][]=syncEncodeRecord($key,$row,$bases);unset($row,$bases);
  }}
 // Catch concurrent changes during a multi-query read, before returning mixed source records.
 if(manuscriptMeta($db)!==$meta)fail(409,'Workspace changed during download. Retry from the latest manifest.');return ['mode'=>'records']+$meta+['records'=>$records];
}

/** Cross-manuscript tombstones/cleanup targets must not invalidate another unit. */
function manuscriptValidateReferences(PDO $db,string $book,array $state):void {
 foreach($state['materialDeletions']??[] as $row){$q=$db->prepare("SELECT book_id FROM manuscript_records WHERE collection='materials' AND item_id=? AND book_id<>? LIMIT 1");$q->execute([$row['itemId'],$book]);if($q->fetchColumn()!==false)fail(422,'Material deletion belongs to another manuscript.');$q->closeCursor();}
 foreach($state['materials']??[] as $row){$q=$db->prepare("SELECT book_id FROM manuscript_records WHERE collection='materialDeletions' AND item_id=? AND book_id<>? LIMIT 1");$q->execute([$row['itemId'],$book]);if($q->fetchColumn()!==false)fail(422,'Material identity was deleted in another manuscript.');$q->closeCursor();}
 foreach($state['chapterCleanups']??[] as $row)foreach(['proposals'=>'proposalIds','contexts'=>'contextIds','chapterProposals'=>'chapterProposalIds'] as $key=>$field)foreach($row[$field] as $id){$owner=manuscriptOwner($db,$key,$id);if($owner!==null&&$owner!==$book)fail(422,'Cleanup target belongs to another manuscript.');}
}
