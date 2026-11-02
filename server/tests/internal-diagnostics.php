<?php
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
$root=sys_get_temp_dir().'/khosra-internal-diagnostics-'.bin2hex(random_bytes(5));mkdir($root);mkdir($root.'/public');
$previousRoot=$_SERVER['DOCUMENT_ROOT']??null;$_SERVER['DOCUMENT_ROOT']=$root.'/public';$oldLog=ini_get('error_log');ini_set('error_log',$root.'/php.log');$checks=[];
function verifyInternal(bool $ok,string $name):void{global $checks;if(!$ok)throw new RuntimeException('FAIL: '.$name);$checks[]=$name;}
try{
 $config=['dsn'=>'sqlite:'.$root.'/workspace.sqlite','origin'=>'https://diagnostics.example'];
 $main=openDatabase($config);$main->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');$main->exec('INSERT INTO workspace VALUES(1,1,\'{invalid\')');
 $before=file_get_contents($root.'/workspace.sqlite');$store=diagnosticStore($config);verifyInternal(isset($store['db'])&&$store['file']!==$root.'/workspace.sqlite','Diagnostics use an independent SQLite file');
 $secret='PRIVATE-CONTENT-'.uuid();$op=uuid();$chapter=uuid();
 diagnosticStart($config);diagnosticEvent('body_read');diagnosticRpc(['method'=>'tools/call','params'=>['name'=>'save_proposal_edits','arguments'=>['operation_id'=>$op,'chapter_id'=>$chapter,'title'=>$secret,'replacements'=>[['paragraphs'=>[['text'=>$secret]]]],'insertions'=>[]]]]);
 diagnosticEvent('authenticated');diagnosticEvent('started',200,null,'save_proposal_edits');diagnosticEvent('rejected',422,'paragraph_validation');diagnosticFinish(200);
 $report=diagnosticReport($config);$row=$report['requests'][0];
 verifyInternal($report['storage']['available']&&$report['totalRequests']===1&&count($row['events'])===7,'Private report groups the complete request lifecycle');
 verifyInternal($row['status']===422&&$row['outcome']==='rejected'&&$row['stage']==='response_generated','A 200 MCP transport response does not hide a rejected tool outcome');
 verifyInternal($row['replacements']===1&&$row['insertions']===0&&$row['reason']==='paragraph_validation','Reports include safe input counts and fixed failure categories');
 verifyInternal($report['environment']['memoryLimit']===ini_get('memory_limit')&&$row['memoryLimit']===ini_get('memory_limit'),'Report and each request capture their effective PHP memory limit');
 verifyInternal(diagnosticReport($config,1,['outcome'=>'errors'])['totalRequests']===1&&diagnosticReport($config,1,['outcome'=>'completed'])['totalRequests']===0,'Error filters use logical tool outcomes despite successful transport');
 verifyInternal(diagnosticReport($config,1,['tool'=>'save_proposal_edits','search'=>substr($row['id'],0,8)])['totalRequests']===1&&diagnosticReport($config,1,['search'=>'no-matching-reference'])['totalRequests']===0,'Tool and request reference search filter the full database');
 verifyInternal(diagnosticReport($config,1,['search'=>'%'])['totalRequests']===0,'Search treats wildcard characters literally');
 foreach([['outcome'=>'bad'],['tool'=>[]],['search'=>[]],['search'=>str_repeat('x',81)]] as $filter){try{diagnosticReport($config,1,$filter);throw new RuntimeException('Invalid filter accepted');}catch(ApiError $e){verifyInternal($e->status===422,'Malformed diagnostic filter is rejected');}}
 $serialized=json_encode($report);foreach([$secret,$op,$chapter,'workspace.sqlite'] as $private)verifyInternal(!str_contains($serialized,$private),'Report excludes prose, operation/workspace IDs and private paths');
 verifyInternal(file_get_contents($root.'/workspace.sqlite')===$before,'Diagnostics never mutate the workspace database');
 verifyInternal(!in_array('events',$main->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN),true),'Main workspace schema has no diagnostic tables');
 $collision=diagnosticReport(array_replace($config,['dsn'=>'sqlite:'.$store['file']]));verifyInternal(!$collision['storage']['available'],'Diagnostic storage cannot reuse a configured workspace database filename');
 $bad=diagnosticReport(array_replace($config,['diagnostics_dir'=>$root.'/public']));verifyInternal(!$bad['storage']['available']&&!is_file($root.'/public/khosra-mcp-diagnostics.sqlite'),'Public-directory logging is rejected');
 $bad=diagnosticReport(array_replace($config,['diagnostics_dir'=>$root.'/missing/child']));verifyInternal(!$bad['storage']['available'],'Unavailable logging reports a storage issue instead of breaking application operations');
 try{diagnosticPurge($config,['olderThanDays'=>2]);throw new RuntimeException('Unsupported purge accepted');}catch(ApiError $e){verifyInternal($e->status===422,'Purge accepts only explicit supported retention ranges');}
 $logs=$store['db'];$logs->exec('UPDATE events SET created_at='.(time()-8*86400));
 diagnosticStart($config);diagnosticFinish(200);$purged=diagnosticPurge($config,['olderThanDays'=>7]);verifyInternal($purged['removed']===7&&diagnosticReport($config)['totalEvents']===2,'Age-based purge preserves recent request entries');
 diagnosticPurge($config,['olderThanDays'=>null]);verifyInternal(diagnosticReport($config)['totalEvents']===0,'All-log purge empties only the diagnostic database');
 $q=$logs->prepare('INSERT INTO events(created_at,request_id,revision,rpc_method,tool,stage,status,elapsed_ms,peak_bytes,input_bytes) VALUES(?,?,?,?,?,?,?,?,?,?)');$logs->beginTransaction();
 for($i=0;$i<10005;$i++)$q->execute([time(),str_pad(dechex($i),16,'0',STR_PAD_LEFT),KHOSRA_MCP_REVISION,'tools/call','save_proposal','received',200,0,0,0]);$logs->commit();
 diagnosticStart($config);diagnosticFinish(200);$bounded=diagnosticReport($config);verifyInternal($bounded['totalEvents']===10000,'Event retention is bounded at 10000 records');
 verifyInternal(count($bounded['requests'])===25&&count(diagnosticReport($config,2)['requests'])===25,'Diagnostic requests are paginated');
 $filtered=diagnosticReport($config,2,['tool'=>'save_proposal','outcome'=>'in_progress']);verifyInternal($filtered['totalRequests']===9998&&count($filtered['requests'])===25&&$filtered['totalRecordedRequests']===9999,'Server filters precede pagination and retain global totals');
 $logs->exec('UPDATE events SET created_at='.(time()-31*86400));verifyInternal(diagnosticReport($config)['totalEvents']===0,'Owner reads enforce expiry even when no new MCP requests arrive');diagnosticStart($config);diagnosticFinish(200);verifyInternal(diagnosticReport($config)['totalEvents']===2,'Automatic retention removes events older than 30 days');
 diagnosticSetEnabled($config,['enabled'=>false]);$eventCount=diagnosticReport($config)['totalEvents'];diagnosticStart($config);diagnosticRpc(['method'=>'ping']);diagnosticFinish(200);
 verifyInternal(diagnosticReport($config)['recordingEnabled']===false&&diagnosticReport($config)['totalEvents']===$eventCount,'Global disable skips request diagnostics and persists across requests');
 diagnosticPurge($config,['olderThanDays'=>null]);verifyInternal(diagnosticReport($config)['recordingEnabled']===false,'Purging logs preserves the global recording switch');
 diagnosticSetEnabled($config,['enabled'=>true]);diagnosticStart($config);diagnosticFinish(200);verifyInternal(diagnosticReport($config)['recordingEnabled']&&diagnosticReport($config)['totalEvents']===2,'Re-enabling resumes logging for new requests');
 try{diagnosticSetEnabled($config,['enabled'=>'true']);throw new RuntimeException('Invalid switch accepted');}catch(ApiError $e){verifyInternal($e->status===422,'Recording controls require a boolean');}
 $task=openDatabase(['dsn'=>'sqlite::memory:']);$task->exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');$task->exec('CREATE TABLE operations(operation_id TEXT PRIMARY KEY,payload_hash TEXT,result_version INTEGER)');$state=blank();$book=uuid();$state['books'][]=['id'=>$book,'title'=>'Synthetic','premise'=>'','language'=>'bn','createdAt'=>stamp()];$task->prepare('INSERT INTO workspace VALUES(1,0,?)')->execute([json_encode($state)]);
 diagnosticStart($config);$store['db']->exec('DROP TABLE events');$response=mcpToolResult($task,['params'=>['name'=>'save_idea','arguments'=>['operation_id'=>uuid(),'book_id'=>$book,'title'=>'Synthetic idea','body'=>'Private']]],['manuscript.propose']);diagnosticFinish(200);
 verifyInternal(!($response['isError']??false)&&loadWorkspace($task)['version']===1,'A logging write failure cannot fail a manuscript operation');
 diagnosticStart(array_replace($config,['diagnostics_dir'=>$root.'/missing/child']));$response=mcpToolResult($task,['params'=>['name'=>'save_idea','arguments'=>['operation_id'=>uuid(),'book_id'=>$book,'title'=>'Second idea','body'=>'Private']]],['manuscript.propose']);
 verifyInternal(!($response['isError']??false)&&loadWorkspace($task)['version']===2,'Unavailable diagnostic storage never blocks tool writes');
 verifyInternal(file_get_contents($root.'/workspace.sqlite')===$before,'All purge and retention actions preserve the main database byte for byte');
}finally{
 if(isset($GLOBALS['khosra_mcp_trace'])){$GLOBALS['khosra_mcp_trace']['done']=true;unset($GLOBALS['khosra_mcp_trace']);}
 unset($store,$logs,$main,$q);ini_set('error_log',$oldLog);if($previousRoot===null)unset($_SERVER['DOCUMENT_ROOT']);else $_SERVER['DOCUMENT_ROOT']=$previousRoot;
 foreach(glob($root.'/*') as $file){if(is_dir($file))rmdir($file);else unlink($file);}rmdir($root);
}
foreach($checks as $name)echo 'PASS: '.$name.PHP_EOL;
echo count($checks).' internal SQLite diagnostic checks passed.'.PHP_EOL;
