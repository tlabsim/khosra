<?php
// Isolated SQLite deployment/transaction tests; no production configuration.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
require dirname(__DIR__).'/oauth.php';
require dirname(__DIR__).'/deployment/bootstrap.php';
function respond(mixed $value,int $status=200):never {throw new ApiError($status,json_encode($value));}
$count=0;
function checkDeployment(bool $ok,string $name):void{global $count;if(!$ok)throw new RuntimeException('FAIL: '.$name);echo 'PASS: '.$name.PHP_EOL;$count++;}
function deploymentReject(callable $fn,int $status,string $name):void{try{$fn();}catch(ApiError $e){checkDeployment($e->status===$status,$name);return;}throw new RuntimeException('Expected rejection: '.$name);}
$root=sys_get_temp_dir().'/khosra-deployment-'.bin2hex(random_bytes(6));mkdir($root);mkdir($root.'/site');
$file=$root.'/site/khosra.config.php';
$config=['origin'=>'https://khosra.example.com','owner_password'=>'a-unique-test-password','data_dir'=>$root.'/data'];
$write=fn($c)=>file_put_contents($file,'<?php return '.var_export($c,true).';');
try{
 deploymentReject(fn()=>khosraDeploymentConfig($file),503,'Missing config gives setup state');
 $bad=$config;$bad['owner_password']='REPLACE_ME';$write($bad);deploymentReject(fn()=>khosraDeploymentConfig($file),503,'Placeholder password rejected');
 $bad=$config;$bad['origin']='http://example.com';$write($bad);deploymentReject(fn()=>khosraDeploymentConfig($file),503,'Non-HTTPS origin rejected');
 $bad=$config;$bad['data_dir']=$root.'/site/data';$write($bad);deploymentReject(fn()=>khosraDeploymentConfig($file),503,'SQLite storage in webroot rejected');
 $bad=$config;$bad['dsn']='sqlite:'.$root.'/site/unsafe.sqlite';$write($bad);deploymentReject(fn()=>khosraDeploymentConfig($file),503,'Explicit SQLite DSN inside webroot rejected');
 $automatic=$config;$automatic['data_dir']='';$write($automatic);$auto=khosraDeploymentConfig($file);$autoDirectory=dirname(substr($auto['dsn'],7));checkDeployment(is_dir($autoDirectory)&&realpath(dirname($autoDirectory))===realpath($root),'Default data directory is outside webroot');@unlink($autoDirectory.'/.htaccess');rmdir($autoDirectory);
 foreach(['https://writer.example.test','https://drafts.example.org:8443'] as $origin){$custom=$config;$custom['origin']=$origin;$write($custom);$resolved=khosraDeploymentConfig($file);$metadata=oauthMetadata($resolved,'oauth-authorization-server');checkDeployment(oauthResource($resolved)===$origin.'/api/mcp'&&$metadata['issuer']===$origin&&$metadata['authorization_endpoint']===$origin.'/api/oauth/authorize','OAuth metadata follows configured origin '.$origin);}
 $write($config);$config=khosraDeploymentConfig($file);checkDeployment(str_starts_with($config['dsn'],'sqlite:')&&is_dir($root.'/data'),'Private SQLite directory selected without DB credentials');
 checkDeployment(ownerPasswordMatches('a-unique-test-password',$config)&&!ownerPasswordMatches('wrong',$config),'Configured owner password verified');
 $hash=password_hash('hash-only-password',PASSWORD_DEFAULT);checkDeployment(ownerPasswordMatches('hash-only-password',['owner_password_hash'=>$hash])&&!ownerPasswordMatches('wrong',['owner_password_hash'=>$hash]),'Existing hashed owner password supported');
 $db=openDatabase($config);checkDeployment((int)$db->query('PRAGMA busy_timeout')->fetchColumn()===5000,'SQLite busy timeout configured');
 deploymentReject(fn()=>khosraPrepareDatabase($db,$config,'login','POST',['password'=>'wrong']),401,'Wrong first-login password cannot initialize schema');
 checkDeployment((int)$db->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")->fetchColumn()===0,'Unauthenticated setup creates no tables');
 khosraPrepareDatabase($db,$config,'login','POST',['password'=>'a-unique-test-password']);
 checkDeployment((int)$db->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")->fetchColumn()===9,'Correct owner sign-in initializes all nine tables');
 $s=blank();$bid=uuid();$cid=uuid();$rid=uuid();$pid=uuid();$s['books'][]=['id'=>$bid,'title'=>'Portable manuscript','language'=>'bn','premise'=>'','createdAt'=>stamp()];$s['chapters'][]=['id'=>$cid,'bookId'=>$bid,'code'=>1,'position'=>0,'title'=>'Portable chapter','headId'=>$rid,'approvedId'=>null,'synopsis'=>''];$s['revisions'][]=['id'=>$rid,'chapterId'=>$cid,'parentId'=>null,'createdAt'=>stamp(),'source'=>'author','edition'=>1,'message'=>'Original','paragraphs'=>[['id'=>$pid,'label'=>1,'section'=>'','text'=>'বাংলা অক্ষর।']]];
 $op=uuid();checkDeployment(writeWorkspace($db,$s,0,$op,'first')===1,'SQLite author upload commits');
 checkDeployment(writeWorkspace($db,$s,0,$op,'first')===1,'SQLite retry is idempotent');
 deploymentReject(fn()=>writeWorkspace($db,$s,0,uuid(),'stale'),409,'SQLite stale upload rejected');
 khosraPrepareDatabase($db,$config,'login','POST',['password'=>'a-unique-test-password']);checkDeployment(loadWorkspace($db)['state']===$s&&loadWorkspace($db)['version']===1,'Repeated setup preserves workspace and version');
 $args=['operation_id'=>uuid(),'chapter_id'=>$cid,'base_revision_id'=>$rid,'title'=>'Rewrite','rationale'=>'Test','paragraphs'=>$s['revisions'][0]['paragraphs']];$r=callTool($db,'save_proposal',$args);checkDeployment($r['saved']&&loadWorkspace($db)['state']['chapters'][0]['headId']===$rid,'SQLite MCP proposal leaves source unchanged');
 checkDeployment(callTool($db,'save_proposal',$args)['duplicate']===true,'SQLite MCP retry deduplicated');
 throttleIdentity($db,'isolated-test',2,'Limited');throttleIdentity($db,'isolated-test',2,'Limited');deploymentReject(fn()=>throttleIdentity($db,'isolated-test',2,'Limited'),429,'SQLite authentication throttle enforced');
 checkDeployment(!$db->inTransaction(),'Rejected requests leave no open transaction');
 $token=issueTokens($db,uuid(),oauthResource($config),'manuscript.read');checkDeployment(oauthAccess($db,$config,$token['access_token'])===['manuscript.read'],'SQLite OAuth token scopes verified');
 // Same version from two independent processes: exactly one can commit.
 $base=loadWorkspace($db)['version'];unset($db);gc_collect_cycles();$processes=[];
 for($i=0;$i<2;$i++){$pipes=[];$proc=proc_open([PHP_BINARY,__DIR__.'/sqlite-worker.php',substr($config['dsn'],7),(string)$base],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fclose($pipes[0]);$processes[]=[$proc,$pipes];}
 $out=[];foreach($processes as [$proc,$pipes]){$out[]=trim(stream_get_contents($pipes[1]));$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(($exit=proc_close($proc))!==0)throw new RuntimeException('Worker exit '.$exit.': '.$error.' output '.end($out));}
 $db=openDatabase($config);sort($out);checkDeployment($out===['committed','conflict'],'Concurrent SQLite writers produce one commit and one conflict');
 checkDeployment(loadWorkspace($db)['version']===$base+1,'Concurrent write advances version exactly once');
 $db->exec('DROP TABLE reader_comments');khosraPrepareDatabase($db,$config,'login','POST',['password'=>'a-unique-test-password']);checkDeployment((int)$db->query('SELECT COUNT(*) FROM reader_comments')->fetchColumn()===0&&loadWorkspace($db)['version']===$base+1,'Additive schema recovery preserves existing manuscript');
 echo "$count deployment checks passed.\n";
}finally{unset($q,$db);foreach(glob($root.'/data/*')?:[] as $p)unlink($p);@unlink($root.'/data/.htaccess');@rmdir($root.'/data');@unlink($file);@rmdir($root.'/site');@rmdir($root);}
