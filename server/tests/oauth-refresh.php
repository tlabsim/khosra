<?php
// Disposable SQLite tests. Never reads live configuration or prints bearer credentials.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';require dirname(__DIR__).'/oauth.php';
$count=0;
function checkRefresh(bool $ok,string $label):void{global $count;if(!$ok)throw new RuntimeException('FAIL: '.$label);$count++;echo 'PASS: '.$label.PHP_EOL;}
function rejectRefresh(callable $fn,int $status,string $label):void{try{$fn();}catch(ApiError $e){checkRefresh($e->status===$status,$label);return;}throw new RuntimeException('Expected rejection: '.$label);}
$directory=sys_get_temp_dir().'/khosra-oauth-refresh-'.bin2hex(random_bytes(6));mkdir($directory,0700);
if(getenv('KHOSRA_OAUTH_TEST_MYSQL')&&!preg_match('/^mysql:host=127\.0\.0\.1;port=[0-9]{4,5};dbname=khosra_oauth_test;charset=utf8mb4$/D',getenv('KHOSRA_OAUTH_TEST_MYSQL')))throw new RuntimeException('MySQL tests require the disposable loopback fixture.');
$config=getenv('KHOSRA_OAUTH_TEST_MYSQL')?['dsn'=>getenv('KHOSRA_OAUTH_TEST_MYSQL'),'db_user'=>'root','db_password'=>'','origin'=>'https://oauth.example.test']:['dsn'=>'sqlite:'.$directory.'/fixture.sqlite','origin'=>'https://oauth.example.test'];
file_put_contents($directory.'/config.json',json_encode($config,JSON_THROW_ON_ERROR));chmod($directory.'/config.json',0600);
function parallelRefresh(string $directory,array $body,array $actions):array{
 $file=$directory.'/request.json';file_put_contents($file,json_encode($body,JSON_THROW_ON_ERROR));chmod($file,0600);$children=[];
 foreach($actions as $action){$pipes=[];$proc=proc_open([PHP_BINARY,'-d','xdebug.mode=off',__DIR__.'/oauth-refresh-worker.php',$directory.'/config.json',$file,$action],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fclose($pipes[0]);$children[]=[$proc,$pipes];}
 $outputs=[];foreach($children as [$proc,$pipes]){$outputs[]=trim(stream_get_contents($pipes[1]));$errors=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($proc)!==0)throw new RuntimeException('OAuth worker failed: '.$errors);}
 unlink($file);return $outputs;
}
try{
 $db=openDatabase($config);$db->exec(file_get_contents(dirname(__DIR__).($db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?'/schema.sql':'/schema.sqlite.sql')));$client=uuid();$resource=oauthResource($config);
 // Exercise an existing installation without the additive table.
 $db->exec('DROP TABLE oauth_refresh_rotations');$first=issueTokens($db,$client,$resource,'manuscript.read manuscript.propose');
 $body=['grant_type'=>'refresh_token','client_id'=>$client,'refresh_token'=>$first['refresh_token'],'resource'=>$resource];
 $bad=$body;$bad['client_id']=uuid();rejectRefresh(fn()=>oauthRefresh($db,$config,$bad),400,'Wrong client rejected');
 checkRefresh(!oauthRotationStorage($db),'Invalid credentials cannot initialize rotation storage');
 $bad=$body;$bad['resource']='https://other.invalid/api/mcp';rejectRefresh(fn()=>oauthRefresh($db,$config,$bad),400,'Wrong explicit audience rejected');
 $bad=$body;$bad['scope']='manuscript.admin';rejectRefresh(fn()=>oauthRefresh($db,$config,$bad),400,'Scope escalation rejected');
 $second=oauthRefresh($db,$config,$body);
 checkRefresh(oauthRotationStorage($db),'Valid legacy refresh initializes additive storage');
 checkRefresh($second['access_token']!==$first['access_token']&&$second['refresh_token']!==$first['refresh_token'],'Refresh rotates both credentials');
 checkRefresh(oauthAccess($db,$config,$first['access_token'])===['manuscript.read','manuscript.propose'],'Parent access remains valid for overlapping requests');
 checkRefresh(in_array('manuscript.propose',oauthAccess($db,$config,$second['access_token']),true),'New token permits proposal submission');
 $retry=oauthRefresh($db,$config,$body);checkRefresh($retry['access_token']===$second['access_token']&&$retry['refresh_token']===$second['refresh_token'],'Lost-response retry returns identical credentials');
 checkRefresh($retry['expires_in']<=3600&&$retry['expires_in']>0,'Retry never restarts access lifetime');
 checkRefresh((int)$db->query('SELECT COUNT(*) FROM oauth_tokens')->fetchColumn()===2,'Retry creates no extra token rows');
 $rows=json_encode($db->query('SELECT * FROM oauth_refresh_rotations')->fetchAll(PDO::FETCH_ASSOC));checkRefresh(!str_contains($rows,$first['refresh_token'])&&!str_contains($rows,$second['access_token'])&&!str_contains($rows,$second['refresh_token']),'Rotation storage contains no plaintext tokens');
 $withoutAudience=$body;unset($withoutAudience['resource']);$retry=oauthRefresh($db,$config,$withoutAudience);checkRefresh($retry['access_token']===$second['access_token'],'Omitted refresh audience inherits exact bound resource');
 $bad=$body;$bad['scope']='manuscript.read';rejectRefresh(fn()=>oauthRefresh($db,$config,$bad),400,'Changed retry parameters cannot fork credentials');
 $db->prepare('UPDATE oauth_refresh_rotations SET rotated_at=? WHERE parent_access_hash=?')->execute([time()-KHOSRA_REFRESH_RETRY_SECONDS-1,hash('sha256',$first['access_token'])]);
 rejectRefresh(fn()=>oauthRefresh($db,$config,$body),400,'Old refresh token is rejected after retry window');
 $nextBody=['client_id'=>$client,'refresh_token'=>$second['refresh_token']];$third=oauthRefresh($db,$config,$nextBody);
 checkRefresh(in_array('manuscript.read',oauthAccess($db,$config,$third['access_token']),true),'Current refresh continues the same family');
 $db->prepare('UPDATE oauth_tokens SET expires_at=? WHERE access_hash=?')->execute([time()-1,hash('sha256',$first['access_token'])]);
 rejectRefresh(fn()=>oauthAccess($db,$config,$first['access_token']),401,'Original access expiry is still enforced');
 oauthRevoke($db,uuid(),$second['access_token']);checkRefresh(count(oauthAccess($db,$config,$third['access_token']))===2,'Wrong client cannot revoke a connection');
 $unrelated=issueTokens($db,$client,$resource,'manuscript.read');
 oauthRevoke($db,$client,$first['refresh_token']);
 checkRefresh(oauthAccess($db,$config,$unrelated['access_token'])===['manuscript.read'],'Revocation preserves unrelated connections for the same client');
 foreach([$first,$second,$third] as $token)rejectRefresh(fn()=>oauthAccess($db,$config,$token['access_token']),401,'Revocation disables family access generation');
 rejectRefresh(fn()=>oauthRefresh($db,$config,['client_id'=>$client,'refresh_token'=>$third['refresh_token']]),400,'Revocation disables latest refresh');
 oauthRevoke($db,$client,$second['access_token']);checkRefresh(!$db->inTransaction(),'Repeated revocation leaves no open transaction');
 $fresh=issueTokens($db,$client,$resource,'manuscript.read manuscript.propose');
 $narrow=oauthRefresh($db,$config,['client_id'=>$client,'refresh_token'=>$fresh['refresh_token'],'scope'=>'manuscript.read']);checkRefresh($narrow['scope']==='manuscript.read','Refresh can narrow scope');
 rejectRefresh(fn()=>oauthRefresh($db,$config,['client_id'=>$client,'refresh_token'=>$narrow['refresh_token'],'scope'=>'manuscript.propose']),400,'Narrowed child cannot regain broader scope');
 oauthRevoke($db,$client,$narrow['refresh_token']);rejectRefresh(fn()=>oauthAccess($db,$config,$fresh['access_token']),401,'Revoking a descendant disables ancestor access');
 $expired=issueTokens($db,$client,$resource,'manuscript.read');$db->prepare('UPDATE oauth_tokens SET refresh_expires_at=? WHERE access_hash=?')->execute([time()-1,hash('sha256',$expired['access_token'])]);
 rejectRefresh(fn()=>oauthRefresh($db,$config,['client_id'=>$client,'refresh_token'=>$expired['refresh_token']]),400,'Expired refresh token is rejected');
 $foreign=issueTokens($db,$client,'https://foreign.invalid/api/mcp','manuscript.read');rejectRefresh(fn()=>oauthRefresh($db,$config,['client_id'=>$client,'refresh_token'=>$foreign['refresh_token']]),400,'Omitted audience cannot bypass stored audience validation');
 rejectRefresh(fn()=>oauthRefresh($db,$config,['client_id'=>$client,'refresh_token'=>[]]),400,'Malformed refresh input rejected');
 checkRefresh(str_contains(oauthChallenge($config,true),'error="invalid_token"'),'Expired MCP token challenge identifies invalid_token');
 $race=issueTokens($db,$client,$resource,'manuscript.read manuscript.propose');$raceBody=['client_id'=>$client,'refresh_token'=>$race['refresh_token']];
 $out=parallelRefresh($directory,$raceBody,['refresh','refresh']);checkRefresh($out[0]===$out[1]&&!str_starts_with($out[0],'rejected:'),'Concurrent refresh processes return one replacement');
 checkRefresh((int)$db->query("SELECT COUNT(*) FROM oauth_refresh_rotations WHERE parent_access_hash='".hash('sha256',$race['access_token'])."'")->fetchColumn()===1,'Concurrent refresh creates exactly one rotation');
 $afterRace=oauthRefresh($db,$config,$raceBody);checkRefresh(hash('sha256',$afterRace['access_token']).':'.hash('sha256',$afterRace['refresh_token'])===$out[0],'Subsequent retry recovers concurrent committed result');
 $race2=issueTokens($db,$client,$resource,'manuscript.read');$raceBody2=['client_id'=>$client,'refresh_token'=>$race2['refresh_token']];
 parallelRefresh($directory,$raceBody2,['refresh','revoke']);rejectRefresh(fn()=>oauthRefresh($db,$config,$raceBody2),400,'Concurrent refresh/revoke cannot resurrect connection');
 checkRefresh((int)$db->query("SELECT COUNT(*) FROM oauth_tokens WHERE revoked=0 AND access_hash IN (SELECT successor_access_hash FROM oauth_refresh_rotations WHERE family_hash='".hash('sha256',$race2['access_token'])."')")->fetchColumn()===0,'Revocation race leaves no active descendant');
 $chainRoot=issueTokens($db,$client,$resource,'manuscript.read manuscript.propose');$chainBody=['client_id'=>$client,'refresh_token'=>$chainRoot['refresh_token']];$chainChild=oauthRefresh($db,$config,$chainBody);
 $chainLatest=oauthRefresh($db,$config,['client_id'=>$client,'refresh_token'=>$chainChild['refresh_token'],'scope'=>'manuscript.read']);
 $delayed=oauthRefresh($db,$config,$chainBody);checkRefresh($delayed['access_token']===$chainLatest['access_token']&&$delayed['refresh_token']===$chainLatest['refresh_token'],'Delayed retry follows already-rotated replacements to the latest credentials');
 checkRefresh($delayed['scope']==='manuscript.read','Delayed retry respects descendant scope narrowing');
 $db->exec('DROP TABLE oauth_refresh_rotations');$legacyRace=issueTokens($db,$client,$resource,'manuscript.read');$legacyBody=['client_id'=>$client,'refresh_token'=>$legacyRace['refresh_token']];
 parallelRefresh($directory,$legacyBody,['refresh','revoke']);rejectRefresh(fn()=>oauthRefresh($db,$config,$legacyBody),400,'First-use schema creation and revocation cannot resurrect a family');
 checkRefresh((int)$db->query("SELECT COUNT(*) FROM oauth_tokens WHERE revoked=0 AND access_hash IN (SELECT successor_access_hash FROM oauth_refresh_rotations WHERE family_hash='".hash('sha256',$legacyRace['access_token'])."')")->fetchColumn()===0,'First-use race leaves no active descendant');
 checkRefresh(!$db->inTransaction(),'Rejected refresh requests leave no transaction open');
 echo "$count OAuth refresh checks passed.\n";
}finally{unset($db);foreach(glob($directory.'/*')?:[] as $file)unlink($file);rmdir($directory);}
