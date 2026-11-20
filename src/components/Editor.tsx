import { useState } from "react";
import { Plus, Check, X } from "lucide-react";
import {
  parseIngredient,
  ingredientTextForEdit,
  recipeSchema,
  type Recipe,
} from "../../shared/domain.ts";
import { change } from "../store.ts";
import type { RecipeRow } from "../types.ts";
import { prepareRecipeImage } from "../recipe-image.ts";
import {
  isStoredRecipeImage,
  recipeImages,
  MAX_RECIPE_IMAGES,
} from "../../shared/recipe-image.ts";
const empty: Recipe = {
  title: "",
  description: "",
  servings: 2,
  minutes: 20,
  ingredients: [],
  steps: [""],
  image: "",
  source: "",
  category: "Vegetarisch",
  archived: false,
};

export function Editor({
  row,
  draft,
  onDone,
}: {
  row?: RecipeRow;
  draft?: Recipe;
  onDone: () => void;
}) {
  const [form, setForm] = useState<Recipe>(
    structuredClone(row?.data || draft || empty),
  );
  const [observedRev] = useState(row?.rev);
  const [ingredients, setIngredients] = useState(
    form.ingredients.map(ingredientTextForEdit).join("\n"),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const images = recipeImages(form);
  function setImages(next: string[]) {
    const unique = [...new Set(next)];
    setForm((current) => ({
      ...current,
      image: unique[0] || "",
      images: unique.slice(1),
    }));
  }
  const field = (key: keyof Recipe, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving || uploading) return;
        const result = recipeSchema.safeParse({
          ...form,
          ingredients: ingredients
            .split("\n")
            .filter((s) => s.trim())
            .map((line, index) => {
              const original = form.ingredients[index];
              return original && line === ingredientTextForEdit(original)
                ? original
                : parseIngredient(line);
            }),
          steps: form.steps.filter((s) => s.trim()),
        });
        if (!result.success) {
          setError(
            "Bitte Titel, gültige Portionen und mindestens einen Kochschritt eintragen.",
          );
          return;
        }
        setSaving(true);
        setError("");
        try {
          const saved = await change(
            "recipe",
            row?.id || crypto.randomUUID(),
            result.data,
            observedRev,
          );
          if (saved) onDone();
          else
            setError(
              "Speichern auf diesem Gerät fehlgeschlagen. Bitte erneut versuchen.",
            );
        } catch {
          setError(
            "Speichern auf diesem Gerät fehlgeschlagen. Bitte erneut versuchen.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2>{row ? "Gericht bearbeiten" : "Ein neues Lieblingsgericht"}</h2>
      <label>
        Gerichtname
        <input
          autoFocus
          required
          maxLength={160}
          value={form.title}
          onChange={(e) => field("title", e.target.value)}
        />
      </label>
      <label>
        Kurzbeschreibung
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => field("description", e.target.value)}
        />
      </label>
      <div className="form-row">
        <label>
          Portionen
          <input
            type="number"
            min="0.5"
            max="1000"
            step="0.5"
            required
            value={form.servings}
            onChange={(e) => field("servings", e.target.valueAsNumber)}
          />
        </label>
        <label>
          Dauer in Minuten
          <input
            type="number"
            min="0"
            max="10000"
            required
            value={form.minutes}
            onChange={(e) => field("minutes", e.target.valueAsNumber)}
          />
        </label>
      </div>
      <label>
        Kategorie
        <select
          value={form.category}
          onChange={(e) => field("category", e.target.value)}
        >
          {[
            ...new Set([
              "Vegetarisch",
              "Vegan",
              "Fleisch",
              "Fisch",
              "Süßes",
              "Importiert",
              form.category,
            ]),
          ]
            .filter(Boolean)
            .map((c) => (
              <option key={c}>{c}</option>
            ))}
        </select>
      </label>
      <label>
        Zutaten
        <textarea
          rows={6}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder={"250 g Pasta\n1 Zitrone\nSalz nach Geschmack"}
          aria-describedby="ingredient-help"
        />
      </label>
      <small id="ingredient-help">
        Eine Zutat pro Zeile, z. B. 250 g Pasta. Mengen ohne Einheit bleiben
        erhalten.
      </small>
      <fieldset>
        <legend>Kochschritte</legend>
        {form.steps.map((s, i) => (
          <div className="step-field" key={i}>
            <label>
              Schritt {i + 1}
              <textarea
                required
                rows={3}
                value={s}
                onChange={(e) =>
                  field(
                    "steps",
                    form.steps.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Schritt ${i + 1} entfernen`}
              disabled={form.steps.length === 1}
              onClick={() =>
                field(
                  "steps",
                  form.steps.filter((_, j) => j !== i),
                )
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => field("steps", [...form.steps, ""])}
        >
          <Plus size={16} />
          Schritt hinzufügen
        </button>
      </fieldset>
      <label>
        Bilder hochladen (optional)
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading || saving}
          aria-describedby="recipe-image-help"
          onChange={async (event) => {
            const files = Array.from(event.currentTarget.files || []);
            event.currentTarget.value = "";
            if (!files.length) return;
            setImageError("");
            if (images.length + files.length > MAX_RECIPE_IMAGES) {
              setImageError(
                `Du kannst höchstens ${MAX_RECIPE_IMAGES} Bilder pro Rezept hinzufügen.`,
              );
              return;
            }
            setUploading(true);
            try {
              const prepared: string[] = [];
              for (const file of files)
                prepared.push(await prepareRecipeImage(file));
              setImages([...images, ...prepared]);
            } catch (error) {
              setImageError(
                error instanceof Error
                  ? error.message
                  : "Das Bild konnte nicht geladen werden.",
              );
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
      <p id="recipe-image-help" className="muted">
        Bis zu {MAX_RECIPE_IMAGES} Bilder · JPG, PNG oder WebP · je bis 10 MB.
        Bilder werden automatisch verkleinert.
      </p>
      {uploading && (
        <p role="status" className="muted">
          Bilder werden vorbereitet …
        </p>
      )}
      {imageError && (
        <p className="error" role="alert">
          {imageError}
        </p>
      )}
      {images.length > 0 && (
        <div className="recipe-images-editor">
          {images.map((image, index) => (
            <div className="recipe-image-preview" key={image}>
              <img
                src={image}
                alt={`Vorschau von Bild ${index + 1}`}
                referrerPolicy="no-referrer"
              />
              <div className="recipe-image-actions">
                <button
                  type="button"
                  className="text-button"
                  aria-pressed={index === 0}
                  aria-label={
                    index === 0
                      ? "Bild 1 ist Titelbild"
                      : `Bild ${index + 1} als Titelbild verwenden`
                  }
                  disabled={uploading || saving}
                  onClick={() =>
                    setImages([image, ...images.filter((_, n) => n !== index)])
                  }
                >
                  {index === 0 && <Check size={14} />}
                  {index === 0 ? "Titelbild" : "Als Titelbild"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Bild ${index + 1} entfernen`}
                  disabled={uploading || saving}
                  onClick={() => {
                    setImages(images.filter((_, n) => n !== index));
                    setImageError("");
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <label>
        Bildadresse für das Titelbild (optional)
        <input
          type="url"
          value={isStoredRecipeImage(form.image) ? "" : form.image}
          disabled={uploading || saving}
          onChange={(e) => {
            if (e.target.value) field("image", e.target.value);
            else setImages(form.images || []);
            setImageError("");
          }}
          pattern="https?://.*"
        />
      </label>
      <label>
        Rezeptquelle (optional)
        <input
          type="url"
          value={form.source}
          onChange={(e) => field("source", e.target.value)}
          pattern="https?://.*"
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={saving || uploading}>
        <Check size={17} />
        Gericht speichern
      </button>
    </form>
  );
}
