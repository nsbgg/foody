import test from "node:test";
import assert from "node:assert/strict";
import { enrichCookingStep } from "../shared/cook-instructions.ts";
import type { Ingredient } from "../shared/domain.ts";

const ingredient = (
  name: string,
  amount: number | null,
  unit = "g",
): Ingredient => ({ name, amount, unit });

test("cooking quantities scale selected portions without changing recipe ingredients", () => {
  const ingredients = [
    ingredient("Pasta", 250),
    ingredient("Sahne", 150, "ml"),
  ];
  const original = structuredClone(ingredients);
  assert.equal(
    enrichCookingStep("Pasta kochen. Sahne erhitzen.", ingredients, 2),
    "Pasta (Rezeptmenge: 500 g) kochen. Sahne (Rezeptmenge: 300 ml) erhitzen.",
  );
  assert.deepEqual(ingredients, original);
  assert.equal(
    enrichCookingStep("Pasta kochen.", ingredients, 0.5),
    "Pasta (Rezeptmenge: 125 g) kochen.",
  );
});

test("unknown amounts, invalid scales and unmatched ingredients remain unchanged", () => {
  assert.equal(
    enrichCookingStep("Salz zufügen.", [ingredient("Salz", null, "")], 2),
    "Salz zufügen.",
  );
  for (const scale of [0, -1, Infinity, NaN])
    assert.equal(
      enrichCookingStep("Pasta kochen.", [ingredient("Pasta", 250)], scale),
      "Pasta kochen.",
    );
  assert.equal(
    enrichCookingStep("Wasser erhitzen.", [ingredient("Pasta", 250)], 1),
    "Wasser erhitzen.",
  );
});

test("whole Unicode words and regex punctuation match literally", () => {
  const ingredients = [
    ingredient("Reis", 180),
    ingredient("Öl", 2, "EL"),
    ingredient("Salz (fein)", 1, "TL"),
  ];
  assert.equal(
    enrichCookingStep(
      "Kreis, REIS, Ölfarbe und Öl. Salz (fein) zugeben.",
      ingredients,
      1,
    ),
    "Kreis, REIS (Rezeptmenge: 180 g), Ölfarbe und Öl (Rezeptmenge: 2 EL). Salz (fein) (Rezeptmenge: 1 TL) zugeben.",
  );
  assert.equal(
    enrichCookingStep("O\u0308l erhitzen.", [ingredient("Öl", 2, "EL")], 1),
    "O\u0308l (Rezeptmenge: 2 EL) erhitzen.",
  );
});

test("leading adjective and explicit compound aliases handle the seeded cooking prose", () => {
  assert.equal(
    enrichCookingStep(
      "Linsen waschen. Zwiebel schälen und Spinat zugeben.",
      [
        ingredient("Rote Linsen", 200),
        ingredient("Zwiebel", 1, "Stück"),
        ingredient("Blattspinat", 250),
      ],
      1,
    ),
    "Linsen (Rezeptmenge: 200 g) waschen. Zwiebel (Rezeptmenge: 1 Stück) schälen und Spinat (Rezeptmenge: 250 g) zugeben.",
  );
  assert.equal(
    enrichCookingStep(
      "Frische rote Linsen waschen.",
      [ingredient("frische rote Linsen", 200)],
      1,
    ),
    "Frische rote Linsen (Rezeptmenge: 200 g) waschen.",
  );
  assert.equal(
    enrichCookingStep(
      "Milch zugeben.",
      [ingredient("Kokosmilch", 400, "ml")],
      1,
    ),
    "Milch zugeben.",
  );
});

test("small known plural pairs match without stemming unrelated words", () => {
  assert.equal(
    enrichCookingStep(
      "Eier und Kartoffeln zugeben.",
      [ingredient("Ei", 2, "Stück"), ingredient("Kartoffel", 500)],
      1,
    ),
    "Eier (Rezeptmenge: 2 Stück) und Kartoffeln (Rezeptmenge: 500 g) zugeben.",
  );
  assert.equal(
    enrichCookingStep("Eierlikör zugeben.", [ingredient("Ei", 2, "Stück")], 1),
    "Eierlikör zugeben.",
  );
});

