import { test, expect } from "@playwright/test";

test("household app refuses embedding in a frame", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", (message) => messages.push(message.text()));
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Foody Startseite" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.src = "/?framed";
    frame.title = "Synthetic framing attempt";
    document.body.append(frame);
  });
  await expect
    .poll(() =>
      messages.some((message) =>
        /frame-ancestors|X-Frame-Options/i.test(message),
      ),
    )
    .toBe(true);
  await expect(
    page.frameLocator("iframe").getByRole("link", { name: "Foody Startseite" }),
  ).toHaveCount(0);
});

test("Foody branding reaches navigation titles and the installable manifest without changing its identity", async ({
  page,
}) => {
  await page.goto("/");
  const brand = page.getByRole("link", {
    name: "Foody Startseite",
    exact: true,
  });
  await expect(brand).toBeVisible();
  await expect(brand).toContainText("foody");
  await expect(page).toHaveTitle("Wochenplan · Foody");
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await expect(page).toHaveTitle("Gerichte · Foody");
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestUrl).toBeTruthy();
  const response = await page.request.get(manifestUrl!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBe("Foody – Gemeinsam gut essen");
  expect(manifest.short_name).toBe("Foody");
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(manifest.id ?? manifest.start_url).toBe("/");
});
