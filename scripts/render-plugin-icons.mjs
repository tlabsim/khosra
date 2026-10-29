// Optional PNG exports for connection-management screens that only accept raster icons.
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "releases");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
  const icons = {};
  for (const theme of ["light", "dark"]) {
    const source = await readFile(
      path.join(root, "plugin/assets", `logomark-${theme}.svg`),
      "utf8",
    );
    icons[theme] = `data:image/svg+xml,${encodeURIComponent(source)}`;
    await page.setContent(
      `<style>body{margin:0}img{display:block;width:256px;height:256px}</style><img alt="Khosra" src="${icons[theme]}">`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    const filename = path.join(output, `khosra-plugin-${theme}.png`);
    await page.screenshot({ path: filename });
    console.log(filename);
  }
  await page.setViewportSize({ width: 640, height: 270 });
  await page.setContent(`<style>
    body{margin:0;display:flex;font:16px sans-serif}
    section{box-sizing:border-box;width:320px;padding:24px;background:#f8f7f0;color:#334238}
    section+section{background:#212121;color:#e6ede0}
    div{display:flex;gap:24px;align-items:center;height:150px}
    img{display:block}
  </style>${["light", "dark"].map((theme) => `<section><p>${theme} theme</p><div><img alt="Khosra, 128px" width="128" height="128" src="${icons[theme]}"><img alt="Khosra, 48px" width="48" height="48" src="${icons[theme]}"></div></section>`).join("")}`);
  await page.locator("img").evaluateAll((images) =>
    Promise.all(images.map((img) => img.decode())),
  );
  await page.screenshot({ path: path.join(output, "khosra-plugin-preview.png") });
} finally {
  await browser.close();
}
