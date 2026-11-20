import { test, expect } from "./fixtures.ts";
import AxeBuilder from "@axe-core/playwright";

test("sync status is only shown in the account popover", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: /Account-Menü/,
  });
  const menu = page.locator("#account-menu");
  const status = menu.locator(".sync-status");
  await expect(status).toHaveText("Alles synchronisiert");
  await expect(status).not.toBeVisible();
  await expect(page.locator("main .sync-status")).toHaveCount(0);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(status).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.press("Enter");
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { name: "Wochenplan", exact: true }).click();
  await expect(menu).not.toBeVisible();
  await trigger.click();
  await expect(menu).toBeVisible();
  await trigger.click();
  await expect(menu).not.toBeVisible();
});
