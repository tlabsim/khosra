<?php
// Test router only; never deploy tests/.
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(str_starts_with($path,'/.well-known/'))$_GET['discovery']=basename($path);
require dirname(__DIR__).'/public/api/index.php';
