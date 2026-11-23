import { test, expect } from "./fixtures.ts";

for (const width of [390, 1226, 3440, 5120]) {
  test(`page frames stay centered and usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto("/");
    await expect(
      page.locator(".stack-list .recipe-card").first(),
    ).toBeVisible();
    const frame = await page.locator("main").boundingBox();
    expect(Math.abs(frame!.x + frame!.width / 2 - width / 2)).toBeLessThan(2);
    expect(frame!.width).toBeLessThanOrEqual(2240);
    if (width >= 3440) {
      expect(frame!.width).toBe(2240);
      const nav = await page
        .locator('nav[aria-label="Hauptnavigation"]')
        .boundingBox();
      expect(Math.abs(nav!.x + nav!.width / 2 - width / 2)).toBeLessThan(2);
      await page.locator(".household").click();
      const menu = await page.locator(".account-menu").boundingBox();
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(
        frame!.x + frame!.width,
      );
      await page.keyboard.press("Escape");
    }
    await page
      .getByRole("button", { name: "Einkaufsliste", exact: true })
      .click();
    const list = await page.locator(".shopping-page").boundingBox();
    const heading = await page.locator(".shopping-heading").boundingBox();
    expect(Math.abs(list!.x + list!.width / 2 - width / 2)).toBeLessThan(2);
    expect(list!.width).toBeLessThanOrEqual(850);
    expect(Math.abs(heading!.x - list!.x)).toBeLessThan(2);
    expect(Math.abs(heading!.width - list!.width)).toBeLessThan(2);
    await page.getByRole("button", { name: "Gerichte", exact: true }).click();
    const card = await page
      .locator(".recipe-grid .recipe-card")
      .first()
      .boundingBox();
    expect(card!.width).toBeLessThan(550);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 3440) {
      await page.screenshot({ path: "test-results/ultrawide-recipes.png" });
      await page
        .getByRole("button", { name: "Wochenplan", exact: true })
        .click();
      await page
        .locator(".meal")
        .first()
        .getByRole("button", { name: /kochen$/ })
        .click();
      const cook = await page.locator(".cook").boundingBox();
      const close = await page
        .locator(".dialog.fullscreen > .close")
        .boundingBox();
      expect(Math.abs(cook!.x + cook!.width / 2 - width / 2)).toBeLessThan(2);
      expect(close!.x + close!.width).toBeLessThanOrEqual(
        cook!.x + cook!.width + 1,
      );
    }
  });
}
