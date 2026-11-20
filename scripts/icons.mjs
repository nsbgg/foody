import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const svg = await readFile(
  new URL("../public/foody_small.svg", import.meta.url),
  "utf8",
);
for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;width:100%;height:100%}svg{width:100%;height:100%;display:block}</style>${svg}`,
  );
  await page.screenshot({
    path: `public/icon-${size}.png`,
    omitBackground: true,
  });
}
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(
  `<style>html,body{margin:0;width:100%;height:100%;background:#fff;display:grid;place-items:center}svg{width:56%;height:56%}</style>${svg}`,
);
await page.screenshot({ path: "public/icon-maskable.png" });
await browser.close();
