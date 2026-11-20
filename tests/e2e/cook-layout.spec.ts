import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

const longStep =
  (
    "Das Gemüse waschen, sorgfältig schneiden und gleichmäßig in der Pfanne verteilen. ".repeat(
      60,
    ) + "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(40)
  ).slice(0, 4000) + "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(39).slice(0, 1000);
const viewports = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
  { label: "landscape", width: 844, height: 390 },
  { label: "tiny", width: 320, height: 568 },
  // A 1440 × 900 screen at 200% browser zoom has this CSS layout viewport.
  { label: "zoom-reflow", width: 720, height: 450 },
];

async function createFixture(request: APIRequestContext, timed = false) {
  const { rows } = await (await request.get("/api/state")).json();
  const template = rows.find((row: any) => row.kind === "recipe").data;
  const id = randomUUID();
  const title = `Kochansicht ${id.slice(0, 8)}`;
  const ingredients = Array.from({ length: 60 }, (_, index) => ({
    name: `Zutat ${String(index + 1).padStart(2, "0")}${index === 0 ? " Langname".repeat(20) : ""}`,
    amount: index + 1,
    unit: "g",
  }));
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
            ingredients,
            servings: 2,
            steps: [
              timed ? "Das Gemüse 1 Minute in der Pfanne garen." : longStep,
              "Alles kurz abschmecken und gemeinsam servieren.",
            ],
            image: "",
            source: "",
          },
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
  return { id, title, ingredients };
}

async function openCook(page: Page, title: string) {
  await page.getByRole("button", { name: title, exact: true }).click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Kochen", exact: true })
    .click();
  await expect(page.locator("dialog.fullscreen .cook")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await frames(page);
}

async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function assertHiddenScrollbars(locator: Locator) {
  const styles = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      scrollbarWidth: style.scrollbarWidth,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
    };
  });
  expect(styles).toEqual({
    scrollbarWidth: "none",
    overflowX: "hidden",
    overflowY: "hidden",
  });
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

async function assertStepFits(page: Page) {
  const dialog = page.locator("dialog.fullscreen");
  await inViewport(
    dialog.getByRole("button", { name: "Schließen", exact: true }),
  );
  await inViewport(dialog.locator(".cook-nav"));
  const geometry = await dialog.evaluate((element) => {
    const cook = element.querySelector<HTMLElement>(".cook")!;
    const step = element.querySelector<HTMLElement>(".cook-step")!;
    const text = element.querySelector<HTMLElement>(
      ".cook-step-text:not(.cook-measure)",
    )!;
    const navigation = element.querySelector<HTMLElement>(".cook-nav")!;
    const rect = element.getBoundingClientRect();
    const stepRect = step.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(text);
    const textRect = range.getBoundingClientRect();
    return {
      dialogOverflow: element.scrollHeight - element.clientHeight,
      cookOverflow: cook.scrollHeight - cook.clientHeight,
      stepOverflow: step.scrollHeight - step.clientHeight,
      horizontalOverflow: element.scrollWidth - element.clientWidth,
      widthDifference: Math.abs(rect.width - innerWidth),
      heightDifference: Math.abs(rect.height - innerHeight),
      textLeft: textRect.left - stepRect.left,
      textTop: textRect.top - stepRect.top,
      textRight: stepRect.right - textRect.right,
      textBottom: stepRect.bottom - textRect.bottom,
      navigationGap: navigation.getBoundingClientRect().top - stepRect.bottom,
      fontSize: parseFloat(getComputedStyle(text).fontSize),
    };
  });
  expect(geometry.dialogOverflow).toBeLessThanOrEqual(1);
  expect(geometry.cookOverflow).toBeLessThanOrEqual(1);
  expect(geometry.stepOverflow).toBeLessThanOrEqual(1);
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(geometry.widthDifference).toBeLessThanOrEqual(2);
  expect(geometry.heightDifference).toBeLessThanOrEqual(2);
  for (const gap of [
    geometry.textLeft,
    geometry.textTop,
    geometry.textRight,
    geometry.textBottom,
    geometry.navigationGap,
  ])
    expect(gap).toBeGreaterThanOrEqual(-1);
  expect(geometry.fontSize).toBeGreaterThanOrEqual(20);
}

