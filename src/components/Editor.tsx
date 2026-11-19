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
  const field = (key: keyof Recipe, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
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
        Bildadresse (optional)
        <input
          type="url"
          value={form.image}
          onChange={(e) => field("image", e.target.value)}
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
      <button className="primary" type="submit" disabled={saving}>
        <Check size={17} />
        Gericht speichern
      </button>
    </form>
  );
}
