import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type Locator,
} from "./fixtures.ts";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { dateKey } from "../../shared/domain.ts";

async function fixture(
  request: APIRequestContext,
  planned = false,
  timedStep?: string,
) {
  const id = randomUUID(),
    entryId = randomUUID();
  const recipe = {
    title: `Kochmengen ${id.slice(0, 8)}`,
    description: "Synthetic cooking fixture",
    servings: 2,
    minutes: 15,
    ingredients: [
      { name: "Pasta", amount: 250, unit: "g" },
      { name: "Zwiebel", amount: 1, unit: "Stück" },
      { name: "Rote Linsen", amount: 200, unit: "g" },
      { name: "Blattspinat", amount: 100, unit: "g" },
      { name: "Salz", amount: null, unit: "" },
    ],
    steps: [
      timedStep ??
        "Pasta kochen und Zwiebel schälen. Linsen waschen, Spinat zugeben und mit Salz abschmecken.",
      "100 g Pasta zugeben, dann eine Zwiebel schneiden. Die Hälfte der Linsen und etwas Salz verwenden.",
    ],
    image: "",
    source: "",
    category: "Test",
    archived: false,
  };
  const operations: any[] = [
    { opId: randomUUID(), id, kind: "recipe", baseRev: 0, data: recipe },
  ];
  if (planned)
    operations.push({
      opId: randomUUID(),
      id: entryId,
      kind: "entry",
      baseRev: 0,
      data: {
        date: dateKey(new Date()),
        recipeId: id,
        recipe,
        servings: 4,
        order: Date.now(),
        deleted: false,
      },
    });
  const response = await request.post("/api/sync", { data: { operations } });
  expect(response.ok()).toBe(true);
  return { id, entryId, recipe };
}

async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
}

async function openRecipeCook(page: Page, title: string) {
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Kochen", exact: true })
    .click();
  await expect(page.locator("dialog.fullscreen .cook")).toBeVisible();
}

async function inViewport(locator: Locator) {
  await expect(locator).toBeVisible();
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: innerWidth,
      height: innerHeight,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
}

async function timerFits(page: Page) {
  const panel = page.locator(".cook-panel-timer:modal");
  await inViewport(panel);
  const metrics = await panel.evaluate((element) => {
    const body = element.querySelector<HTMLElement>(".timer-panel")!;
    const face = element.querySelector<HTMLElement>(".timer-face")!;
    const readout = element.querySelector<HTMLElement>(".timer-readout")!;
    const range = document.createRange();
    range.selectNodeContents(readout);
    const text = range.getBoundingClientRect(),
      bounds = face.getBoundingClientRect();
    return {
      panelOverflow: element.scrollHeight - element.clientHeight,
      horizontalOverflow: element.scrollWidth - element.clientWidth,
      bodyOverflow: body.scrollHeight - body.clientHeight,
      gaps: [
        text.left - bounds.left,
        text.top - bounds.top,
        bounds.right - text.right,
        bounds.bottom - text.bottom,
      ],
    };
  });
  expect(metrics.panelOverflow).toBeLessThanOrEqual(1);
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(metrics.bodyOverflow).toBeLessThanOrEqual(1);
  for (const gap of metrics.gaps) expect(gap).toBeGreaterThanOrEqual(-1);
  for (const button of await panel.locator("button:visible").all())
    await inViewport(button);
}

async function chipFits(page: Page) {
  const chip = page.locator(".cook-timer-chip.active");
  await inViewport(chip);
  const close = page.locator("dialog.fullscreen > .close");
  await inViewport(close);
  const a = (await chip.boundingBox())!,
    b = (await close.boundingBox())!;
  const overlaps =
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
  expect(overlaps).toBe(false);
}

