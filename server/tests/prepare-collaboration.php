<?php
// Test-only configuration; never reads or modifies server/config.php.
declare(strict_types=1);
if(!in_array('--isolated-mysql', $argv, true))throw new RuntimeException('Requires --isolated-mysql and a disposable MySQL server on port 33319.');
$root=__DIR__.'/.sharing-runtime';
if(!is_dir($root.'/public/api')&&!mkdir($root.'/public/api',0777,true))throw new RuntimeException('Cannot create test fixture.');
foreach(['lib.php','oauth.php','sharing.php','guide.php'] as $name)copy(dirname(__DIR__).'/'.$name,$root.'/'.$name);
copy(dirname(__DIR__).'/public/api/index.php',$root.'/public/api/index.php');
$config=['dsn'=>'mysql:host=127.0.0.1;port=33319;dbname=khosra_test;charset=utf8mb4','db_user'=>'root','db_password'=>'','origin'=>'https://khosra.example.com','owner_password_hash'=>password_hash('khosra-test-only',PASSWORD_DEFAULT),'tool_token_hash'=>'','oauth_redirect_allowlist'=>['https://chatgpt.com/connector_platform_oauth_redirect']];
file_put_contents($root.'/config.php','<?php return '.var_export($config,true).';');
file_put_contents($root.'/audit-router.php', <<<'ROUTER'
<?php
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(str_starts_with($path,'/.well-known/'))$_GET['discovery']=basename($path);
require __DIR__.'/public/api/index.php';
ROUTER);
$http=file_get_contents(__DIR__.'/http.php');
$http=str_replace(["dirname(__DIR__).'/lib.php'","dirname(__DIR__).'/oauth.php'","dirname(__DIR__).'/config.php'"],["__DIR__.'/lib.php'","__DIR__.'/oauth.php'","__DIR__.'/config.php'"],$http);
file_put_contents($root.'/audit-http.php',$http);
echo "Isolated collaboration HTTP fixture prepared. Never deploy this directory.\n";