test("longest names win and ambiguous aliases never get guessed quantities", () => {
  assert.equal(
    enrichCookingStep(
      "Rote Linsen und Linsen waschen.",
      [ingredient("Linsen", 100), ingredient("Rote Linsen", 200)],
      1,
    ),
    "Rote Linsen (Rezeptmenge: 200 g) und Linsen waschen.",
  );
  assert.equal(
    enrichCookingStep(
      "Linsen waschen.",
      [ingredient("Rote Linsen", 200), ingredient("frische Linsen", 100)],
      1,
    ),
    "Linsen waschen.",
  );
  assert.equal(
    enrichCookingStep(
      "Rote Linsen und Linsen waschen.",
      [ingredient("Rote Linsen", null), ingredient("Linsen", 100)],
      1,
    ),
    "Rote Linsen und Linsen waschen.",
  );
});

test("explicit numeric, fractional and written counts are not duplicated or rescaled", () => {
  const ingredients = [
    ingredient("Pasta", 250),
    ingredient("Öl", 2, "EL"),
    ingredient("Zitrone", 1, "Stück"),
  ];
  for (const text of [
    "100 g Pasta kochen.",
    "100g Pasta kochen.",
    "100 g der Pasta kochen.",
    "Pasta (100 g) kochen.",
    "Pasta: 100 g kochen.",
    "Pasta 100 g kochen.",
    "1/2 Zitrone auspressen.",
    "½ Zitrone auspressen.",
    "Eine Zitrone auspressen.",
    "zwei EL Öl zugeben.",
    "1–2 EL Öl zugeben.",
  ])
    assert.equal(enrichCookingStep(text, ingredients, 2), text, text);
});

test("partial directions remain intact and annotations explicitly mean total recipe quantities", () => {
  assert.equal(
    enrichCookingStep(
      "Etwas Öl erhitzen, die Hälfte der Pasta zugeben.",
      [ingredient("Öl", 2, "EL"), ingredient("Pasta", 250)],
      1,
    ),
    "Etwas Öl (Rezeptmenge: 2 EL) erhitzen, die Hälfte der Pasta (Rezeptmenge: 250 g) zugeben.",
  );
  assert.equal(
    enrichCookingStep("Pasta 10 Minuten garen.", [ingredient("Pasta", 250)], 1),
    "Pasta (Rezeptmenge: 250 g) 10 Minuten garen.",
  );
});

test("each ingredient is annotated once per step and repeated enrichment is idempotent", () => {
  const ingredients = [ingredient("Pasta", 250)];
  const result = enrichCookingStep(
    "Pasta kochen, dann Pasta abgießen.",
    ingredients,
    1,
  );
  assert.equal(
    result,
    "Pasta (Rezeptmenge: 250 g) kochen, dann Pasta abgießen.",
  );
  assert.equal(enrichCookingStep(result, ingredients, 1), result);
  assert.equal(
    enrichCookingStep(
      "250 g Pasta kochen, dann Pasta abgießen.",
      ingredients,
      1,
    ),
    "250 g Pasta kochen, dann Pasta abgießen.",
  );
});

test("fractional, unitless and tiny positive quantities do not become missing or zero", () => {
  assert.equal(
    enrichCookingStep("Zitrone pressen.", [ingredient("Zitrone", 1, "")], 0.5),
    "Zitrone (Rezeptmenge: 0,5) pressen.",
  );
  assert.equal(
    enrichCookingStep("Pasta kochen.", [ingredient("Pasta", 500)], 3),
    "Pasta (Rezeptmenge: 1,5 kg) kochen.",
  );
  assert.equal(
    enrichCookingStep("Salz zugeben.", [ingredient("Salz", 0.001)], 1),
    "Salz (Rezeptmenge: 0,001 g) zugeben.",
  );
});

test("annotations remain plain text and do not parse or construct HTML", () => {
  const text = "<img src=x onerror=synthetic> Pasta kochen.";
  assert.equal(
    enrichCookingStep(text, [ingredient("Pasta", 250)], 1),
    "<img src=x onerror=synthetic> Pasta (Rezeptmenge: 250 g) kochen.",
  );
  assert.equal(
    enrichCookingStep("[Salz]+ zugeben.", [ingredient("[Salz]+", 1, "TL")], 1),
    "[Salz]+ (Rezeptmenge: 1 TL) zugeben.",
  );
});
