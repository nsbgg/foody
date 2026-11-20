import { load } from "cheerio";
import { lookup } from "node:dns/promises";
import type { ReadableStreamDefaultReader } from "node:stream/web";
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
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}
type Address = { address: string; family: number };
type FetchDependencies = {
  resolve: (hostname: string) => Promise<Address[]>;
  createAgent: (options: Agent.Options) => Agent;
  request: typeof fetch;
  timeoutMs: number;
};
const timeoutMessage =
  "Die Rezeptseite braucht zu lange. Bitte später erneut versuchen.";

// One deadline covers DNS, every redirect and the complete response body.
// Dependencies allow deterministic security tests without external requests.
export function createRecipeFetcher(
  overrides: Partial<FetchDependencies> = {},
) {
  const dependencies: FetchDependencies = {
    resolve: (hostname) => lookup(hostname, { all: true }),
    createAgent: (options) => new Agent(options),
    request: fetch,
    timeoutMs: 12000,
    ...overrides,
  };
  return async (url: string) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ImportError(timeoutMessage));
      }, dependencies.timeoutMs);
    });
    const withinDeadline = <T>(work: Promise<T>) =>
      Promise.race([work, deadline]);
    try {
      let current = new URL(url);
      for (let n = 0; n < 5; n++) {
        if (
          !["https:", "http:"].includes(current.protocol) ||
          current.username ||
          current.password ||
          (current.port && !["80", "443"].includes(current.port))
        )
          throw new ImportError(
            "Nur öffentliche HTTP- oder HTTPS-Rezeptseiten sind erlaubt.",
          );
        const host = current.hostname.replace(/^\[|\]$/g, "");
        const addresses = await withinDeadline(dependencies.resolve(host));
        if (
          !addresses.length ||
          addresses.some((a) => !publicAddress(a.address))
        )
          throw new ImportError(
            "Diese Adresse ist keine öffentliche Rezeptseite.",
          );
        // Pin the validated address to the actual connection, including on every redirect.
        const agent = dependencies.createAgent({
          connect: {
            autoSelectFamily: false,
            lookup: (_hostname, _options, cb) =>
              cb(null, addresses[0].address, addresses[0].family),
          },
        });
        let response: Awaited<ReturnType<typeof fetch>> | undefined;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
          response = await withinDeadline(
            dependencies.request(current, {
              dispatcher: agent,
              redirect: "manual",
              signal: controller.signal,
              headers: {
                "User-Agent": "FoodieRecipeImporter/1.0",
                Accept: "text/html",
              },
            }),
          );
          if (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.get("location")
          ) {
            current = new URL(response.headers.get("location")!, current);
            continue;
          }
          if (!response.ok)
            throw new ImportError(
              `Die Rezeptseite antwortet mit HTTP ${response.status}.`,
            );
          const contentType = (response.headers.get("content-type") || "")
            .split(";")[0]
            .trim()
            .toLowerCase();
          if (
            contentType !== "text/html" &&
            contentType !== "application/xhtml+xml"
          )
            throw new ImportError(
              "Die Adresse liefert keine HTML-Rezeptseite.",
            );
          if (!response.body)
            throw new ImportError("Die Rezeptseite ist leer.");
          reader = response.body.getReader();
          let total = 0;
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await withinDeadline(reader.read());
            if (done) break;
            total += value.length;
            if (total > 2_000_000) {
              throw new ImportError("Die Rezeptseite ist zu groß.");
            }
            chunks.push(value);
          }
          return {
            html: Buffer.concat(chunks).toString("utf8"),
            url: current.href,
          };
        } finally {
          // Do not gracefully close while an unread/hostile body holds the socket.
          // Cancellation itself may wait on the remote stream, so destroy immediately.
          const cancellation = reader
            ? reader.cancel()
            : response?.body?.cancel();
          void cancellation?.catch(() => {});
          await withinDeadline(agent.destroy());
        }
      }
      throw new ImportError("Zu viele Weiterleitungen auf der Rezeptseite.");
    } catch (error) {
      if (error instanceof ImportError) throw error;
      if (controller.signal.aborted) throw new ImportError(timeoutMessage);
      throw new ImportError(
        "Die Rezeptseite konnte nicht geladen werden. Bitte Adresse prüfen und erneut versuchen.",
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
}
export const safeFetch = createRecipeFetcher();
const text = (v: unknown): string =>
  typeof v === "string" ? load(`<div>${v}</div>`)("div").text().trim() : "";
export function extractRecipe(
  html: string,
  source: string,
  fallback?: Partial<Recipe>,
): Recipe {
  try {
    return parseRecipe(html, source, fallback);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(
      "Die Rezeptdaten konnten nicht gelesen werden. Bitte Angaben manuell ergänzen.",
    );
  }
}
function parseRecipe(
  html: string,
  source: string,
  fallback?: Partial<Recipe>,
): Recipe {
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
  if (!found && !fallback?.title)
    throw new ImportError(
      "Kein strukturiertes Rezept gefunden. Du kannst das Gericht manuell anlegen und die Quelle ergänzen.",
    );
  found ??= {};
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
  const ingredients = [found.recipeIngredient || []]
    .flat()
    .map((i: any) =>
      parseIngredient(
        typeof i === "string"
          ? text(i)
          : `${i.value || ""} ${i.unitText || ""} ${i.name || ""}`,
      ),
    )
    .filter((i: any) => i.name);
  const instructions = steps(found.recipeInstructions);
  return {
    title: text(found.name) || fallback?.title || "Importiertes Rezept",
    description:
      text(found.description).slice(0, 1000) || fallback?.description || "",
    servings: Math.max(
      1,
      Number(String([found.recipeYield].flat()[0] || "").match(/\d+/)?.[0]) ||
        fallback?.servings ||
        2,
    ),
    minutes:
      duration(found.totalTime) ||
      duration(found.prepTime) + duration(found.cookTime) ||
      fallback?.minutes ||
      0,
    ingredients: ingredients.length ? ingredients : fallback?.ingredients || [],
    steps: instructions.length ? instructions : fallback?.steps || [],
    image: imageUrl || fallback?.image || "",
    source,
    category:
      text([found.recipeCategory].flat()[0]) ||
      fallback?.category ||
      "Importiert",
    archived: false,
  };
}
