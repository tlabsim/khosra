"""Build an FTP handoff archive. Run npm run build and checks first."""
from pathlib import Path
import hashlib, zipfile
root=Path(__file__).resolve().parent.parent
out=root/'releases';out.mkdir(exist_ok=True)
archive=out/'khosra-0.2.0-ftp.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted((root/'dist').rglob('*')):
  if p.is_file():z.write(p,'webroot/'+str(p.relative_to(root/'dist')))
 for name in ['lib.php','oauth.php','sharing.php','guide.php','config.example.php']:
  z.write(root/'server'/name,'private/'+name)
 z.writestr('private/.htaccess','Require all denied\n')
 z.write(root/'server/schema.sql','database/schema.sql')
 z.write(root/'server/sharing-schema.sql','database/sharing-upgrade.sql')
 for name in ['DEPLOYMENT.md','CHATGPT-CONNECTION.md','SHARING.md','LIMITATIONS.md','VERIFICATION.md','COLLABORATION-AUDIT.md']:
  p=root/'docs'/name
  if p.exists():z.write(p,'instructions/'+name)
 z.writestr('START-HERE.txt','KHOSRA FTP HANDOFF\n\n1. Export current Khosra archives and back up server data before updating.\n2. Read instructions/DEPLOYMENT.md.\n3. Fresh install: create MySQL tables with database/schema.sql and initialize the workspace row. Existing install: apply database/sharing-upgrade.sql for reader invitations.\n4. Upload private/ OUTSIDE all public document roots; rename config.example.php to config.php and configure secrets locally.\n5. Set the private file paths at the top of webroot/api/index.php to the actual private directory.\n6. Upload webroot/ contents (including .htaccess) to your domain document root.\n7. Log in under Settings, upload the workspace, then connect ChatGPT using OAuth.\n8. Verify access, backups, conflicts, and the real ChatGPT voice workflow before relying on the system.\n\nNever upload private configuration, source archives, or SQL into a public directory. No real server credentials are included.\n')
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/(archive.name+'.sha256')).write_text(checksum+'  '+archive.name+'\n')
print(f'{archive}\nSHA-256: {checksum}')

# Single-root portable installation. Existing khosra.config.php/data are never packaged.
portable=out/'khosra-0.2.0-upload-extract.zip'
guard="\nif(!defined('KHOSRA_DEPLOYMENT')){http_response_code(404);exit;}\n"
def guarded(source):
 return source.replace('declare(strict_types=1);','declare(strict_types=1);'+guard,1)
api=(root/'server/public/api/index.php').read_text()
replacements={
 "require dirname(__DIR__,2).'/lib.php';":"define('KHOSRA_DEPLOYMENT',true);\nrequire dirname(__DIR__).'/khosra-server/lib.php';\nrequire dirname(__DIR__).'/khosra-server/bootstrap.php';",
 "require dirname(__DIR__,2).'/oauth.php';":"require dirname(__DIR__).'/khosra-server/oauth.php';",
 "require dirname(__DIR__,2).'/sharing.php';":"require dirname(__DIR__).'/khosra-server/sharing.php';",
 "$file=dirname(__DIR__,2).'/config.php';if(!is_file($file))respond(['error'=>'Private server is not configured. Local workspace remains available.','code'=>'server_not_configured'],503);$config=require $file;":"$file=dirname(__DIR__).'/khosra.config.php';$config=khosraDeploymentConfig($file);",
 " if(isset($_GET['discovery'])":" khosraPrepareDatabase($db,$config,$path,$method,$body);\n if(isset($_GET['discovery'])",
}
for old,new in replacements.items():
 assert api.count(old)==1, f'Portable API transformation drifted: {old}'
 api=api.replace(old,new,1)
with zipfile.ZipFile(portable,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted((root/'dist').rglob('*')):
  if p.is_file() and str(p.relative_to(root/'dist')) not in ['api/index.php','.htaccess']:
   z.write(p,str(p.relative_to(root/'dist')))
 z.writestr('api/index.php',api)
 htaccess=(root/'server/public/.htaccess').read_text().replace('RewriteEngine On','RewriteEngine On\n# Portable backend/config must never be served directly.\nRewriteRule ^(?:khosra-server(?:/|$)|khosra\\.config(?:\\.[^/]*)?$) - [F,L,NC]')
 z.writestr('.htaccess',htaccess)
 z.writestr('khosra-server/.htaccess','Require all denied\n')
 for name in ['lib.php','oauth.php','sharing.php','guide.php']:
  z.writestr('khosra-server/'+name,guarded((root/'server'/name).read_text()))
 z.writestr('khosra-server/bootstrap.php',guarded((root/'server/deployment/bootstrap.php').read_text()))
 for name in ['schema','schema.sqlite']:
  sql=(root/'server'/f'{name}.sql').read_text()
  z.writestr('khosra-server/'+name+'.php',"<?php\ndeclare(strict_types=1);"+guard+"return <<<'KHOSRA_SCHEMA'\n"+sql+"\nKHOSRA_SCHEMA;\n")
 z.write(root/'server/deployment/config.example.php','khosra.config.example.php')
 z.writestr('START-HERE.txt','KHOSRA PORTABLE INSTALL\n\n1. Back up existing browser manuscripts and server data.\n2. Upload this ZIP to your HTTPS website document root, extract it there, then remove the uploaded ZIP. Keep hidden .htaccess files.\n3. Rename khosra.config.example.php to khosra.config.php. Set origin and a unique owner_password (16+ characters).\n4. Open Khosra Settings and sign in. SQLite tables are created on the first correct owner sign-in. No SQL import or database account needed.\n5. Upload your local workspace, then connect your chat client through OAuth.\n\nRequires PHP 8.2+, PDO SQLite, HTTPS and Apache/LiteSpeed .htaccess/rewrite support. Backend/config HTTP requests must be denied. SQLite data is automatically placed outside the website directory; if hosting disallows that location, set data_dir to an existing writable directory outside ALL public roots. Config is a server secret. Future ZIPs never contain khosra.config.php or the database.\n\nExisting MySQL: retain your prior private configuration credentials in khosra.config.php; do not switch an existing database silently. A workspace archive/upload moves manuscript/history, but not reading links, reader feedback or OAuth credentials. Back up those separately.\n\nBackup: stop server writes and copy the private data directory, or use a SQLite-consistent backup. Do not copy a live database casually. Never upload database files into the webroot.\n')
digest=hashlib.sha256(portable.read_bytes()).hexdigest()
(out/(portable.name+'.sha256')).write_text(digest+'  '+portable.name+'\n')
print(f'{portable}\nSHA-256: {digest}')
