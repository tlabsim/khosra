import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  for (const profile of [
    { viewport: { width: 1280, height: 800 } },
    devices["Pixel 7"],
  ]) {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    for (const decision of ["allow", "deny", "enter"]) {
      await page.goto("about:blank");
      await page.setContent(
        `<form action="/api/oauth/authorize" method="post"><input id="consent-password" type="password" name="password" required><button id="reveal-password" type="button" hidden>Show</button><button name="decision" value="allow">Allow connection</button><button name="decision" value="deny" formnovalidate>Cancel</button><p id="connection-status" role="status" hidden></p></form>`,
      );
      await page.addScriptTag({
        path: fileURLToPath(
          new URL("../server/public/oauth-consent.js", import.meta.url),
        ),
      });
      await page.locator("input").fill("fixture-password");
      await page.locator("#reveal-password").click();
      assert.equal(await page.locator("input").getAttribute("type"), "text");
      await page.locator("#reveal-password").click();
      assert.equal(
        await page.locator("input").getAttribute("type"),
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
