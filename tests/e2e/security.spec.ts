import { test, expect } from "./fixtures.ts";
import { randomUUID } from "node:crypto";

test("API strips injected metadata and recipe markup renders as text", async ({
  page,
  request,
}) => {
  const { rows } = await (await request.get("/api/state")).json();
  const template = rows.find((row: any) => row.kind === "recipe").data;
  const id = randomUUID();
  const title = `<img src=x onerror="globalThis.securityInjected=true"> ${id.slice(0, 8)}`;
  const response = await request.post("/api/sync", {
    data: {
      operations: [
        {
          opId: randomUUID(),
          id,
          kind: "recipe",
          baseRev: 0,
          data: {
            ...template,
            title,
            description: "<script>globalThis.securityInjected=true</script>",
            steps: ["<svg onload=globalThis.securityInjected=true>"],
            image: "javascript:globalThis.securityInjected=true",
            source: "javascript:globalThis.securityInjected=true",
            unvalidatedMetadata: { synthetic: true },
            recipe: { synthetic: true },
          },
        },
        {
          opId: randomUUID(),
          id: randomUUID(),
          kind: "check",
          baseRev: 0,
          data: {
            checked: true,
            title: { synthetic: true },
            recipe: { synthetic: true },
          },
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
  const accepted = (await response.json()).results.map(
    (result: any) => result.accepted,
  );
  expect(accepted[0].data).not.toHaveProperty("unvalidatedMetadata");
  expect(accepted[0].data).not.toHaveProperty("recipe");
  expect(accepted[1].data).toEqual({ checked: true });
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.locator("dialog h2")).toHaveText(title);
  await expect(page.locator("dialog")).toContainText(
    "<script>globalThis.securityInjected=true</script>",
  );
  await expect(
    page.locator("dialog script, dialog img, dialog svg[onload]"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Originalrezept öffnen" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => (globalThis as any).securityInjected),
  ).toBeUndefined();
});

test("legacy poisoned check metadata cannot impersonate a recipe in conflict comparison", async ({
  page,
  account,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(
    async ({ id, key }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("keyval-store");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("keyval", "readwrite");
        const store = transaction.objectStore("keyval");
        const request = store.get(key);
        request.onsuccess = () => {
          const state = request.result;
          const local = {
            opId: crypto.randomUUID(),
            id,
            kind: "check",
            baseRev: 1,
            data: {
              checked: false,
              title: { synthetic: true },
              recipe: { synthetic: true },
            },
          };
          const remote = {
            id,
            kind: "check",
            rev: 2,
            data: { checked: true, title: "Poisoned metadata" },
          };
          state.pending.push(local);
          state.rows.push(remote);
          state.conflicts.push({ local, remote });
          state.generation++;
          store.put(state, key);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    {
      id: randomUUID(),
      key: `foody-state-v3:${encodeURIComponent(account.userId)}:${encodeURIComponent(account.householdId)}`,
    },
  );
  await page.reload();
  await page.getByRole("button", { name: "Konflikte (1)" }).click();
  await expect(
    page.getByRole("heading", { name: "Einkaufsstatus", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".version-content").first()).toContainText(
    "Noch einkaufen",
  );
  await expect(page.locator(".version-content").last()).toContainText(
    "Bereits eingekauft",
  );
  await expect(
    page.getByText("Poisoned metadata", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
