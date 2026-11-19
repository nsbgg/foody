import { test, expect } from "@playwright/test";

test("household app refuses embedding in a frame", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", (message) => messages.push(message.text()));
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Foodie Startseite" }),
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
    page
      .frameLocator("iframe")
      .getByRole("link", { name: "Foodie Startseite" }),
  ).toHaveCount(0);
});
