<?php
// Real API round trip against the dedicated disposable MySQL audit fixture only.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
require dirname(__DIR__).'/oauth.php';
$config=require __DIR__.'/.sharing-runtime/config.php';
if($config['dsn']!=='mysql:host=127.0.0.1;port=33319;dbname=khosra_test;charset=utf8mb4'&&!(in_array('--sqlite',$argv,true)&&str_starts_with($config['dsn'],'sqlite:')&&str_contains(str_replace('\\','/',$config['dsn']),'/khosra-portable-audit/data/khosra.sqlite')))throw new RuntimeException('Use the isolated MySQL audit fixture on port 33319.');
$db=new PDO($config['dsn'],$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$token=issueTokens($db,uuid(),oauthResource($config),'manuscript.read manuscript.propose')['access_token'];
$count=0;
function auditCheck(bool $ok,string $label):void{global $count;if(!$ok)throw new RuntimeException('FAIL: '.$label);$count++;echo 'PASS: '.$label.PHP_EOL;}
function auditHttp(string $path,string $method='GET',?array $body=null,array $headers=[]):array {
 $opts=['http'=>['method'=>$method,'ignore_errors'=>true,'follow_location'=>0,'timeout'=>10,'header'=>implode("\r\n",array_merge(['Content-Type: application/json'],$headers))]];
 if($body!==null)$opts['http']['content']=json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
 $text=file_get_contents('http://127.0.0.1:8081'.$path,false,stream_context_create($opts));$hs=$http_response_header??[];preg_match('/\\s(\\d{3})\\s/',$hs[0]??'',$m);
 return ['status'=>(int)($m[1]??0),'json'=>json_decode($text?:'',true),'headers'=>$hs];
}
function auditTool(string $name,array $args=[]):array {
 global $token;$r=auditHttp('/api/mcp','POST',['jsonrpc'=>'2.0','id'=>1,'method'=>'tools/call','params'=>['name'=>$name,'arguments'=>$args?:new stdClass()]],['Authorization: Bearer '.$token]);
 if($r['status']!==200)throw new RuntimeException('MCP HTTP request failed.');
 return $r['json']['result'];
}
function auditValue(array $result):array {if(!empty($result['isError']))throw new RuntimeException('Unexpected tool error: '.$result['content'][0]['text']);return json_decode($result['content'][0]['text'],true,512,JSON_THROW_ON_ERROR);}
$r=auditHttp('/api/login','POST',['password'=>'khosra-test-only']);auditCheck($r['status']===200,'Author signs in through actual owner API');
$cookie='';foreach($r['headers'] as $header)if(str_starts_with(strtolower($header),'set-cookie:'))$cookie=explode(';',trim(substr($header,11)))[0];
$owner=['Cookie: '.$cookie,'X-CSRF-Token: '.$r['json']['csrf']];
$r=auditHttp('/api/workspace','GET',null,$owner);$s=$r['json']['state'];$version=$r['json']['version'];$c=$s['chapters'][0];$original=record($s['revisions'],$c['headId']);$author=$original;
$author['id']=uuid();$author['parentId']=$original['id'];$author['createdAt']=stamp();$author['source']='author';$author['message']='Audit author revision';$untouched=['id'=>uuid(),'label'=>2,'section'=>'','text'=>'Untouched Bengali passage: নদীর ধারে।'];$author['paragraphs'][]=$untouched;
$s['revisions'][]=$author;foreach($s['chapters'] as &$chapter)if($chapter['id']===$c['id'])$chapter['headId']=$author['id'];unset($chapter);
$flag=['id'=>uuid(),'number'=>1,'chapterId'=>$c['id'],'revisionId'=>$author['id'],'paragraphIds'=>[$author['paragraphs'][0]['id']],'quote'=>$author['paragraphs'][0]['text'],'note'=>'Audit: refine the first paragraph only.','kind'=>'rewrite','status'=>'open','createdAt'=>stamp()];$s['flags'][]=$flag;
$r=auditHttp('/api/workspace','POST',['state'=>$s,'baseVersion'=>$version,'operationId'=>uuid()],$owner);auditCheck($r['status']===200,'Author uploads source and anchored revision request');
$guide=auditValue(auditTool('get_khosra_guide'));auditCheck($guide['product']==='Khosra','Model retrieves onboarding through actual authenticated MCP');
$books=auditValue(auditTool('list_books'));auditCheck($books['chapters'][0]['headId']===$author['id'],'Model discovers uploaded current chapter head');
$read=auditValue(auditTool('read_chapter',['chapter_id'=>$c['id']]));auditCheck($read['revision']['paragraphs']===$author['paragraphs'],'Model reads exact uploaded Bengali source');
$flags=auditValue(auditTool('list_flags',['chapter_id'=>$c['id']]));auditCheck(in_array($flag,$flags['flags'],true),'Model reads original anchored author flag');
$paragraphs=$read['revision']['paragraphs'];$paragraphs[0]['text'].=' [Refined by audit proposal]';
$args=['operation_id'=>uuid(),'chapter_id'=>$c['id'],'base_revision_id'=>$author['id'],'title'=>'Audit revision','rationale'=>'Refine first paragraph; retain all other text and references.','paragraphs'=>$paragraphs];
$proposal=auditValue(auditTool('save_proposal',$args));auditCheck($proposal['saved']===true,'Model saves pending proposal through actual MCP');
$retry=auditValue(auditTool('save_proposal',$args));auditCheck($retry['duplicate']===true,'Uncertain model-write retry is idempotent');
$bad=$args;$bad['rationale']='Different operation payload';auditCheck((auditTool('save_proposal',$bad)['isError']??false)===true,'Changed payload cannot reuse operation ID');
$context=['operation_id'=>uuid(),'chapter_id'=>$c['id'],'revision_id'=>$author['id'],'summary'=>'Audit source-grounded context.','facts'=>[['kind'=>'event','text'=>'The source contains Bengali prose.','paragraphIds'=>[$author['paragraphs'][0]['id']]]]];
$index=auditValue(auditTool('save_context',$context));auditCheck($index['saved']===true,'Model saves evidence-linked context');
$r=auditHttp('/api/workspace','GET',null,$owner);$pending=$r['json']['state'];$base=$r['json']['version'];$p=record($pending['proposals'],$proposal['id']);
auditCheck($p['status']==='pending'&&record($pending['chapters'],$c['id'])['headId']===$author['id'],'Author downloads pending proposal without manuscript overwrite');
// Mirror the already browser-tested author acceptance commit and upload its state.
$accepted=$pending;$revision=$author;$revision['id']=uuid();$revision['parentId']=$author['id'];$revision['createdAt']=stamp();$revision['source']='proposal';$revision['message']='Audit author acceptance';$revision['paragraphs']=$p['paragraphs'];$accepted['revisions'][]=$revision;
foreach($accepted['chapters'] as &$chapter)if($chapter['id']===$c['id'])$chapter['headId']=$revision['id'];unset($chapter);
foreach($accepted['proposals'] as &$item)if($item['id']===$p['id'])$item['status']='accepted';unset($item);
$r=auditHttp('/api/workspace','POST',['state'=>$accepted,'baseVersion'=>$base,'operationId'=>uuid()],$owner);auditCheck($r['status']===200,'Author-accepted revision uploads while retaining history');
$next=auditValue(auditTool('read_chapter',['chapter_id'=>$c['id']]));auditCheck($next['revision']['id']===$revision['id']&&$next['revision']['paragraphs'][0]===$paragraphs[0]&&$next['revision']['paragraphs'][1]===$untouched,'Next model iteration reads accepted text with untouched passages and UUIDs');
$old=auditValue(auditTool('read_chapter',['chapter_id'=>$c['id'],'revision_id'=>$original['id']]));auditCheck($old['revision']===$original,'Original pre-collaboration source stays immutable and retrievable');
$stale=$args;$stale['operation_id']=uuid();$older=auditValue(auditTool('save_proposal',$stale));auditCheck($older['saved']&&$older['stale']&&$older['baseRevisionId']===$author['id'],'Earlier-source rewrite is saved for review after author acceptance');
$staleContext=$context;$staleContext['operation_id']=uuid();auditCheck((auditTool('save_context',$staleContext)['isError']??false)===true,'Stale context write is rejected');
$readContext=auditValue(auditTool('read_context',['chapter_id'=>$c['id']]));auditCheck($readContext['stale']===true,'Old context is explicitly stale after accepted edits');
$r=auditHttp('/api/workspace','POST',['state'=>$pending,'baseVersion'=>$base,'operationId'=>uuid()],$owner);auditCheck($r['status']===409,'Stale owner upload cannot roll back the accepted revision');
$again=auditValue(auditTool('save_proposal',$args));auditCheck($again['duplicate']===true,'Completed proposal retry remains idempotent after acceptance');
$final=auditValue(auditTool('read_chapter',['chapter_id'=>$c['id']]));auditCheck($final['revision']===$revision,'Rejected stale writes leave accepted manuscript unchanged');
auditHttp('/api/logout','POST',[],$owner);$db->prepare('UPDATE oauth_tokens SET revoked=1 WHERE access_hash=?')->execute([hash('sha256',$token)]);
echo "$count collaboration HTTP checks passed.".PHP_EOL;
