import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { dateKey, monday } from "../../shared/domain.ts";

for (const [name, selector] of [
  ["image", ".meal-layout > .food-art"],
  ["title", ".title-button"],
  ["body", ".meal-category"],
]) {
  test(`planned card drags from its ${name} without opening a dialog`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { rows } = await (await request.get("/api/state")).json();
    const template = rows.find((row: any) => row.kind === "recipe");
    const id = randomUUID();
    const recipe = { ...template.data, title: `Karte ${id.slice(0, 8)}` };
    const response = await request.post("/api/sync", {
      data: {
        operations: [
          {
            opId: randomUUID(),
            id,
            kind: "entry",
            baseRev: 0,
            data: {
              date: dateKey(monday()),
              recipeId: template.id,
              recipe,
              servings: 2,
              order: -1,
              deleted: false,
            },
          },
        ],
      },
    });
    expect(response.ok()).toBe(true);
    await page.goto("/");
    await expect(
      page.getByText("Alles synchronisiert", { exact: true }),
    ).toHaveText("Alles synchronisiert");
    const card = page.locator(`[data-entry="${id}"]`);
    const origin = (await card.locator(selector).boundingBox())!;
    const destination = page.locator(".day-column").last();
    const bounds = (await destination.boundingBox())!;
    await page.mouse.move(
      origin.x + origin.width / 2,
      origin.y + origin.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 85, {
      steps: 15,
    });
    const preview = page.locator(".card-drag-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS("opacity", "0.68");
    await expect(preview.locator("[data-entry]")).toHaveCount(0);
    const firstPosition = (await preview.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2 + 10, bounds.y + 100);
    const nextPosition = (await preview.boundingBox())!;
    expect(nextPosition.x - firstPosition.x).toBeCloseTo(10, 0);
    expect(nextPosition.y - firstPosition.y).toBeCloseTo(15, 0);
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
    await expect(page.locator(".card-drag-source, .drag-handle")).toHaveCount(
      0,
    );
    await expect(destination.locator(`[data-entry="${id}"]`)).toBeVisible();
    await expect(page.locator("dialog:modal")).toHaveCount(0);
    await card.getByRole("button", { name: recipe.title, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: recipe.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Zutaten", exact: true }),
    ).toBeVisible();
    await expect(page.locator("dialog.fullscreen")).toHaveCount(0);
    await page.getByRole("button", { name: "Kochen", exact: true }).click();
    await expect(page.locator("dialog.fullscreen")).toBeVisible();
    await page.keyboard.press("Escape");
    await card
      .getByRole("button", { name: `Ändern: ${recipe.title}`, exact: true })
      .click();
    await expect(page.getByLabel("Portionen", { exact: true })).toBeVisible();
  });
}

test("recipe card image can be dragged and still opened with a normal click", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
  const image = page.locator(".stack-list .image-button").first();
  const destination = page.locator(".day-column").last();
  const before = await destination.locator(".meal").count();
  const origin = (await image.boundingBox())!;
  const bounds = (await destination.boundingBox())!;
  await page.mouse.move(
    origin.x + origin.width / 2,
    origin.y + origin.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 85, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(destination.locator(".meal")).toHaveCount(before + 1);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await image.click();
  await expect(
    page.getByRole("button", { name: "Kochen", exact: true }),
  ).toBeVisible();
});

test("Escape removes the drag preview without scheduling a recipe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const card = page.locator(".stack-list .recipe-card").first();
  await expect(card).toBeVisible();
  const bounds = (await card.boundingBox())!;
  const count = await page.locator(".board .meal").count();
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 60, bounds.y + 20, { steps: 8 });
  await expect(page.locator(".card-drag-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".card-drag-preview, .card-drag-source"),
  ).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".board .meal")).toHaveCount(count);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
});
