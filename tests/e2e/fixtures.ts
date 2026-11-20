import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedRows } from "../../shared/seed.ts";
import type { SessionView } from "../../shared/accounts.ts";
export * from "@playwright/test";

type TestAccount = { userId: string; householdId: string; csrfToken: string };
export const test = base.extend<
  { account: TestAccount },
  {
    accountPool: () => Promise<{
      request: APIRequestContext;
      session: SessionView;
    }>;
  }
>({
  accountPool: [
    async ({ playwright }, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL;
      let current:
        { request: APIRequestContext; session: SessionView } | undefined;
      let count = 0;
      const requests: APIRequestContext[] = [];
      await use(async () => {
        if (!current || count % 8 === 0) {
          const request = await playwright.request.newContext({ baseURL });
          requests.push(request);
          let session = await (await request.get("/api/session")).json();
          const registration = await request.post("/api/auth/register", {
            headers: { "X-CSRF-Token": session.csrfToken },
            data: {
              name: "Testperson",
              email: `test-${randomUUID()}@example.com`,
              password: "Test password with 20 characters!",
            },
          });
          expect(registration.status()).toBe(201);
          session = await registration.json();
          current = { request, session };
        }
        count++;
        return current;
      });
      for (const request of requests) await request.dispose();
    },
    { scope: "worker" },
  ],
  account: [
    async ({ context, accountPool }, use) => {
      const { request, session } = await accountPool();
      await context.addCookies((await request.storageState()).cookies);
      const householdResponse = await request.post("/api/households", {
        headers: { "X-CSRF-Token": session.csrfToken },
        data: { name: "Unser Zuhause" },
      });
      expect(householdResponse.status()).toBe(201);
      const household = (await householdResponse.json()).household;
      const account = {
        userId: session.user!.id,
        householdId: household.id,
        csrfToken: session.csrfToken,
      };
      const headers = {
        "X-CSRF-Token": account.csrfToken,
        "X-Household-Id": account.householdId,
      };
      const seeded = await request.post("/api/sync", {
        headers,
        data: {
          operations: seedRows().map((row) => ({
            opId: randomUUID(),
            id: row.id,
            kind: row.kind,
            baseRev: 0,
            data: row.data,
          })),
        },
      });
      expect(seeded.status()).toBe(200);
      await context.setExtraHTTPHeaders(headers);
      await use(account);
    },
    { auto: true },
  ],
  request: async ({ playwright, context, baseURL, account }, use) => {
    const request = await playwright.request.newContext({
      baseURL,
      storageState: await context.storageState(),
      extraHTTPHeaders: {
        "X-CSRF-Token": account.csrfToken,
        "X-Household-Id": account.householdId,
      },
    });
    await use(request);
    await request.dispose();
  },
});
