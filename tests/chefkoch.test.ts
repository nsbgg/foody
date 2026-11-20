import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { ChefkochAPI } from "chefkoch-api";
import {
  extractChefkochRecipe,
  isChefkochRecipeUrl,
} from "../server/chefkoch.ts";
import { createRecipeImporter } from "../server/recipe-import.ts";
import { ImportError } from "../server/importer.ts";

const source = "https://www.chefkoch.de/rezepte/123456/Synthetische-Pasta.html";
const classic = `<!doctype html><html><body>
  <h1> Synthetische Pasta </h1>
  <table class="ingredients"><tbody>
    <tr><td class="td-left"><span>250 g</span></td><td class="td-right"><span><a href="http://127.0.0.1/private">Pasta</a></span></td></tr>
    <tr><td class="td-left"><span>1</span></td><td class="td-right"><span>Zwiebel</span></td></tr>
    <tr><td class="td-left"><span></span></td><td class="td-right"><span>Salz</span></td></tr>
  </tbody></table>
  <input name="portionen" value="3">
  <div class="ds-recipe-instructions"><p>Pasta 10 Minuten kochen.</p><p>Zwiebel schneiden &amp; zugeben.</p></div>
  <ol class="ds-col-12"><li><a href="http://127.0.0.1/private">Kategorie</a></li></ol>
  </body></html>`;

function structured(data: object) {
  return `<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", ...data })}</script>`;
}

test("Chefkoch recognition requires the exact provider host and a recipe path", () => {
  for (const url of [
    source,
    source.replace("www.", ""),
    source.replace("https:", "http:"),
  ])
    assert.equal(isChefkochRecipeUrl(url), true, url);
  for (const url of [
    source.replace("www.chefkoch.de", "www.chefkoch.de.evil.example"),
    source.replace("www.chefkoch.de", "evilchefkoch.de"),
    source.replace("www.chefkoch.de", "chefkoch.de@evil.example"),
    source.replace("https:", "ftp:"),
    source.replace("https:", "javascript:"),
    "https://www.chefkoch.de/rezepte/kategorien/",
    "https://www.chefkoch.de/rs/s0/pasta/Rezepte.html",
    "not a URL",
  ])
    assert.equal(isChefkochRecipeUrl(url), false, url);
});

test("classic Chefkoch markup maps measured and unknown ingredients, portions and steps", () => {
  const recipe = extractChefkochRecipe(classic, source);
  assert.ok(recipe);
  assert.equal(recipe.title, "Synthetische Pasta");
  assert.equal(recipe.servings, 3);
  assert.deepEqual(recipe.ingredients, [
    { name: "Pasta", amount: 250, unit: "g" },
    { name: "Zwiebel", amount: 1, unit: "" },
    { name: "Salz", amount: null, unit: "" },
  ]);
  assert.deepEqual(recipe.steps, [
    "Pasta 10 Minuten kochen.",
    "Zwiebel schneiden & zugeben.",
  ]);
});

test("partial Chefkoch pages leave missing instructions and quantities for editing", async () => {
  const html = `<h1>Unvollständiges Gericht</h1><table class="ingredients"><tr><td class="td-left"></td><td class="td-right">Salz</td></tr></table>`;
  const result = await createRecipeImporter(async () => ({
    html,
    url: source,
  }))(source);
  assert.equal(result.title, "Unvollständiges Gericht");
  assert.deepEqual(result.ingredients, [
    { name: "Salz", amount: null, unit: "" },
  ]);
  assert.deepEqual(result.steps, []);
  assert.equal(result.source, source);
  assert.equal(extractChefkochRecipe("<p>No recipe</p>", source), null);
});

test("structured fields take precedence and Chefkoch fills only missing fields", async () => {
  const html =
    classic +
    structured({
      name: "Strukturierter Titel",
      recipeYield: "4 Portionen",
      recipeIngredient: ["100 g Reis"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Reis kochen." }],
    });
  const result = await createRecipeImporter(async () => ({
    html,
    url: source,
  }))(source);
  assert.equal(result.title, "Strukturierter Titel");
  assert.equal(result.servings, 4);
  assert.deepEqual(result.ingredients, [
    { name: "Reis", amount: 100, unit: "g" },
  ]);
  assert.deepEqual(result.steps, ["Reis kochen."]);
  const partial = await createRecipeImporter(async () => ({
    html: classic + structured({ name: "Nur strukturierter Titel" }),
    url: source,
  }))(source);
  assert.equal(partial.title, "Nur strukturierter Titel");
  assert.equal(partial.servings, 3);
  assert.equal(partial.ingredients.length, 3);
  assert.equal(partial.steps.length, 2);
});

test("the final fetched URL controls provider fallback while generic JSON-LD stays supported", async () => {
  const other = "https://recipes.example/recipe";
  await assert.rejects(
    createRecipeImporter(async () => ({ html: classic, url: other }))(source),
    ImportError,
  );
  const redirected = await createRecipeImporter(async () => ({
    html: classic,
    url: source,
  }))(other);
  assert.equal(redirected.title, "Synthetische Pasta");
  assert.equal(redirected.source, source);
  const generic = await createRecipeImporter(async () => ({
    html: classic + structured({ name: "Generic", recipeIngredient: ["1 Ei"] }),
    url: other,
  }))(other);
  assert.equal(generic.title, "Generic");
  assert.equal(generic.source, other);
  assert.deepEqual(generic.steps, []);
  assert.equal(generic.servings, 2);
});

test("Chefkoch import fetches once and never invokes package network methods", async () => {
  const calls: string[] = [];
  const methods = [
    "getRecipe",
    "getCategory",
    "getCategories",
    "getRecipes",
    "searchRecipes",
    "getAllRecipes",
  ] as const;
  const spies = methods.map((method) =>
    mock.method(ChefkochAPI.prototype, method, () => {
      assert.fail(`Package network method ${method} must not run`);
    }),
  );
  try {
    const importer = createRecipeImporter(async (url) => {
      calls.push(url);
      return { html: classic, url: source };
    });
    assert.equal((await importer(source)).title, "Synthetische Pasta");
    assert.deepEqual(calls, [source]);
    for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
  } finally {
    for (const spy of spies) spy.mock.restore();
  }
});

test("fallback text is inert and optional image URLs require HTTP(S)", () => {
  const html = `<h1>Tomaten &amp; Pasta</h1>
    <meta property="og:image" content="javascript:alert(1)">
    <div class="instructions"><script>unsafeScript()</script><style>unsafeStyle</style><button>Do not import control</button><p>Tomaten <b>waschen</b>.<br>Dann servieren.</p></div>`;
  const recipe = extractChefkochRecipe(html, source);
  assert.ok(recipe);
  assert.equal(recipe.title, "Tomaten & Pasta");
  assert.deepEqual(recipe.steps, ["Tomaten waschen.", "Dann servieren."]);
  assert.equal(recipe.image, undefined);
  assert.equal(
    extractChefkochRecipe(
      html,
      "https://chefkoch.de.evil.example/rezepte/123/Test.html",
    ),
    null,
  );
  assert.equal(
    extractChefkochRecipe(
      "<h1>Access Denied</h1><div class='instructions'>Retry</div>",
      source,
    ),
    null,
  );
});
