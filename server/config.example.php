<?php
// Copy to config.php OUTSIDE the public document root. Never upload this inside public/.
return [
 'dsn' => 'mysql:host=localhost;dbname=khosra;charset=utf8mb4',
 'db_user' => 'khosra',
 'db_password' => 'REPLACE_ME',
 'owner_password_hash' => 'GENERATE_WITH_PASSWORD_HASH',
 'tool_token_hash' => '', // Optional static-token hash; OAuth needs no static token
 'oauth_redirect_allowlist' => ['https://chatgpt.com/connector_platform_oauth_redirect'],
 'origin' => 'https://khosra.example.com',
];
