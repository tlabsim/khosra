<?php
// Test-only concurrent writer; supplied database must be the isolated deployment fixture.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
$path=$argv[1]??'';
if(!str_contains(str_replace('\\','/',$path),'/khosra-deployment-')||basename($path)!=='khosra.sqlite')throw new RuntimeException('Isolated fixture required.');
$db=openDatabase(['dsn'=>'sqlite:'.$path]);$s=loadWorkspace($db)['state'];
try{writeWorkspace($db,$s,(int)$argv[2],uuid(),bin2hex(random_bytes(8)));echo 'committed';}catch(ApiError $e){if($e->status!==409)throw $e;echo 'conflict';}
