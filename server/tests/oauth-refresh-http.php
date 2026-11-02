<?php
// Full OAuth/owner/MCP router checks against a disposable loopback SQLite server.
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';require dirname(__DIR__).'/oauth.php';
$root=sys_get_temp_dir().'/khosra-oauth-http-'.bin2hex(random_bytes(5));mkdir($root.'/public/api',0700,true);mkdir($root.'/sessions',0700);
$socket=stream_socket_server('tcp://127.0.0.1:0');$address=stream_socket_get_name($socket,false);fclose($socket);
$config=['dsn'=>'sqlite:'.$root.'/fixture.sqlite','origin'=>'http://'.$address,'owner_password_hash'=>password_hash('khosra-test-only',PASSWORD_DEFAULT),'tool_token_hash'=>'','oauth_redirect_allowlist'=>['https://chatgpt.com/connector_platform_oauth_redirect']];$process=null;$count=0;
function verifyRefreshHttp(bool $ok,string $label):void{global $count;if(!$ok)throw new RuntimeException('FAIL: '.$label);$count++;echo 'PASS: '.$label.PHP_EOL;}
function refreshHttp(string $path,?array $body=null,?string $bearer=null,?string $origin=null):array{
 global $config;$headers=['Content-Type: application/x-www-form-urlencoded'];if($bearer!==null)$headers[]='Authorization: Bearer '.$bearer;if($origin!==null)$headers[]='Origin: '.$origin;
 $options=['http'=>['method'=>$body===null?'GET':'POST','ignore_errors'=>true,'timeout'=>10,'header'=>implode("\r\n",$headers)]];if($body!==null)$options['http']['content']=http_build_query($body);
 $raw=file_get_contents($config['origin'].$path,false,stream_context_create($options));preg_match('/\s(\d{3})\s/',$http_response_header[0]??'',$m);return ['status'=>(int)($m[1]??0),'json'=>json_decode($raw?:'',true),'headers'=>strtolower(implode(' ',$http_response_header??[]))];
}
function refreshMcp(string $token,?string $origin=null,string $scheme="Bearer"):array{
 global $config;$payload=json_encode(['jsonrpc'=>'2.0','id'=>1,'method'=>'tools/list'],JSON_THROW_ON_ERROR);
 $raw=file_get_contents($config['origin'].'/api/mcp',false,stream_context_create(['http'=>['method'=>'POST','ignore_errors'=>true,'timeout'=>10,'header'=>"Content-Type: application/json".($token!==""?"\r\nAuthorization: ".$scheme." ".$token:"").($origin!==null?"\r\nOrigin: ".$origin:""),'content'=>$payload]]));preg_match('/\s(\d{3})\s/',$http_response_header[0]??'',$m);return ['status'=>(int)($m[1]??0),'json'=>json_decode($raw?:'',true),'headers'=>strtolower(implode(' ',$http_response_header??[]))];
}
try{
 foreach(['lib.php','oauth.php','sharing.php','guide.php','materials.php','proposal-edits.php','workspace-sync.php','diagnostics.php'] as $file)copy(dirname(__DIR__).'/'.$file,$root.'/'.$file);
 copy(dirname(__DIR__).'/public/api/index.php',$root.'/public/api/index.php');copy(dirname(__DIR__).'/public/oauth-consent.js',$root.'/public/oauth-consent.js');
 file_put_contents($root.'/config.php','<?php return '.var_export($config,true).';');chmod($root.'/config.php',0600);
 file_put_contents($root.'/router.php',"<?php \$path=parse_url(\$_SERVER['REQUEST_URI'],PHP_URL_PATH);if(\$path==='/oauth-consent.js')return false;if(str_starts_with(\$path,'/.well-known/'))\$_GET['discovery']=basename(\$path);require __DIR__.'/public/api/index.php';");
 $db=openDatabase($config);$db->exec(file_get_contents(dirname(__DIR__).'/schema.sqlite.sql'));$db->prepare('INSERT INTO workspace(id,version,payload) VALUES(1,0,?)')->execute([json_encode(blank())]);
 $pipes=[];$process=proc_open([PHP_BINARY,'-d','xdebug.mode=off','-d','error_log='.$root.'/auth.log','-d','session.save_path='.$root.'/sessions','-S',$address,'-t',$root.'/public',$root.'/router.php'],[0=>['pipe','r'],1=>['file',$root.'/server.log','a'],2=>['file',$root.'/server.log','a']],$pipes);fclose($pipes[0]);
 for($i=0;$i<100;$i++){$socket=@fsockopen('127.0.0.1',(int)substr(strrchr($address,':'),1),$errno,$error,0.1);if($socket){fclose($socket);break;}usleep(50000);}
 // Run the existing complete PKCE/consent/owner/scope/revocation HTTP regression.
 $env=getenv();$env['KHOSRA_HTTP_TEST_CONFIG']=$root.'/config.php';$env['KHOSRA_HTTP_TEST_URL']=$config['origin'];$pipes=[];
 $suite=proc_open([PHP_BINARY,'-d','xdebug.mode=off',__DIR__.'/http.php'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,$env);fclose($pipes[0]);$out=stream_get_contents($pipes[1]);$errors=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$status=proc_close($suite);echo $out;if($status!==0)throw new RuntimeException('OAuth regression failed: '.$errors);
 $db->exec('DROP TABLE oauth_refresh_rotations');$client=uuid();$tokens=issueTokens($db,$client,oauthResource($config),'manuscript.read manuscript.propose');$body=['grant_type'=>'refresh_token','client_id'=>$client,'refresh_token'=>$tokens['refresh_token']];
 $r=refreshHttp('/api/oauth/token',$body);verifyRefreshHttp($r['status']===200&&isset($r['json']['refresh_token']),'Form-encoded refresh works without repeated resource');$next=$r['json'];
 verifyRefreshHttp(str_contains($r['headers'],'no-store'),'Refresh response cannot be cached');
 $r=refreshHttp('/api/oauth/token',$body);verifyRefreshHttp($r['status']===200&&$r['json']['access_token']===$next['access_token']&&$r['json']['refresh_token']===$next['refresh_token'],'Repeated HTTP refresh recovers identical token pair');
 verifyRefreshHttp(refreshMcp($tokens['access_token'])['status']===200,'Overlapping old-token MCP call succeeds after refresh');
 verifyRefreshHttp(refreshMcp($next['access_token'])['status']===200,'Replacement token can discover proposal tools');
 $bad=$body;$bad['resource']='https://wrong.invalid/api/mcp';$r=refreshHttp('/api/oauth/token',$bad);verifyRefreshHttp($r['status']===400&&$r['json']['error']==='invalid_grant','Wrong refresh audience remains rejected by router');
 $db->prepare('UPDATE oauth_tokens SET expires_at=? WHERE access_hash=?')->execute([time()-1,hash('sha256',$tokens['access_token'])]);$r=refreshMcp($tokens['access_token']);verifyRefreshHttp($r['status']===401&&str_contains($r['headers'],'error="invalid_token"')&&str_contains($r['headers'],'resource_metadata='),'Expired MCP token advertises refreshable invalid_token challenge');
 $r=refreshHttp('/api/oauth/revoke',['client_id'=>$client,'token'=>$tokens['refresh_token']]);verifyRefreshHttp($r['status']===200,'Ancestor refresh revocation succeeds over HTTP');
 verifyRefreshHttp(refreshMcp($next['access_token'])['status']===401,'Revoked family denies current MCP token');
 $r=refreshHttp('/api/oauth/token',['grant_type'=>'refresh_token','client_id'=>$client,'refresh_token'=>$next['refresh_token']]);verifyRefreshHttp($r['status']===400,'Revoked latest refresh cannot restore connection');
 verifyRefreshHttp(loadWorkspace($db)['state']===blank(),'OAuth refresh/revocation never changes workspace');
 $client=uuid();$fresh=issueTokens($db,$client,oauthResource($config),'manuscript.read manuscript.propose');
 $r=refreshMcp($fresh['access_token'],'https://chatgpt.com');verifyRefreshHttp($r['status']===200&&!str_contains($r['headers'],'www-authenticate:'),'ChatGPT-origin authenticated MCP succeeds without a reconnect challenge');
 verifyRefreshHttp(refreshMcp($fresh['access_token'],null,'bearer')['status']===200,'Lowercase Bearer scheme is accepted over real HTTP');
 $r=refreshMcp('');verifyRefreshHttp($r['status']===401&&str_contains($r['headers'],'www-authenticate:')&&!str_contains($r['headers'],'invalid_token'),'Discovery without credentials does not falsely report token expiry');
 foreach(['https://attacker.invalid','https://chatgpt.com.attacker.invalid','null'] as $origin)verifyRefreshHttp(refreshMcp($fresh['access_token'],$origin)['status']===403,'Unknown or opaque Origin cannot access MCP');
 $r=refreshHttp('/api/oauth/token',['grant_type'=>'refresh_token','client_id'=>$client,'refresh_token'=>$fresh['refresh_token']],null,'https://chatgpt.com');verifyRefreshHttp($r['status']===200,'ChatGPT-origin refresh succeeds with valid credentials');
 verifyRefreshHttp(refreshHttp('/api/login',['password'=>'khosra-test-only'],null,'https://chatgpt.com')['status']===403,'ChatGPT origin cannot bypass owner login CSRF protections');
 verifyRefreshHttp(refreshHttp('/api/oauth/authorize',['decision'=>'allow'],null,'https://chatgpt.com')['status']===403,'External Origin cannot submit consent');
 $code=bin2hex(random_bytes(32));$verifier=str_repeat('v',64);$challenge=rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'=');
 $q=$db->prepare('INSERT INTO oauth_codes(code_hash,client_id,redirect_uri,resource,scope,challenge,expires_at) VALUES(?,?,?,?,?,?,?)');$q->execute([hash('sha256',$code),$client,'https://chatgpt.com/connector_platform_oauth_redirect',oauthResource($config),'manuscript.read',$challenge,time()+120]);
 $r=refreshHttp('/api/oauth/token',['grant_type'=>'authorization_code','client_id'=>$client,'redirect_uri'=>'https://chatgpt.com/connector_platform_oauth_redirect','code'=>$code,'code_verifier'=>$verifier],null,'https://chatgpt.com');verifyRefreshHttp($r['status']===200&&$r['json']['resource']===oauthResource($config),'Authorization-code exchange inherits only the PKCE grant-bound audience when omitted');
 $r=refreshHttp('/.well-known/oauth-authorization-server');verifyRefreshHttp(($r['json']['khosra_auth_revision']??null)===KHOSRA_AUTH_REVISION&&str_contains($r['headers'],strtolower(KHOSRA_AUTH_REVISION)),'Public discovery identifies the installed auth implementation');
 $r=refreshMcp(str_repeat('a',64));verifyRefreshHttp($r['status']===401&&str_contains($r['headers'],'x-khosra-request-id:'),'Invalid credentials expose a safe diagnostic correlation ID');
 $logs=array_values(array_filter(file($root.'/auth.log')?:[],fn($line)=>str_contains($line,'[Khosra auth ')));
 verifyRefreshHttp(count($logs)>0,'Authentication failures are diagnosable in the hosting PHP error log');
 $log=implode('',$logs);foreach([$fresh['access_token'],$fresh['refresh_token'],$next['access_token'],$next['refresh_token'],'khosra-test-only',$verifier,$code] as $secret)verifyRefreshHttp(!str_contains($log,$secret),'Authentication diagnostics omit credentials');
 verifyRefreshHttp(oauthBearer(['HTTP_AUTHORIZATION'=>'','REDIRECT_HTTP_AUTHORIZATION'=>'bEaReR  abc123  '])==='abc123','Empty CGI headers fall back to preserved Authorization');
 verifyRefreshHttp(oauthBearer(['HTTP_AUTHORIZATION'=>"Bearer abc\r\nInjected: value"])===null,'Bearer parser rejects header injection');
 verifyRefreshHttp(oauthBearer(['HTTP_AUTHORIZATION'=>'Basic abc','REDIRECT_HTTP_AUTHORIZATION'=>'Bearer fallback'])===null,'A conflicting primary auth scheme cannot be bypassed with a fallback');
 echo "$count additional OAuth refresh HTTP checks passed.\n";
}finally{
 if(is_resource($process)){proc_terminate($process);proc_close($process);}unset($q,$db);
 $files=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);foreach($files as $file){if($file->isDir())rmdir($file->getPathname());else unlink($file->getPathname());}rmdir($root);
}
