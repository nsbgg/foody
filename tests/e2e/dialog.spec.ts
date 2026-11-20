import { test, expect } from "./fixtures.ts";

test("recipe dialog closes outside and with Escape while inside clicks stay open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const title = page.locator(".stack-list .title-button").first();
  await title.click();
  const dialog = page.locator("dialog.dialog");
  await expect(dialog).toBeVisible();
  const bounds = (await dialog.boundingBox())!;
  // The dialog's own padding is still inside, even when it is the event target.
  await page.mouse.click(bounds.x + 12, bounds.y + 12);
  await expect(dialog).toBeVisible();
  await page.mouse.move(bounds.x + 12, bounds.y + 12);
  await page.mouse.down();
  await page.mouse.move(8, 8);
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toHaveCount(0);
  await expect(title).toBeFocused();
  await title.press("Enter");
  await expect(dialog).toBeVisible();
  // Embedded browsers can deliver Escape without the native dialog cancel action.
  await dialog.dispatchEvent("keydown", {
    key: "Escape",
    code: "Escape",
    bubbles: true,
    cancelable: true,
  });
  await expect(dialog).toHaveCount(0);
  await expect(title).toBeFocused();
  await title.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(title).toBeFocused();
});
