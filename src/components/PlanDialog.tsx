import { useState } from "react";
import { Check, RefreshCw, Minus } from "lucide-react";
import { dateKey, addDays, type Recipe } from "../../shared/domain.ts";
import type { RecipeRow, EntryRow } from "../types.ts";

export function PlanDialog({
  row,
  recipes,
  entries,
  week,
  initialDay,
  onSave,
  onRemove,
  onRefresh,
}: {
  row?: RecipeRow | EntryRow;
  recipes: RecipeRow[];
  entries: EntryRow[];
  week: Date;
  initialDay: number;
  onSave: (
    r: RecipeRow | EntryRow,
    date: string,
    servings: number,
    order: number,
  ) => Promise<boolean>;
  onRemove: (r: EntryRow) => void;
  onRefresh: (r: EntryRow) => void;
}) {
  const [selected, setSelected] = useState(row?.id || recipes[0]?.id || "");
  const entry = row?.kind === "entry" ? (row as EntryRow) : undefined;
  const chosen = entry || recipes.find((r) => r.id === selected);
  const [date, setDate] = useState(
    entry?.data.date || dateKey(addDays(week, initialDay)),
  );
  const [servings, setServings] = useState(
    entry?.data.servings || (row?.data as Recipe)?.servings || 2,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState(() =>
    entry
      ? Math.max(
          0,
          entries
            .filter((e) => e.data.date === entry.data.date)
            .sort((a, b) => a.data.order - b.data.order)
            .findIndex((e) => e.id === entry.id),
        )
      : entries.filter((e) => e.data.date === date).length,
  );
  const peers = entries
    .filter((e) => e.data.date === date && e.id !== entry?.id)
    .sort((a, b) => a.data.order - b.data.order);
  const safePosition = Math.min(position, peers.length);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        const previous =
          peers[safePosition - 1]?.data.order ??
          (peers[0]?.data.order ?? 2000) - 2000;
        const next = peers[safePosition]?.data.order ?? previous + 2000;
        if (chosen) {
          setSaving(true);
          setError("");
          try {
            if (!(await onSave(chosen, date, servings, (previous + next) / 2)))
              setError(
                "Speichern auf diesem Gerät fehlgeschlagen. Bitte erneut versuchen.",
              );
          } finally {
            setSaving(false);
          }
        }
      }}
    >
      <h2>{entry ? "Planeintrag ändern" : "Was kommt auf den Tisch?"}</h2>
      {entry ? (
        <h3>{entry.data.recipe.title}</h3>
      ) : (
        <label>
          Gericht
          <select
            autoFocus
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setServings(
                recipes.find((r) => r.id === e.target.value)!.data.servings,
              );
            }}
          >
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.data.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Tag
        <input
          type="date"
          required
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPosition(
              entries.filter(
                (entry) =>
                  entry.data.date === e.target.value && entry.id !== row?.id,
              ).length,
            );
          }}
        />
      </label>
      <label>
        Portionen
        <input
          type="number"
          min="0.5"
          step="0.5"
          max="1000"
          required
          value={servings}
          onChange={(e) => setServings(e.target.valueAsNumber)}
        />
      </label>
      {peers.length > 0 && (
        <label>
          Reihenfolge an diesem Tag
          <select
            value={safePosition}
            onChange={(e) => setPosition(Number(e.target.value))}
          >
            {Array.from({ length: peers.length + 1 }, (_, i) => (
              <option key={i} value={i}>
                {i < peers.length
                  ? `Vor ${peers[i].data.recipe.title}`
                  : "Als letztes Gericht"}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={!chosen || saving} type="submit">
        <Check size={17} />
        Einplanen
      </button>
      {entry && (
        <div className="archive-row">
          <button
            type="button"
            className="text-button"
            onClick={() => onRefresh(entry)}
            disabled={!recipes.some((r) => r.id === entry.data.recipeId)}
          >
            <RefreshCw size={15} />
            Aktuelle Rezeptfassung übernehmen
          </button>
          <button
            type="button"
            className="text-button danger"
            onClick={() => onRemove(entry)}
          >
            <Minus size={15} />
            Aus dem Plan entfernen
          </button>
        </div>
      )}
    </form>
  );
}
