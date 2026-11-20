import { MAX_RECIPE_IMAGE_LENGTH } from "../shared/recipe-image.ts";

export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

export async function prepareRecipeImage(file: File): Promise<string> {
  if (
    !/^(image\/jpeg|image\/png|image\/webp)$/.test(file.type) ||
    !/\.(jpe?g|png|webp)$/i.test(file.name)
  ) {
    throw new Error("Bitte ein JPG-, PNG- oder WebP-Bild auswählen.");
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new Error(
      "Das Bild ist zu groß. Bitte ein Bild mit höchstens 10 MB auswählen.",
    );
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Das Bild konnte nicht gelesen werden. Bitte eine andere Bilddatei auswählen.",
    );
  }
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 40_000_000
    ) {
      throw new Error(
        "Die Bildauflösung ist zu groß. Bitte eine kleinere Bilddatei auswählen.",
      );
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Das Bild konnte nicht verarbeitet werden.");
    let scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // Re-encoding strips metadata and keeps uploads within the offline sync budget.
      const image = canvas.toDataURL("image/jpeg", 0.82);
      if (
        image.length <= MAX_RECIPE_IMAGE_LENGTH &&
        image.startsWith("data:image/jpeg;base64,")
      )
        return image;
      scale *= 0.65;
    }
    throw new Error(
      "Das Bild konnte nicht ausreichend verkleinert werden. Bitte ein anderes Bild auswählen.",
    );
  } finally {
    bitmap.close();
  }
}
