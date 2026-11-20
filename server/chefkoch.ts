import { load } from "cheerio";
import {
  Category,
  ChefkochAPI,
  Ingredient as ChefkochIngredient,
  Recipe as ChefkochRecipe,
} from "chefkoch-api";
import {
  ingredientSchema,
  parseIngredient,
  type Recipe,
} from "../shared/domain.ts";

// Only use the package's local models/normalizer. Its network methods cannot
// accept our bounded, DNS-pinned transport and must never fetch user URLs.
const api = new ChefkochAPI();
const clean = (value: string) =>
  String(api.beautifyText(value.replace(/\s+/gu, " ")));

export function isChefkochRecipeUrl(source: string): boolean {
  try {
    const url = new URL(source);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["chefkoch.de", "www.chefkoch.de"].includes(url.hostname.toLowerCase()) &&
      !url.username &&
      !url.password &&
      (!url.port || ["80", "443"].includes(url.port)) &&
      /^\/rezepte\/\d+\/[^/]+\.html$/iu.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function instructionParts(text: string): string[] {
  const result: string[] = [];
  for (const paragraph of text.split(/\n+/u).map(clean).filter(Boolean)) {
    let remaining = paragraph;
    while (remaining.length > 5000) {
      const boundary = remaining.lastIndexOf(" ", 5000);
      const end = boundary > 2500 ? boundary : 5000;
      result.push(remaining.slice(0, end));
      remaining = remaining.slice(end).trim();
    }
    if (remaining) result.push(remaining);
    if (result.length > 200) return [];
  }
  return result;
}

/** Map already-fetched Chefkoch HTML without issuing any network requests.
 * JSON-LD remains the caller's preferred source; this only supplies evidence-
 * backed fallback fields, never invented portions or placeholder instructions.
 */
export function extractChefkochRecipe(
  html: string,
  source: string,
): Partial<Recipe> | null {
  if (!isChefkochRecipeUrl(source)) return null;
  const $ = load(html);
  const title = clean($("h1").first().text());
  if (
    !title ||
    /^(?:404\b|seite nicht gefunden|rezept nicht gefunden|access denied|zugriff verweigert)/iu.test(
      title,
    )
  )
    return null;

  const ingredients: ChefkochIngredient[] = [];
  $("table.ingredients tr").each((_index, row) => {
    const name = clean($(row).find("td.td-right").text());
    const amount = clean($(row).find("td.td-left").text());
    if (name && ingredients.length < 300)
      ingredients.push(new ChefkochIngredient(name, amount));
  });
  const instruction = $(".ds-recipe-instructions, .instructions")
    .first()
    .clone();
  instruction.find("script, style, button").remove();
  instruction.find("br").replaceWith("\n");
  instruction.find("p, li").append("\n\n");
  const steps = instructionParts(instruction.text());
  if (!ingredients.length && !steps.length) return null;

  const model = new ChefkochRecipe(
    title,
    source,
    ingredients,
    new Category("Chefkoch", "https://www.chefkoch.de/rezepte/"),
  );
  const parsed = model
    .getIngredients()
    .map((ingredient) => {
      const item = parseIngredient(
        `${ingredient.getAmount()} ${ingredient.getName()}`.trim(),
      );
      return ingredientSchema.safeParse({
        ...item,
        name: item.name.slice(0, 200),
        unit: item.unit.slice(0, 40),
      });
    })
    .filter((item) => item.success)
    .map((item) => item.data);
  const result: Partial<Recipe> = {
    title: String(model.getName()).slice(0, 160),
    category: String(model.getCategory().getName()),
  };
  if (parsed.length) result.ingredients = parsed;
  if (steps.length) result.steps = steps;

  const portionControls = $(
    "input[name=portionen], input[name=portions], #divisor, [data-servings], [data-portions], [data-portionen]",
  );
  portionControls.each((_index, element) => {
    if (result.servings !== undefined) return;
    const node = $(element);
    const raw =
      node.attr("value") ??
      node.attr("data-servings") ??
      node.attr("data-portions") ??
      node.attr("data-portionen") ??
      (node.attr("id") === "divisor" ? node.text() : "");
    if (!/^\d+(?:[.,]\d+)?$/u.test(raw.trim())) return;
    const servings = Number(raw.trim().replace(",", "."));
    if (servings > 0 && servings <= 1000) result.servings = servings;
  });

  const description = clean(
    $(".recipe-subtitle").first().text() || $(".recipe-text").first().text(),
  );
  if (description) result.description = description.slice(0, 1000);
  const image = $("meta[property='og:image']").first().attr("content");
  if (image) {
    try {
      const url = new URL(image, source);
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.href.length <= 2000
      )
        result.image = url.href;
    } catch {
      /* Invalid optional images do not invalidate the recipe. */
    }
  }
  const time = $("time[itemprop=totalTime]").first();
  const iso = time.attr("datetime") ?? time.attr("content") ?? "";
  const duration = iso.match(
    /^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/iu,
  );
  if (duration && duration.slice(1).some((value) => value !== undefined)) {
    const [days, hours, minutes, seconds] = duration
      .slice(1)
      .map((value) => Number((value || "0").replace(",", ".")));
    const total = days * 1440 + hours * 60 + minutes + seconds / 60;
    if (Number.isFinite(total) && total <= 10000) result.minutes = total;
  }
  return result;
}
