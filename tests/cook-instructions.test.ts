import test from "node:test";
import assert from "node:assert/strict";
import {
  enrichCookingStep,
  cookingStepSegments,
} from "../shared/cook-instructions.ts";
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
    "500g Pasta kochen. 300ml Sahne erhitzen.",
  );
  assert.deepEqual(ingredients, original);
  assert.equal(
    enrichCookingStep("Pasta kochen.", ingredients, 0.5),
    "125g Pasta kochen.",
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
    "Kreis, 180g REIS, Ölfarbe und 2 EL Öl. 1 TL Salz (fein) zugeben.",
  );
  assert.equal(
    enrichCookingStep("O\u0308l erhitzen.", [ingredient("Öl", 2, "EL")], 1),
    "2 EL O\u0308l erhitzen.",
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
    "200g Linsen waschen. 1 Zwiebel schälen und 250g Spinat zugeben.",
  );
  assert.equal(
    enrichCookingStep(
      "Frische rote Linsen waschen.",
      [ingredient("frische rote Linsen", 200)],
      1,
    ),
    "200g Frische rote Linsen waschen.",
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
    "2 Eier und 500g Kartoffeln zugeben.",
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
    "200g Rote Linsen und Linsen waschen.",
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

test("partial directions preserve their authored quantities without adding recipe totals", () => {
  assert.equal(
    enrichCookingStep(
      "Etwas Öl erhitzen, die Hälfte der Pasta zugeben.",
      [ingredient("Öl", 2, "EL"), ingredient("Pasta", 250)],
      1,
    ),
    "Etwas Öl erhitzen, die Hälfte der Pasta zugeben.",
  );
  assert.equal(
    enrichCookingStep("Pasta 10 Minuten garen.", [ingredient("Pasta", 250)], 1),
    "250g Pasta 10 Minuten garen.",
  );
});

test("each ingredient is annotated once per step and repeated enrichment is idempotent", () => {
  const ingredients = [ingredient("Pasta", 250)];
  const result = enrichCookingStep(
    "Pasta kochen, dann Pasta abgießen.",
    ingredients,
    1,
  );
  assert.equal(result, "250g Pasta kochen, dann Pasta abgießen.");
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
    "0,5 Zitrone pressen.",
  );
  assert.equal(
    enrichCookingStep("Pasta kochen.", [ingredient("Pasta", 500)], 3),
    "1,5kg Pasta kochen.",
  );
  assert.equal(
    enrichCookingStep("Salz zugeben.", [ingredient("Salz", 0.001)], 1),
    "0,001g Salz zugeben.",
  );
});

test("annotations remain plain text and do not parse or construct HTML", () => {
  const text = "<img src=x onerror=synthetic> Pasta kochen.";
  assert.equal(
    enrichCookingStep(text, [ingredient("Pasta", 250)], 1),
    "<img src=x onerror=synthetic> 250g Pasta kochen.",
  );
  assert.equal(
    enrichCookingStep("[Salz]+ zugeben.", [ingredient("[Salz]+", 1, "TL")], 1),
    "1 TL [Salz]+ zugeben.",
  );
});

test("segments highlight every unambiguous mention including unknown and repeated amounts", () => {
  const ingredients = [ingredient("Pasta", 250), ingredient("Salz", null, "")];
  assert.deepEqual(
    cookingStepSegments(
      "Pasta kochen, dann Pasta mit Salz servieren.",
      ingredients,
      1,
    ),
    [
      { text: "250g Pasta", ingredient: true },
      { text: " kochen, dann ", ingredient: false },
      { text: "Pasta", ingredient: true },
      { text: " mit ", ingredient: false },
      { text: "Salz", ingredient: true },
      { text: " servieren.", ingredient: false },
    ],
  );
  assert.deepEqual(cookingStepSegments("Salz", ingredients, 1), [
    { text: "Salz", ingredient: true },
  ]);
});

