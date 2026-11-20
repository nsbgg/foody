import { test, expect } from "./fixtures.ts";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { dateKey } from "../../shared/domain.ts";

for (const viewport of [
  { width: 1440, height: 900, colorScheme: "light" as const },
  { width: 320, height: 568, colorScheme: "dark" as const },
]) {
  test(`cooking ingredients can be checked and resumed at ${viewport.width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: viewport.colorScheme });
    const recipeId = randomUUID();
    const entryId = randomUUID();
    const recipe = {
      title: `Zutatencheck ${recipeId.slice(0, 8)}`,
      description: "Synthetic checklist fixture",
      servings: 2,
      minutes: 5,
      ingredients: [
        { name: "Kartoffeln", amount: 500, unit: "g" },
        { name: "Paprika", amount: 2, unit: "Stück" },
        { name: "Zucchini", amount: 1, unit: "Stück" },
        { name: "Feta", amount: 200, unit: "g" },
        { name: "Olivenöl", amount: 2, unit: "EL" },
      ],
      steps: ["Das Gemüse schneiden und garen."],
      image: "",
      source: "",
      category: "Test",
      archived: false,
    };
    const result = await request.post("/api/sync", {
      data: {
        operations: [
          {
            opId: randomUUID(),
            id: recipeId,
            kind: "recipe",
            baseRev: 0,
            data: recipe,
          },
          {
            opId: randomUUID(),
            id: entryId,
            kind: "entry",
            baseRev: 0,
            data: {
              date: dateKey(new Date()),
              recipeId,
              recipe,
              servings: 4,
              order: 0,
              deleted: false,
            },
          },
        ],
      },
    });
    expect(result.ok()).toBe(true);
    const openCook = async () => {
      await page
        .locator(`[data-entry="${entryId}"]`)
        .getByRole("button", { name: `${recipe.title} kochen`, exact: true })
        .click();
      await page
        .locator(".cook")
        .getByRole("button", { name: "Zutaten", exact: true })
        .click();
    };
    await page.goto("/");
    await expect(
      page.getByText("Alles synchronisiert", { exact: true }),
    ).toHaveText("Alles synchronisiert");
    await openCook();
    const panel = page.locator(".cook-panel-ingredients:modal");
    const potato = panel.getByRole("checkbox", {
      name: "1 kg Kartoffeln",
      exact: true,
    });
    await expect(panel.getByRole("checkbox")).toHaveCount(5);
    await potato.focus();
    await potato.press("Space");
    await expect(potato).toBeChecked();
    await panel.getByText("400 g Feta", { exact: true }).click();
    await expect(
      panel.getByRole("checkbox", { name: "400 g Feta" }),
    ).toBeChecked();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/checklist-${viewport.width}.png`,
    });
    await page.keyboard.press("Escape");
    await page
      .locator(".cook")
      .getByRole("button", { name: "Zutaten", exact: true })
      .click();
    await expect(potato).toBeChecked();
    await page.reload();
    await expect(
      page.getByText("Alles synchronisiert", { exact: true }),
    ).toHaveText("Alles synchronisiert");
    await openCook();
    await expect(potato).toBeChecked();
    await expect(
      panel.getByRole("checkbox", { name: "4 Stück Paprika" }),
    ).not.toBeChecked();
    await potato.uncheck();
    await expect(potato).not.toBeChecked();
    await page.keyboard.press("Escape");
    await page
      .locator(".cook")
      .getByRole("button", { name: "Fertig", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Noch einmal", exact: true })
      .click();
    await page
      .locator(".cook")
      .getByRole("button", { name: "Zutaten", exact: true })
      .click();
    await expect(
      panel.getByRole("checkbox", { name: "400 g Feta" }),
    ).not.toBeChecked();
    const { rows } = await (await request.get("/api/state")).json();
    expect(
      rows.find((row: { id: string }) => row.id === recipeId).data,
    ).toEqual(recipe);
  });
}
