import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

const prose =
  "Behutsam umrühren — Gemüse, Öl und Gewürze bleiben gleichmäßig verteilt. 続けて混ぜる 🥣. ";
const original = `Linsen vorsichtig rühren. ${prose.repeat(55)}Mit Salz servieren.`;
const expected = original.replace(/^Linsen/, "200g Linsen");

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 320, height: 568 },
  { name: "landscape", width: 844, height: 390 },
  { name: "zoom", width: 720, height: 450 },
]) {
  test(`highlighted ingredient quantities retain all multilingual text on ${viewport.name}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const id = randomUUID();
    const title = `Lesbare Zutaten ${id.slice(0, 8)}`;
    const recipe = {
      title,
      description: "Synthetic readability fixture",
      servings: 2,
      minutes: 0,
      ingredients: [
        { name: "Linsen", amount: 200, unit: "g" },
        { name: "Salz", amount: null, unit: "" },
      ],
      steps: [original],
      image: "",
      source: "",
      category: "Test",
      archived: false,
    };
    expect(original.length).toBeLessThanOrEqual(5000);
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
                data: recipe,
              },
            ],
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/");
    await expect(
      page.getByText("Alles synchronisiert", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Gerichte", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await page
      .locator("dialog")
      .getByRole("button", { name: "Kochen", exact: true })
      .click();
    const dialog = page.locator("dialog.fullscreen");
    const text = dialog.locator(".cook-step-text");
    const indicator = dialog.locator(".cook").getByText(/^Seite \d+ von \d+$/);
    await expect(indicator).toBeVisible();
    const count = Number(
      (await indicator.textContent())!.match(/von (\d+)/)![1],
    );
    expect(count).toBeGreaterThan(1);
    await expect(
      text.locator("mark.cook-ingredient").filter({ hasText: "200g Linsen" }),
    ).toHaveCount(1);
    const pages: string[] = [];
    for (let index = 0; index < count; index++) {
      await expect(indicator).toHaveText(`Seite ${index + 1} von ${count}`);
      const geometry = await text.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = element.closest(".cook-step")!.getBoundingClientRect();
        const rect = range.getBoundingClientRect();
        const dialog = element.closest("dialog")!;
        return {
          gaps: [
            rect.left - bounds.left,
            rect.top - bounds.top,
            bounds.right - rect.right,
            bounds.bottom - rect.bottom,
          ],
          overflow: dialog.scrollHeight - dialog.clientHeight,
          horizontal: dialog.scrollWidth - dialog.clientWidth,
        };
      });
      for (const gap of geometry.gaps) expect(gap).toBeGreaterThanOrEqual(-1);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.horizontal).toBeLessThanOrEqual(1);
      for (const control of await dialog
        .locator(".cook-nav button, .close")
        .all()) {
        const rect = (await control.boundingBox())!;
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
      }
      pages.push((await text.textContent())!);
      if (
        index === 0 &&
        ["desktop", "mobile", "landscape"].includes(viewport.name)
      )
        await page.screenshot({
          path: `test-results/cook-ingredients-${viewport.name}.png`,
        });
      if (index < count - 1)
        await dialog
          .getByRole("button", { name: "Nächste Textseite", exact: true })
          .click();
    }
    expect(pages.join("")).toBe(expected);
    await expect(
      text.locator("mark.cook-ingredient").filter({ hasText: "Salz" }),
    ).toHaveCount(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const { rows } = await (await request.get("/api/state")).json();
    expect(rows.find((row: { id: string }) => row.id === id).data).toEqual(
      recipe,
    );
  });
}
