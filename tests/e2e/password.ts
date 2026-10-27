import { expect, type Page } from "@playwright/test";

export async function checkPasswordReveal(
  page: Page,
  label: string,
  value: string,
) {
  const input = page.getByLabel(label, { exact: true });
  await expect(input).toHaveAttribute("type", "password");
  await input.fill(value);
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveValue(value);
  const hide = page.getByRole("button", { name: "Hide password", exact: true });
  await expect(hide).toHaveAttribute("aria-pressed", "true");
  await hide.focus();
  await page.keyboard.press("Space");
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue(value);
}
