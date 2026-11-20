import { formatAmount, type Ingredient } from "./domain.ts";

const normalizeName = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("de-DE");
const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordCharacters = "\\p{L}\\p{M}\\p{N}_";
const adjectives = new Set([
  "rot",
  "rote",
  "roter",
  "rotes",
  "roten",
  "rotem",
  "frisch",
  "frische",
  "frischer",
  "frisches",
  "frischen",
  "frischem",
]);
const commonNames = [
  ["Ei", "Eier"],
  ["Zwiebel", "Zwiebeln"],
  ["Kartoffel", "Kartoffeln"],
  ["Zitrone", "Zitronen"],
  ["Tomate", "Tomaten"],
  ["Karotte", "Karotten"],
  ["Gurke", "Gurken"],
  ["Blattspinat", "Spinat"],
];

function namesFor(ingredient: Ingredient) {
  const names = new Set([ingredient.name.trim()]);
  let words = ingredient.name.trim().split(/\s+/u);
  while (words.length > 1 && adjectives.has(normalizeName(words[0]))) {
    words = words.slice(1);
    names.add(words.join(" "));
  }
  for (const name of [...names]) {
    const pair = commonNames.find((choices) =>
      choices.some((choice) => normalizeName(choice) === normalizeName(name)),
    );
    for (const alias of pair ?? []) names.add(alias);
  }
  return names;
}

function hasAdjacentQuantity(before: string, after: string, unit: string) {
  const number =
    "(?:(?:\\d+\\s+)?\\d+[/⁄]\\d+|\\d+(?:[.,]\\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|ein(?:e|en|em|er|es)?|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)";
  const units = [
    ...new Set(
      [
        unit.trim(),
        "Kilogramm",
        "Gramm",
        "Milligramm",
        "Milliliter",
        "Liter",
        "kg",
        "mg",
        "µg",
        "g",
        "ml",
        "cl",
        "dl",
        "l",
        "EL",
        "TL",
        "Stück",
        "Stk",
        "Dose",
        "Dosen",
        "Bund",
        "Prise",
        "Prisen",
        "Becher",
        "Packung",
        "Packungen",
        "Päckchen",
        "Tasse",
        "Tassen",
      ].filter(Boolean),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .map(escapePattern)
    .join("|");
  const measure = `(?:${units})(?![${wordCharacters}])`;
  const prefix = new RegExp(
    `(?:^|[^${wordCharacters}])${number}\\s*(?:${measure}\\.?\\s*)?(?:(?:von|der|die|das|den|dem|des|vom)\\s+){0,3}$`,
    "iu",
  );
  const suffix = new RegExp(
    `^\\s*(?:(?:\\(\\s*(?:(?:Rezeptmenge\\s*:|insgesamt)\\s*)?)|[:;,–—-]\\s*)?${number}(?:\\s*${measure}|\\s*(?=\\)|$))`,
    "iu",
  );
  return prefix.test(before) || suffix.test(after);
}

function quantity(amount: number, unit: string) {
  // The regular display formatter rounds to two decimals. A small positive
  // recipe amount must not silently become "0 g" in an instruction.
  if (amount > 0 && amount < 0.005) {
    return [
      new Intl.NumberFormat("de-DE", {
        maximumSignificantDigits: 6,
        useGrouping: false,
      }).format(amount),
      unit,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return formatAmount(amount, unit);
}

/**
 * Add the scaled TOTAL recipe quantity beside an unambiguous ingredient mention.
 * The "Rezeptmenge" label deliberately does not claim a per-step allocation:
 * directions such as "etwas", "die Hälfte" and "den Rest" remain authoritative.
 *
 * Names match literal Unicode words, case-insensitively, with only the small
 * adjective/plural/name whitelist above. No fuzzy matching, arbitrary suffix
 * removal, unit conversion guesses or amounts for unmeasured ingredients.
 * Duplicate/ambiguous aliases are left untouched. Each ingredient is annotated
 * at most once per step, and adjacent explicit amounts are never replaced.
 *
 * Returns plain text for escaped text rendering, never HTML. Original recipe
 * data is not modified. Complex prose may deliberately remain unannotated.
 */
export function enrichCookingStep(
  text: string,
  ingredients: readonly Ingredient[],
  scale: number,
): string {
  if (!text || !Number.isFinite(scale) || scale <= 0) return text;
  const candidates = new Map<
    string,
    { names: Set<string>; owners: Set<number> }
  >();
  ingredients.forEach((ingredient, index) => {
    for (const name of namesFor(ingredient)) {
      if (!name) continue;
      const key = normalizeName(name);
      const candidate = candidates.get(key) ?? {
        names: new Set<string>(),
        owners: new Set<number>(),
      };
      candidate.names.add(name.normalize("NFC"));
      candidate.names.add(name.normalize("NFD"));
      candidate.owners.add(index);
      candidates.set(key, candidate);
    }
  });
  const alternatives = [...candidates.values()]
    .flatMap((candidate) => [...candidate.names])
    .sort((a, b) => b.length - a.length)
    .map((name) => escapePattern(name).replace(/\s+/gu, "\\s+"));
  if (!alternatives.length) return text;
  const pattern = new RegExp(
    `(?<![${wordCharacters}])(?:${alternatives.join("|")})(?![${wordCharacters}])`,
    "giu",
  );
  const seen = new Set<number>();
  return text.replace(pattern, (matched: string, offset: number) => {
    const candidate = candidates.get(normalizeName(matched));
    if (!candidate || candidate.owners.size !== 1) return matched;
    const owner = [...candidate.owners][0];
    if (seen.has(owner)) return matched;
    seen.add(owner);
    const ingredient = ingredients[owner];
    if (
      ingredient.amount === null ||
      !Number.isFinite(ingredient.amount) ||
      ingredient.amount < 0
    )
      return matched;
    const scaled = ingredient.amount * scale;
    if (!Number.isFinite(scaled) || (scaled === 0 && ingredient.amount > 0))
      return matched;
    if (
      hasAdjacentQuantity(
        text.slice(0, offset),
        text.slice(offset + matched.length),
        ingredient.unit,
      )
    )
      return matched;
    return `${matched} (Rezeptmenge: ${quantity(scaled, ingredient.unit)})`;
  });
}
