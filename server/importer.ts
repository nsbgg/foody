import { load } from "cheerio";
import { lookup } from "node:dns/promises";
import { Agent, fetch } from "undici";
import ipaddr from "ipaddr.js";
import { parseIngredient, type Recipe } from "../shared/domain.ts";
export function publicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export async function safeFetch(url: string) {
  let current = new URL(url);
  for (let n = 0; n < 5; n++) {
    if (
      !["https:", "http:"].includes(current.protocol) ||
      current.username ||
      current.password ||
      (current.port && !["80", "443"].includes(current.port))
    )
      throw new Error(
        "Nur öffentliche HTTP- oder HTTPS-Rezeptseiten sind erlaubt.",
      );
    const host = current.hostname.replace(/^\[|\]$/g, "");
    const addresses = await lookup(host, { all: true });
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new Error("Diese Adresse ist keine öffentliche Rezeptseite.");
    // Pin the validated address to the actual connection, including on every redirect.
    const agent = new Agent({
      connect: {
        autoSelectFamily: false,
        lookup: (_hostname, _options, cb) =>
          cb(null, addresses[0].address, addresses[0].family),
      },
    });
    try {
      const response = await fetch(current, {
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
        headers: {
          "User-Agent": "FoodieRecipeImporter/1.0",
          Accept: "text/html",
        },
      });
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        await response.body?.cancel();
        current = new URL(response.headers.get("location")!, current);
        continue;
      }
      if (!response.ok)
        throw new Error(
          `Die Rezeptseite antwortet mit HTTP ${response.status}.`,
        );
      const contentType = response.headers.get("content-type") || "";
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml")
      )
        throw new Error("Die Adresse liefert keine HTML-Rezeptseite.");
      const reader = response.body!.getReader();
      let total = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 2_000_000) {
          await reader.cancel();
          throw new Error("Die Rezeptseite ist zu groß.");
        }
        chunks.push(value);
      }
      return {
        html: Buffer.concat(chunks).toString("utf8"),
        url: current.href,
      };
    } finally {
      await agent.close();
    }
  }
  throw new Error("Zu viele Weiterleitungen auf der Rezeptseite.");
}
const text = (v: unknown): string =>
  typeof v === "string" ? load(`<div>${v}</div>`)("div").text().trim() : "";
export function extractRecipe(html: string, source: string): Recipe {
  const $ = load(html);
  let found: any;
  function walk(v: any) {
    if (!v || typeof v !== "object" || found) return;
    if (
      [v["@type"]]
        .flat()
        .some(
          (t) =>
            typeof t === "string" && (t === "Recipe" || t.endsWith("/Recipe")),
        )
    ) {
      found = v;
      return;
    }
    for (const child of Object.values(v))
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {}
  });
  if (!found)
    throw new Error(
      "Kein strukturiertes Rezept gefunden. Du kannst das Gericht manuell anlegen und die Quelle ergänzen.",
    );
  const steps = (v: any): string[] =>
    Array.isArray(v)
      ? v.flatMap(steps)
      : typeof v === "string"
        ? v.split(/\n+/).map(text).filter(Boolean)
        : v?.itemListElement
          ? steps(v.itemListElement)
          : v?.text
            ? [text(v.text)]
            : [];
  const duration = (v: string) => {
    const m = String(v || "").match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
    return m
      ? Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
      : 0;
  };
  const image = [found.image].flat()[0];
  const img = typeof image === "string" ? image : image?.url || "";
  let imageUrl = "";
  try {
    const u = new URL(img, source);
    if (img && ["http:", "https:"].includes(u.protocol)) imageUrl = u.href;
  } catch {}
  return {
    title: text(found.name) || "Importiertes Rezept",
    description: text(found.description).slice(0, 1000),
    servings: Math.max(
      1,
      Number(String([found.recipeYield].flat()[0] || 2).match(/\d+/)?.[0]) || 2,
    ),
    minutes:
      duration(found.totalTime) ||
      duration(found.prepTime) + duration(found.cookTime),
    ingredients: [found.recipeIngredient || []]
      .flat()
      .map((i: any) =>
        parseIngredient(
          typeof i === "string"
            ? text(i)
            : `${i.value || ""} ${i.unitText || ""} ${i.name || ""}`,
        ),
      )
      .filter((i: any) => i.name),
    steps: steps(found.recipeInstructions),
    image: imageUrl,
    source,
    category: text([found.recipeCategory].flat()[0]) || "Importiert",
    archived: false,
  };
}
