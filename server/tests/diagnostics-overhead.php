<?php
declare(strict_types=1);
// Informational local timing; never asserts a production latency guarantee.
require dirname(__DIR__).'/lib.php';
$root=sys_get_temp_dir().'/khosra-log-cost-'.bin2hex(random_bytes(6));mkdir($root,0700);$config=['dsn'=>'sqlite:'.$root.'/workspace.sqlite','origin'=>'https://timing.example'];$old=ini_get('error_log');ini_set('error_log',$root.'/php.log');$measurements=[];
try{
 foreach([false,true] as $enabled){diagnosticSetEnabled($config,['enabled'=>$enabled]);diagnosticPurge($config,['olderThanDays'=>null]);$samples=[];
  for($i=0;$i<30;$i++){$start=microtime(true);diagnosticStart($config);diagnosticEvent('body_read');diagnosticRpc(['method'=>'tools/call','params'=>['name'=>'save_chapter_proposal','arguments'=>['paragraphs'=>[]]]]);diagnosticEvent('authenticated');$id=$GLOBALS['khosra_mcp_trace']['id']??'0000000000000000';mcpDiagnostic($id,'save_chapter_proposal','started',200,$start);mcpDiagnostic($id,'save_chapter_proposal','result_ready',200,$start);diagnosticFinish(200);$samples[]=(microtime(true)-$start)*1000;}
  sort($samples);$report=diagnosticReport($config);if($report['totalEvents']!==($enabled?210:0))throw new RuntimeException('Incorrect enabled/disabled event count.');$measurements[$enabled?'enabled':'disabled']=['medianMs'=>round($samples[15],2),'p95Ms'=>round($samples[28],2),'events'=>$report['totalEvents']];
 }
}finally{unset($GLOBALS['khosra_mcp_trace']);ini_set('error_log',$old);foreach(glob($root.'/*') as $file)unlink($file);rmdir($root);}
echo json_encode($measurements,JSON_PRETTY_PRINT).PHP_EOL;
