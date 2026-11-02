<?php
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
$root=sys_get_temp_dir().'/khosra-mcp-diagnostics-'.bin2hex(random_bytes(5));mkdir($root);
$previous=ini_get('error_log');ini_set('error_log',$root.'/diagnostic.log');
$passed=[];
$check=function(bool $ok,string $label)use(&$passed):void{if(!$ok)throw new RuntimeException('FAIL: '.$label);$passed[]=$label;};
try{
 $db=openDatabase(['dsn'=>'sqlite::memory:']);$db->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');$db->exec('CREATE TABLE operations(operation_id TEXT PRIMARY KEY,payload_hash TEXT,result_version INTEGER)');
 $s=blank();$bid=uuid();$cid=uuid();$rid=uuid();$pid=uuid();$secret='PRIVATE-MANUSCRIPT-CANARY-'.uuid();
 $s['books'][]=['id'=>$bid,'title'=>$secret,'premise'=>'','language'=>'bn','createdAt'=>stamp()];
 $s['chapters'][]=['id'=>$cid,'bookId'=>$bid,'code'=>1,'title'=>'Synthetic','position'=>0,'headId'=>$rid,'approvedId'=>null,'synopsis'=>''];
 $blocks=[['id'=>$pid,'label'=>1,'text'=>$secret,'section'=>'']];
 $s['revisions'][]=['id'=>$rid,'chapterId'=>$cid,'parentId'=>null,'createdAt'=>stamp(),'source'=>'author','paragraphs'=>$blocks,'edition'=>1,'message'=>'Initial'];
 $q=$db->prepare('INSERT INTO workspace VALUES(1,1,?)');$q->execute([json_encode($s)]);unset($q);
 $op=uuid();$args=['operation_id'=>$op,'chapter_id'=>$cid,'base_revision_id'=>$rid,'title'=>$secret,'rationale'=>$secret,'paragraphs'=>[array_replace($blocks[0],['text'=>$secret.' revised'])]];
 $rpc=['params'=>['name'=>'save_proposal','arguments'=>$args]];
 $denied=mcpToolResult($db,$rpc,['manuscript.read']);
 $check(($denied['isError']??false)&&str_contains($denied['content'][0]['text'],'Token scope'),'Scope failures remain tool errors');
 $check(preg_match('/^[a-f0-9]{16}$/D',$denied['_meta']['khosra/requestId']??'')===1&&str_contains($denied['content'][0]['text'],$denied['_meta']['khosra/requestId']),'Error content and metadata share a safe request reference');
 $saved=mcpToolResult($db,$rpc,['manuscript.propose']);$value=json_decode($saved['content'][0]['text'],true);
 $check(!($saved['isError']??false)&&($value['saved']??false)&&isset($saved['_meta']['khosra/requestId']),'Successful write returns its ordinary receipt and correlation metadata');
 $bad=$rpc;$bad['params']['arguments']=['not-an-object'];$r=mcpToolResult($db,$bad,['manuscript.propose']);
 $check(($r['isError']??false)&&str_contains($r['content'][0]['text'],'arguments must be an object'),'Malformed tool arguments return actionable errors');
 $bad=['params'=>'invalid'];$r=mcpToolResult($db,$bad,['manuscript.read']);
 $check(($r['isError']??false)&&str_contains($r['content'][0]['text'],'parameters must be an object'),'Malformed parameters do not escape as internal exceptions');
 $db->exec("UPDATE workspace SET payload='{' WHERE id=1");$args['operation_id']=uuid();$rpc['params']['arguments']=$args;$r=mcpToolResult($db,$rpc,['manuscript.propose']);
 $check(($r['isError']??false)&&str_contains($r['content'][0]['text'],'SAME operation_id')&&!str_contains($r['content'][0]['text'],$secret),'Unexpected exceptions produce a safe retry instruction, not a raw stack trace');
 $check(!$db->inTransaction(),'Unexpected failure leaves no transaction open');
 $log=file_get_contents($root.'/diagnostic.log');
 foreach(['event=started','event=result_ready','event=rejected','event=failed','reason=server_failure','elapsed_ms=','peak_bytes='] as $marker)$check(str_contains($log,$marker),'Diagnostic log includes '.$marker);
 foreach([$secret,$op,$bid,$cid,$rid,$pid] as $private)$check(!str_contains($log,$private),'Diagnostic log excludes private content or workspace identifiers');
}finally{ini_set('error_log',$previous);unset($db,$q);foreach(glob($root.'/*') as $file)unlink($file);rmdir($root);}
foreach($passed as $label)echo 'PASS: '.$label.PHP_EOL;
echo count($passed).' MCP diagnostic checks passed.'.PHP_EOL;
