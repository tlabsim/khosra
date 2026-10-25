<?php
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
$count=0;
function verify(bool $v,string $label):void{global $count;if(!$v)throw new RuntimeException('FAIL: '.$label);$count++;echo 'PASS: '.$label.PHP_EOL;}
function http(string $path,string $method='GET',?array $body=null,array $headers=[]):array{
 $opts=['http'=>['method'=>$method,'ignore_errors'=>true,'follow_location'=>0,'timeout'=>10,'header'=>implode("\r\n",array_merge(['Content-Type: application/json'],$headers))]];if($body!==null)$opts['http']['content']=json_encode($body,JSON_THROW_ON_ERROR);$text=file_get_contents('http://127.0.0.1:8081'.$path,false,stream_context_create($opts));$hs=$http_response_header??[];preg_match('/\s(\d{3})\s/',$hs[0]??'',$m);return ['status'=>(int)($m[1]??0),'text'=>$text,'json'=>json_decode($text?:'',true),'headers'=>$hs];
}
function cookie(array $r):string{$value='';foreach($r['headers'] as $h)if(str_starts_with(strtolower($h),'set-cookie:'))$value=explode(';',trim(substr($h,11)))[0];return $value;}
$r=http('/api/shares?bookId=none');verify($r['status']===401,'Anonymous cannot list owner invitations');
$r=http('/test-owner','GET',null,['X-Test-Secret: local-sharing-fixture']);$owner=cookie($r);$headers=['Cookie: '.$owner,'X-CSRF-Token: '.$r['json']['csrf']];
$r=http('/api/workspace','GET',null,$headers);$s=$r['json']['state'];$book=$s['books'][0];$chapter=$s['chapters'][0];$other=$s['chapters'][1];
$create=['bookId'=>$book['id'],'title'=>$book['title'],'language'=>$book['language'],'recipient'=>'Trusted reader','expiresAt'=>time()+3600,'chapters'=>[['id'=>$chapter['id'],'title'=>$chapter['title'],'headId'=>$chapter['headId']]]];
$r=http('/api/shares','POST',$create,['Cookie: '.$owner]);verify($r['status']===403,'Owner creation requires CSRF');
$bad=$create;$bad['chapters'][0]['headId']=uuid();$r=http('/api/shares','POST',$bad,$headers);verify($r['status']===409,'Unuploaded revision cannot be shared');
$bad=$create;$bad['expiresAt']=time()+91*86400;$r=http('/api/shares','POST',$bad,$headers);verify($r['status']===422,'Overlong expiry rejected');
$bad=$create;$bad['recipient']=str_repeat('ক',101);$r=http('/api/shares','POST',$bad,$headers);verify($r['status']===422,'Unicode reader-name length enforced');
$bad=$create;$bad['chapters']=[];$r=http('/api/shares','POST',$bad,$headers);verify($r['status']===422,'Empty chapter scope rejected');
$r=http('/api/shares','POST',$create,$headers);verify($r['status']===201,'Owner creates fixed selected-chapter invitation');$id=$r['json']['id'];$url=$r['json']['url'];parse_str(parse_url($url,PHP_URL_FRAGMENT),$fragment);$token=$fragment['token'];verify(strlen($token)===43&&!parse_url($url,PHP_URL_QUERY),'256-bit token travels in fragment only');
$config=require __DIR__.'/.sharing-runtime/config.php';$db=new PDO($config['dsn'],$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$stored=$db->query('SELECT token_hash,snapshot FROM reading_grants')->fetch(PDO::FETCH_ASSOC);verify($stored['token_hash']===hash('sha256',$token)&&!str_contains(json_encode($stored),$token),'Only hashed access token stored');
$r=http('/api/shares?bookId='.$book['id'],'GET',null,$headers);verify(!str_contains($r['text'],$token)&&!str_contains($r['text'],'snapshot'),'Invitation list never rediscloses tokens or manuscript');
$malformed=http('/api/guest/session','GET',null,['Cookie: khosra_guest[]=bad']);verify($malformed['status']===401,'Malformed guest cookie rejected');
$r=http('/api/guest/exchange','POST',['token'=>str_repeat('x',43)]);verify($r['status']===410,'Unknown reading token denied');
$r=http('/api/guest/exchange','POST',['token'=>$token],['Origin: https://attacker.invalid']);verify($r['status']===403,'Cross-origin token exchange denied');
$r=http('/api/guest/exchange','POST',['token'=>$token]);verify($r['status']===200,'Reading token exchanged for guest cookie');$guest=cookie($r);verify(str_starts_with($guest,'khosra_guest=')&&str_contains(strtolower(implode(' ',$r['headers'])),'httponly'),'Guest uses separate HttpOnly cookie');
$r=http('/api/guest/session','GET',null,['Cookie: '.$guest]);verify($r['status']===200&&count($r['json']['chapters'])===1,'Guest sees selected chapter metadata only');$csrf=$r['json']['csrf'];verify(!str_contains($r['text'],'OWNER PRIVATE'),'Owner-only notes and history excluded');
$missing=http('/api/guest/chapter?id='.$chapter['id'],'GET',null,['Cookie: '.$guest]);verify($missing['status']===401,'Content reads require invitation binding');
$malformed=http('/api/guest/chapter?id[]=bad','GET',null,['Cookie: '.$guest,'X-Guest-Invitation: '.$id]);verify($malformed['status']===422,'Malformed query reference rejected without warnings');
$r=http('/api/guest/chapter?id='.$other['id'],'GET',null,['Cookie: '.$guest,'X-Guest-Invitation: '.$id]);verify($r['status']===404,'Unselected chapter denied');
$r=http('/api/guest/chapter?id='.$chapter['id'],'GET',null,['Cookie: '.$guest,'X-Guest-Invitation: '.$id]);verify($r['status']===200&&str_contains($r['text'],'Shared text.'),'Guest reads immutable shared prose');$p=$r['json']['chapter']['paragraphs'][0];verify(!str_contains($r['text'],'OWNER PRIVATE'),'Only public paragraph fields enter reading snapshots');verify(str_contains(strtolower(implode(' ',$r['headers'])),'no-store'),'Guest manuscript is no-store');
$r=http('/api/workspace','GET',null,['Cookie: '.$guest]);verify($r['status']===401,'Guest cookie never authorizes owner workspace');
$r=http('/api/mcp','POST',[],['Cookie: '.$guest]);verify($r['status']===401,'Guest cookie never authorizes MCP');
$comment=['operationId'=>uuid(),'chapterId'=>$chapter['id'],'paragraphId'=>$p['id'],'text'=>'A thoughtful reader comment <script>alert(1)</script>'];$gh=['Cookie: '.$guest,'X-Guest-CSRF: '.$csrf,'X-Guest-Invitation: '.$id];
$r=http('/api/guest/comments','POST',$comment,['Cookie: '.$guest,'X-Guest-Invitation: '.$id]);verify($r['status']===403,'Guest comments require own CSRF');
$malformed=$comment;$malformed['paragraphId']=[];$r=http('/api/guest/comments','POST',$malformed,$gh);verify($r['status']===422,'Malformed paragraph reference rejected');
$malformed=$comment;$malformed['chapterId']=[];$r=http('/api/guest/comments','POST',$malformed,$gh);verify($r['status']===422,'Malformed chapter reference rejected');
$bad=$comment;$bad['paragraphId']=uuid();$r=http('/api/guest/comments','POST',$bad,$gh);verify($r['status']===404,'Comment cannot anchor to unshared paragraph');
$bad=$comment;$bad['text']=str_repeat('ক',6001);$r=http('/api/guest/comments','POST',$bad,$gh);verify($r['status']===422,'Overlong Unicode feedback rejected');
$r=http('/api/guest/comments','POST',$comment,$gh);verify($r['status']===201,'Passage comment accepted against fixed revision UUID');
$r=http('/api/guest/comments','POST',$comment,$gh);verify($r['status']===200,'Comment retry is idempotent');
$bad=$comment;$bad['text']='Different';$r=http('/api/guest/comments','POST',$bad,$gh);verify($r['status']===409,'Mismatched comment retry denied');
$r=http('/api/shares/'.$id.'/comments','GET',null,$headers);verify(count($r['json']['comments'])===1&&$r['json']['comments'][0]['revision_id']===$chapter['headId'],'Owner receives separate source-anchored feedback');
$before=$db->query('SELECT payload FROM workspace')->fetchColumn();$changed=json_decode($before,true);$changed['revisions'][0]['paragraphs'][0]['text']='LATER PRIVATE EDIT';$db->prepare('UPDATE workspace SET payload=?')->execute([json_encode($changed)]);
$r=http('/api/guest/chapter?id='.$chapter['id'],'GET',null,$gh);verify(str_contains($r['text'],'Shared text.')&&!str_contains($r['text'],'LATER PRIVATE EDIT'),'Later author edits do not alter shared snapshot');
$db->prepare('UPDATE workspace SET payload=?')->execute([$before]);
$r=http('/api/shares/'.$id.'/revoke','POST',[],$headers);verify($r['status']===200,'Owner revokes invitation');
foreach(['session','chapter?id='.$chapter['id'],'comments'] as $path){$r=http('/api/guest/'.$path,'GET',null,$gh);verify($r['status']===410,'Revocation enforced for '.$path);}
$r=http('/api/guest/comments','POST',['operationId'=>uuid(),...array_diff_key($comment,['operationId'=>true])],$gh);verify($r['status']===410,'Revoked session cannot write feedback');
$r=http('/api/guest/exchange','POST',['token'=>$token]);verify($r['status']===410,'Revoked link cannot open a new session');
$r=http('/api/shares','POST',$create,$headers);parse_str(parse_url($r['json']['url'],PHP_URL_FRAGMENT),$fragment);$expiredId=$r['json']['id'];$r=http('/api/guest/exchange','POST',['token'=>$fragment['token']]);$expiredCookie=cookie($r);$wrong=http('/api/guest/session','GET',null,['Cookie: '.$expiredCookie,'X-Guest-Invitation: '.$id]);verify($wrong['status']===401,'Cross-tab invitation mismatch rejected');$db->prepare('UPDATE reading_grants SET expires_at=? WHERE id=?')->execute([time()-1,$expiredId]);
$r=http('/api/guest/session','GET',null,['Cookie: '.$expiredCookie]);verify($r['status']===410,'Expiry enforced on existing sessions');
$r=http('/api/guest/exchange','POST',['token'=>$fragment['token']]);verify($r['status']===410,'Expired link denied');
verify($db->query('SELECT payload FROM workspace')->fetchColumn()===$before,'Sharing and feedback leave manuscript unchanged');
echo "$count sharing HTTP checks passed.\n";
