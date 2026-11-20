import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { SessionView } from "../../shared/accounts.ts";

// Deliberately use base Playwright: each test creates its real accounts and
// memberships explicitly instead of using the authenticated legacy fixture.
async function account(context: BrowserContext, name: string) {
  let session: SessionView = await (
    await context.request.get("/api/session")
  ).json();
  const email = `${name}-${crypto.randomUUID()}@example.com`;
  async function call(
    path: string,
    method = "GET",
    data?: unknown,
    householdId?: string,
  ) {
    const response = await context.request.fetch(path, {
      method,
      headers: {
        "X-CSRF-Token": session.csrfToken,
        ...(householdId ? { "X-Household-Id": householdId } : {}),
      },
      ...(data === undefined ? {} : { data }),
    });
    const value = response.status() === 204 ? null : await response.json();
    expect(
      response.ok(),
      `${method} ${path}: ${JSON.stringify(value)}`,
    ).toBeTruthy();
    if (value?.csrfToken) session = value;
    return value;
  }
  await call("/api/auth/register", "POST", {
    name,
    email,
    password: "Secure-isolation-password-123",
  });
  return { call, email, userId: session.user!.id };
}

async function shopping(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Wochenplan", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", { name: "Einkaufsliste", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Zusätzlicher Einkaufsartikel" }),
  ).toBeVisible();
}
async function chooseHousehold(page: Page, householdId: string) {
  await page.getByRole("button", { name: "Account-Menü", exact: true }).click();
  await page.getByLabel("Aktiver Haushalt").selectOption(householdId);
  await expect(
    page.getByRole("region", { name: "Account", exact: true }),
  ).not.toBeVisible();
}

test("offline outbox stays in its original household during a household switch", async ({
  page,
  context,
}) => {
  const user = await account(context, "outbox");
  const a = (await user.call("/api/households", "POST", { name: "Haushalt A" }))
    .household;
  const b = (await user.call("/api/households", "POST", { name: "Haushalt B" }))
    .household;
  await user.call(`/api/households/${a.id}/selection`, "POST", {});
  await page.goto("/");
  await shopping(page);
  await context.setOffline(true);
  const item = `Nur Haushalt A ${crypto.randomUUID()}`;
  await page
    .getByRole("textbox", { name: "Zusätzlicher Einkaufsartikel" })
    .fill(item);
  await page.getByRole("button", { name: "Ergänzen", exact: true }).click();
  await expect(page.getByText(item, { exact: true })).toBeVisible();
  // Keep A's upload pending while the connection returns and B is selected.
  await page.route("**/api/sync", async (route) => {
    if (route.request().headers()["x-household-id"] === a.id)
      await route.abort("internetdisconnected");
    else await route.continue();
  });
  await context.setOffline(false);
  await chooseHousehold(page, b.id);
  await expect(page.getByText(item, { exact: true })).not.toBeVisible();
  const bState = await user.call("/api/state", "GET", undefined, b.id);
  expect(
    bState.rows.some(
      (row: { data: { text?: string } }) => row.data.text === item,
    ),
  ).toBe(false);
  await page.unroute("**/api/sync");
  await chooseHousehold(page, a.id);
  await expect(page.getByText(item, { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const saved = await user.call("/api/state", "GET", undefined, a.id);
      return saved.rows.some(
        (row: { data: { text?: string } }) => row.data.text === item,
      );
    })
    .toBe(true);
  const bAfter = await user.call("/api/state", "GET", undefined, b.id);
  expect(
    bAfter.rows.some(
      (row: { data: { text?: string } }) => row.data.text === item,
    ),
  ).toBe(false);
});

test("logout clears the private interface in another open tab", async ({
  page,
  context,
}) => {
  const user = await account(context, "logout");
  await user.call("/api/households", "POST", { name: "Private Küche" });
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("heading", { name: "Wochenplan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account-Menü", exact: true }).click();
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  for (const tab of [page, other]) {
    await expect(
      tab.getByRole("button", { name: "Mit Passkey anmelden", exact: true }),
    ).toBeVisible();
    await expect(
      tab.getByRole("heading", { name: "Wochenplan", exact: true }),
    ).not.toBeVisible();
    expect(
      await tab.evaluate(() =>
        localStorage.getItem("foody-account-metadata-v1"),
      ),
    ).toBeNull();
  }
  await other.close();
});

test("revoked membership removes a previously cached household from the live UI", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const ownerContext = await browser.newContext({ baseURL });
  try {
    const owner = await account(ownerContext, "owner"),
      member = await account(context, "member");
    const household = (
      await owner.call("/api/households", "POST", { name: "Gemeinsame Küche" })
    ).household;
    const invitation = await owner.call(
      `/api/households/${household.id}/invitations`,
      "POST",
      { email: member.email },
    );
    await member.call("/api/household-memberships", "POST", {
      token: invitation.token,
    });
    await page.goto("/");
    await shopping(page);
    const item = `Vertraulicher Artikel ${crypto.randomUUID()}`;
    await page
      .getByRole("textbox", { name: "Zusätzlicher Einkaufsartikel" })
      .fill(item);
    await page.getByRole("button", { name: "Ergänzen", exact: true }).click();
    await expect(page.getByText(item, { exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        (
          await owner.call("/api/state", "GET", undefined, household.id)
        ).rows.some(
          (row: { data: { text?: string } }) => row.data.text === item,
        ),
      )
      .toBe(true);
    await owner.call(
      `/api/households/${household.id}/members/${member.userId}`,
      "DELETE",
    );
    // visibilitychange invokes the actual data sync; the server responds404.
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(page.getByText(item, { exact: true })).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Wer sitzt mit am Tisch?" }),
    ).toBeVisible();
    const session = await member.call("/api/session");
    expect(session.activeHouseholdId).toBeNull();
    expect(session.households).toEqual([]);
  } finally {
    await ownerContext.close();
  }
});

test("an already-open offline view expires without waiting for another reload", async ({
  page,
  context,
}) => {
  const user = await account(context, "expiry");
  await user.call("/api/households", "POST", { name: "Offline Küche" });
  await page.clock.install();
  // Use a real authorized session and shorten only its advertised client expiry.
  // The server's cookie and authorization are never replaced or bypassed.
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    value.expiresAt = Date.now() + 3000;
    await route.fulfill({ response, json: value });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Wochenplan", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.clock.fastForward(4000);
  await expect(
    page.getByRole("button", { name: "Mit Passkey anmelden", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Wochenplan", exact: true }),
  ).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("foody-account-metadata-v1"),
    ),
  ).toBeNull();
});
