import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  shoppingList,
  parseIngredient,
  ingredientTextForEdit,
  monday,
  dateKey,
  addDays,
  operationSchema,
  type Entry,
  type Recipe,
  type Operation,
} from "../shared/domain.ts";
import { seedRows } from "../shared/seed.ts";
import { Store } from "../server/store.ts";
import { extractRecipe, publicAddress } from "../server/importer.ts";
const recipe = seedRows()[0].data as Recipe;
const entry = (r: Recipe, servings = 2): Entry => ({
  date: "2026-11-16",
  recipeId: "a",
  recipe: r,
  servings,
  order: 1,
  deleted: false,
});
test("shopping scales portions and merges grams with kilograms, not cans", () => {
  const r = {
    ...recipe,
    ingredients: [
      { name: "Kartoffeln", amount: 500, unit: "g" },
      { name: "Tomaten", amount: 1, unit: "Dose" },
    ],
  };
  const s = {
    ...recipe,
    ingredients: [
      { name: "kartoffeln", amount: 1, unit: "kg" },
      { name: "Tomaten", amount: 400, unit: "g" },
    ],
  };
  const list = shoppingList([entry(r), entry(s)]);
  assert.equal(list.find((i) => i.name === "Kartoffeln")?.amount, 1500);
  assert.equal(list.filter((i) => i.name === "Tomaten").length, 2);
  assert.equal(shoppingList([entry(r, 4)])[0].amount, 1000);
});
test("deleted meals do not contribute to shopping", () =>
  assert.deepEqual(shoppingList([{ ...entry(recipe), deleted: true }]), []));
test("ingredient parser handles fractions, decimal commas, no spaces and free text", () => {
  for (const [s, n, u, name] of [
    ["1/2 TL Salz", 0.5, "TL", "Salz"],
    ["1½ EL Öl", 1.5, "EL", "Öl"],
    ["½ Zitrone", 0.5, "", "Zitrone"],
    ["1,5 kg Kartoffeln", 1.5, "kg", "Kartoffeln"],
    ["200g Pasta", 200, "g", "Pasta"],
    ["Salz nach Geschmack", null, "", "Salz nach Geschmack"],
  ] as const)
    assert.deepEqual(parseIngredient(s), { amount: n, unit: u, name });
});
test("full-word kilogram and liter aliases retain their conversion factors", () => {
  const parsed = [
    parseIngredient("1 Kilogramm Kartoffeln"),
    parseIngredient("0,5 KG. Kartoffeln"),
    parseIngredient("500 Gramm Kartoffeln"),
    parseIngredient("1 Liter Wasser"),
    parseIngredient("0,25 L. Wasser"),
    parseIngredient("250 ml Wasser"),
  ];
  assert.equal(parsed[0].unit, "kg");
  assert.equal(parsed[3].unit, "l");
  const list = shoppingList([entry({ ...recipe, ingredients: parsed })]);
  assert.equal(list.find((i) => i.name === "Kartoffeln")?.amount, 2000);
  assert.equal(list.find((i) => i.name === "Wasser")?.amount, 1500);
});
test("editable ingredient text round-trips fractional and tiny quantities exactly", () => {
  for (const amount of [
    1 / 3,
    2 / 7,
    0.12345678901234568,
    1e-8,
    5e-324,
    1000000,
  ]) {
    const ingredient = { name: "Salz", amount, unit: "g" };
    const text = ingredientTextForEdit(ingredient);
    assert.deepEqual(parseIngredient(text), ingredient, text);
  }
  assert.equal(
    ingredientTextForEdit({ name: "Mehl", amount: 1234.56789, unit: "g" }),
    "1234,56789 g Mehl",
  );
});
test("ambiguous ranges and zero-denominator fractions remain intact as free text", () => {
  for (const text of [
    "1-2 TL Salz",
    "1–2 TL Salz",
    "1 bis 2 TL Salz",
    "1/2–3/4 TL Salz",
    "1 oder 2 Eier",
    "1/0 TL Salz",
    "1 1/0 TL Salz",
  ]) {
    const ingredient = { name: text, amount: null, unit: "" };
    assert.deepEqual(parseIngredient(text), ingredient);
    assert.equal(ingredientTextForEdit(ingredient), text);
  }
});
test("calendar dates use local calendar arithmetic across year and daylight saving", () => {
  assert.equal(dateKey(monday(new Date(2027, 0, 1))), "2026-12-28");
  assert.equal(dateKey(addDays(new Date(2026, 2, 28, 12), 2)), "2026-03-30");
});
test("sync retries are idempotent and stale edits retain both variants", () => {
  const db = new Store(":memory:");
  const op: Operation = {
    opId: randomUUID(),
    kind: "recipe",
    id: "r",
    baseRev: 0,
    data: recipe,
  };
  assert.equal(db.apply(op).accepted?.rev, 1);
  assert.equal(db.apply(op).accepted?.rev, 1);
  const updated = { ...recipe, title: "Neu" };
  assert.equal(
    db.apply({ ...op, opId: randomUUID(), baseRev: 1, data: updated }).accepted
      ?.rev,
    2,
  );
  const stale = db.apply({ ...op, opId: randomUUID(), baseRev: 1 });
  assert.equal((stale.conflict?.data as Recipe).title, "Neu");
  assert.equal((op.data as Recipe).title, recipe.title);
  db.db.close();
});
test("different entities merge independently and plan snapshots survive recipe changes", () => {
  const db = new Store(":memory:");
  const write = (
    id: string,
    kind: Operation["kind"],
    data: Operation["data"],
    baseRev = 0,
  ) => db.apply({ opId: randomUUID(), id, kind, data, baseRev });
  write("recipe", "recipe", recipe);
  write("meal", "entry", entry(recipe));
  write(
    "recipe",
    "recipe",
    { ...recipe, title: "Geändert", archived: true },
    1,
  );
  assert.equal(
    (db.rows().find((r) => r.id === "meal")!.data as Entry).recipe.title,
    recipe.title,
  );
  db.db.close();
});
test("rejects invalid portions and invalid entity payloads", () => {
  assert.equal(
    operationSchema.safeParse({
      opId: randomUUID(),
      id: "x",
      kind: "recipe",
      baseRev: 0,
      data: { ...recipe, servings: 0 },
    }).success,
    false,
  );
});
test("extracts nested JSON-LD sections, ingredients, source and durations", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": ["Recipe"], name: "Test &amp; Gemüse", recipeYield: "4 Portionen", prepTime: "PT10M", cookTime: "PT1H", recipeIngredient: ["500 g Kartoffeln", "1 Dose Tomaten"], recipeInstructions: [{ "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "<b>Waschen</b> und schneiden." }, { text: "Garen." }] }], image: { url: "/food.jpg" } }] })}</script>`;
  const r = extractRecipe(html, "https://example.com/rezept");
  assert.equal(r.title, "Test & Gemüse");
  assert.equal(r.minutes, 70);
  assert.equal(r.servings, 4);
  assert.equal(r.steps.length, 2);
  assert.equal(r.steps[0], "Waschen und schneiden.");
  assert.equal(r.image, "https://example.com/food.jpg");
  assert.equal(r.source, "https://example.com/rezept");
});
test("recipe importer rejects pages without recipe metadata", () =>
  assert.throws(() =>
    extractRecipe("<h1>Kein Rezept</h1>", "https://example.com"),
  ));
test("importer blocks internal, mapped, link-local and multicast addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "224.0.0.1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
});
