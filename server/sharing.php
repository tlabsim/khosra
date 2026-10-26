<?php
declare(strict_types=1);
// Reading grants are separate from workspace history and never grant owner/MCP access.
function shareReference(mixed $value):string{if(!idvalid($value))fail(422,'Invalid reading reference.');return $value;}
function shareToken():string{return rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');}
function sharePreview(string $text):string{preg_match('/^.{0,240}/us',$text,$m);return $m[0]??'';}
function shareSnapshot(array $s,array $body):array{
 $book=record($s['books'],shareReference($body['bookId']??null));
 if(($body['title']??null)!==$book['title']||($body['language']??null)!==$book['language'])fail(409,'Sync the current manuscript with the server before sharing.');
 $selected=$body['chapters']??null;if(!is_array($selected)||!count($selected)||count($selected)>1000)fail(422,'Select at least one chapter.');
 $chapters=array_values(array_filter($s['chapters'],fn($c)=>$c['bookId']===$book['id']&&empty($c['deletedAt'])));usort($chapters,fn($a,$b)=>$a['position']<=>$b['position']);
 $requested=[];foreach($selected as $item){if(!is_array($item)||!idvalid($item['id']??null)||isset($requested[$item['id']]))fail(422,'Invalid chapter selection.');$requested[$item['id']]=$item;}
 $out=[];foreach($chapters as $number=>$c){if(!isset($requested[$c['id']]))continue;$expected=$requested[$c['id']];if(($expected['headId']??null)!==$c['headId']||($expected['title']??null)!==$c['title'])fail(409,'Sync the current manuscript with the server before sharing.');$r=record($s['revisions'],$c['headId']);$out[]=['id'=>$c['id'],'title'=>$c['title'],'number'=>$number+1,'revisionId'=>$r['id'],'paragraphs'=>array_map(fn($p)=>['id'=>$p['id'],'label'=>$p['label'],'text'=>$p['text'],'section'=>$p['section']??''],$r['paragraphs'])];}
 if(count($out)!==count($selected))fail(409,'Selected chapters are not saved on the server. Sync the current manuscript before sharing.');
 return ['title'=>$book['title'],'language'=>$book['language'],'chapters'=>$out];
}
function shareSummary(array $r):array{return ['id'=>$r['id'],'recipient'=>$r['recipient'],'bookId'=>$r['book_id'],'title'=>$r['book_title'],'chapterCount'=>(int)$r['chapter_count'],'createdAt'=>(int)$r['created_at'],'expiresAt'=>(int)$r['expires_at'],'revokedAt'=>$r['revoked_at']===null?null:(int)$r['revoked_at']];}
function shareActive(PDO $db,string $id,bool $lock=false):array{
 $sql='SELECT * FROM reading_grants WHERE id=?';if($lock&&$db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql')$sql.=' FOR UPDATE';$q=$db->prepare($sql);$q->execute([$id]);$grant=$q->fetch(PDO::FETCH_ASSOC);
 if(!$grant||$grant['revoked_at']!==null||(int)$grant['expires_at']<=time())fail(410,'This reading invitation is unavailable or has expired.');return $grant;
}
function shareOwner(PDO $db,array $config,string $path,string $method,array $body):never{
 if($path==='shares'&&$method==='GET'){
  $q=$db->prepare('SELECT id,recipient,book_id,book_title,chapter_count,created_at,expires_at,revoked_at FROM reading_grants WHERE book_id=? ORDER BY created_at DESC,id DESC');$q->execute([shareReference($_GET['bookId']??null)]);respond(['invitations'=>array_map('shareSummary',$q->fetchAll(PDO::FETCH_ASSOC))]);
 }
 if($path==='shares'&&$method==='POST'){
  $name=trim(is_string($body['recipient']??null)?$body['recipient']:'');if($name===''||strlen($name)>400||preg_match_all('/./us',$name)>100)fail(422,'Enter a reader name of up to 100 characters.');
  $expires=$body['expiresAt']??null;if(!is_int($expires)||$expires<=time()+60||$expires>time()+90*86400)fail(422,'Choose an expiry between a minute and 90 days from now.');
  beginWrite($db);try{$workspace=loadWorkspace($db);$snapshot=shareSnapshot($workspace['state'],$body);$token=shareToken();$id=uuid();$q=$db->prepare('INSERT INTO reading_grants(id,token_hash,recipient,book_id,book_title,chapter_count,snapshot,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)');$q->execute([$id,hash('sha256',$token),$name,$body['bookId'],$snapshot['title'],count($snapshot['chapters']),json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),time(),$expires]);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  respond(['id'=>$id,'url'=>$config['origin'].'/guest#token='.$token],201);
 }
 if(preg_match('#^shares/([0-9a-f-]{36})/(revoke|comments)$#',$path,$m)){
  $q=$db->prepare('SELECT id FROM reading_grants WHERE id=?');$q->execute([$m[1]]);if(!$q->fetch())fail(404,'Invitation not found.');
  if($m[2]==='revoke'&&$method==='POST'){$q=$db->prepare('UPDATE reading_grants SET revoked_at=COALESCE(revoked_at,?) WHERE id=?');$q->execute([time(),$m[1]]);respond(['ok'=>true]);}
  if($m[2]==='comments'&&$method==='GET'){$q=$db->prepare('SELECT id,chapter_id,revision_id,paragraph_id,chapter_title,paragraph_label,quote,comment_text,created_at FROM reader_comments WHERE grant_id=? ORDER BY created_at DESC,id DESC');$q->execute([$m[1]]);respond(['comments'=>$q->fetchAll(PDO::FETCH_ASSOC)]);}
 }
 fail(404,'Endpoint not found.');
}
function guestRoute(PDO $db,array $config,string $path,string $method,array $body):never{
 // No owner session is started here. Only opaque guest cookies are recognized.
 $cookieName='khosra_guest';
 if($path==='guest/exchange'&&$method==='POST'){
  $token=$body['token']??null;if(!is_string($token)||!preg_match('/^[A-Za-z0-9_-]{43}$/D',$token))fail(410,'This reading invitation is unavailable or has expired.');
  $q=$db->prepare('SELECT id FROM reading_grants WHERE token_hash=?');$q->execute([hash('sha256',$token)]);$id=$q->fetchColumn();if(!$id)fail(410,'This reading invitation is unavailable or has expired.');$grant=shareActive($db,$id);
  $session=shareToken();$expires=min((int)$grant['expires_at'],time()+30*86400);
  // Opportunistic expiry cleanup needs no cron on shared hosting.
  $db->prepare('DELETE FROM reading_sessions WHERE expires_at<=?')->execute([time()]);
  $q=$db->prepare('INSERT INTO reading_sessions(session_hash,grant_id,expires_at) VALUES(?,?,?)');$q->execute([hash('sha256',$session),$id,$expires]);
  setcookie($cookieName,$session,['expires'=>$expires,'path'=>'/api/guest','httponly'=>true,'secure'=>parse_url($config['origin'],PHP_URL_SCHEME)==='https','samesite'=>'Strict']);
  respond(['ok'=>true,'invitationId'=>$id]);
 }
 $session=$_COOKIE[$cookieName]??'';if(!is_string($session)||!preg_match('/^[A-Za-z0-9_-]{43}$/D',$session))fail(401,'Open your reading invitation to continue.');
 $q=$db->prepare('SELECT grant_id FROM reading_sessions WHERE session_hash=? AND expires_at>?');$q->execute([hash('sha256',$session),time()]);$id=$q->fetchColumn();if(!$id)fail(401,'Open your reading invitation to continue.');$grant=shareActive($db,$id);
 $bound=$_SERVER['HTTP_X_GUEST_INVITATION']??'';if(($bound!==''&&!hash_equals($id,$bound))||($path!=='guest/session'&&$bound===''))fail(401,'The reading invitation changed. Reopen your original link to continue.');
 $csrf=hash_hmac('sha256','khosra-guest-csrf',$session);
 if($method==='POST'&&!hash_equals($csrf,$_SERVER['HTTP_X_GUEST_CSRF']??''))fail(403,'Guest CSRF validation failed.');
 $snapshot=json_decode($grant['snapshot'],true,128,JSON_THROW_ON_ERROR);
 if($path==='guest/session'&&$method==='GET')respond(['invitationId'=>$id,'title'=>$snapshot['title'],'language'=>$snapshot['language'],'expiresAt'=>(int)$grant['expires_at'],'csrf'=>$csrf,'chapters'=>array_map(fn($c)=>array_diff_key($c,['paragraphs'=>true]),$snapshot['chapters'])]);
 if($path==='guest/chapter'&&$method==='GET'){$chapter=record($snapshot['chapters'],shareReference($_GET['id']??null));respond(['chapter'=>$chapter]);}
 if($path==='guest/comments'&&$method==='GET'){$q=$db->prepare('SELECT id,chapter_id,revision_id,paragraph_id,chapter_title,paragraph_label,quote,comment_text,created_at FROM reader_comments WHERE grant_id=? ORDER BY created_at DESC,id DESC');$q->execute([$id]);respond(['comments'=>$q->fetchAll(PDO::FETCH_ASSOC)]);}
 if($path==='guest/comments'&&$method==='POST'){
  $comment=trim(is_string($body['text']??null)?$body['text']:'');$operation=$body['operationId']??null;if(!idvalid($operation)||$comment===''||strlen($comment)>24000||preg_match_all('/./us',$comment)>6000)fail(422,'Write a comment of up to 6,000 characters.');$chapter=record($snapshot['chapters'],shareReference($body['chapterId']??null));$paragraph=null;if(($body['paragraphId']??null)!==null)$paragraph=record($chapter['paragraphs'],shareReference($body['paragraphId']));
  beginWrite($db);try{shareActive($db,$id,true);$q=$db->prepare('SELECT * FROM reader_comments WHERE id=?');$q->execute([$operation]);$existing=$q->fetch(PDO::FETCH_ASSOC);if($existing){if($existing['grant_id']!==$id||$existing['comment_text']!==$comment||$existing['chapter_id']!==$chapter['id']||$existing['paragraph_id']!==($paragraph['id']??null))fail(409,'Comment retry does not match the original.');$db->commit();respond(['ok'=>true]);}
   $q=$db->prepare('SELECT COUNT(*) FROM reader_comments WHERE grant_id=?');$q->execute([$id]);if((int)$q->fetchColumn()>=500)fail(429,'This invitation has reached its feedback limit.');
   $q=$db->prepare('INSERT INTO reader_comments(id,grant_id,chapter_id,revision_id,paragraph_id,chapter_title,paragraph_label,quote,comment_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');$q->execute([$operation,$id,$chapter['id'],$chapter['revisionId'],$paragraph['id']??null,$chapter['title'],$paragraph['label']??null,$paragraph?sharePreview($paragraph['text']):'',$comment,time()]);$db->commit();respond(['ok'=>true],201);
  }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 }
 fail(404,'Endpoint not found.');
}
