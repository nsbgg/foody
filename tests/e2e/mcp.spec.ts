import { test, expect, type APIRequestContext } from "./fixtures.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { dateKey, monday } from "../../shared/domain.ts";

const permissions = [
  "recipes:read",
  "recipes:write",
  "recipes:delete",
  "plan:read",
  "plan:write",
  "plan:delete",
  "shopping:read",
  "shopping:write",
  "shopping:delete",
];
const week = dateKey(monday());
for (const reopenBeforeResponse of [false, true]) {
  test(`closing the account menu discards a delayed MCP key, reopen before response=${reopenBeforeResponse}`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const pending = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await page.route("**/api/mcp-connections", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      arrived();
      await gate;
      await route.fulfill({ response });
    });
    try {
      await page.goto("/");
      await page.locator(".household").click();
      await page.getByText("KI verbinden", { exact: true }).click();
      const name = `Delayed key ${reopenBeforeResponse}`;
      await page.getByLabel("Name der Verbindung").fill(name);
      await page
        .getByRole("button", { name: "Verbindung erstellen", exact: true })
        .click();
      await pending;
      await page.keyboard.press("Escape");
      await expect(page.locator("#account-menu")).not.toBeVisible();
      if (reopenBeforeResponse) await page.locator(".household").click();
      release();
      // Metadata appears only after the delayed result has been processed.
      await expect(
        page
          .locator(".mcp-connections .account-rows")
          .getByText(name, { exact: true }),
      ).toHaveCount(1);
      await expect(page.getByLabel("MCP-Schlüssel")).toHaveCount(0);
      if (!reopenBeforeResponse) await page.locator(".household").click();
      await expect(page.locator("#account-menu")).toBeVisible();
      await expect(page.getByLabel("MCP-Schlüssel")).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: "Konfiguration kopieren",
          exact: true,
        }),
      ).toHaveCount(0);
      // A later intentional request can still create and display a fresh key.
      await page.getByLabel("Name der Verbindung").fill("Fresh key");
      await page
        .getByRole("button", { name: "Verbindung erstellen", exact: true })
        .click();
      await expect(page.getByLabel("MCP-Schlüssel")).toHaveValue(/^foody_mcp_/);
    } finally {
      release();
    }
  });
}
test("a delayed reauthentication error cannot reopen confirmation after the menu was closed", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const pending = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route("**/api/mcp-connections", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    arrived();
    await gate;
    await route.fulfill({
      status: 403,
      json: { error: "Bestätigung erforderlich", code: "reauth_required" },
    });
  });
  try {
    await page.goto("/");
    await page.locator(".household").click();
    await page.getByText("KI verbinden", { exact: true }).click();
    await page.getByLabel("Name der Verbindung").fill("Cancelled request");
    await page
      .getByRole("button", { name: "Verbindung erstellen", exact: true })
      .click();
    await pending;
    await page.keyboard.press("Escape");
    await page.locator(".household").click();
    release();
    await expect(
      page.getByRole("button", { name: "Verbindung erstellen", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("group", { name: "KI-Zugriff bestätigen", exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});
test("expired confirmation resumes MCP creation with its chosen settings after password verification", async ({
  page,
  context,
}) => {
  // Let the app supply its fresh CSRF header after session rotation.
  await context.setExtraHTTPHeaders({});
  let needsConfirmation = true;
  const submitted: unknown[] = [];
  await page.route("**/api/mcp-connections", async (route) => {
    if (route.request().method() === "POST") {
      submitted.push(route.request().postDataJSON());
      if (needsConfirmation) {
        needsConfirmation = false;
        await route.fulfill({
          status: 403,
          json: {
            error: "Bitte erneut anmelden, um einen KI-Zugriff freizugeben.",
            code: "reauth_required",
          },
        });
        return;
      }
    }
    await route.continue();
  });
  await page.goto("/");
  await page.locator(".household").click();
  await page.getByText("KI verbinden", { exact: true }).click();
  await page.getByLabel("Name der Verbindung").fill("Bestätigte KI");
  await page.getByLabel("Gültigkeit").selectOption("unlimited");
  await page
    .locator(".mcp-permission-row")
    .filter({ hasText: "Rezepte" })
    .getByLabel("Schreiben", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Verbindung erstellen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "KI-Zugriff bestätigen", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Dein Passwort", { exact: true })
    .fill("wrong-password");
  await page
    .getByRole("button", { name: "Bestätigen und erstellen", exact: true })
    .click();
  await expect(
    page.getByText("Das Passwort stimmt nicht.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("MCP-Schlüssel")).toHaveCount(0);
  await page
    .getByLabel("Dein Passwort", { exact: true })
    .fill("Test password with 20 characters!");
  await page
    .getByRole("button", { name: "Bestätigen und erstellen", exact: true })
    .click();
  await expect(page.getByLabel("MCP-Schlüssel")).toHaveValue(/^foody_mcp_/);
  await expect(page.getByText("Bestätigte KI", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Unbegrenzt gültig", { exact: true }),
  ).toBeVisible();
  expect(submitted).toHaveLength(2);
  expect(submitted[0]).toEqual(submitted[1]);
});
test("write rights cannot remove data and delete-only rights cannot edit content", async ({
  request,
}) => {
  const key = await connection(
    request,
    permissions.filter((permission) => !permission.endsWith(":delete")),
  );
  const writer = await connect(key.token);
  const id = randomUUID(),
    entryId = randomUUID(),
    extraId = randomUUID();
  try {
    await call(writer, "recipes_add", {
      recipes: [
        {
          id,
          recipe: {
            title: "Rechtetest",
            servings: 2,
            minutes: 10,
            ingredients: [],
            steps: ["Kochen."],
          },
        },
      ],
    });
    await call(writer, "plan_add", { id: entryId, recipeId: id, date: week });
    await call(writer, "shopping_add", {
      week,
      items: [{ id: extraId, text: "Kaffee" }],
    });
    expect(
      (
        await writer.callTool({
          name: "recipes_update",
          arguments: {
            id,
            expectedRev: 1,
            requestId: randomUUID(),
            changes: { archived: true },
          },
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await writer.callTool({
          name: "plan_remove",
          arguments: { id: entryId, expectedRev: 1, requestId: randomUUID() },
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await writer.callTool({
          name: "shopping_update",
          arguments: {
            week,
            id: extraId,
            expectedRev: 1,
            requestId: randomUUID(),
            deleted: true,
          },
        })
      ).isError,
    ).toBe(true);
    await call(writer, "recipes_update", {
      id,
      expectedRev: 1,
      requestId: randomUUID(),
      changes: { title: "Bearbeitet" },
    });
    await call(writer, "shopping_update", {
      week,
      id: extraId,
      expectedRev: 1,
      requestId: randomUUID(),
      checked: true,
    });
    const deleteKey = await connection(request, [
      "recipes:delete",
      "plan:delete",
      "shopping:delete",
    ]);
    const remover = await connect(deleteKey.token);
    try {
      expect(
        (await remover.listTools()).tools.map((tool) => tool.name),
      ).toEqual(["recipes_update", "plan_remove", "shopping_update"]);
      expect(
        (
          await remover.callTool({
            name: "recipes_update",
            arguments: {
              id,
              expectedRev: 2,
              requestId: randomUUID(),
              changes: { title: "Verboten" },
            },
          })
        ).isError,
      ).toBe(true);
      expect(
        (
          await remover.callTool({
            name: "shopping_update",
            arguments: {
              week,
              id: extraId,
              expectedRev: 2,
              requestId: randomUUID(),
              checked: false,
            },
          })
        ).isError,
      ).toBe(true);
      await call(remover, "recipes_update", {
        id,
        expectedRev: 2,
        requestId: randomUUID(),
        changes: { archived: true },
      });
      await call(remover, "plan_remove", {
        id: entryId,
        expectedRev: 1,
        requestId: randomUUID(),
      });
      await call(remover, "shopping_update", {
        week,
        id: extraId,
        expectedRev: 2,
        requestId: randomUUID(),
        deleted: true,
      });
      expect((await call(writer, "recipes_get", { id })).data.archived).toBe(
        true,
      );
      expect(
        (await call(writer, "shopping_list", { week })).items.some(
          (item: { id: string }) => item.id === extraId,
        ),
      ).toBe(false);
    } finally {
      await remover.close();
    }
  } finally {
    await writer.close();
  }
});
async function connection(request: APIRequestContext, rights = permissions) {
  const response = await request.post("/api/mcp-connections", {
    data: { name: "Test MCP", permissions: rights, days: 7 },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; token: string };
}
async function connect(token: string) {
  const client = new Client({ name: "Foody test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL("http://localhost:3002/api/mcp"),
      { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
    ),
  );
  return client;
}
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, JSON.stringify(result)).not.toBe(true);
  return JSON.parse((result.content as { text: string }[])[0].text);
}
test("MCP supports bulk recipes, safe editing, planning and shopping actions", async ({
  request,
  page,
}) => {
  const key = await connection(request);
  const client = await connect(key.token);
  try {
    expect((await client.listTools()).tools).toHaveLength(11);
    const id = randomUUID();
    const recipe = {
      title: "MCP Suppe",
      servings: 2,
      minutes: 20,
      ingredients: [{ name: "Karotten", amount: 200, unit: "g" }],
      steps: ["Kochen."],
    };
    const batch = {
      recipes: [
        { id, recipe },
        { id: randomUUID(), recipe: { ...recipe, title: "MCP Pasta" } },
      ],
    };
    expect(
      (await call(client, "recipes_add", batch)).every(
        (r: { saved: boolean }) => r.saved,
      ),
    ).toBe(true);
    await call(client, "recipes_add", batch);
    expect((await call(client, "recipes_list", { query: "MCP" })).total).toBe(
      2,
    );
    expect((await call(client, "recipes_get", { id })).rev).toBe(1);
    await call(client, "recipes_update", {
      id,
      expectedRev: 1,
      requestId: randomUUID(),
      changes: { description: "Neu" },
    });
    const conflict = await client.callTool({
      name: "recipes_update",
      arguments: {
        id,
        expectedRev: 1,
        requestId: randomUUID(),
        changes: { title: "Überschreiben" },
      },
    });
    expect(conflict.isError).toBe(true);
    const entryId = randomUUID();
    await call(client, "plan_add", {
      id: entryId,
      recipeId: id,
      date: week,
      servings: 4,
    });
    await call(client, "plan_update", {
      id: entryId,
      expectedRev: 1,
      requestId: randomUUID(),
      servings: 6,
    });
    expect(
      (await call(client, "plan_list", { week })).meals.some(
        (r: { id: string }) => r.id === entryId,
      ),
    ).toBe(true);
    let list = await call(client, "shopping_list", { week });
    const ingredient = list.items.find(
      (r: { name: string }) => r.name === "Karotten",
    );
    expect(ingredient.amount).toBe(600);
    const checkArgs = {
      week,
      id: ingredient.id,
      expectedRev: ingredient.rev,
      requestId: randomUUID(),
      checked: true,
    };
    await call(client, "shopping_update", checkArgs);
    await call(client, "shopping_update", checkArgs);
    list = await call(client, "shopping_list", { week });
    expect(
      list.items.find((r: { id: string }) => r.id === ingredient.id).checked,
    ).toBe(true);
    await call(client, "shopping_update", {
      week,
      id: ingredient.id,
      expectedRev: 1,
      requestId: randomUUID(),
      deleted: true,
    });
    expect(
      (await call(client, "shopping_list", { week })).items.some(
        (r: { id: string }) => r.id === ingredient.id,
      ),
    ).toBe(false);
    const extraId = randomUUID();
    await call(client, "shopping_add", {
      week,
      items: [
        { id: extraId, text: "Kaffee" },
        { id: randomUUID(), text: "Tee" },
      ],
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Einkaufsliste", exact: true })
      .click();
    await expect(
      page.locator(".shopping-list").getByText("Kaffee", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".shopping-list").getByText("Karotten", { exact: true }),
    ).toHaveCount(0);
    await call(client, "shopping_update", {
      week,
      id: extraId,
      expectedRev: 1,
      requestId: randomUUID(),
      checked: true,
      text: "Espresso",
    });
    await call(client, "shopping_update", {
      week,
      id: extraId,
      expectedRev: 2,
      requestId: randomUUID(),
      deleted: true,
    });
    await call(client, "plan_remove", {
      id: entryId,
      expectedRev: 2,
      requestId: randomUUID(),
    });
    expect(
      (await call(client, "plan_list", { week })).meals.some(
        (r: { id: string }) => r.id === entryId,
      ),
    ).toBe(false);
    expect((await call(client, "recipes_get", { id })).data.description).toBe(
      "Neu",
    );
  } finally {
    await client.close();
  }
});
test("MCP requires a dedicated key, enforces rights and revokes immediately", async ({
  request,
  playwright,
}) => {
  const key = await connection(request, ["recipes:read"]);
  const client = await connect(key.token);
  try {
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "recipes_list",
      "recipes_get",
    ]);
    expect(
      (await client.callTool({ name: "shopping_list", arguments: { week } }))
        .isError,
    ).toBe(true);
    expect(
      (
        await client.callTool({
          name: "recipes_get",
          arguments: { id: randomUUID() },
        })
      ).isError,
    ).toBe(true);
    const listed = await (await request.get("/api/mcp-connections")).json();
    expect(JSON.stringify(listed)).not.toContain(key.token);
    await request.delete(`/api/mcp-connections/${key.id}`);
    await expect(client.listTools()).rejects.toThrow();
    expect(
      (
        await request.post("/api/mcp", {
          data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
        })
      ).status(),
    ).toBe(401);
    const anonymous = await playwright.request.newContext({
      baseURL: "http://localhost:3002",
    });
    try {
      expect((await anonymous.get("/api/mcp-connections")).status()).toBe(401);
      expect(
        (
          await anonymous.post("/api/mcp", {
            headers: {
              Authorization: `Bearer ${key.token}`,
              Origin: "https://evil.example",
            },
            data: {},
          })
        ).status(),
      ).toBe(403);
    } finally {
      await anonymous.dispose();
    }
  } finally {
    await client.close();
  }
});
test("account menu creates an MCP connection with read-only defaults and hides its secret", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".household").click();
  await page.getByText("KI verbinden", { exact: true }).click();
  await page.getByLabel("Name der Verbindung").fill("Meine KI");
  await page.getByLabel("Gültigkeit").selectOption("unlimited");
  await expect(
    page.getByRole("checkbox", { name: "Löschen", exact: true }),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "Verbindung erstellen", exact: true })
    .click();
  await expect(page.getByLabel("MCP-Schlüssel")).toHaveValue(/^foody_mcp_/);
  await page.keyboard.press("Escape");
  await page.locator(".household").click();
  await expect(page.getByLabel("MCP-Schlüssel")).toHaveCount(0);
  await expect(page.getByText("Meine KI", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Unbegrenzt gültig", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Meine KI widerrufen", exact: true })
    .click();
  await page.getByRole("button", { name: "Widerrufen", exact: true }).click();
  await expect(
    page.getByText("Zugriff widerrufen.", { exact: true }),
  ).toBeVisible();
});
