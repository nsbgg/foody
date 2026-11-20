import test from "node:test";
import assert from "node:assert/strict";
import { recipeSchema } from "../shared/domain.ts";
import { seedRows } from "../shared/seed.ts";
import {
  MAX_RECIPE_IMAGE_LENGTH,
  isRecipeImageSource,
  isStoredRecipeImage,
  recipeImages,
  MAX_RECIPE_IMAGES,
} from "../shared/recipe-image.ts";

test("recipe images allow bounded uploaded JPEGs alongside existing URL values", () => {
  const image = "data:image/jpeg;base64,/9j/" + "A".repeat(4000);
  const recipe = seedRows().find((row) => row.kind === "recipe")!.data;
  assert.equal(isStoredRecipeImage(image), true);
  assert.equal(recipeSchema.safeParse({ ...recipe, image }).success, true);
  assert.equal(
    recipeSchema.safeParse({ ...recipe, image: "https://example.com/food.jpg" })
      .success,
    true,
  );
  for (const invalid of [
    "data:image/svg+xml;base64," + "A".repeat(4000),
    "data:text/html;base64," + "A".repeat(4000),
    "data:image/jpeg;base64,not-an-image" + "A".repeat(4000),
    "data:image/jpeg;base64,/9j/" + "A".repeat(MAX_RECIPE_IMAGE_LENGTH),
  ]) {
    assert.equal(isStoredRecipeImage(invalid), false);
    assert.equal(
      recipeSchema.safeParse({ ...recipe, image: invalid }).success,
      false,
    );
  }
  assert.equal(isRecipeImageSource("javascript:alert(1)"), false);
  assert.equal(isRecipeImageSource("data:image/svg+xml,<svg></svg>"), false);
});

test("multiple images preserve old recipes, order and the eight-picture limit", () => {
  const recipe = seedRows().find((row) => row.kind === "recipe")!.data;
  const urls = Array.from(
    { length: MAX_RECIPE_IMAGES },
    (_, index) => `https://example.com/${index}.jpg`,
  );
  const parsed = recipeSchema.parse({
    ...recipe,
    image: urls[0],
    images: urls.slice(1),
  });
  assert.deepEqual(recipeImages(parsed), urls);
  assert.equal(
    recipeSchema.safeParse({ ...parsed, images: urls }).success,
    false,
  );
  assert.equal(recipeSchema.safeParse(recipe).success, true);
  assert.deepEqual(
    recipeImages({
      image: urls[0],
      images: [urls[0], urls[1], "javascript:alert(1)"],
    }),
    urls.slice(0, 2),
  );
});
