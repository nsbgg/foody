import { test, expect } from "./fixtures.ts";

const url = "https://www.chefkoch.de/rezepte/448991137121794/Waffeln.html";
const invalidResponseMessage =
  "Der Importdienst hat keine gültige Antwort gesendet. Bitte versuche es erneut.";

for (const response of [
  { name: "empty proxy error", status: 500, body: "" },
  { name: "HTML gateway error", status: 502, body: "<h1>Bad Gateway</h1>" },
  { name: "truncated JSON", status: 200, body: '{"recipe":' },
]) {
  test(`import explains ${response.name} and allows retry`, async ({
    page,
    request,
  }) => {
    const { rows } = await (await request.get("/api/state")).json();
    const recipe = rows.find((row: any) => row.kind === "recipe").data;
    let attempts = 0;
    await page.route("**/api/import", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ url });
      if (attempts++ === 0) await route.fulfill(response);
      else await route.fulfill({ json: { recipe } });
    });
    await page.goto("/");
    await page.locator(".import-button").click();
    await page.getByLabel("Rezeptadresse").fill(url);
    const submit = page.getByRole("button", { name: "Rezept übernehmen" });
    await submit.click();
    await expect(page.getByRole("alert")).toHaveText(invalidResponseMessage, {
      timeout: 2000,
    });
    await expect(submit).toBeEnabled();
    await expect(page.getByLabel("Rezeptadresse")).toHaveValue(url);
    await submit.click();
    await expect(page.getByLabel("Gerichtname")).toHaveValue(recipe.title);
  });
}

test("import preserves the backend's recipe error", async ({ page }) => {
  const message = "Die Rezeptseite antwortet mit HTTP 403.";
  await page.route("**/api/import", (route) =>
    route.fulfill({ status: 422, json: { error: message } }),
  );
  await page.goto("/");
  await page.locator(".import-button").click();
  await page.getByLabel("Rezeptadresse").fill(url);
  await page.getByRole("button", { name: "Rezept übernehmen" }).click();
  await expect(page.getByRole("alert")).toHaveText(message);
});
