import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const html = execFileSync(
  "php",
  ["-d", "xdebug.mode=off", "server/tests/consent-render.php"],
  { encoding: "utf8" },
);
const browser = await chromium.launch();
try {
  for (const profile of [
    { viewport: { width: 1280, height: 800 } },
    devices["Pixel 7"],
  ]) {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    for (const decision of ["allow", "deny", "enter"]) {
      await page.route("https://consent.example/**", async (route) => {
        if (route.request().url().endsWith("favicon.svg")) {
          await route.fulfill({
            path: fileURLToPath(
              new URL("../public/favicon.svg", import.meta.url),
            ),
            contentType: "image/svg+xml",
          });
        } else if (route.request().url().includes("oauth-consent.js")) {
          await route.fulfill({
            path: fileURLToPath(
              new URL("../server/public/oauth-consent.js", import.meta.url),
            ),
            contentType: "text/javascript",
          });
        } else await route.fulfill({ body: html, contentType: "text/html" });
      });
      await page.goto("https://consent.example/");
      assert.equal(
        await page.getByRole("heading", { name: "Connect to Khosra" }).count(),
        1,
      );
      assert.equal(await page.locator(".permissions li").count(), 2);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (decision === "allow")
        await page.screenshot({
          path: `test-results/consent-${profile.viewport.width}.png`,
          fullPage: true,
        });
      await page.locator("#consent-password").fill("fixture-password");
      await page.locator("#reveal-password").click();
      assert.equal(
        await page.locator("#consent-password").getAttribute("type"),
        "text",
      );
      await page.locator("#reveal-password").click();
      assert.equal(
        await page.locator("#consent-password").getAttribute("type"),
        "password",
      );
      const result = await page.evaluate((decision) => {
        const form = document.querySelector("form");
        let accepted = 0;
        form.addEventListener("submit", (event) => {
          if (!event.defaultPrevented) accepted++;
          event.preventDefault();
        });
        const button =
          decision === "enter"
            ? undefined
            : form.querySelector(`[value="${decision}"]`);
        form.requestSubmit(button);
        form.requestSubmit();
        return {
          accepted,
          decision: new FormData(form).get("decision"),
          disabled: [...form.querySelectorAll('button[name="decision"]')].every(
            (b) => b.disabled,
          ),
          busy: form.getAttribute("aria-busy"),
          status: document.querySelector("#connection-status").hidden,
        };
      }, decision);
      assert.deepEqual(result, {
        accepted: 1,
        decision: decision === "deny" ? "deny" : "allow",
        disabled: true,
        busy: "true",
        status: false,
      });
    }
    await context.close();
  }
  console.log(
    "PASS: six desktop/mobile Allow, Cancel and Enter cases preserve decisions, block duplicate submission, expose progress and toggle password visibility.",
  );
} finally {
  await browser.close();
}
