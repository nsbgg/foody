import { test, expect, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

async function fits(locator: Locator) {
  await expect(locator).toBeVisible();
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: innerWidth,
      height: innerHeight,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tiny", width: 320, height: 568 },
  { name: "landscape", width: 844, height: 390 },
  { name: "zoom", width: 720, height: 450 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`cooking completion fits ${viewport.name} and supports restart and the weekly plan`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const id = randomUUID();
    const title = `Kochabschluss ${id.slice(0, 8)}`;
    expect(
      (
        await request.post("/api/sync", {
          data: {
            operations: [
              {
                opId: randomUUID(),
                id,
                kind: "recipe",
                baseRev: 0,
                data: {
                  title,
                  description: "Synthetic completion fixture",
                  servings: 2,
                  minutes: 1,
                  ingredients: [],
                  steps: ["Das Gericht 1 Minute ruhen lassen."],
                  image: "",
                  source: "",
                  category: "Test",
                  archived: false,
                },
              },
            ],
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/");
    await expect(
      page.getByText("Alles synchronisiert", { exact: true }),
    ).toHaveText("Alles synchronisiert");
    await page.getByRole("button", { name: "Gerichte", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await page
      .locator("dialog")
      .getByRole("button", { name: "Kochen", exact: true })
      .click();
    const dialog = page.locator("dialog.fullscreen");
    if (viewport.name === "desktop") {
      await dialog.locator(".cook-timer-chip").click();
      const timer = page.locator(".cook-panel-timer:modal");
      await timer
        .getByRole("button", { name: "Timer starten", exact: true })
        .click();
      await timer
        .getByRole("button", { name: "Minimieren", exact: true })
        .click();
    }
    await dialog.getByRole("button", { name: "Fertig", exact: true }).click();
    const complete = dialog.locator(".cook-complete");
    await expect(
      complete.getByRole("heading", { name: "Guten Appetit!", exact: true }),
    ).toBeVisible();
    await fits(complete);
    await expect(complete.getByRole("status")).toContainText(
      "Dein Essen ist fertig.",
    );
    await expect(complete.getByRole("status")).toContainText(
      "Zeit zum Genießen.",
    );
    await fits(complete.locator("svg").first());
    await expect(complete.locator("svg").first()).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    for (const content of await complete.locator("h3, p").all())
      await fits(content);
    for (const button of await dialog
      .locator(".cook-nav button, :scope > .close")
      .all())
      await fits(button);
    expect(
      await dialog.evaluate((element) => ({
        vertical: element.scrollHeight - element.clientHeight,
        horizontal: element.scrollWidth - element.clientWidth,
      })),
    ).toEqual({ vertical: 0, horizontal: 0 });
    await expect(dialog.getByText("Geschafft", { exact: true })).toBeVisible();
    if (viewport.name === "desktop")
      await expect(dialog.locator(".cook-timer-chip.active")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (["desktop", "tiny", "landscape"].includes(viewport.name))
      await page.screenshot({
        path: `test-results/cook-complete-${viewport.name}.png`,
      });
    await dialog
      .getByRole("button", { name: "Noch einmal", exact: true })
      .click();
    await expect(complete).toHaveCount(0);
    await expect(
      dialog.getByText("Schritt 1 von 1", { exact: true }),
    ).toBeVisible();
    await expect(dialog.locator(".cook-step-text")).toHaveText(
      "Das Gericht 1 Minute ruhen lassen.",
    );
    await dialog.getByRole("button", { name: "Fertig", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Zum Wochenplan", exact: true })
      .click();
    await expect(page.locator("dialog:modal")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Wochenplan", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });
}
