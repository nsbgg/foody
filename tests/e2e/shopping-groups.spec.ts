import { test, expect } from "./fixtures.ts";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

test("shopping areas include extras, preserve checks and remember the preference", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
  await page
    .getByRole("button", { name: "Einkaufsliste", exact: true })
    .click();
  const add = page.getByRole("textbox", {
    name: "Zusätzlicher Einkaufsartikel",
  });
  const suffix = randomUUID().slice(0, 8);
  const [coffeeName, frozenName, householdName, otherName] = [
    "Kaffee",
    "TK-Erbsen",
    "Spülmittel",
    "Mein spezieller Artikel",
  ].map((name) => `${name} ${suffix}`);
  for (const name of [coffeeName, frozenName, householdName, otherName]) {
    await add.fill(name);
    await page.getByRole("button", { name: "Ergänzen", exact: true }).click();
  }
  const coffee = page.getByRole("checkbox", {
    name: `${coffeeName} Zusätzlich`,
    exact: true,
  });
  await coffee.check();
  const normalView = page.getByRole("button", {
    name: "Normale Liste",
    exact: true,
  });
  const storeView = page.getByRole("button", {
    name: "Nach Supermarktbereich",
    exact: true,
  });
  await expect(normalView).toHaveAttribute(
    "title",
    "Alle Artikel als einfache Liste",
  );
  await expect(storeView).toHaveAttribute(
    "title",
    "Artikel nach Supermarktbereich gruppieren",
  );
  await page
    .getByRole("button", { name: "Nach Supermarktbereich", exact: true })
    .click();
  await expect(coffee).toBeChecked();
  await expect(
    page
      .getByRole("list", { name: "Getränke & Kaffee", exact: true })
      .getByText(coffeeName, { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Tiefkühlung", exact: true })
      .getByText(frozenName),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Haushalt & Drogerie", exact: true })
      .getByText(householdName),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Sonstiges", exact: true })
      .getByText(otherName),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Einkaufsliste", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Nach Supermarktbereich", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(coffee).toBeChecked();
  await page
    .getByRole("button", { name: "Normale Liste", exact: true })
    .press("Space");
  await expect(
    page.getByRole("button", { name: "Nach Supermarktbereich", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".shopping-list")).toHaveCount(1);
  await expect(coffee).toBeChecked();
  await coffee.uncheck();
  await expect(coffee).not.toBeChecked();
});
