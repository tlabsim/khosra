<?php
// Run only against the extracted portable test installation on localhost:8081.
declare(strict_types=1);
$count=0;
foreach(['/khosra.config.php','/khosra.config.example.php','/KHOSRA.CONFIG.PHP','/khosra-server/lib.php','/khosra-server/bootstrap.php','/khosra-server/schema.sqlite.php','/khosra-server/guide.php','/khosra-server/proposal-edits.php','/khosra-server/.htaccess','/khosra-server/'] as $path){
 $body=file_get_contents('http://127.0.0.1:8081'.$path,false,stream_context_create(['http'=>['ignore_errors'=>true,'timeout'=>10]]));
 if(!preg_match('/\s403\s/',$http_response_header[0]??'')||str_contains($body,'khosra-test-only')||str_contains($body,'<?php'))throw new RuntimeException('Portable file protection failed: '.$path);
 echo 'PASS: HTTP access denied '.$path.PHP_EOL;$count++;
}
foreach(['/api/mcp'=>401,'/.well-known/oauth-protected-resource'=>200,'/.well-known/oauth-authorization-server'=>200,'/guest'=>200] as $path=>$expected){
 $body=file_get_contents('http://127.0.0.1:8081'.$path,false,stream_context_create(['http'=>['ignore_errors'=>true,'timeout'=>10]]));
 if(!preg_match('/\s'.$expected.'\s/',$http_response_header[0]??''))throw new RuntimeException('Portable route failed: '.$path);
 if($path==='/api/mcp'&&!array_filter($http_response_header,fn($h)=>str_starts_with(strtolower($h),'www-authenticate: bearer resource_metadata=')))throw new RuntimeException('Missing MCP challenge.');
 echo 'PASS: Portable route '.$path.PHP_EOL;$count++;
}
echo "$count portable Apache checks passed.\n";
