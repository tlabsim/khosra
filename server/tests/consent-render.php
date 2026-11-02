<?php
// Synthetic consent markup for browser verification; no live client, cookies or secrets.
declare(strict_types=1);
require dirname(__DIR__).'/oauth.php';
$read=oauthConsentHtml(['manuscript.read'],str_repeat('a',48),'<Untrusted client>');
if(str_contains($read,'Save proposals and planning material')||!str_contains($read,'Read your writing')||!str_contains($read,'&lt;Untrusted client&gt;')||str_contains($read,'<Untrusted client>'))throw new RuntimeException('Consent scopes or escaping regressed.');
echo oauthConsentHtml(['manuscript.read','manuscript.propose'],str_repeat('a',48),'ChatGPT');
