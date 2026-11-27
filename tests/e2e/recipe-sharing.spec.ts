import { test, expect, type APIRequestContext } from "./fixtures.ts";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

test("bulk selection has no recipe count limit and stays below the sticky navigation", async ({
  page,
  request,
}) => {
  const state = await (await request.get("/api/state")).json();
  const original = state.rows.find(
    (row: { kind: string }) => row.kind === "recipe",
  );
  const operations = Array.from({ length: 25 }, (_, i) => ({
    opId: randomUUID(),
    id: randomUUID(),
    kind: "recipe",
    baseRev: 0,
    data: { ...original.data, title: `Bulk recipe ${i}` },
  }));
  expect((await request.post("/api/sync", { data: { operations } })).ok()).toBe(
    true,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await page
    .getByRole("button", { name: "Rezepte auswählen", exact: true })
    .click();
  const bar = page.getByRole("region", { name: "Rezeptauswahl" });
  const checkboxes = page.locator(".recipe-share-selection input");
  const count = await checkboxes.count();
  expect(count).toBeGreaterThan(20);
  await bar
    .getByRole("button", { name: "Alles auswählen", exact: true })
    .click();
  await expect(
    page.locator(".recipe-share-selection input:checked"),
  ).toHaveCount(count);
  await expect(bar).toContainText(`${count} ausgewählt`);
  await bar
    .getByRole("button", { name: "Alles abwählen", exact: true })
    .click();
  await expect(
    page.locator(".recipe-share-selection input:checked"),
  ).toHaveCount(0);
  await bar
    .getByRole("button", { name: "Alles auswählen", exact: true })
    .click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect
      .poll(() =>
        page
          .locator("header.app-header")
          .evaluate((header) => header.getBoundingClientRect().top),
      )
      .toBe(0);
    await expect
      .poll(async () => {
        const header = await page.locator("header.app-header").boundingBox();
        const selection = await bar.boundingBox();
        return Math.abs(selection!.y - (header!.y + header!.height));
      })
      .toBeLessThan(2);
    await expect(
      bar.getByRole("button", { name: "Auswahl teilen", exact: true }),
    ).toBeInViewport();
  }
  await bar
    .getByRole("button", { name: "Auswahl teilen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Freigabelink erstellen", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Freigabelink", exact: true }),
  ).toHaveValue(/\/share#[A-Za-z0-9_-]{43}$/);
});

test("household links select only their bound destination even when the source household is active", async ({
  page,
  request,
  account,
}) => {
  const selected = (await recipes(request)).slice(0, 1);
  const destination = (
    await (
      await request.post("/api/households", {
        data: { name: "Bound destination" },
      })
    ).json()
  ).household;
  expect(
    (
      await request.post(`/api/households/${account.householdId}/selection`)
    ).status(),
  ).toBe(200);
  const created = await request.post(
    `/api/households/${account.householdId}/recipe-shares`,
    {
      data: {
        recipeIds: [selected[0].id],
        target: { kind: "household", householdId: destination.id },
        expiresInDays: 7,
      },
    },
  );
  expect(created.status()).toBe(201);
  const { token } = await created.json();
  await page.goto(`/share#${token}`);
  const target = page.getByRole("combobox", {
    name: "Empfangender Haushalt",
    exact: true,
  });
  await expect(target).toHaveValue(destination.id);
  await expect(target).toBeDisabled();
  await expect(target.locator("option")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Rezepte übernehmen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Rezepte übernommen", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: selected[0].data.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const saved = await (
    await request.get("/api/state", {
      headers: { "X-Household-Id": destination.id },
    })
  ).json();
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0].data.title).toBe(selected[0].data.title);
});

