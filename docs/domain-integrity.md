# Ingredient quantity integrity

Ingredient amounts remain structured JavaScript numbers. The parser recognizes
`kg`/`Kilogramm` as kilograms and `l`/`Liter` as liters, including capitalization
and abbreviated units ending in a period. Shopping converts these to grams or
milliliters before aggregating and scaling portions. Cans and weight units remain
separate.

The recipe editor uses `ingredientTextForEdit` rather than display formatting.
It writes the shortest decimal that round-trips to the stored number, without
grouping, rounding or changing units. Exponent notation is expanded to ordinary
decimal input, including very small quantities. Display-only formatting may
still round quantities for readability. Opening and saving an unchanged editor
also preserves its existing structured ingredient lines, including custom units.

Ambiguous ranges and fractions with a zero denominator are retained verbatim as
unmeasured text. They are not silently reduced to one endpoint or an invalid
numeric amount. Enter a specific quantity to make them measurable.

Regression coverage in [domain tests](../tests/domain.test.ts) verifies aliases
through shopping totals, precise fractional/tiny-number serialization and parser
round trips, ranges, and zero denominators. These checks run with `npm test`.
