<?php
declare(strict_types=1);
if(!defined('KHOSRA_DEPLOYMENT')){http_response_code(404);exit;}


function khosraDeploymentConfig(string $file):array {
    if(!is_file($file))respond(['error'=>'Rename khosra.config.example.php to khosra.config.php and configure your server.','code'=>'server_not_configured'],503);
    $config=require $file;
    $origin=is_array($config)?($config['origin']??''):'';
    $parts=is_string($origin)?parse_url($origin):false;
    $password=is_array($config)?($config['owner_password']??''):'';
    $hash=is_array($config)?($config['owner_password_hash']??''):'';
    if(!is_array($config)||!$parts||($parts['scheme']??'')!=='https'||empty($parts['host'])||isset($parts['user'])||isset($parts['pass'])||isset($parts['query'])||isset($parts['fragment'])||!in_array($parts['path']??'',['','/'],true)
        ||(!(is_string($hash)&&password_get_info($hash)['algo']!==null)&&(!is_string($password)||strlen($password)<16||strlen($password)>1000||str_starts_with($password,'REPLACE_')))) {
        respond(['error'=>'Set your HTTPS origin and a unique owner password of at least 16 characters in khosra.config.php.','code'=>'server_not_configured'],503);
    }
    if(empty($config['dsn'])){
        $webroot=realpath(dirname($file));
        $base=dirname($webroot);
        for($parent=$webroot;dirname($parent)!==$parent;$parent=dirname($parent))if(in_array(strtolower(basename($parent)),['public_html','htdocs','httpdocs','wwwroot','www'],true)){$base=dirname($parent);break;}
        $directory=$config['data_dir']??'';
        if(!is_string($directory))fail(503,'Invalid private data directory.');
        if($directory==='')$directory=$base.'/khosra-data-'.substr(hash('sha256',str_replace('\\','/',$webroot)),0,12);
        // Resolve the existing parent first, so a symlink cannot hide a public path.
        $parent=realpath(dirname($directory));
        $normalize=fn(string $path)=>strtolower(str_replace('\\','/',rtrim($path,'/\\')));
        if($parent===false||$normalize($parent)===$normalize($webroot)||str_starts_with($normalize($parent).'/', $normalize($webroot).'/'))fail(503,'Set data_dir to a writable private directory outside the website folder.');
        if(!is_dir($directory)&&!mkdir($directory,0700,true))fail(503,'Cannot create private data directory. Set data_dir to a writable private location.');
        $directory=realpath($directory);
        if($directory===false||$normalize($directory)===$normalize($webroot)||str_starts_with($normalize($directory).'/', $normalize($webroot).'/')||!is_writable($directory))fail(503,'Private data directory must be writable and outside the website folder.');
        if(!is_file($directory.'/.htaccess'))file_put_contents($directory.'/.htaccess',"Require all denied\n");
        $database=$directory.'/khosra.sqlite';
        if(is_link($database))fail(503,'SQLite database must not be a symbolic link.');
        $config['dsn']='sqlite:'.$database;
    }
    if(!is_string($config['dsn'])||(!str_starts_with($config['dsn'],'sqlite:')&&!str_starts_with($config['dsn'],'mysql:')))fail(503,'Unsupported database configuration.');
    if(str_starts_with($config['dsn'],'sqlite:')){
        $path=substr($config['dsn'],7);$parent=realpath(dirname($path));$webroot=realpath(dirname($file));
        $normalize=fn(string $value)=>strtolower(str_replace('\\','/',rtrim($value,'/\\')));
        if($path===''||$path===':memory:'||$parent===false||is_link($path)||$normalize($parent)===$normalize($webroot)||str_starts_with($normalize($parent).'/', $normalize($webroot).'/'))fail(503,'SQLite must use a private file outside the website folder.');
    }
    $config['origin']=rtrim($origin,'/');
    $config['owner_password_hash']=$hash;
    $config['tool_token_hash']=$config['tool_token_hash']??'';
    $config['oauth_redirect_allowlist']=$config['oauth_redirect_allowlist']??['https://chatgpt.com/connector_platform_oauth_redirect'];
    return $config;
}

function khosraPrepareDatabase(PDO $db,array $config,string $path,string $method,array $body):void {
    // No public installer or unauthenticated DDL. Existing logins retain normal throttling.
    if($path!=='login'||$method!=='POST')return;
    $sqlite=$db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite';
    $required=['workspace','operations','auth_attempts','oauth_clients','oauth_codes','oauth_tokens','reading_grants','reading_sessions','reader_comments'];
    $tables=$db->query($sqlite?"SELECT name FROM sqlite_master WHERE type='table'":'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')->fetchAll(PDO::FETCH_COLUMN);
    $missing=array_diff($required,$tables);
    $rowMissing=!in_array('workspace',$tables,true)||$db->query('SELECT id FROM workspace WHERE id=1')->fetchColumn()===false;
    if(!$missing&&!$rowMissing)return;
    if(!is_string($body['password']??null)||!ownerPasswordMatches($body['password'],$config))fail(401,'Incorrect owner password.');
    $source=__DIR__.($sqlite?'/../schema.sqlite.sql':'/../schema.sql');
    $schema=is_file($source)?file_get_contents($source):require __DIR__.($sqlite?'/schema.sqlite.php':'/schema.php');
    foreach(explode(';',$schema) as $statement)if(trim($statement)!=='')$db->exec($statement);
    $q=$db->prepare(($sqlite?'INSERT OR IGNORE':'INSERT IGNORE').' INTO workspace(id,version,payload) VALUES(1,0,?)');
    $q->execute([json_encode(blank(),JSON_THROW_ON_ERROR)]);
}