test("planned portions appear beside step ingredients while original recipes and explicit amounts remain unchanged", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const data = await fixture(request, true);
  await ready(page);
  await page
    .locator(`[data-entry="${data.entryId}"]`)
    .getByRole("button", { name: /kochen$/ })
    .click();
  const text = page.locator(".cook-step-text");
  await expect(text).toHaveText(
    "500g Pasta kochen und 2 Zwiebel schälen. 400g Linsen waschen, 200g Spinat zugeben und mit Salz abschmecken.",
  );
  await expect(text).not.toContainText("Salz (Rezeptmenge:");
  for (const ingredient of [
    "500g Pasta",
    "2 Zwiebel",
    "400g Linsen",
    "200g Spinat",
    "Salz",
  ])
    await expect(
      text.locator("mark.cook-ingredient").filter({ hasText: ingredient }),
    ).toHaveCount(1);
  await expect(page.locator(".cook-panel:modal")).toHaveCount(0);
  await expect(page.locator(".cook-timer-chip")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Nächster Schritt", exact: true })
    .click();
  await expect(text).toHaveText(data.recipe.steps[1]);
  await expect(text.locator("mark.cook-ingredient")).toHaveText([
    "Pasta",
    "Zwiebel",
    "Linsen",
    "Salz",
  ]);
  const { rows } = await (await request.get("/api/state")).json();
  expect(rows.find((row: any) => row.id === data.id).data).toEqual(data.recipe);
  expect(rows.find((row: any) => row.id === data.entryId).data.recipe).toEqual(
    data.recipe,
  );
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 320, height: 568 },
  { name: "landscape", width: 844, height: 390 },
]) {
  test(`timer lifecycle, minimized header and long durations fit the ${viewport.name} cooking screen`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const data = await fixture(request, false, "Pasta 1 Minute kochen.");
    await ready(page);
    await page.clock.install();
    await openRecipeCook(page, data.recipe.title);
    await page.locator(".cook-timer-chip").click();
    const panel = page.locator(".cook-panel-timer:modal");
    const timer = panel.locator(".timer-panel");
    await expect(timer).toHaveAttribute("data-state", "ready");
    await expect(panel.locator(".timer-hint")).toHaveText(
      "Geräte-Timer hier nicht verfügbar",
    );
    await timerFits(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(
      panel.getByLabel("Timer Minuten", { exact: true }),
    ).toHaveValue("1");
    await panel
      .getByRole("button", { name: "Timer starten", exact: true })
      .click();
    await expect(timer).toHaveAttribute("data-state", "running");
    await timerFits(page);
    await panel
      .getByRole("button", { name: "Minimieren", exact: true })
      .click();
    await expect(panel).toHaveCount(0);
    await chipFits(page);
    const secondsBefore = (await page
      .locator(".timer-chip-value")
      .textContent())!
      .split(":")
      .map(Number)
      .reduce((minutes, seconds) => minutes * 60 + seconds);
    await page.clock.fastForward(10_000);
    const secondsAfter = (await page
      .locator(".timer-chip-value")
      .textContent())!
      .split(":")
      .map(Number)
      .reduce((minutes, seconds) => minutes * 60 + seconds);
    expect(secondsAfter).toBeLessThanOrEqual(secondsBefore - 9);
    expect(secondsAfter).toBeGreaterThanOrEqual(secondsBefore - 13);
    await page.locator(".cook-timer-chip").click();
    await panel.getByRole("button", { name: "Pausieren", exact: true }).click();
    await expect(timer).toHaveAttribute("data-state", "paused");
    await timerFits(page);
    const paused = await panel.locator(".timer-readout").textContent();
    await page.clock.fastForward(30_000);
    await expect(panel.locator(".timer-readout")).toHaveText(paused!);
    await panel
      .getByRole("button", { name: "Minimieren", exact: true })
      .click();
    await expect(page.locator(".cook-timer-chip")).toHaveAccessibleName(
      /pausiert/,
    );
    await page.reload();
    await expect(
      page.getByText("Alles synchronisiert", { exact: true }),
    ).toHaveText("Alles synchronisiert");
    await openRecipeCook(page, data.recipe.title);
    await expect(page.locator(".cook-timer-chip")).toHaveAccessibleName(
      /pausiert/,
    );
    await chipFits(page);
    await page.locator(".cook-timer-chip").click();
    await expect(timer).toHaveAttribute("data-state", "paused");
    await expect(panel.locator(".timer-readout")).toHaveText(paused!);
    await panel
      .getByRole("button", { name: "Fortsetzen", exact: true })
      .click();
    await expect(timer).toHaveAttribute("data-state", "running");
    await page.clock.fastForward(65_000);
    await expect(timer).toHaveAttribute("data-state", "finished");
    await expect(panel.locator(".timer-readout")).toHaveText("0:00");
    await expect(page.locator(".cook > [role=status]")).toHaveText(
      "Timer abgelaufen",
    );
    await timerFits(page);
    await panel
      .getByRole("button", { name: "Zurücksetzen", exact: true })
      .click();
    await expect(timer).toHaveAttribute("data-state", "ready");
    await expect(
      panel.getByLabel("Timer Minuten", { exact: true }),
    ).toHaveValue("1");
    await panel.getByLabel("Timer Minuten", { exact: true }).fill("1440");
    await timerFits(page);
    await panel
      .getByRole("button", { name: "Timer starten", exact: true })
      .click();
    await expect(timer).toHaveAttribute("data-state", "running");
    await timerFits(page);
    if (viewport.name !== "landscape")
      await page.screenshot({
        path: `test-results/cook-timer-${viewport.name}.png`,
      });
    await panel
      .getByRole("button", { name: "Minimieren", exact: true })
      .click();
    await chipFits(page);
    await page
      .getByRole("button", { name: "Nächster Schritt", exact: true })
      .click();
    await expect(
      page.getByText("Schritt 2 von 2", { exact: true }),
    ).toBeVisible();
    await chipFits(page);
    await page.locator(".cook-timer-chip").click();
    await panel.getByRole("button", { name: "Beenden", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".cook-timer-chip")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog:modal")).toHaveCount(0);
  });
}

for (const viewport of [
  { name: "tiny", width: 320, height: 568 },
  { name: "landscape", width: 844, height: 390 },
]) {
  test(`recipe durations include seconds and offer multiple times on ${viewport.name} screens`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const data = await fixture(
      request,
      false,
      "Pasta 30 Sekunden rühren und danach 2 Minuten kochen.",
    );
    await ready(page);
    await page.clock.install();
    await openRecipeCook(page, data.recipe.title);
    await page.locator(".cook-timer-chip").click();
    const panel = page.locator(".cook-panel-timer:modal");
    const minutes = panel.getByLabel("Timer Minuten", { exact: true });
    const choices = panel.getByRole("combobox", {
      name: "Zeit im Rezept",
      exact: true,
    });
    await expect(minutes).toHaveValue("0.5");
    await timerFits(page);
    await inViewport(choices);
    await inViewport(minutes);
    await expect(choices.locator("option:enabled")).toHaveCount(2);
    await choices.selectOption("120");
    await expect(minutes).toHaveValue("2");
    await choices.selectOption("30");
    await panel
      .getByRole("button", { name: "Timer starten", exact: true })
      .click();
    await expect(panel.locator(".timer-readout")).toHaveText("0:30");
    await page.clock.fastForward(31_000);
    await expect(panel.locator(".timer-panel")).toHaveAttribute(
      "data-state",
      "finished",
    );
    await panel
      .getByRole("button", { name: "Zurücksetzen", exact: true })
      .click();
    await expect(minutes).toHaveValue("0.5");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
