import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("account forms create a household and manage a real passkey", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto("/");
  await page
    .getByRole("group", { name: "Zugang wählen" })
    .getByRole("button", { name: "Account erstellen" })
    .click();
  await page.getByLabel("Dein Name").fill("Mila Küche");
  await page
    .getByLabel("E-Mail-Adresse", { exact: true })
    .fill(`ui-${crypto.randomUUID()}@example.com`);
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Unser-gemeinsamer-Test-123");
  await page
    .locator("form")
    .getByRole("button", { name: "Account erstellen" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Wer sitzt mit am Tisch?" }),
  ).toBeVisible();
  await page.getByLabel("Name des Haushalts").fill("Milas Küche");
  await page
    .getByRole("button", { name: "Haushalt erstellen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Wochenplan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account-Menü", exact: true }).click();
  const panel = page.getByRole("region", { name: "Account", exact: true });
  await expect(
    panel.getByRole("heading", { name: "Mila Küche" }),
  ).toBeVisible();
  await panel.getByText("Person einladen", { exact: true }).click();
  await panel
    .getByLabel("E-Mail-Adresse der Person")
    .fill("partner@example.com");
  await panel
    .getByRole("button", { name: "Einladung erstellen", exact: true })
    .click();
  await expect(
    panel.getByRole("textbox", { name: "Einladungscode", exact: true }),
  ).not.toHaveValue("");
  await panel
    .locator("summary")
    .filter({ hasText: "Passkey hinzufügen" })
    .click();
  await panel.getByLabel("Name des Passkeys").fill("Mein Testhandy");
  await panel
    .getByRole("button", { name: "Passkey hinzufügen", exact: true })
    .click();
  await expect(
    panel.getByText("Passkey hinzugefügt", { exact: true }),
  ).toBeVisible();
  await expect(
    panel
      .getByRole("list", { name: "Deine Passkeys" })
      .getByText("Mein Testhandy", { exact: true }),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .include("#account-menu")
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await panel.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mit Passkey anmelden", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mit Passkey anmelden", exact: true })
    .click();
  await page
    .getByLabel("Aktiver Haushalt")
    .selectOption({ label: "Milas Küche · Verwaltung" });
  await expect(
    page.getByRole("heading", { name: "Wochenplan", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Account-Menü", exact: true }).click();
  const bounds = await panel.boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/account-mobile.png",
    fullPage: true,
  });
});
