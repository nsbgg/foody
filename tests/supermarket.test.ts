import test from "node:test";
import assert from "node:assert/strict";
import { supermarketArea } from "../shared/supermarket.ts";

test("supermarket areas classify ingredients including imported recipe names", () => {
  for (const [name, unit, expected] of [
    ["Blattspinat", "g", "Obst & Gemüse"],
    ["Zitrone", "Stück", "Obst & Gemüse"],
    ["Tomaten", "Dose", "Nudeln, Reis & Konserven"],
    ["Tomaten", "g", "Obst & Gemüse"],
    ["Kokosmilch", "ml", "Nudeln, Reis & Konserven"],
    ["Rote Linsen", "g", "Nudeln, Reis & Konserven"],
    ["Risottoreis", "g", "Nudeln, Reis & Konserven"],
    ["Ei(er)", "", "Kühlregal & Eier"],
    ["Feta", "g", "Kühlregal & Eier"],
    ["Margarine", "g", "Kühlregal & Eier"],
    ["etwas Öl, neutrales (für das Waffeleisen)", "", "Öle, Saucen & Gewürze"],
    ["Prise(n) Salz", "", "Öle, Saucen & Gewürze"],
    ["Currypulver", "TL", "Öle, Saucen & Gewürze"],
    ["Pck. Vanillezucker", "", "Backzutaten"],
    ["Backpulver", "TL", "Backzutaten"],
    ["TK-Blattspinat", "g", "Tiefkühlung"],
    ["Hähnchenbrust", "g", "Fleisch & Fisch"],
    ["Brot", "", "Brot & Backwaren"],
    ["Kaffee", "", "Getränke & Kaffee"],
    ["Hafermilch", "ml", "Getränke & Kaffee"],
    ["Spülmittel", "", "Haushalt & Drogerie"],
    ["Mein spezieller Artikel", "", "Sonstiges"],
  ])
    assert.equal(supermarketArea(name, unit), expected, name);
});
