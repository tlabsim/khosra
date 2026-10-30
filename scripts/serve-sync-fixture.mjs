// Isolated loopback fixture for cross-language browser/PHP protocol tests.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
const php = process.env.KHOSRA_TEST_PHP || "php";
const prepared = spawnSync(
  php,
  [
    "-d",
    "xdebug.mode=off",
    "-d",
    "memory_limit=512M",
    "server/tests/sync-browser.php",
  ],
  { encoding: "utf8" },
);
if (prepared.status !== 0) throw Error(prepared.stderr || prepared.stdout);
const { root } = JSON.parse(prepared.stdout);
if (!root.replaceAll("\\", "/").includes("/khosra-sync-browser-"))
  throw Error("Unsafe fixture path");
const child = spawn(
  php,
  [
    "-d",
    "xdebug.mode=off",
    "-d",
    "memory_limit=512M",
    "-d",
    "post_max_size=64M",
    "-d",
    `session.save_path=${root}/sessions`,
    "-S",
    "127.0.0.1:18084",
    "-t",
    `${root}/public`,
    `${root}/router.php`,
  ],
  { stdio: "inherit" },
);
const cleanupRoot =
  process.platform === "linux" && /^[a-z]:[\\/]/i.test(root)
    ? `/mnt/${root[0].toLowerCase()}/${root.slice(3).replaceAll("\\", "/")}`
    : root;
let stopping = false;
function stop() {
  if (!stopping) {
    stopping = true;
    child.kill();
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => {
  rmSync(cleanupRoot, { recursive: true, force: true });
  process.exit(stopping ? 0 : (code ?? 1));
});
child.on("error", (error) => {
  rmSync(cleanupRoot, { recursive: true, force: true });
  throw error;
});
