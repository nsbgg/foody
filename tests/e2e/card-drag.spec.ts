import {
  test,
  expect,
  type Page,
  type Locator,
  type APIRequestContext,
} from "./fixtures.ts";
import { randomUUID } from "node:crypto";
import { dateKey, monday, type Row } from "../../shared/domain.ts";
import type { RecipeRow } from "../../src/types.ts";
import AxeBuilder from "@axe-core/playwright";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".stack-list .recipe-card").first()).toBeVisible();
}
async function startDrag(page: Page, handle: Locator) {
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 12,
    bounds.y + bounds.height / 2,
    { steps: 4 },
  );
  await expect(page.locator(".card-drag-preview")).toBeVisible();
}
async function addEntry(request: APIRequestContext, archived = false) {
  const { rows }: { rows: Row[] } = await (
    await request.get("/api/state")
  ).json();
  const original = rows.find((row) => row.kind === "recipe") as RecipeRow;
  const recipeId = randomUUID(),
    id = randomUUID();
  const recipe = {
    ...original.data,
    title: `Ziehgericht ${id.slice(0, 8)}`,
    archived,
  };
  const response = await request.post("/api/sync", {
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
          id,
          kind: "entry",
          baseRev: 0,
          data: {
            date: dateKey(monday()),
            recipeId,
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
  return { id, recipeId, recipe };
}

test("planned cards move only from the grip, with a translucent preview and working title", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const data = await addEntry(request);
  await ready(page);
  const card = page.locator(`[data-entry="${data.id}"]`);
  const destination = page.locator(".day-column").last();
  const target = (await destination.boundingBox())!;
  for (const selector of [
    ".meal-category",
    ".meal-layout > .food-art",
    ".title-button",
  ]) {
    const bounds = (await card.locator(selector).boundingBox())!;
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + 85, {
      steps: 12,
    });
    await expect(page.locator(".card-drag-preview")).toHaveCount(0);
    await page.mouse.up();
    await expect(destination.locator(`[data-entry="${data.id}"]`)).toHaveCount(
      0,
    );
  }
  await startDrag(page, card.locator(".card-drag-handle"));
  const preview = page.locator(".card-drag-preview");
  await expect(preview).toHaveCSS("opacity", "0.68");
  await expect(preview.locator("[data-entry]")).toHaveCount(0);
  await page.mouse.move(target.x + target.width / 2, target.y + 85, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(destination.locator(`[data-entry="${data.id}"]`)).toBeVisible();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await card
    .getByRole("button", { name: data.recipe.title, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: data.recipe.title, exact: true }),
  ).toBeVisible();
});

test("stack recipes are scheduled with the grip while their images stay clickable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const card = page.locator(".stack-list .recipe-card").first();
  const destination = page.locator(".day-column").last();
  const before = await destination.locator(".meal").count();
  await startDrag(page, card.locator(".card-drag-handle"));
  const target = (await destination.boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + 85, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(destination.locator(".meal")).toHaveCount(before + 1);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await card.locator(".image-button").click();
  await expect(
    page.getByRole("button", { name: "Kochen", exact: true }),
  ).toBeVisible();
});

for (const archived of [false, true]) {
  test(`returning a planned card preserves its recipe and restores archived=${archived}`, async ({
    page,
    request,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const data = await addEntry(request, archived);
    await ready(page);
    const before = await page.locator(".board .meal").count();
    if (!archived) {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await context.setOffline(true);
    }
    await startDrag(
      page,
      page.locator(`[data-entry="${data.id}"] .card-drag-handle`),
    );
    const stack = page.locator(".recipe-stack");
    await expect(stack).toHaveClass(/accepting-return/);
    const target = (await stack.boundingBox())!;
    await page.mouse.move(target.x + 40, target.y + 20, { steps: 12 });
    await expect(stack).toHaveClass(/return-target/);
    await page.mouse.up();
    await expect(page.locator(".board .meal")).toHaveCount(before - 1);
    await expect(
      page.locator(`.stack-list [data-recipe="${data.recipeId}"]`),
    ).toBeVisible();
    await expect(page.locator("dialog:modal, .card-drag-preview")).toHaveCount(
      0,
    );
    if (!archived) {
      await expect(page.locator(".toast")).toContainText(
        "zurück im Gerichtestapel",
      );
      await page.reload();
      await expect(page.locator(`[data-entry="${data.id}"]`)).toHaveCount(0);
      await expect(
        page.locator(`.stack-list [data-recipe="${data.recipeId}"]`),
      ).toBeVisible();
      await context.setOffline(false);
    }
    await expect
      .poll(async () => {
        const { rows }: { rows: Row[] } = await (
          await request.get("/api/state")
        ).json();
        const recipe = rows.find(
          (row) => row.id === data.recipeId,
        ) as RecipeRow;
        return (
          recipe?.data.archived === false &&
          rows.some(
            (row) =>
              row.id === data.id && "deleted" in row.data && row.data.deleted,
          )
        );
      })
      .toBe(true);
    await page.reload();
    await expect(page.locator(`[data-entry="${data.id}"]`)).toHaveCount(0);
    await expect(
      page.locator(`.stack-list [data-recipe="${data.recipeId}"]`),
    ).toBeVisible();
  });
}

test("recipe library has no grips, drag previews or blocked scrolling", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", { name: "Gerichte", exact: true })
    .click();
  const card = page.locator(".recipe-grid .recipe-card").first();
  await expect(card).toBeVisible();
  await expect(page.locator(".card-drag-handle")).toHaveCount(0);
  await expect(card).toHaveCSS("touch-action", "auto");
  await expect(card).not.toHaveCSS("cursor", "grab");
  const bounds = (await card.boundingBox())!;
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 80, { steps: 10 });
  await expect(page.locator(".card-drag-preview")).toHaveCount(0);
  await page.mouse.up();
});

