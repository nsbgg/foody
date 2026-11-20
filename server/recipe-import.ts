import { safeFetch, extractRecipe } from "./importer.ts";
import { isChefkochRecipeUrl, extractChefkochRecipe } from "./chefkoch.ts";

// All providers share one bounded, DNS-pinned downloader. The Chefkoch package's
// own network methods would bypass that boundary and fetch extra category pages.
export function createRecipeImporter(fetchPage = safeFetch) {
  return async (url: string) => {
    const page = await fetchPage(url);
    const fallback = isChefkochRecipeUrl(page.url)
      ? (extractChefkochRecipe(page.html, page.url) ?? undefined)
      : undefined;
    return extractRecipe(page.html, page.url, fallback);
  };
}

export const importRecipe = createRecipeImporter();
