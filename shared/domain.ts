import { z } from "zod";
export const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  amount: z.number().nonnegative().max(1e6).nullable(),
  unit: z.string().max(40),
});
export const recipeSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000),
  servings: z.number().positive().max(1000),
  minutes: z.number().nonnegative().max(10000),
  ingredients: z.array(ingredientSchema).max(300),
  steps: z.array(z.string().trim().min(1).max(5000)).min(1).max(200),
  image: z.string().max(2000),
  source: z.string().max(2000),
  category: z.string().max(60),
  archived: z.boolean(),
});
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recipeId: z.string(),
  recipe: recipeSchema,
  servings: z.number().positive().max(1000),
  order: z.number().finite(),
  deleted: z.boolean(),
});
export type Entry = z.infer<typeof entrySchema>;
export const extraSchema = z.object({
  week: z.string(),
  text: z.string().trim().min(1).max(300),
  checked: z.boolean(),
  deleted: z.boolean(),
});
export const checkSchema = z.object({ checked: z.boolean() });
export type Kind = "recipe" | "entry" | "extra" | "check";
export type Row = {
  id: string;
  kind: Kind;
  rev: number;
  data:
    Recipe | Entry | z.infer<typeof extraSchema> | z.infer<typeof checkSchema>;
};
export type Operation = {
  opId: string;
  id: string;
  kind: Kind;
  baseRev: number;
  data: Row["data"];
};
export const dataSchemas = {
  recipe: recipeSchema,
  entry: entrySchema,
  extra: extraSchema,
  check: checkSchema,
};
const operationFields = {
  opId: z.string().uuid(),
  id: z.string().min(1).max(500),
  baseRev: z.number().int().nonnegative(),
};
// Parsing must return the validated nested value, including stripped metadata.
// Merely refining an unknown payload would retain arbitrary unvalidated fields.
export const operationSchema = z.discriminatedUnion("kind", [
  z.object({
    ...operationFields,
    kind: z.literal("recipe"),
    data: recipeSchema,
  }),
  z.object({ ...operationFields, kind: z.literal("entry"), data: entrySchema }),
  z.object({ ...operationFields, kind: z.literal("extra"), data: extraSchema }),
  z.object({ ...operationFields, kind: z.literal("check"), data: checkSchema }),
]);
export const dayNames = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];
export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function monday(d = new Date()) {
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  n.setDate(n.getDate() - ((n.getDay() + 6) % 7));
  return n;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function prettyDate(
  d: Date,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) {
  return new Intl.DateTimeFormat("de-DE", opts).format(d);
}
const units: Record<string, [string, number]> = {
  g: ["g", 1],
  gramm: ["g", 1],
  kg: ["g", 1000],
  kilogramm: ["g", 1000],
  ml: ["ml", 1],
  l: ["ml", 1000],
  liter: ["ml", 1000],
  tl: ["TL", 1],
  el: ["EL", 1],
  stück: ["Stück", 1],
  stk: ["Stück", 1],
  dose: ["Dose", 1],
  dosen: ["Dose", 1],
  bund: ["Bund", 1],
  prise: ["Prise", 1],
};
export function parseIngredient(text: string): Ingredient {
  const cleaned = text
    .trim()
    .replace(/½/g, " 1/2")
    .replace(/¼/g, " 1/4")
    .replace(/¾/g, " 3/4")
    .replace(/\s+/g, " ")
    .trim();
  const m = cleaned.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { name: text.trim(), amount: null, unit: "" };
  if (/^\s*(?:[-–—/]|(?:bis|oder|or|to)\b)/i.test(m[2]))
    return { name: text.trim(), amount: null, unit: "" };
  const fraction = (s: string) =>
    s.includes("/")
      ? s
          .split("/")
          .map(Number)
          .reduce((a, b) => a / b)
      : Number(s.replace(",", "."));
  const amount = m[1].split(" ").reduce((a, s) => a + fraction(s), 0);
  if (!Number.isFinite(amount))
    return { name: text.trim(), amount: null, unit: "" };
  const pieces = m[2].split(" "),
    first = pieces[0]?.toLowerCase().replace(/\.$/, "");
  const unit = units[first];
  return {
    amount,
    unit: unit
      ? unit[1] === 1000
        ? unit[0] === "g"
          ? "kg"
          : "l"
        : unit[0]
      : "",
    name: (unit ? pieces.slice(1).join(" ") : m[2]).trim() || text.trim(),
  };
}
// Editing must preserve the stored number, rather than round it for display.
// Expand exponent notation because ingredient input accepts ordinary decimals.
export function ingredientTextForEdit(ingredient: Ingredient) {
  if (ingredient.amount === null) return ingredient.name;
  const [mantissa, exponent] = String(ingredient.amount).split("e");
  let amount = mantissa;
  if (exponent !== undefined) {
    const [whole, decimal = ""] = mantissa.split(".");
    const digits = whole + decimal;
    const point = whole.length + Number(exponent);
    amount =
      point <= 0
        ? `0.${"0".repeat(-point)}${digits}`
        : point >= digits.length
          ? digits + "0".repeat(point - digits.length)
          : `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  return [amount.replace(".", ","), ingredient.unit, ingredient.name]
    .filter(Boolean)
    .join(" ");
}
export function formatAmount(n: number | null, unit = "") {
  if (n === null) return "";
  let amount = n,
    suffix = unit;
  if ((unit === "g" || unit === "ml") && n >= 1000) {
    amount = n / 1000;
    suffix = unit === "g" ? "kg" : "l";
  }
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(amount)}${suffix ? " " + suffix : ""}`;
}
export type ShoppingItem = {
  key: string;
  name: string;
  amount: number | null;
  unit: string;
};
export function shoppingList(entries: Entry[]): ShoppingItem[] {
  const result = new Map<string, ShoppingItem>();
  for (const e of entries.filter((e) => !e.deleted))
    for (const i of e.recipe.ingredients) {
      const normalized = units[i.unit.toLowerCase()] || [i.unit, 1];
      // A freely written ingredient cannot safely merge with a measured ingredient.
      const key = `${i.name.trim().toLocaleLowerCase("de-DE")}|${normalized[0]}|${i.amount === null ? "text" : "quantity"}`;
      const amount =
        i.amount === null
          ? null
          : (i.amount * Number(normalized[1]) * e.servings) / e.recipe.servings;
      const prev = result.get(key);
      if (prev && prev.amount !== null && amount !== null)
        prev.amount += amount;
      else if (!prev)
        result.set(key, {
          key,
          name: i.name,
          amount,
          unit: String(normalized[0]),
        });
    }
  return [...result.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "de"),
  );
}
