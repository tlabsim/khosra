<?php
// Explicit local test router; no production endpoint uses this fixture login.
if(getenv('KHOSRA_SHARING_TEST')!=='1'){http_response_code(404);exit;}
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if($path==='/test-owner'){
 if(($_SERVER['HTTP_X_TEST_SECRET']??'')!=='local-sharing-fixture'){http_response_code(404);exit;}
 ini_set('session.use_strict_mode','1');session_name('khosra_owner');session_set_cookie_params(['httponly'=>true,'secure'=>false,'samesite'=>'Strict','path'=>'/api']);session_start();session_regenerate_id(true);$_SESSION=['owner'=>true,'last'=>time(),'csrf'=>bin2hex(random_bytes(24))];header('Content-Type: application/json');echo json_encode(['csrf'=>$_SESSION['csrf']]);exit;
}
require __DIR__.'/.sharing-runtime/public/api/index.php';