test("touch grips have generous targets and readable dark-mode cards at 320px", async ({
  browser,
  context,
  baseURL,
}) => {
  const touch = await browser.newContext({
    baseURL,
    storageState: await context.storageState(),
    viewport: { width: 320, height: 720 },
    hasTouch: true,
    isMobile: true,
    colorScheme: "dark",
  });
  try {
    const page = await touch.newPage();
    await ready(page);
    const handle = page.locator(".stack-list .card-drag-handle").first();
    await expect(handle).toHaveCSS("height", "44px");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: "test-results/grip-dark-mobile.png",
      fullPage: true,
    });
    await handle.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Was kommt auf den Tisch?" }),
    ).toBeVisible();
  } finally {
    await touch.close();
  }
});

test("Escape cancels a grip drag and the grip also opens keyboard planning", async ({
  page,
}) => {
  await ready(page);
  const handle = page.locator(".stack-list .card-drag-handle").first();
  const before = await page.locator(".board .meal").count();
  await startDrag(page, handle);
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".card-drag-preview, .card-drag-source"),
  ).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".board .meal")).toHaveCount(before);
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Was kommt auf den Tisch?" }),
  ).toBeVisible();
});

test("dragging near the mobile viewport edge scrolls down to the return stack", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await addEntry(request);
  await ready(page);
  const handle = page.locator(`[data-entry="${data.id}"] .card-drag-handle`);
  await handle.scrollIntoViewIfNeeded();
  await startDrag(page, handle);
  await page.mouse.move(150, 830, { steps: 8 });
  const stack = page.locator(".recipe-stack");
  await expect
    .poll(async () => (await stack.boundingBox())!.y < 730)
    .toBe(true);
  const target = (await stack.boundingBox())!;
  await page.mouse.move(target.x + 40, Math.max(80, target.y + 20), {
    steps: 4,
  });
  await expect(stack).toHaveClass(/return-target/);
  await page.mouse.up();
  await expect(page.locator(`[data-entry="${data.id}"]`)).toHaveCount(0);
  await page.screenshot({
    path: "test-results/grip-mobile.png",
    fullPage: true,
  });
});

for (const width of [390, 1440]) {
  test(`invisible edge zones scroll both ways and stop outside them at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await ready(page);
    const handle = page
      .locator(".day-column:not(.mobile-hidden) .meal .card-drag-handle")
      .first();
    await handle.scrollIntoViewIfNeeded();
    await startDrag(page, handle);
    await expect(page.locator(".drag-scroll-zone")).toHaveCount(0);
    const initial = await page.evaluate(() => scrollY);
    await page.mouse.move(width / 2, 580, { steps: 5 });

    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThan(initial + 100);
    const first = await page.evaluate(() => scrollY);
    const maxScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight,
    );
    // Holding the same position continues scrolling without further pointer events.
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThanOrEqual(Math.min(first + 60, maxScroll));
    if (width === 1440)
      await page.screenshot({ path: "test-results/drag-scroll-zones.png" });
    await page.mouse.move(width / 2, 300);

    const paused = await page.evaluate(() => scrollY);
    await page.waitForTimeout(200);
    expect(
      Math.abs((await page.evaluate(() => scrollY)) - paused),
    ).toBeLessThanOrEqual(2);
    await page.mouse.move(width / 2, 20, { steps: 5 });

    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeLessThan(paused - 60);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(
      page.locator(".drag-scroll-zone, .card-drag-preview"),
    ).toHaveCount(0);
    const stopped = await page.evaluate(() => scrollY);
    await page.waitForTimeout(200);
    expect(
      Math.abs((await page.evaluate(() => scrollY)) - stopped),
    ).toBeLessThanOrEqual(2);
  });
}
