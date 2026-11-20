// Ordered like a typical supermarket route; unfamiliar items stay in Sonstiges.
export const supermarketAreas = [
  "Obst & Gemüse",
  "Brot & Backwaren",
  "Kühlregal & Eier",
  "Fleisch & Fisch",
  "Nudeln, Reis & Konserven",
  "Öle, Saucen & Gewürze",
  "Backzutaten",
  "Tiefkühlung",
  "Getränke & Kaffee",
  "Haushalt & Drogerie",
  "Sonstiges",
] as const;
export type SupermarketArea = (typeof supermarketAreas)[number];

export function supermarketArea(name: string, unit = ""): SupermarketArea {
  const text = name
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/\b(tk|tiefkuhl|tiefgefroren|gefroren)|eiscreme/.test(text))
    return "Tiefkühlung";
  if (
    /spulmittel|waschmittel|toilettenpapier|kuchenrolle|zahnpasta|shampoo|mullbeutel|backpapier|alufolie/.test(
      text,
    )
  )
    return "Haushalt & Drogerie";
  if (
    /kaffee|\btee\b|saft|mineralwasser|sprudel|limonade|\bbier\b|\bwein\b/.test(
      text,
    )
  )
    return "Getränke & Kaffee";
  if (
    /kokosmilch|tomatenmark|passata|konserve|kichererbs|\blinsen\b|nudel|pasta|spaghetti|penne|fusilli|\w*reis\b|couscous|bulgur|quinoa/.test(
      text,
    ) ||
    /dose|glas/i.test(unit) ||
    /\b(dose|dosentomaten)\b/.test(text)
  )
    return "Nudeln, Reis & Konserven";
  if (
    /hafermilch|mandelmilch|sojamilch|haferdrink|mandeldrink|sojadrink/.test(
      text,
    )
  )
    return "Getränke & Kaffee";
  if (
    /milch|sahne|rahm|butter|margarine|joghurt|jogurt|quark|skyr|kase|feta|parmesan|mozzarella|gouda|cheddar|\bei(?:er)?\b|tofu/.test(
      text,
    )
  )
    return "Kühlregal & Eier";
  if (
    /fleisch|hack|hahnchen|huhn|huhner|pute|rind|schwein|speck|schinken|wurst|lachs|thunfisch|kabeljau|fisch|garnelen/.test(
      text,
    )
  )
    return "Fleisch & Fisch";
  if (
    /mehl|zucker|backpulver|hefe|vanille|kuverture|kakao|speisestarke|paniermehl/.test(
      text,
    )
  )
    return "Backzutaten";
  if (/\bbrot\b|brotchen|toast|baguette|wrap|tortilla/.test(text))
    return "Brot & Backwaren";
  if (
    /\w*ol\b|essig|salz|pfeffer|currypulver|paprikapulver|zimt|muskat|kreuzkummel|kurkuma|oregano|getrocknet|bruh|senf|ketchup|mayonnaise|sojasauce|sojasoße|pesto|gewurz/.test(
      text,
    )
  )
    return "Öle, Saucen & Gewürze";
  if (
    /kartoffel|paprika|zucchini|tomate|zwiebel|knoblauch|spinat|champignon|pilz|karotte|mohre|brokkoli|blumenkohl|gurke|salat|lauch|sellerie|aubergine|kurbis|avocado|bohne|erbse|zitrone|limette|apfel|apfel|banane|orange|beere|birne|traube|mango|ingwer|petersilie|basilikum|schnittlauch|koriander/.test(
      text,
    )
  )
    return "Obst & Gemüse";
  return "Sonstiges";
}
