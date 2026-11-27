import { test, expect, type Locator } from "./fixtures.ts";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { dateKey, monday } from "../../shared/domain.ts";

async function plannedCooking(
  request: import("@playwright/test").APIRequestContext,
) {
  const state = await (await request.get("/api/state")).json();
  const original = state.rows.find(
    (row: { kind: string }) => row.kind === "recipe",
  );
  const id = randomUUID();
  const data = {
    recipeId: original.id,
    recipe: {
      ...original.data,
      title: `Kochtest ${id}`,
      steps: ["Servieren."],
    },
    date: dateKey(monday()),
    servings: 2,
    order: -100,
    deleted: false,
  };
  expect(
    (
      await request.post("/api/sync", {
        data: {
          operations: [
            { opId: randomUUID(), id, kind: "entry", baseRev: 0, data },
          ],
        },
      })
    ).ok(),
  ).toBe(true);
  return { id, data };
}

test("a delayed cooking completion cannot close a newly opened editor", async ({
  page,
  request,
}) => {
  const { id, data } = await plannedCooking(request);
  await page.goto("/");
  await page
    .locator(`[data-entry="${id}"]`)
    .getByRole("button", { name: `${data.recipe.title} kochen`, exact: true })
    .click();
  const cook = page.locator("dialog.fullscreen");
  await cook.getByRole("button", { name: "Fertig", exact: true }).click();
  await page.evaluate((id) => {
    const transactions = new WeakSet<IDBTransaction>();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: any, ...args: any[]) {
      if (value?.pending?.some((op: any) => op.id === id && op.data.cooked))
        transactions.add(this.transaction);
      return put.apply(this, [value, ...args] as [any, IDBValidKey?]);
    };
    const descriptor = Object.getOwnPropertyDescriptor(
      IDBTransaction.prototype,
      "oncomplete",
    )!;
    let held = false;
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
      ...descriptor,
      set(handler) {
        descriptor.set!.call(
          this,
          function (this: IDBTransaction, event: Event) {
            if (!held && transactions.has(this)) {
              held = true;
              (window as any).cookWriteHeld = true;
              (window as any).releaseCookWrite = () =>
                handler.call(this, event);
            } else handler.call(this, event);
          },
        );
      },
    });
  }, id);
  await cook
    .getByRole("button", { name: "Zum Wochenplan", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).cookWriteHeld))
    .toBe(true);
  await cook.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .getByRole("button", { name: "Neues Gericht", exact: true })
    .click();
  await page
    .getByLabel("Gerichtname")
    .fill("Ungespeicherter Entwurf bleibt erhalten");
  await page.evaluate(() => (window as any).releaseCookWrite());
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/state")).json()).rows.find(
          (row: { id: string }) => row.id === id,
        ).data.cooked,
    )
    .toBe(true);
  await expect(page.getByLabel("Gerichtname")).toHaveValue(
    "Ungespeicherter Entwurf bleibt erhalten",
  );
});

test("cooking-only conflicts show the different status in both versions", async ({
  page,
  request,
  context,
}) => {
  const { id, data } = await plannedCooking(request);
  await page.goto("/");
  await page
    .locator(`[data-entry="${id}"]`)
    .getByRole("button", { name: `${data.recipe.title} kochen`, exact: true })
    .click();
  const cook = page.locator("dialog.fullscreen");
  await cook.getByRole("button", { name: "Fertig", exact: true }).click();
  await context.setOffline(true);
  await cook
    .getByRole("button", { name: "Zum Wochenplan", exact: true })
    .click();
  expect(
    (
      await request.post("/api/sync", {
        data: {
          operations: [
            {
              opId: randomUUID(),
              id,
              kind: "entry",
              baseRev: 1,
              data: { ...data, cooked: false },
            },
          ],
        },
      })
    ).ok(),
  ).toBe(true);
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Konflikte (1)", exact: true })
    .click();
  const versions = page.locator(".conflict-version");
  await expect(
    versions.first().getByText("Gekocht", { exact: true }),
  ).toBeVisible();
  await expect(
    versions.last().getByText("Noch nicht gekocht", { exact: true }),
  ).toBeVisible();
  await versions
    .last()
    .getByRole("button", { name: "Diese Fassung verwenden", exact: true })
    .click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Schließen", exact: true })
    .click();
  await expect(page.locator(`[data-entry="${id}"]`)).not.toHaveClass(
    /is-cooked/,
  );
});

test("returning after cooking dims only that planned entry and keeps its status after reload", async ({
  page,
  request,
}) => {
  const state = await (await request.get("/api/state")).json();
  const original = state.rows.find(
    (row: { kind: string }) => row.kind === "recipe",
  );
  const id = randomUUID(),
    otherId = randomUUID();
  const snapshot = {
    ...original.data,
    title: `Gekocht ${id.slice(0, 8)}`,
    steps: ["Servieren."],
  };
  expect(
    (
      await request.post("/api/sync", {
        data: {
          operations: [id, otherId].map((entryId, index) => ({
            opId: randomUUID(),
            id: entryId,
            kind: "entry",
            baseRev: 0,
            data: {
              recipeId: original.id,
              recipe: snapshot,
              date: dateKey(monday()),
              servings: 2,
              order: -10 + index,
              deleted: false,
            },
          })),
        },
      })
    ).ok(),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".mobile-week button").first().click();
  const card = page.locator(`[data-entry="${id}"]`);
  const other = page.locator(`[data-entry="${otherId}"]`);
  await card
    .getByRole("button", { name: `${snapshot.title} kochen`, exact: true })
    .click();
  const dialog = page.locator("dialog.fullscreen");
  // Leaving before completion must not mark the meal as cooked.
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(card).not.toHaveClass(/is-cooked/);
  await card
    .getByRole("button", { name: `${snapshot.title} kochen`, exact: true })
    .click();
  await dialog.getByRole("button", { name: "Fertig", exact: true }).click();
  await expect(card).not.toHaveClass(/is-cooked/);
  await dialog
    .getByRole("button", { name: "Zum Wochenplan", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toHaveClass(/is-cooked/);
  await expect(card).toHaveCSS("opacity", "0.5");
  await expect(card).toContainText("Gekocht");
  await expect(other).not.toHaveClass(/is-cooked/);
  await expect
    .poll(async () => {
      const latest = await (await request.get("/api/state")).json();
      return latest.rows.find((row: { id: string }) => row.id === id).data
        .cooked;
    })
    .toBe(true);
  await page.reload();
  await page.locator(".mobile-week button").first().click();
  await expect(card).toHaveClass(/is-cooked/);
  await expect(other).not.toHaveClass(/is-cooked/);
  await card
    .getByRole("button", { name: `${snapshot.title} kochen`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Noch einmal", exact: true })
    .click();
  await expect(
    dialog.getByText("Schritt 1 von 1", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(card).not.toHaveClass(/is-cooked/);
  await expect(card).toHaveCSS("opacity", "1");
  await expect
    .poll(async () => {
      const latest = await (await request.get("/api/state")).json();
      return latest.rows.find((row: { id: string }) => row.id === id).data
        .cooked;
    })
    .toBe(false);
  await page.reload();
  await page.locator(".mobile-week button").first().click();
  await expect(card).not.toHaveClass(/is-cooked/);
});

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