test("destination is locked during an import and its success belongs only to that household", async ({
  page,
  request,
  account,
}) => {
  const selected = (await recipes(request)).slice(0, 1);
  const other = (
    await (
      await request.post("/api/households", {
        data: { name: "Other destination" },
      })
    ).json()
  ).household;
  expect(
    (
      await request.post(`/api/households/${account.householdId}/selection`)
    ).status(),
  ).toBe(200);
  const { token } = await (
    await request.post(`/api/households/${account.householdId}/recipe-shares`, {
      data: {
        recipeIds: [selected[0].id],
        target: { kind: "guest" },
        expiresInDays: 7,
      },
    })
  ).json();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: (body: { householdId: string }) => void;
  const received = new Promise<{ householdId: string }>((resolve) => {
    arrived = resolve;
  });
  await page.route("**/api/recipe-shares/*/accept", async (route) => {
    arrived(route.request().postDataJSON());
    await gate;
    await route.continue();
  });
  try {
    await page.goto(`/share#${token}`);
    const target = page.getByRole("combobox", {
      name: "Empfangender Haushalt",
      exact: true,
    });
    await expect(target).toHaveValue(account.householdId);
    await page
      .getByRole("button", { name: "Rezepte übernehmen", exact: true })
      .click();
    expect((await received).householdId).toBe(account.householdId);
    await expect(target).toBeDisabled();
    release();
    await expect(
      page.getByRole("button", { name: "Rezepte übernommen", exact: true }),
    ).toBeDisabled();
    await expect(target).toBeEnabled();
    await target.selectOption(other.id);
    await expect(
      page.getByRole("button", { name: "Rezepte übernehmen", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Rezepte übernommen", exact: true }),
    ).toHaveCount(0);
    const untouched = await (
      await request.get("/api/state", {
        headers: { "X-Household-Id": other.id },
      })
    ).json();
    expect(untouched.rows).toHaveLength(0);
  } finally {
    release();
  }
});

async function recipes(request: APIRequestContext) {
  const state = await (await request.get("/api/state")).json();
  return state.rows.filter(
    (row: { kind: string; data: { archived?: boolean } }) =>
      row.kind === "recipe" && !row.data.archived,
  );
}

test("guest batch links expose only snapshots and stop working after revocation", async ({
  request,
  account,
  browser,
  page,
  baseURL,
}) => {
  const selected = (await recipes(request)).slice(0, 2);
  const created = await request.post(
    `/api/households/${account.householdId}/recipe-shares`,
    {
      data: {
        recipeIds: selected.map((row: { id: string }) => row.id),
        target: { kind: "guest" },
        expiresInDays: 1,
      },
    },
  );
  expect(created.status()).toBe(201);
  const { share, token } = await created.json();
  const guest = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  try {
    const resolved = await guest.request.post("/api/recipe-shares/resolve", {
      data: { token },
    });
    expect(resolved.status()).toBe(200);
    expect(resolved.headers()["cache-control"]).toContain("no-store");
    const content = await resolved.json();
    expect(Object.keys(content).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "recipeCount",
      "recipes",
    ]);
    expect(
      content.recipes.map((recipe: { title: string }) => recipe.title),
    ).toEqual(
      selected.map((row: { data: { title: string } }) => row.data.title),
    );
    expect(
      content.recipes.every(
        (recipe: object) => !("id" in recipe) && !("householdId" in recipe),
      ),
    ).toBe(true);
    const first = selected[0];
    const changed = await request.post("/api/sync", {
      data: {
        operations: [
          {
            opId: randomUUID(),
            id: first.id,
            kind: "recipe",
            baseRev: first.rev,
            data: { ...first.data, title: "Changed original after sharing" },
          },
        ],
      },
    });
    expect(changed.status()).toBe(200);
    const snapshot = await (
      await guest.request.post("/api/recipe-shares/resolve", {
        data: { token },
      })
    ).json();
    expect(snapshot.recipes[0].title).toBe(first.data.title);
    const guestPage = await guest.newPage();
    await guestPage.goto(`/share#${token}`);
    await expect(
      guestPage.getByRole("heading", { name: first.data.title, exact: true }),
    ).toBeVisible();
    expect(
      await guestPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      guestPage.locator('nav[aria-label="Hauptnavigation"]'),
    ).toHaveCount(0);
    await page.goto("/");
    await page.getByRole("button", { name: "Gerichte", exact: true }).click();
    await page
      .getByRole("button", { name: "Geteilte Rezepte", exact: true })
      .click();
    await expect(page.locator("dialog")).toBeVisible();
    const revoked = await request.delete(
      `/api/households/${account.householdId}/recipe-shares/${share.id}`,
    );
    expect(revoked.status()).toBe(204);
    const denied = await guest.request.post("/api/recipe-shares/resolve", {
      data: { token },
    });
    expect(denied.status()).toBe(404);
    await guestPage.reload();
    await expect(
      guestPage.getByRole("heading", { name: first.data.title, exact: true }),
    ).toHaveCount(0);
    await expect(guestPage.getByRole("alert")).toBeVisible();
  } finally {
    await guest.close();
  }
});

test("personal links require both the secret and matching account and import copies once", async ({
  request,
  account,
  playwright,
  baseURL,
}) => {
  const recipient = await playwright.request.newContext({ baseURL });
  const guest = await playwright.request.newContext({ baseURL });
  try {
    const email = `recipient-${randomUUID()}@example.com`;
    let session = await (await recipient.get("/api/session")).json();
    const registered = await recipient.post("/api/auth/register", {
      headers: { "X-CSRF-Token": session.csrfToken },
      data: {
        name: "Recipient",
        email,
        password: "A long sharing test password!",
      },
    });
    expect(registered.status()).toBe(201);
    session = await registered.json();
    const headers = { "X-CSRF-Token": session.csrfToken };
    const target = await (
      await recipient.post("/api/households", {
        headers,
        data: { name: "Recipient kitchen" },
      })
    ).json();
    const selected = (await recipes(request)).slice(0, 2);
    const created = await request.post(
      `/api/households/${account.householdId}/recipe-shares`,
      {
        data: {
          recipeIds: selected.map((row: { id: string }) => row.id),
          target: { kind: "user", email },
          expiresInDays: 7,
        },
      },
    );
    expect(created.status()).toBe(201);
    const { share, token } = await created.json();
    expect(
      (
        await guest.post("/api/recipe-shares/resolve", { data: { token } })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.post("/api/recipe-shares/resolve", { data: { token } })
      ).status(),
    ).toBe(404);
    expect(
      (
        await recipient.post("/api/recipe-shares/resolve", { data: { token } })
      ).status(),
    ).toBe(200);
    const acceptURL = `/api/recipe-shares/${share.id}/accept`;
    expect(
      (
        await recipient.post(acceptURL, {
          headers,
          data: { householdId: target.household.id },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await recipient.post(acceptURL, {
          headers,
          data: { token, householdId: account.householdId },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await recipient.post(acceptURL, {
          headers: { "X-CSRF-Token": "wrong" },
          data: { token, householdId: target.household.id },
        })
      ).status(),
    ).toBe(403);
    const body = { token, householdId: target.household.id };
    const accepted = await recipient.post(acceptURL, { headers, data: body });
    expect(accepted.status()).toBe(200);
    const result = await accepted.json();
    expect(result.recipeIds).toHaveLength(2);
    expect(result.alreadyAccepted).toBe(false);
    const retry = await (
      await recipient.post(acceptURL, { headers, data: body })
    ).json();
    expect(retry.recipeIds).toEqual(result.recipeIds);
    expect(retry.alreadyAccepted).toBe(true);
    const state = await (
      await recipient.get("/api/state", {
        headers: { "X-Household-Id": target.household.id },
      })
    ).json();
    expect(state.rows).toHaveLength(2);
    expect(
      state.rows.every(
        (row: { id: string }) =>
          !selected.some((source: { id: string }) => source.id === row.id),
      ),
    ).toBe(true);
    expect(
      (
        await request.get(
          `/api/households/${target.household.id}/recipe-shares`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await recipient.dispose();
    await guest.dispose();
  }
});

test("recipe detail and library offer single and bulk sharing without changing the planner", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".stack-list .title-button").first().click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Teilen", exact: true })
    .click();
  await expect(page.locator("dialog h2")).toBeVisible();
  await expect(
    page
      .locator("dialog")
      .getByRole("button", { name: "Freigabelink erstellen" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await page
    .getByRole("button", { name: "Rezepte auswählen", exact: true })
    .click();
  const checkboxes = page.locator(".recipe-share-selection input");
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await expect(
    page.getByRole("region", { name: "Rezeptauswahl" }),
  ).toContainText("2 ausgewählt");
  await page
    .getByRole("button", { name: "Auswahl teilen", exact: true })
    .click();
  await expect(page.locator("dialog")).toContainText("2");
  await page
    .locator("dialog")
    .getByRole("button", { name: "Freigabelink erstellen" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Freigabelink", exact: true }),
  ).toHaveValue(/\/share#[A-Za-z0-9_-]{43}$/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Geteilte Rezepte", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Freigabelink", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Freigabe für .* widerrufen/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Jetzt widerrufen", exact: true })
    .click();
  await expect(page.locator("dialog")).toContainText("Widerrufen");
});

test("a delayed public preview cannot restore content after a newer denial", async ({
  request,
  account,
  browser,
  baseURL,
}) => {
  const selected = (await recipes(request)).slice(0, 1);
  const { token } = await (
    await request.post(`/api/households/${account.householdId}/recipe-shares`, {
      data: {
        recipeIds: [selected[0].id],
        target: { kind: "guest" },
        expiresInDays: 30,
      },
    })
  ).json();
  const content = await (
    await request.post("/api/recipe-shares/resolve", { data: { token } })
  ).json();
  const context = await browser.newContext({ baseURL });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const first = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let requests = 0;
  try {
    const page = await context.newPage();
    await page.route("**/api/recipe-shares/resolve", async (route) => {
      if (++requests === 1) {
        arrived();
        await gate;
        await route.fulfill({ json: content });
      } else
        await route.fulfill({
          status: 404,
          json: { error: "Freigabe widerrufen" },
        });
    });
    await page.goto(`/share#${token}`);
    await first;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("alert")).toContainText("Freigabe widerrufen");
    const delayedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/recipe-shares/resolve") &&
        response.status() === 200,
    );
    release();
    await delayedResponse;
    await expect(
      page.getByRole("heading", { name: selected[0].data.title, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert")).toContainText("Freigabe widerrufen");
  } finally {
    release();
    await context.close();
  }
});

test("a personal link survives sign-in and copies into the chosen household from the guest page", async ({
  request,
  account,
  browser,
  baseURL,
}) => {
  const session = await (await request.get("/api/session")).json();
  const selected = (await recipes(request)).slice(0, 1);
  const destinationResponse = await request.post("/api/households", {
    data: { name: "Saved shared recipes" },
  });
  expect(destinationResponse.status()).toBe(201);
  const destination = (await destinationResponse.json()).household;
  const created = await request.post(
    `/api/households/${account.householdId}/recipe-shares`,
    {
      data: {
        recipeIds: [selected[0].id],
        target: { kind: "user", email: session.user.email },
        expiresInDays: 7,
      },
    },
  );
  expect(created.status()).toBe(201);
  const { token } = await created.json();
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto(`/share#${token}`);
    await expect(page.getByRole("alert")).toContainText("Bitte anmelden");
    await page
      .getByRole("button", { name: "Bei Foody anmelden", exact: true })
      .click();
    await page
      .getByLabel("E-Mail-Adresse", { exact: true })
      .fill(session.user.email);
    await page
      .getByLabel("Passwort", { exact: true })
      .fill("Test password with 20 characters!");
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByRole("heading", { name: selected[0].data.title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Empfangender Haushalt", exact: true })
      .selectOption(destination.id);
    await page
      .getByRole("button", { name: "Rezepte übernehmen", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Rezepte übernommen", exact: true }),
    ).toBeDisabled();
    expect(page.url()).not.toContain(token);
    const saved = await (
      await request.get("/api/state", {
        headers: { "X-Household-Id": destination.id },
      })
    ).json();
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0].data.title).toBe(selected[0].data.title);
    expect(saved.rows[0].id).not.toBe(selected[0].id);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
