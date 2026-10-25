<?php
// CLI only. On FTP-only hosting use schema.sql and the initialization SQL in DEPLOYMENT.md.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/lib.php';$config=require __DIR__.'/config.php';$db=openDatabase($config);$sqlite=$db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite';$db->exec(file_get_contents(__DIR__.($sqlite?'/schema.sqlite.sql':'/schema.sql')));$q=$db->prepare(($sqlite?'INSERT OR IGNORE':'INSERT IGNORE').' INTO workspace(id,version,payload) VALUES(1,0,?)');$q->execute([json_encode(blank())]);echo "Schema initialized.\n";