for (const viewport of viewports) {
  test(`cooking uses the complete ${viewport.label} viewport and exposes all long-step text without scrolling`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    expect(longStep).toHaveLength(5000);
    const fixture = await createFixture(request);
    await page.goto("/");
    await expect(
      page.getByText("Alles synchronisiert", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Gerichte", exact: true }).click();
    const normalScrollbar = await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).scrollbarWidth);
    await openCook(page, fixture.title);
    await expect(page.locator("html")).toHaveCSS("scrollbar-width", "none");
    await assertHiddenScrollbars(page.locator("dialog.fullscreen"));
    await expect(
      page.getByLabel("Timer Minuten", { exact: true }),
    ).toBeHidden();
    await expect(page.locator(".cook-panel:visible")).toHaveCount(0);
    const text = page.locator(".cook-step-text:not(.cook-measure)");
    const indicator = page.locator(".cook").getByText(/^Seite \d+ von \d+$/);
    await expect(indicator).toBeVisible();
    const count = Number(
      (await indicator.textContent())!.match(/von (\d+)/)![1],
    );
    expect(count).toBeGreaterThan(1);
    expect(count).toBeLessThan(200);
    await expect(
      page.getByRole("button", { name: "Nächster Schritt", exact: true }),
    ).toBeDisabled();
    const pages: string[] = [];
    for (let index = 0; index < count; index++) {
      await expect(indicator).toHaveText(`Seite ${index + 1} von ${count}`);
      await frames(page);
      await assertStepFits(page);
      pages.push((await text.textContent())!);
      if (
        index === 0 &&
        ["desktop", "mobile", "landscape"].includes(viewport.label)
      ) {
        await page.screenshot({
          path: `test-results/cook-${viewport.label}.png`,
        });
      }
      if (index < count - 1)
        await page
          .getByRole("button", { name: "Nächste Textseite", exact: true })
          .click();
    }
    expect(pages.join("")).toBe(longStep);
    const scrollBefore = await page.evaluate(() => ({
      page: scrollY,
      dialog: document.querySelector("dialog.fullscreen")!.scrollTop,
    }));
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 800);
    await frames(page);
    expect(
      await page.evaluate(() => ({
        page: scrollY,
        dialog: document.querySelector("dialog.fullscreen")!.scrollTop,
      })),
    ).toEqual(scrollBefore);
    await page
      .getByRole("button", { name: "Nächster Schritt", exact: true })
      .click();
    await expect(
      page.getByText("Schritt 2 von 2", { exact: true }),
    ).toBeVisible();
    await assertStepFits(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog:modal")).toHaveCount(0);
    await expect(page.locator("html")).toHaveCSS(
      "scrollbar-width",
      normalScrollbar,
    );
    await openCook(page, fixture.title);
    await expect(
      page.getByText("Schritt 2 von 2", { exact: true }),
    ).toBeVisible();
  });
}

test("optional cooking panels keep all ingredients and timer controls reachable on a tiny screen", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const fixture = await createFixture(request, true);
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await openCook(page, fixture.title);
  await page
    .locator(".cook")
    .getByRole("button", { name: "Zutaten", exact: true })
    .click();
  const panel = page.locator("dialog.cook-panel:modal");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(panel).toBeVisible();
  await assertHiddenScrollbars(panel);
  await inViewport(
    panel.getByRole("button", { name: "Zurück zum Schritt", exact: true }),
  );
  const indicator = panel.getByText(/^Seite \d+ von \d+$/);
  await expect(indicator).toBeVisible();
  const count = Number((await indicator.textContent())!.match(/von (\d+)/)![1]);
  const pages: string[] = [];
  for (let index = 0; index < count; index++) {
    await expect(indicator).toHaveText(`Seite ${index + 1} von ${count}`);
    const text = panel.locator(".cook-panel-text:not(.cook-measure)");
    await inViewport(text);
    pages.push((await text.textContent())!);
    expect(
      await panel.evaluate(
        (element) => element.scrollHeight <= element.clientHeight + 1,
      ),
    ).toBe(true);
    if (index < count - 1)
      await panel
        .getByRole("button", { name: "Nächste Zutatenseite", exact: true })
        .click();
  }
  const normalized = pages.join("").replace(/\s/g, "");
  for (const ingredient of fixture.ingredients)
    expect(normalized).toContain(ingredient.name.replace(/\s/g, ""));
  await panel
    .getByRole("button", { name: "Zurück zum Schritt", exact: true })
    .click();
  await page
    .locator(".cook")
    .getByRole("button", { name: /^Timer(?:\s|$)/ })
    .click();
  await expect(panel).toBeVisible();
  await assertHiddenScrollbars(panel);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await inViewport(
    panel.getByRole("button", { name: "Timer starten", exact: true }),
  );
  await page.getByLabel("Timer Minuten", { exact: true }).fill("1");
  await panel
    .getByRole("button", { name: "Timer starten", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "{}").deadline,
        `foodie-cook:${fixture.id}`,
      ),
    )
    .toBeGreaterThan(Date.now());
  if (await panel.isVisible())
    await panel
      .getByRole("button", { name: "Zurück zum Schritt", exact: true })
      .click();
  await assertStepFits(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog:modal")).toHaveCount(0);
});
