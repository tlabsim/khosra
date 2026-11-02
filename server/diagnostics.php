<?php
declare(strict_types=1);

const KHOSRA_DIAGNOSTIC_LIMIT=10000;
const KHOSRA_DIAGNOSTIC_DAYS=30;

/** A separate private SQLite file; never reuse the workspace connection or tables. */
function diagnosticStore(array $config):array {
 try{
  if(!in_array('sqlite',PDO::getAvailableDrivers(),true))return ['issue'=>'sqlite_unavailable'];
  $dsn=$config['dsn']??'';$explicit=$config['diagnostics_dir']??null;
  if($explicit!==null&&(!is_string($explicit)||$explicit===''))return ['issue'=>'invalid_directory'];
  $directory=$explicit??(str_starts_with($dsn,'sqlite:')&&substr($dsn,7)!==':memory:'?dirname(substr($dsn,7)):sys_get_temp_dir().'/khosra-diagnostics-'.substr(hash('sha256',__DIR__.($config['origin']??'')),0,20));
  if(is_link($directory))return ['issue'=>'unsafe_directory'];
  $parent=realpath(dirname($directory));if($parent===false)return ['issue'=>'directory_unavailable'];
  $candidate=$parent.'/'.basename($directory);$normalize=fn(string $p)=>strtolower(str_replace('\\','/',rtrim($p,'/\\')));
  $public=realpath($_SERVER['DOCUMENT_ROOT']??'');$roots=$public?[$public]:[];
  for($p=$public?:'';$p!==''&&dirname($p)!==$p;$p=dirname($p))if(in_array(strtolower(basename($p)),['public_html','htdocs','httpdocs','wwwroot','www'],true))$roots[]=$p;
  foreach($roots as $root)if($normalize($candidate)===$normalize($root)||str_starts_with($normalize($candidate).'/', $normalize($root).'/'))return ['issue'=>'public_directory_rejected'];
  if(!is_dir($candidate)&&!@mkdir($candidate,0700))return ['issue'=>'directory_unwritable'];
  $resolved=realpath($candidate);if(DIRECTORY_SEPARATOR==='/'&&function_exists('posix_geteuid')&&$explicit===null&&!str_starts_with($dsn,'sqlite:')&&($resolved===false||fileowner($resolved)!==posix_geteuid()))return ['issue'=>'unsafe_directory'];if($resolved===false||is_link($candidate))return ['issue'=>'unsafe_directory'];
  $file=$resolved.'/khosra-mcp-diagnostics.sqlite';
  if(is_link($file)||is_dir($file)||($normalize(substr($dsn,7))===$normalize($file)))return ['issue'=>'unsafe_file'];
  $mask=umask(0077);try{$db=new PDO('sqlite:'.$file,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);}finally{umask($mask);}
  @chmod($file,0600);$db->exec('PRAGMA busy_timeout=150');$db->exec('PRAGMA auto_vacuum=FULL');
  $db->exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, request_id TEXT NOT NULL, revision TEXT NOT NULL, rpc_method TEXT NOT NULL, tool TEXT NOT NULL, stage TEXT NOT NULL, status INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL, peak_bytes INTEGER NOT NULL, input_bytes INTEGER NOT NULL, memory_limit TEXT NOT NULL DEFAULT \'\', execution_limit INTEGER NOT NULL DEFAULT 0, paragraph_count INTEGER NULL, replacement_count INTEGER NULL, insertion_count INTEGER NULL, reason TEXT NULL)');
  $db->exec('CREATE INDEX IF NOT EXISTS diagnostic_request ON events(request_id,id)');$db->exec('CREATE INDEX IF NOT EXISTS diagnostic_time ON events(created_at)');
  return ['db'=>$db,'file'=>$file];
 }catch(Throwable){return ['issue'=>'storage_unavailable'];}
}
function diagnosticReason(Throwable $e):string {
 if($e instanceof PDOException)return in_array((int)($e->errorInfo[1]??0),[5,6,1205,1213],true)?'database_busy':'database_failure';
 if($e instanceof JsonException)return 'invalid_json';
 if($e instanceof ApiError){
  $message=strtolower($e->getMessage());
  if($e->status===401)return 'authentication_rejected';
  if(str_contains($message,'scope'))return 'scope_denied';
  if(str_contains($message,'origin is not allowed'))return 'origin_rejected';
  if($e->status===413)return 'request_too_large';
  if($e->status===409)return 'revision_or_workspace_conflict';
  if(str_contains($message,'paragraph'))return 'paragraph_validation';
  return 'request_rejected';
 }
 return 'server_failure';
}
function diagnosticEvent(string $stage,int $status=200,?string $reason=null,?string $tool=null):void {
 $trace=&$GLOBALS['khosra_mcp_trace'];if(!is_array($trace)||!isset($trace['store']['db']))return;
 if(!in_array($stage,['received','body_read','decoded','authenticated','started','result_ready','response_generated','rejected','failed','fatal','interrupted'],true))return;
 if($tool!==null)$trace['tool']=in_array($tool,array_column(tools(),'name'),true)?$tool:'unknown';
 $allowed=['authentication_rejected','scope_denied','origin_rejected','request_too_large','revision_or_workspace_conflict','paragraph_validation','request_rejected','database_busy','database_failure','invalid_json','server_failure','memory_exhausted','execution_timeout','fatal_failure','request_interrupted'];
 if($reason!==null&&!in_array($reason,$allowed,true))$reason='server_failure';
 try{
  $db=$trace['store']['db'];$q=$db->prepare('INSERT INTO events(created_at,request_id,revision,rpc_method,tool,stage,status,elapsed_ms,peak_bytes,input_bytes,paragraph_count,replacement_count,insertion_count,reason,memory_limit,execution_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  $q->execute([time(),$trace['id'],KHOSRA_MCP_REVISION,$trace['method'],$trace['tool'],$stage,$status,(int)((microtime(true)-$trace['started'])*1000),memory_get_peak_usage(true),$trace['bytes'],$trace['paragraphs'],$trace['replacements'],$trace['insertions'],$reason,ini_get('memory_limit'),(int)ini_get('max_execution_time')]);
  $db->exec('DELETE FROM events WHERE id <= (SELECT COALESCE(MAX(id),0)-'.KHOSRA_DIAGNOSTIC_LIMIT.' FROM events)');
 }catch(Throwable){/* Diagnostics must never break a manuscript operation. */}
}
function diagnosticStart(array $config):void {
 $GLOBALS['khosra_mcp_trace']=['id'=>bin2hex(random_bytes(8)),'started'=>microtime(true),'store'=>diagnosticStore($config),'method'=>'unknown','tool'=>'unknown','bytes'=>max(0,min(1073741824,(int)($_SERVER['CONTENT_LENGTH']??0))),'paragraphs'=>null,'replacements'=>null,'insertions'=>null,'done'=>false,'reserve'=>str_repeat('x',262144)];
 $trace=&$GLOBALS['khosra_mcp_trace'];header('X-Khosra-Request-Id: '.$trace['id']);
 try{if(isset($trace['store']['db'])){$q=$trace['store']['db']->prepare('DELETE FROM events WHERE created_at < ?');$q->execute([time()-KHOSRA_DIAGNOSTIC_DAYS*86400]);}}catch(Throwable){}
 diagnosticEvent('received');
 register_shutdown_function(static function():void{
  $trace=&$GLOBALS['khosra_mcp_trace'];if(!is_array($trace)||$trace['done'])return;$trace['reserve']=null;
  $last=error_get_last();$fatal=$last&&in_array($last['type'],[E_ERROR,E_PARSE,E_CORE_ERROR,E_COMPILE_ERROR],true);
  $reason=$fatal?(str_contains($last['message'],'Allowed memory size')?'memory_exhausted':(str_contains($last['message'],'Maximum execution time')?'execution_timeout':'fatal_failure')):'request_interrupted';
  diagnosticEvent($fatal?'fatal':'interrupted',500,$reason);$trace['done']=true;
 });
}
function diagnosticRpc(array $rpc):void {
 $trace=&$GLOBALS['khosra_mcp_trace'];if(!is_array($trace))return;
 $method=$rpc['method']??'';$trace['method']=in_array($method,['initialize','ping','tools/list','tools/call','notifications/initialized'],true)?$method:'unknown';
 $params=$rpc['params']??[];$name=is_array($params)?($params['name']??''):'';$trace['tool']=is_string($name)&&in_array($name,array_column(tools(),'name'),true)?$name:'unknown';
 $args=is_array($params)?($params['arguments']??[]):[];
 if(is_array($args))foreach(['paragraphs','replacements','insertions'] as $field)$trace[$field]=is_array($args[$field]??null)?count($args[$field]):null;
 diagnosticEvent('decoded');
}
function diagnosticFinish(int $status):void {
 if(!isset($GLOBALS['khosra_mcp_trace']))return;
 diagnosticEvent('response_generated',$status);$GLOBALS['khosra_mcp_trace']['done']=true;$GLOBALS['khosra_mcp_trace']['reserve']=null;
}
function diagnosticReport(array $config,int $page=1):array {
 if($page<1||$page>1000)fail(422,'Invalid diagnostic page.');
 $store=diagnosticStore($config);$out=['revision'=>KHOSRA_MCP_REVISION,'serverTime'=>gmdate('c'),'environment'=>['phpVersion'=>PHP_VERSION,'memoryLimit'=>ini_get('memory_limit'),'maxExecutionSeconds'=>(int)ini_get('max_execution_time'),'postMaxSize'=>ini_get('post_max_size')],'storage'=>['available'=>isset($store['db']),'issue'=>$store['issue']??null,'retentionDays'=>KHOSRA_DIAGNOSTIC_DAYS,'maxEvents'=>KHOSRA_DIAGNOSTIC_LIMIT,'bytes'=>isset($store['file'])?(int)@filesize($store['file']):0],'requests'=>[],'page'=>$page,'pageSize'=>25,'totalRequests'=>0,'totalEvents'=>0];
 if(!isset($store['db']))return $out;
 $db=$store['db'];$expired=$db->prepare('DELETE FROM events WHERE created_at < ?');$expired->execute([time()-KHOSRA_DIAGNOSTIC_DAYS*86400]);$out['totalEvents']=(int)$db->query('SELECT COUNT(*) FROM events')->fetchColumn();$out['totalRequests']=(int)$db->query('SELECT COUNT(DISTINCT request_id) FROM events')->fetchColumn();
 $ids=$db->query('SELECT request_id FROM events GROUP BY request_id ORDER BY MAX(id) DESC LIMIT 25 OFFSET '.(($page-1)*25))->fetchAll(PDO::FETCH_COLUMN);
 foreach($ids as $id){
  $q=$db->prepare('SELECT * FROM events WHERE request_id=? ORDER BY id LIMIT 100');$q->execute([$id]);$rows=$q->fetchAll(PDO::FETCH_ASSOC);$events=[];
  foreach($rows as $row)$events[]=['at'=>gmdate('c',(int)$row['created_at']),'stage'=>$row['stage'],'status'=>(int)$row['status'],'elapsedMs'=>(int)$row['elapsed_ms'],'peakBytes'=>(int)$row['peak_bytes'],'reason'=>$row['reason'],'inputBytes'=>(int)$row['input_bytes']];
  $last=end($rows);$outcome=$last;foreach($rows as $row)if(in_array($row['stage'],['rejected','failed','fatal','interrupted'],true))$outcome=$row;
  $out['requests'][]=['id'=>$id,'at'=>gmdate('c',(int)$rows[0]['created_at']),'revision'=>$last['revision'],'method'=>$last['rpc_method'],'tool'=>$last['tool'],'stage'=>$last['stage'],'outcome'=>$outcome['stage'],'status'=>(int)$outcome['status'],'elapsedMs'=>(int)$last['elapsed_ms'],'peakBytes'=>(int)$last['peak_bytes'],'inputBytes'=>(int)$last['input_bytes'],'paragraphs'=>$last['paragraph_count']===null?null:(int)$last['paragraph_count'],'replacements'=>$last['replacement_count']===null?null:(int)$last['replacement_count'],'insertions'=>$last['insertion_count']===null?null:(int)$last['insertion_count'],'reason'=>$outcome['reason'],'memoryLimit'=>$last['memory_limit'],'maxExecutionSeconds'=>(int)$last['execution_limit'],'events'=>$events];
 }
 return $out;
}
function diagnosticPurge(array $config,array $body):array {
 if(array_diff(array_keys($body),['olderThanDays'])||!array_key_exists('olderThanDays',$body)||!in_array($body['olderThanDays'],[null,1,7,30],true))fail(422,'Choose all logs or logs older than 1, 7 or 30 days.');
 $store=diagnosticStore($config);if(!isset($store['db']))fail(503,'Private diagnostic storage is unavailable.');
 $q=$store['db']->prepare('DELETE FROM events'.($body['olderThanDays']===null?'':' WHERE created_at < ?'));$q->execute($body['olderThanDays']===null?[]:[time()-$body['olderThanDays']*86400]);
 return ['removed'=>$q->rowCount()];
}
