import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const html = await readFile("dist/index.html");
const hash = createHash("sha256").update(html).digest("hex").slice(0, 12);
const sw = await readFile("dist/sw.js", "utf8");
await writeFile(
  "dist/sw.js",
  sw.replace("khosra-shell-v2", "khosra-shell-" + hash),
);
await mkdir("dist/api", { recursive: true });
await copyFile("server/public/api/index.php", "dist/api/index.php");
await copyFile("server/public/.htaccess", "dist/.htaccess");
await copyFile("server/public/oauth-consent.js", "dist/oauth-consent.js");
console.log(
  "FTP webroot prepared in dist/. Keep server configuration and lib.php outside the document root.",
);
const notices = [];
for (const name of [
  "react",
  "react-dom",
  "scheduler",
  "dexie",
  "zod",
  "@phosphor-icons/react",
]) {
  const manifest = JSON.parse(
    await readFile(`node_modules/${name}/package.json`, "utf8"),
  );
  let license;
  for (const filename of ["LICENSE", "LICENSE.txt", "LICENSE.md"]) {
    try {
      license = await readFile(`node_modules/${name}/${filename}`, "utf8");
      break;
    } catch {
      /* Try standard license filenames. */
    }
  }
  if (!license) throw Error(`Missing distributed license for ${name}`);
  notices.push(`${name} ${manifest.version}\n${"=".repeat(50)}\n${license}`);
}
await writeFile("dist/THIRD-PARTY-NOTICES.txt", notices.join("\n\n"));
