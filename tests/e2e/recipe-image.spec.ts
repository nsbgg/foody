import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isStoredRecipeImage } from "../../shared/recipe-image.ts";
import AxeBuilder from "@axe-core/playwright";

const picture = readFileSync(
  new URL("../../public/icon-192.png", import.meta.url),
);

test("uploaded picture survives offline reload, syncs and displays on another device", async ({
  page,
  context,
  request,
  browser,
}) => {
  await page.goto("/");
  await expect(page.locator(".sync-status")).toHaveText("Alles synchronisiert");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Neues Gericht", exact: true })
    .click();
  const title = `Bild ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Gerichtname").fill(title);
  await page
    .getByLabel("Schritt 1", { exact: true })
    .fill("Zutaten zubereiten.");
  const largePicture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1600;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#36a86d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Bilder hochladen (optional)").setInputFiles({
    name: "gericht.png",
    mimeType: "image/png",
    buffer: Buffer.from(largePicture, "base64"),
  });
  const preview = page.getByRole("img", { name: "Vorschau von Bild 1" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  expect(
    await preview.evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBe(1280);
  await page
    .getByRole("button", { name: "Gericht speichern", exact: true })
    .click();
  await expect(page.locator("dialog.dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  const card = page
    .locator(".recipe-card")
    .filter({ has: page.getByRole("button", { name: title, exact: true }) });
  await expect(card.locator("img.food-art")).toHaveAttribute(
    "src",
    /^data:image\/jpeg;base64,/,
  );
  await context.setOffline(false);
  await expect(page.locator(".sync-status")).toHaveText("Alles synchronisiert");
  const { rows } = await (await request.get("/api/state")).json();
  const recipe = rows.find(
    (row: any) => row.kind === "recipe" && row.data.title === title,
  );
  expect(isStoredRecipeImage(recipe.data.image)).toBe(true);
  const otherDevice = await browser.newPage();
  try {
    await otherDevice.goto(new URL("/", page.url()).href);
    await otherDevice
      .getByRole("button", { name: "Gerichte", exact: true })
      .click();
    const otherCard = otherDevice.locator(".recipe-card").filter({
      has: otherDevice.getByRole("button", { name: title, exact: true }),
    });
    await expect(otherCard.locator("img.food-art")).toHaveAttribute(
      "src",
      recipe.data.image,
    );
  } finally {
    await otherDevice.close();
  }
  await card.getByRole("button", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await expect(preview).toBeVisible();
  await page
    .getByRole("button", { name: "Bild 1 entfernen", exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  await page
    .getByRole("button", { name: "Gericht speichern", exact: true })
    .click();
  await expect(card.locator("img.food-art")).toHaveCount(0);
});

test("unsupported, corrupt and oversized image files show errors without replacing a valid picture", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Neues Gericht", exact: true })
    .click();
  const input = page.getByLabel("Bilder hochladen (optional)");
  await input.setInputFiles({
    name: "bild.png",
    mimeType: "image/png",
    buffer: picture,
  });
  const preview = page.getByRole("img", { name: "Vorschau von Bild 1" });
  await expect(preview).toBeVisible();
  const original = await preview.getAttribute("src");
  for (const [name, mimeType, buffer, message] of [
    [
      "bild.svg",
      "image/svg+xml",
      Buffer.from("<svg></svg>"),
      "JPG-, PNG- oder WebP",
    ],
    ["kaputt.jpg", "image/jpeg", Buffer.from("not a picture"), "nicht gelesen"],
    [
      "gross.jpg",
      "image/jpeg",
      Buffer.alloc(10 * 1024 * 1024 + 1),
      "höchstens 10 MB",
    ],
  ] as const) {
    await input.setInputFiles({ name, mimeType, buffer });
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(preview).toHaveAttribute("src", original!);
  }
  await input.setInputFiles(
    Array.from({ length: 8 }, (_, index) => ({
      name: `${index}.png`,
      mimeType: "image/png",
      buffer: picture,
    })),
  );
  await expect(page.getByRole("alert")).toContainText("höchstens 8 Bilder");
  await expect(preview).toHaveAttribute("src", original!);
  await input.setInputFiles([
    { name: "gut.png", mimeType: "image/png", buffer: picture },
    {
      name: "kaputt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("not a picture"),
    },
  ]);
  await expect(page.getByRole("alert")).toContainText("nicht gelesen");
  await expect(page.locator(".recipe-image-preview")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("multiple uploads support a cover, gallery switching and removing the cover after reload", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Neues Gericht", exact: true })
    .click();
  const title = `Galerie ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Gerichtname").fill(title);
  await page
    .getByLabel("Schritt 1", { exact: true })
    .fill("Kochen und genießen.");
  const secondPicture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#c24d29";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Bilder hochladen (optional)").setInputFiles([
    { name: "erstes.png", mimeType: "image/png", buffer: picture },
    {
      name: "zweites.png",
      mimeType: "image/png",
      buffer: Buffer.from(secondPicture, "base64"),
    },
  ]);
  await expect(page.locator(".recipe-image-preview")).toHaveCount(2);
  const first = await page
    .getByRole("img", { name: "Vorschau von Bild 1", exact: true })
    .getAttribute("src");
  const second = await page
    .getByRole("img", { name: "Vorschau von Bild 2", exact: true })
    .getAttribute("src");
  expect(first).not.toBe(second);
  await page
    .getByRole("button", {
      name: "Bild 2 als Titelbild verwenden",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("img", { name: "Vorschau von Bild 1", exact: true }),
  ).toHaveAttribute("src", second!);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Gericht speichern", exact: true })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Alles synchronisiert");
  const { rows } = await (await request.get("/api/state")).json();
  const saved = rows.find(
    (row: any) => row.kind === "recipe" && row.data.title === title,
  );
  expect(saved.data.image).toBe(second);
  expect(saved.data.images).toEqual([first]);
  await page.reload();
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  const card = page
    .locator(".recipe-card")
    .filter({ has: page.getByRole("button", { name: title, exact: true }) });
  await expect(card.locator("img.food-art")).toHaveAttribute("src", second!);
  await card.getByRole("button", { name: title, exact: true }).click();
  await expect(page.locator("dialog > img.food-art")).toHaveAttribute(
    "src",
    second!,
  );
  await page
    .getByRole("button", { name: "Bild 2 anzeigen", exact: true })
    .click();
  await expect(page.locator("dialog > img.food-art")).toHaveAttribute(
    "src",
    first!,
  );
  await expect(
    page.getByRole("button", { name: "Bild 2 anzeigen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await page
    .getByRole("button", { name: "Bild 1 entfernen", exact: true })
    .click();
  await expect(page.locator(".recipe-image-preview")).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: "Vorschau von Bild 1", exact: true }),
  ).toHaveAttribute("src", first!);
  await page
    .getByRole("button", { name: "Gericht speichern", exact: true })
    .click();
  await expect(card.locator("img.food-art")).toHaveAttribute("src", first!);
});
