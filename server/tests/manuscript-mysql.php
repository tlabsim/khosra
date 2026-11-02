<?php
// Optional Windows/Wamp fixture: launches only a disposable loopback MySQL instance.
declare(strict_types=1);
$binary=$argv[1]??'';if(!is_file($binary))throw new RuntimeException('Pass the absolute path to a MySQL mysqld executable.');
$base=str_replace('\\','/',dirname(dirname($binary)));$root=str_replace('\\','/',sys_get_temp_dir()).'/khosra-manuscripts-mysql-'.bin2hex(random_bytes(5));mkdir($root,0700);$data=$root.'/data';mkdir($data,0700);
$server=null;
function mysqlFixtureProcess(array $args,string $root){$pipes=[];$process=proc_open($args,[0=>['pipe','r'],1=>['file',$root.'/mysql.log','a'],2=>['file',$root.'/mysql.log','a']],$pipes);fclose($pipes[0]);return $process;}
try{
 $initialize=mysqlFixtureProcess([$binary,'--no-defaults','--initialize-insecure','--basedir='.$base,'--datadir='.$data,'--console'],$root);
 if(proc_close($initialize)!==0)throw new RuntimeException('Disposable MySQL initialization failed.');
 $socket=stream_socket_server('tcp://127.0.0.1:0');$port=(int)substr(strrchr(stream_socket_get_name($socket,false),':'),1);fclose($socket);
 $server=mysqlFixtureProcess([$binary,'--no-defaults','--basedir='.$base,'--datadir='.$data,'--port='.$port,'--bind-address=127.0.0.1','--mysqlx=0','--skip-log-bin','--console'],$root);
 $db=null;for($i=0;$i<200;$i++){try{$db=new PDO('mysql:host=127.0.0.1;port='.$port,'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);break;}catch(PDOException){usleep(100000);}}
 if(!$db)throw new RuntimeException('Disposable MySQL did not start.');
 $db->exec('CREATE DATABASE khosra_manuscripts_test');$env=getenv();$env['KHOSRA_MANUSCRIPT_TEST_MYSQL']='mysql:host=127.0.0.1;port='.$port.';dbname=khosra_manuscripts_test;charset=utf8mb4';
 $pipes=[];$suite=proc_open([PHP_BINARY,'-d','xdebug.mode=off',__DIR__.'/manuscript-store.php'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,$env);fclose($pipes[0]);$out=stream_get_contents($pipes[1]);$errors=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$status=proc_close($suite);echo $out;if($status!==0)throw new RuntimeException('MySQL manuscript suite failed: '.$errors);
 echo "Manuscript storage suite passed against isolated MySQL.\n";
}finally{
 if(isset($db)&&$db){try{$db->exec('SHUTDOWN');}catch(Throwable){}$db=null;}
 if(is_resource($server)){for($i=0;$i<200;$i++){if(!proc_get_status($server)['running'])break;usleep(100000);}if(proc_get_status($server)['running'])proc_terminate($server);proc_close($server);}
 $entries=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);foreach($entries as $file){if($file->isDir())rmdir($file->getPathname());else unlink($file->getPathname());}rmdir($root);
}
