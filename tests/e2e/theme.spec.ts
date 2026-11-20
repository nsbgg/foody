import { test, expect, type Page } from "./fixtures.ts";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
}

test("theme follows the system until a saved choice overrides it", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ready(page);
  const root = page.locator("html");
  const toggle = page.getByRole("button", { name: "Dunkelmodus", exact: true });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await toggle.click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await toggle.click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#101a15",
  );
});

test("theme toggle still works when local storage is unavailable", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
  });
  await ready(page);
  await page.getByRole("button", { name: "Dunkelmodus", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const width of [1440, 390]) {
  test(`dark theme covers app views and cooking panels at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await ready(page);
    for (const view of ["Wochenplan", "Gerichte", "Einkaufsliste"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await page.getByRole("button", { name: "Neues Gericht" }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");

    const { rows } = await (await request.get("/api/state")).json();
    const template = rows.find((row: any) => row.kind === "recipe").data;
    const id = randomUUID();
    const title = `Darkmode ${id.slice(0, 8)}`;
    const response = await request.post("/api/sync", {
      data: {
        operations: [
          {
            opId: randomUUID(),
            id,
            kind: "recipe",
            baseRev: 0,
            data: {
              ...template,
              title,
              ingredients: [{ name: "Pasta", amount: 250, unit: "g" }],
              steps: ["Die Pasta 1 Minute kochen."],
            },
          },
        ],
      },
    });
    expect(response.ok()).toBe(true);
    await ready(page);
    await page.getByRole("button", { name: "Gerichte", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Kochen", exact: true }).click();
    const cook = page.locator(".dialog.fullscreen");
    await expect(cook).toHaveCSS("background-color", "rgb(16, 26, 21)");
    await expect(
      cook.getByRole("button", { name: "Dunkelmodus" }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await cook.getByRole("button", { name: "Zutaten", exact: true }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await cook.getByRole("button", { name: "Timer", exact: true }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    const toggle = cook.getByRole("button", {
      name: "Dunkelmodus",
      exact: true,
    });
    await toggle.click();
    await expect(cook).toHaveCSS("background-color", "rgb(244, 249, 246)");
    await toggle.click();
    await cook.getByRole("button", { name: "Fertig", exact: true }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/dark-cook-${width}.png` });
    await cook
      .getByRole("button", { name: "Zum Wochenplan", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Dunkelmodus", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".day-column:visible").first()).toHaveCSS(
      "background-color",
      width === 390 ? "rgb(24, 38, 31)" : "rgba(0, 0, 0, 0)",
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/dark-week-${width}.png` });
  });
}
