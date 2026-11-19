import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { dateKey, monday } from "../../shared/domain.ts";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}
async function create(request: APIRequestContext, title: string) {
  const { rows } = await (await request.get("/api/state")).json();
  const recipe = rows.find((r: any) => r.kind === "recipe").data;
  const id = randomUUID();
  const response = await request.post("/api/sync", {
    data: {
      operations: [
        {
          opId: randomUUID(),
          id,
          kind: "recipe",
          baseRev: 0,
          data: { ...recipe, title },
        },
      ],
    },
  });
  const data = await response.json();
  return data.results[0].accepted;
}
test("weekly board and recipe editor meet automated accessibility checks", async ({
  page,
}) => {
  await ready(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Neues Gericht" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("weekly board, accessible scheduling, portions and cooking progress", async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator(".day-column")).toHaveCount(7);
  await page
    .locator(".stack-list .recipe-card")
    .first()
    .getByRole("button", { name: "Einplanen", exact: true })
    .click();
  await page.getByLabel("Portionen", { exact: true }).fill("4");
  await page
    .locator("dialog")
    .getByRole("button", { name: "Einplanen", exact: true })
    .click();
  const last = page.locator(".meal").last();
  await expect(
    page.getByText("Wochenplan gespeichert", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".meal")
    .first()
    .getByRole("button", { name: /kochen$/ })
    .click();
  await expect(page.getByText(/Schritt 1 von/)).toBeVisible();
  await page.getByRole("button", { name: "Nächster Schritt" }).click();
  await expect(page.getByText(/Schritt 2 von/)).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .locator(".meal")
    .first()
    .getByRole("button", { name: /kochen$/ })
    .click();
  await expect(page.getByText(/Schritt 2 von/)).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .getByRole("button", { name: "Einkaufsliste", exact: true })
    .click();
  await expect(
    page.locator(".shopping-list input[type=checkbox]").first(),
  ).toBeVisible();
  await page.locator(".shopping-list input[type=checkbox]").first().check();
  await page
    .getByRole("textbox", { name: "Zusätzlicher Einkaufsartikel" })
    .fill("Kaffee");
  await page.getByRole("button", { name: "Ergänzen" }).click();
  await expect(page.getByText("Kaffee", { exact: true })).toBeVisible();
});
test("mobile shows one day and does not overflow at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.locator(".day-column:visible")).toHaveCount(1);
  await page.locator(".mobile-week button").first().click();
  await expect(page.locator(".day-column:visible h3")).toHaveText("Montag");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("pointer drag schedules a recipe in another day", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const handle = page.locator(".stack-list .drag-handle").first();
  const target = page.locator(".day-column").last();
  const before = await target.locator(".meal").count();
  const a = await handle.boundingBox(),
    b = await target.boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + 100, { steps: 12 });
  await page.mouse.up();
  await expect(target.locator(".meal")).toHaveCount(before + 1);
});
test("offline changes survive reload and sync when connection returns", async ({
  page,
  context,
  request,
}) => {
  await ready(page);
  await page.reload();
  await expect(page.locator(".stack-list .recipe-card").first()).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Neues Gericht" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Neues Gericht" }).click();
  const title = `Offline ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Gerichtname").fill(title);
  await page
    .getByLabel("Schritt 1", { exact: true })
    .fill("Gemüse waschen und garen.");
  await page.getByRole("button", { name: "Gericht speichern" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.locator(".sync-state > .text-button").first().click();
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toBeVisible();
  const { rows } = await (await request.get("/api/state")).json();
  expect(rows.some((r: any) => r.data.title === title)).toBe(true);
});
test("conflicting edits preserve both versions and allow explicit selection", async ({
  page,
  context,
  request,
}) => {
  const base = await create(request, `Konflikt ${randomUUID().slice(0, 8)}`);
  await ready(page);
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await context.setOffline(true);
  await page
    .getByRole("button", { name: base.data.title, exact: true })
    .click();
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await page.getByLabel("Gerichtname").fill(base.data.title + " lokal");
  await page.getByRole("button", { name: "Gericht speichern" }).click();
  await request.post("/api/sync", {
    data: {
      operations: [
        {
          opId: randomUUID(),
          id: base.id,
          kind: "recipe",
          baseRev: base.rev,
          data: { ...base.data, title: base.data.title + " entfernt" },
        },
      ],
    },
  });
  await context.setOffline(false);
  await page.locator(".sync-state > .text-button").first().click();
  await expect(
    page.getByRole("button", { name: "Konflikte (1)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Konflikte (1)" }).click();
  await expect(page.locator(".version-content").first()).toContainText("lokal");
  await expect(page.locator(".version-content").last()).toContainText(
    "entfernt",
  );
  await page
    .getByRole("button", { name: "Diese Fassung verwenden" })
    .first()
    .click();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toBeVisible();
  const { rows } = await (await request.get("/api/state")).json();
  expect(rows.find((r: any) => r.id === base.id).data.title).toContain("lokal");
});
test("recipe editing leaves planned snapshots unchanged and archive is reversible", async ({
  page,
  request,
}) => {
  const base = await create(request, `Version ${randomUUID().slice(0, 8)}`);
  await ready(page);
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  const card = page.locator(".recipe-card").filter({
    has: page.getByRole("button", { name: base.data.title, exact: true }),
  });
  await card.getByRole("button", { name: "Einplanen", exact: true }).click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Einplanen", exact: true })
    .click();
  await page
    .getByRole("button", { name: base.data.title, exact: true })
    .click();
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await page.getByLabel("Gerichtname").fill(base.data.title + " neu");
  await page.getByRole("button", { name: "Gericht speichern" }).click();
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toBeVisible();
  const { rows } = await (await request.get("/api/state")).json();
  expect(
    rows.some(
      (r: any) =>
        r.kind === "entry" &&
        r.data.recipeId === base.id &&
        r.data.recipe.title === base.data.title,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: base.data.title + " neu", exact: true })
    .click();
  await page.getByRole("button", { name: "Gericht archivieren" }).click();
  await expect(
    page.getByRole("button", { name: base.data.title + " neu", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Archiv anzeigen" }).click();
  await page
    .getByRole("button", { name: base.data.title + " neu", exact: true })
    .click();
  await page.getByRole("button", { name: "Wiederherstellen" }).click();
});
test("API rejects private recipe addresses and invalid sync payloads", async ({
  request,
}) => {
  const response = await request.post("/api/import", {
    data: { url: "http://127.0.0.1:3002/api/state" },
  });
  expect(response.status()).toBe(422);
  const invalid = await request.post("/api/sync", {
    data: {
      operations: [
        {
          opId: randomUUID(),
          id: "bad",
          kind: "recipe",
          baseRev: 0,
          data: { servings: 0 },
        },
      ],
    },
  });
  expect(invalid.status()).toBe(400);
});

test("keyboard controls reorder meals within a day", async ({
  page,
  request,
}) => {
  const recipe = await create(
    request,
    `Reihenfolge ${randomUUID().slice(0, 8)}`,
  );
  const ids = [randomUUID(), randomUUID()];
  const date = dateKey(monday());
  await request.post("/api/sync", {
    data: {
      operations: ids.map((id, i) => ({
        opId: randomUUID(),
        id,
        kind: "entry",
        baseRev: 0,
        data: {
          date,
          recipeId: recipe.id,
          recipe: recipe.data,
          servings: 2,
          order: i + 1,
          deleted: false,
        },
      })),
    },
  });
  await ready(page);
  await page
    .locator(`[data-entry="${ids[0]}"]`)
    .getByRole("button", { name: `Ändern: ${recipe.data.title}` })
    .click();
  const position = page.getByLabel("Reihenfolge an diesem Tag");
  await position.focus();
  await position.press("End");
  await position.press("Tab");
  await page
    .locator("dialog")
    .getByRole("button", { name: "Einplanen", exact: true })
    .press("Enter");
  await expect(
    page.locator(`[data-date="${date}"] .meal`).last(),
  ).toHaveAttribute("data-entry", ids[0]);
});
