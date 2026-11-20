import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

async function openCook(page: Page, request: APIRequestContext) {
  const id = randomUUID();
  const title = `Displaystatus ${id.slice(0, 8)}`;
  const response = await request.post("/api/sync", {
    data: {
      operations: [
        {
          opId: randomUUID(),
          id,
          kind: "recipe",
          baseRev: 0,
          data: {
            title,
            description: "Synthetic display fixture",
            servings: 2,
            minutes: 0,
            ingredients: [],
            steps: ["Das Gericht servieren."],
            image: "",
            source: "",
            category: "Test",
            archived: false,
          },
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  await expect(
    page.getByText("Alles synchronisiert", { exact: true }),
  ).toHaveText("Alles synchronisiert");
  await page.getByRole("button", { name: "Gerichte", exact: true }).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Kochen", exact: true })
    .click();
}

async function statusFits(page: Page, text: string) {
  const progress = page.locator(".cook-progress");
  const status = progress.getByRole("status");
  await expect(status).toHaveText(text);
  await expect(status.locator("svg")).toHaveCount(1);
  await expect(status.locator("svg.lucide-sun, svg.lucide-moon")).toHaveCount(
    0,
  );
  await expect(status.locator("button")).toHaveCount(0);
  expect(
    await status.evaluate((element) => element.closest("button")),
  ).toBeNull();
  const geometry = await status.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const dialog = element.closest("dialog")!;
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: innerWidth,
      height: innerHeight,
      overflow: dialog.scrollHeight - dialog.clientHeight,
      horizontal: dialog.scrollWidth - dialog.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.horizontal).toBeLessThanOrEqual(1);
}

test("wake status truthfully reports an active lock and its release on a tiny screen", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const sentinel = new EventTarget() as EventTarget & {
      released: boolean;
      release: () => Promise<void>;
    };
    sentinel.released = false;
    sentinel.release = async () => {
      sentinel.released = true;
      sentinel.dispatchEvent(new Event("release"));
    };
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async (type: string) => {
          if (type !== "screen") throw new Error("Unexpected wake lock type");
          return sentinel;
        },
      },
    });
    Object.assign(window, { releaseTestWakeLock: () => sentinel.release() });
  });
  await openCook(page, request);
  await statusFits(page, "Display bleibt an");
  await page.screenshot({ path: "test-results/cook-wake-mobile.png" });
  await page.evaluate(() =>
    (
      window as unknown as { releaseTestWakeLock: () => Promise<void> }
    ).releaseTestWakeLock(),
  );
  await statusFits(page, "Display kann ausgehen");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog:modal")).toHaveCount(0);
});

for (const mode of ["unsupported", "rejected"] as const) {
  test(`wake status reports that the display may sleep when the API is ${mode}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript((mode) => {
      if (mode === "unsupported") {
        delete (Navigator.prototype as unknown as { wakeLock?: unknown })
          .wakeLock;
        delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
      } else {
        Object.defineProperty(navigator, "wakeLock", {
          configurable: true,
          value: {
            request: async () => {
              throw new DOMException("Wake lock denied", "NotAllowedError");
            },
          },
        });
      }
    }, mode);
    await openCook(page, request);
    await statusFits(page, "Display kann ausgehen");
    await expect(
      page
        .locator(".cook-progress")
        .getByText("Display bleibt an", { exact: true }),
    ).toHaveCount(0);
  });
}
