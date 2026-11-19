import { CookingPot, CalendarDays, Pencil, Archive } from "lucide-react";
import { formatAmount } from "../../shared/domain.ts";
import type { RecipeRow } from "../types.ts";
import { FoodArt } from "./FoodArt.tsx";

export function RecipeDetail({
  row,
  onEdit,
  onPlan,
  onCook,
  onArchive,
}: {
  row: RecipeRow;
  onEdit: () => void;
  onPlan: () => void;
  onCook: () => void;
  onArchive: () => void;
}) {
  const r = row.data;
  return (
    <>
      <FoodArt recipe={r} />
      <span className="recipe-context">
        {r.category} · {r.minutes} Minuten · {r.servings} Portionen
      </span>
      <h2>{r.title}</h2>
      <p>{r.description}</p>
      <div className="detail-actions">
        <button className="primary" onClick={onCook}>
          <CookingPot size={17} />
          Kochen
        </button>
        <button className="secondary" onClick={onPlan}>
          <CalendarDays size={17} />
          Einplanen
        </button>
        <button className="text-button" onClick={onEdit}>
          <Pencil size={16} />
          Bearbeiten
        </button>
      </div>
      <h3>Zutaten</h3>
      <ul className="ingredient-list">
        {r.ingredients.map((i, n) => (
          <li key={n}>
            <span>{i.name}</span>
            <strong>{formatAmount(i.amount, i.unit)}</strong>
          </li>
        ))}
      </ul>
      <h3>Zubereitung</h3>
      <ol className="recipe-steps">
        {r.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {/^https?:\/\//.test(r.source) && (
        <a href={r.source} target="_blank" rel="noreferrer">
          Originalrezept öffnen
        </a>
      )}
      <div className="archive-row">
        <button className="text-button" onClick={onArchive}>
          <Archive size={16} />
          {r.archived ? "Wiederherstellen" : "Gericht archivieren"}
        </button>
      </div>
    </>
  );
}
