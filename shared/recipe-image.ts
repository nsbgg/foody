export const MAX_RECIPE_IMAGE_LENGTH = 500_000;
export const MAX_RECIPE_IMAGES = 8;
const storedImagePattern =
  /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/;

export function isStoredRecipeImage(value: string): boolean {
  return (
    value.length <= MAX_RECIPE_IMAGE_LENGTH && storedImagePattern.test(value)
  );
}

export function isRecipeImageSource(value: string): boolean {
  return /^https?:\/\//.test(value) || isStoredRecipeImage(value);
}

export function recipeImages(recipe: {
  image: string;
  images?: string[];
}): string[] {
  return [
    ...new Set(
      [recipe.image, ...(recipe.images || [])].filter(isRecipeImageSource),
    ),
  ];
}
