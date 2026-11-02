<?php
// Isolated worker: arguments name only generated fixture files, never credentials.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';require dirname(__DIR__).'/oauth.php';
$config=json_decode(file_get_contents($argv[1]),true,128,JSON_THROW_ON_ERROR);
$db=openDatabase($config);$body=json_decode(file_get_contents($argv[2]),true,128,JSON_THROW_ON_ERROR);
try{
 if(($argv[3]??'refresh')==='revoke'){oauthRevoke($db,$body['client_id'],$body['refresh_token']);echo 'revoked';}
 else{$result=oauthRefresh($db,$config,$body);echo hash('sha256',$result['access_token']).':'.hash('sha256',$result['refresh_token']);}
}catch(ApiError $e){echo 'rejected:'.$e->status;}
