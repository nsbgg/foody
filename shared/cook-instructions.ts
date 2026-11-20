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
  const displayUnit = /^(?:stück|stk)\.?$/iu.test(unit.trim()) ? "" : unit;
  // The regular display formatter rounds to two decimals. A small positive
  // recipe amount must not silently become "0 g" in an instruction.
  if (amount > 0 && amount < 0.005) {
    return [
      new Intl.NumberFormat("de-DE", {
        maximumSignificantDigits: 6,
        useGrouping: false,
      }).format(amount),
      displayUnit,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return formatAmount(amount, displayUnit);
}

function compactQuantity(amount: number, unit: string) {
  return quantity(amount, unit).replace(/\s+(g|kg|mg|ml|cl|dl|l)$/iu, "$1");
}

function hasPartialDirection(before: string, after: string) {
  const cue =
    "(?:etwas|wenig(?:er)?|ein\\s+(?:wenig|bisschen)|restlich[\\p{L}]*|übrig[\\p{L}]*|rest|hälfte|drittel|viertel|teil|handvoll|spritzer|some|a\\s+little|half|remaining|rest|part|portion|handful)";
  const bridge =
    "(?:(?:der|die|das|den|dem|des|von|vom|of|the|cooked|chopped|(?:gekocht|gegart|geschnitten|vorbereitet|verbleibend|rot|frisch)[\\p{L}]*)\\s+){0,4}";
  return (
    new RegExp(`(?:^|[^${wordCharacters}])${cue}\\s+${bridge}$`, "iu").test(
      before,
    ) ||
    /^\s*(?:[(:,;–—-]\s*)?(?:(?:nur|only)\s+)?(?:nach\s+(?:Bedarf|Geschmack)|as\s+needed|to\s+taste|zur\s+Hälfte|(?:die\s+)?Hälfte\b|(?:den\s+)?Rest\b|(?:einen?\s+)?Teil\b|half\b|teilweise|anteilig|portionsweise|übrig(?:e|en)?\s+lassen)/iu.test(
      after,
    )
  );
}

export type CookingStepSegment = { text: string; ingredient: boolean };

/**
 * Prefix the first unambiguous ingredient mention with its scaled quantity.
 * Partial directions such as "etwas", "die Hälfte" and "den Rest" suppress
 * totals so an authored partial instruction never becomes a full allocation.
 *
 * Names match literal Unicode words, case-insensitively, with only the small
 * adjective/plural/name whitelist above. No fuzzy matching, arbitrary suffix
 * removal, unit conversion guesses or amounts for unmeasured ingredients.
 * Duplicate/ambiguous aliases stay plain. Every unambiguous mention is marked
 * for highlighting, including unknown quantities and later occurrences.
 * Quantities appear at most once, and authored amounts are never replaced.
 *
 * Returns plain text for escaped text rendering, never HTML. Original recipe
 * data is not modified. Complex prose may deliberately remain unannotated.
 */
export function cookingStepSegments(
  text: string,
  ingredients: readonly Ingredient[],
  scale: number,
): CookingStepSegment[] {
  if (!text) return [];
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
  if (!alternatives.length) return [{ text, ingredient: false }];
  const pattern = new RegExp(
    `(?<![${wordCharacters}])(?:${alternatives.join("|")})(?![${wordCharacters}])`,
    "giu",
  );
  const seen = new Set<number>();
  const segments: CookingStepSegment[] = [];
  const append = (value: string, ingredient: boolean) => {
    if (!value) return;
    const previous = segments.at(-1);
    if (previous?.ingredient === ingredient) previous.text += value;
    else segments.push({ text: value, ingredient });
  };
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    const matched = match[0];
    const offset = match.index;
    append(text.slice(position, offset), false);
    position = offset + matched.length;
    const candidate = candidates.get(normalizeName(matched));
    if (!candidate || candidate.owners.size !== 1) {
      append(matched, false);
      continue;
    }
    const owner = [...candidate.owners][0];
    const first = !seen.has(owner);
    seen.add(owner);
    const ingredient = ingredients[owner];
    const before = text.slice(0, offset);
    const after = text.slice(position);
    let prefix = "";
    if (
      first &&
      Number.isFinite(scale) &&
      scale > 0 &&
      ingredient.amount !== null &&
      Number.isFinite(ingredient.amount) &&
      ingredient.amount >= 0 &&
      !hasAdjacentQuantity(before, after, ingredient.unit) &&
      !hasPartialDirection(before, after)
    ) {
      const scaled = ingredient.amount * scale;
      if (Number.isFinite(scaled) && !(scaled === 0 && ingredient.amount > 0)) {
        prefix = `${compactQuantity(scaled, ingredient.unit)} `;
      }
    }
    append(prefix + matched, true);
  }
  append(text.slice(position), false);
  return segments;
}

export function enrichCookingStep(
  text: string,
  ingredients: readonly Ingredient[],
  scale: number,
): string {
  return cookingStepSegments(text, ingredients, scale)
    .map((segment) => segment.text)
    .join("");
}
