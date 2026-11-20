import { test, expect, type Page } from "./fixtures.ts";
import { randomUUID } from "node:crypto";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}
async function draft(page: Page, title: string) {
  await page.getByRole("button", { name: "Neues Gericht" }).click();
  await page.getByLabel("Gerichtname").fill(title);
  await page
    .getByLabel("Schritt 1", { exact: true })
    .fill("Gemüse waschen und garen.");
}
test("two offline tabs retain independent edits after both tabs close and reload", async ({
  context,
  page,
  request,
}) => {
  await ready(page);
  const second = await context.newPage();
  await ready(second);
  await context.setOffline(true);
  const a = `Tab A ${randomUUID().slice(0, 8)}`,
    b = `Tab B ${randomUUID().slice(0, 8)}`;
  await Promise.all([draft(page, a), draft(second, b)]);
  await Promise.all([
    page.getByRole("button", { name: "Gericht speichern" }).click(),
    second.getByRole("button", { name: "Gericht speichern" }).click(),
  ]);
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(second.locator("dialog")).toHaveCount(0);
  const fresh = await context.newPage();
  await page.close();
  await second.close();
  await fresh.goto("/");
  await fresh.getByRole("button", { name: "Gerichte", exact: true }).click();
  await expect(
    fresh.getByRole("button", { name: a, exact: true }),
  ).toBeVisible();
  await expect(
    fresh.getByRole("button", { name: b, exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    fresh.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
  const { rows } = await (await request.get("/api/state")).json();
  expect(rows.some((r: any) => r.data.title === a)).toBe(true);
  expect(rows.some((r: any) => r.data.title === b)).toBe(true);
});
test("one failed IndexedDB write keeps the editor open and a second save recovers", async ({
  page,
  request,
}) => {
  await ready(page);
  const title = `Storage retry ${randomUUID().slice(0, 8)}`;
  await draft(page, title);
  await page.evaluate((title) => {
    const original = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function (value: any, ...args: any[]) {
      if (fail && value?.pending?.some((p: any) => p.data.title === title)) {
        fail = false;
        throw new DOMException(
          "Simulated temporary storage failure",
          "QuotaExceededError",
        );
      }
      return original.apply(this, [value, ...args] as [any, IDBValidKey?]);
    };
  }, title);
  await page.getByRole("button", { name: "Gericht speichern" }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator("dialog").getByRole("alert")).toContainText(
    "Speichern auf diesem Gerät fehlgeschlagen",
  );
  await page.getByRole("button", { name: "Gericht speichern" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
  const { rows } = await (await request.get("/api/state")).json();
  expect(rows.some((r: any) => r.data.title === title)).toBe(true);
});
test("an open editor cannot overwrite a refreshed remote recipe without a conflict", async ({
  page,
  request,
}) => {
  const { rows } = await (await request.get("/api/state")).json();
  const template = rows.find((r: any) => r.kind === "recipe").data;
  const id = randomUUID(),
    title = `Open editor ${id.slice(0, 8)}`;
  await request.post("/api/sync", {
    data: {
      operations: [
        {
          opId: randomUUID(),
          id,
          kind: "recipe",
          baseRev: 0,
          data: { ...template, title },
        },
      ],
    },
  });
  await ready(page);
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await request.post("/api/sync", {
    data: {
      operations: [
        {
          opId: randomUUID(),
          id,
          kind: "recipe",
          baseRev: 1,
          data: { ...template, title, description: "Remote update preserved" },
        },
      ],
    },
  });
  // Focus triggers the normal foreground refresh while the draft remains open.
  const refreshed = page.waitForResponse(
    (r) => r.url().endsWith("/api/state") && r.status() === 200,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshed;
  await page.getByLabel("Gerichtname").fill(title + " local");
  await page.getByRole("button", { name: "Gericht speichern" }).click();
  await expect(
    page.getByRole("button", { name: "Konflikte (1)" }),
  ).toBeVisible();
  const result = await (await request.get("/api/state")).json();
  expect(result.rows.find((r: any) => r.id === id).data.description).toBe(
    "Remote update preserved",
  );
});
