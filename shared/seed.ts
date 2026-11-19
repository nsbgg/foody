import type { Recipe, Row, Entry } from "./domain.ts";
import { monday, addDays, dateKey } from "./domain.ts";
const data = [
  {
    title: "Zitronenpasta mit Spinat",
    description: "Frisch, cremig und genau richtig für einen langen Montag.",
    minutes: 20,
    category: "Vegetarisch",
    ingredients: [
      { name: "Pasta", amount: 250, unit: "g" },
      { name: "Blattspinat", amount: 200, unit: "g" },
      { name: "Zitrone", amount: 1, unit: "Stück" },
      { name: "Sahne", amount: 150, unit: "ml" },
      { name: "Parmesan", amount: 50, unit: "g" },
    ],
    steps: [
      "Einen großen Topf Salzwasser aufkochen. Die Pasta nach Packungsangabe bissfest garen. Vor dem Abgießen eine Tasse Nudelwasser aufheben.",
      "Spinat waschen. Zitrone heiß abwaschen, die Schale fein abreiben und den Saft auspressen. Parmesan reiben.",
      "Sahne in einer großen Pfanne erwärmen. Spinat zugeben und zusammenfallen lassen. Mit Zitronenschale, etwas Zitronensaft, Salz und Pfeffer würzen.",
      "Pasta und Parmesan unterheben. Mit etwas Nudelwasser cremig rühren, abschmecken und direkt servieren.",
    ],
  },
  {
    title: "Ofengemüse mit Feta",
    description: "Ein Blech voller Gemüse, wenig Abwasch und viel Geschmack.",
    minutes: 40,
    category: "Vegetarisch",
    ingredients: [
      { name: "Kartoffeln", amount: 500, unit: "g" },
      { name: "Paprika", amount: 2, unit: "Stück" },
      { name: "Zucchini", amount: 1, unit: "Stück" },
      { name: "Feta", amount: 200, unit: "g" },
      { name: "Olivenöl", amount: 2, unit: "EL" },
    ],
    steps: [
      "Den Backofen auf 200 °C Umluft vorheizen. Kartoffeln gründlich waschen und in kleine Spalten schneiden. Paprika und Zucchini waschen und würfeln.",
      "Gemüse auf einem Backblech mit Olivenöl, Salz, Pfeffer und getrocknetem Oregano mischen. Gleichmäßig verteilen.",
      "Für 25 Minuten im Ofen rösten. Zwischendurch einmal wenden.",
      "Feta darüberbröseln und weitere 10 Minuten backen, bis die Kartoffeln gar sind. Mit frischen Kräutern servieren.",
    ],
  },
  {
    title: "Rotes Linsen-Dal",
    description: "Wärmend, würzig und am nächsten Tag noch besser.",
    minutes: 30,
    category: "Vegan",
    ingredients: [
      { name: "Rote Linsen", amount: 200, unit: "g" },
      { name: "Kokosmilch", amount: 400, unit: "ml" },
      { name: "Tomaten", amount: 1, unit: "Dose" },
      { name: "Zwiebel", amount: 1, unit: "Stück" },
      { name: "Currypulver", amount: 2, unit: "TL" },
    ],
    steps: [
      "Linsen in einem Sieb waschen. Zwiebel schälen und fein würfeln.",
      "Zwiebel in etwas Öl glasig dünsten. Currypulver zugeben und eine Minute mitrösten.",
      "Linsen, Kokosmilch und Tomaten zugeben. Mit 200 ml Wasser aufgießen, aufkochen und bei kleiner Hitze 20 Minuten köcheln lassen. Regelmäßig umrühren.",
      "Wenn die Linsen weich sind, mit Salz, Pfeffer und etwas Zitronensaft abschmecken. Mit Brot oder Reis servieren.",
    ],
  },
  {
    title: "Knusprige Kichererbsen-Bowl",
    description:
      "Knackiges Gemüse, knusprige Kichererbsen und ein Joghurt-Dressing.",
    minutes: 25,
    category: "Vegetarisch",
    ingredients: [
      { name: "Kichererbsen", amount: 1, unit: "Dose" },
      { name: "Couscous", amount: 150, unit: "g" },
      { name: "Gurke", amount: 1, unit: "Stück" },
      { name: "Joghurt", amount: 150, unit: "g" },
      { name: "Zitrone", amount: 1, unit: "Stück" },
    ],
    steps: [
      "Kichererbsen abspülen und trocken tupfen. In einer Pfanne mit etwas Öl, Paprikapulver und Salz etwa 10 Minuten knusprig braten.",
      "Couscous nach Packungsangabe mit heißem Wasser übergießen und quellen lassen. Mit einer Gabel auflockern.",
      "Gurke waschen und würfeln. Joghurt mit Zitronensaft, Salz und Pfeffer verrühren.",
      "Couscous, Gurke und Kichererbsen in Schalen verteilen. Das Dressing darübergeben und servieren.",
    ],
  },
  {
    title: "Pilzrisotto",
    description: "Ein bisschen rühren. Ein bisschen zur Ruhe kommen.",
    minutes: 35,
    category: "Vegetarisch",
    ingredients: [
      { name: "Risottoreis", amount: 180, unit: "g" },
      { name: "Champignons", amount: 250, unit: "g" },
      { name: "Gemüsebrühe", amount: 700, unit: "ml" },
      { name: "Zwiebel", amount: 1, unit: "Stück" },
      { name: "Parmesan", amount: 50, unit: "g" },
    ],
    steps: [
      "Brühe in einem Topf erhitzen. Zwiebel fein würfeln, Pilze putzen und in Scheiben schneiden.",
      "Pilze in einer großen Pfanne mit Öl kräftig anbraten und herausnehmen. Zwiebel glasig dünsten, Reis zugeben und kurz mitdünsten.",
      "Eine Kelle heiße Brühe zugeben. Unter Rühren einkochen lassen und wieder Brühe zugeben. Etwa 20 Minuten fortsetzen, bis der Reis bissfest und cremig ist.",
      "Pilze und geriebenen Parmesan unterrühren. Mit Salz und Pfeffer abschmecken und zwei Minuten ruhen lassen.",
    ],
  },
  {
    title: "Kartoffel-Spinat-Pfanne",
    description: "Die einfache Feierabendküche aus einer Pfanne.",
    minutes: 30,
    category: "Vegetarisch",
    ingredients: [
      { name: "Kartoffeln", amount: 600, unit: "g" },
      { name: "Blattspinat", amount: 250, unit: "g" },
      { name: "Ei", amount: 2, unit: "Stück" },
      { name: "Zwiebel", amount: 1, unit: "Stück" },
    ],
    steps: [
      "Kartoffeln waschen, in kleine Würfel schneiden und in Salzwasser 10 Minuten vorgaren. Abgießen und gut ausdampfen lassen.",
      "Zwiebel würfeln und mit den Kartoffeln in etwas Öl goldbraun braten.",
      "Gewaschenen Spinat zugeben und zusammenfallen lassen. Mit Salz, Pfeffer und Muskat würzen.",
      "Zwei Mulden formen, die Eier hineinschlagen und mit Deckel bei niedriger Hitze garen, bis das Eiweiß vollständig gestockt ist.",
    ],
  },
];
export function seedRows(): Row[] {
  const recipes = data.map((r, index) => ({
    id: `seed-${index}`,
    kind: "recipe" as const,
    rev: 1,
    data: {
      ...r,
      servings: 2,
      image: "",
      source: "",
      archived: false,
    } as Recipe,
  }));
  const start = monday();
  return [
    ...recipes,
    ...[0, 1, 2, 4].map((r, index) => ({
      id: `starter-${dateKey(start)}-${index}`,
      kind: "entry" as const,
      rev: 1,
      data: {
        date: dateKey(addDays(start, index === 3 ? 4 : index)),
        recipeId: recipes[r].id,
        recipe: recipes[r].data,
        servings: 2,
        order: 0,
        deleted: false,
      } as Entry,
    })),
  ];
}