test("authored explicit amounts stay exact while ingredient names are highlighted", () => {
  const text = "100 g Pasta kochen. Pasta (50 g) später zugeben.";
  const segments = cookingStepSegments(text, [ingredient("Pasta", 250)], 2);
  assert.equal(segments.map((segment) => segment.text).join(""), text);
  assert.deepEqual(
    segments
      .filter((segment) => segment.ingredient)
      .map((segment) => segment.text),
    ["Pasta", "Pasta"],
  );
});

test("ambiguous aliases are never highlighted or assigned guessed quantities", () => {
  const ingredients = [
    ingredient("Rote Linsen", 200),
    ingredient("frische Linsen", 100),
  ];
  assert.deepEqual(cookingStepSegments("Linsen waschen.", ingredients, 1), [
    { text: "Linsen waschen.", ingredient: false },
  ]);
  assert.deepEqual(
    cookingStepSegments("Rote Linsen und Linsen waschen.", ingredients, 1),
    [
      { text: "200g Rote Linsen", ingredient: true },
      { text: " und Linsen waschen.", ingredient: false },
    ],
  );
});

test("partial references before or after a name suppress full quantities but retain highlighting", () => {
  for (const text of [
    "Etwas Pasta zugeben.",
    "Die Hälfte der Pasta zugeben.",
    "Restliche Pasta erhitzen.",
    "Den Rest der Pasta zugeben.",
    "Die übrige gekochte Pasta abgießen.",
    "Ein Teil von der Pasta zugeben.",
    "Pasta nach Bedarf zugeben.",
    "Pasta (die Hälfte) zugeben.",
    "Pasta, nur einen Teil verwenden.",
    "Some of the Pasta dazugeben.",
    "Half of the Pasta dazugeben.",
    "Pasta as needed.",
  ]) {
    const parts = cookingStepSegments(text, [ingredient("Pasta", 250)], 2);
    assert.equal(parts.map((part) => part.text).join(""), text, text);
    assert.deepEqual(
      parts.filter((part) => part.ingredient).map((part) => part.text),
      ["Pasta"],
      text,
    );
  }
  assert.equal(
    enrichCookingStep(
      "Etwas Öl erhitzen und Pasta kochen.",
      [ingredient("Öl", 2, "EL"), ingredient("Pasta", 250)],
      1,
    ),
    "Etwas Öl erhitzen und 250g Pasta kochen.",
  );
});

test("only weight and volume units compact while counted pieces omit their unit", () => {
  for (const unit of ["g", "kg", "mg", "ml", "cl", "dl", "l"]) {
    assert.equal(
      enrichCookingStep("Zutat zugeben.", [ingredient("Zutat", 2, unit)], 1),
      `2${unit} Zutat zugeben.`,
    );
  }
  for (const unit of ["Stück", "Stk", "Stk."]) {
    assert.equal(
      enrichCookingStep(
        "Zwiebel zugeben.",
        [ingredient("Zwiebel", 1, unit)],
        1,
      ),
      "1 Zwiebel zugeben.",
    );
  }
  assert.equal(
    enrichCookingStep("Öl zugeben.", [ingredient("Öl", 2, "EL")], 1),
    "2 EL Öl zugeben.",
  );
});

test("segment boundaries retain all source characters and plain text under invalid scales", () => {
  const source = "<b>Salz</b>\n  Pasta + Pasta!";
  const ingredients = [ingredient("Pasta", 250), ingredient("Salz", null, "")];
  const parts = cookingStepSegments(source, ingredients, NaN);
  assert.equal(parts.map((part) => part.text).join(""), source);
  assert.equal(parts.filter((part) => part.ingredient).length, 3);
  assert.ok(
    parts.every(
      (part, index) =>
        part.text.length > 0 &&
        (index === 0 || part.ingredient !== parts[index - 1].ingredient),
    ),
  );
  assert.deepEqual(cookingStepSegments("", ingredients, 1), []);
});
