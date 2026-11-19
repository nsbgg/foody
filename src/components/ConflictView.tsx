import {
  formatAmount,
  dataSchemas,
  type Kind,
  type Row,
  type Operation,
  type Recipe,
  type Entry,
} from "../../shared/domain.ts";

function Version({ kind, data }: { kind: Kind; data?: Row["data"] }) {
  if (!data)
    return <p>Dieser Eintrag ist in dieser Fassung nicht vorhanden.</p>;
  const parsed = dataSchemas[kind].safeParse(data);
  if (!parsed.success) return <p>Diese Fassung enthält ungültige Daten.</p>;
  const clean = parsed.data;
  if (kind === "entry") {
    const entry = clean as Entry;
    return (
      <>
        <p>
          {entry.date} · {entry.servings} Portionen
        </p>
        {entry.deleted && <p>Aus dem Plan entfernt</p>}
        <Version kind="recipe" data={entry.recipe} />
      </>
    );
  }
  if (kind === "recipe") {
    const recipe = clean as Recipe;
    return (
      <>
        <p>
          <strong>{recipe.title}</strong>
        </p>
        <p>{recipe.description}</p>
        <p>
          {recipe.servings} Portionen · {recipe.minutes} Minuten ·{" "}
          {recipe.category}
          {recipe.archived ? " · Archiviert" : ""}
        </p>
        <h5>Zutaten</h5>
        <ul>
          {recipe.ingredients.map((item, i) => (
            <li key={i}>
              {formatAmount(item.amount, item.unit)} {item.name}
            </li>
          ))}
        </ul>
        <h5>Kochschritte</h5>
        <ol>
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        {recipe.source && <p>Quelle: {recipe.source}</p>}
        {/^https?:\/\//.test(recipe.image) && (
          <img
            src={recipe.image}
            alt="Rezeptbild dieser Fassung"
            referrerPolicy="no-referrer"
          />
        )}
      </>
    );
  }
  const item = clean as { checked: boolean; text?: string; deleted?: boolean };
  return (
    <>
      <p>{kind === "extra" ? item.text : "Einkaufsartikel"}</p>
      <p>{item.checked ? "Bereits eingekauft" : "Noch einkaufen"}</p>
      {kind === "extra" && item.deleted && <p>Entfernt</p>}
    </>
  );
}

function conflictTitle(local: Operation) {
  const parsed = dataSchemas[local.kind].safeParse(local.data);
  if (!parsed.success) return "Ungültiger Eintrag";
  if (local.kind === "recipe") return (parsed.data as Recipe).title;
  if (local.kind === "entry") return (parsed.data as Entry).recipe.title;
  if (local.kind === "extra") return dataSchemas.extra.parse(local.data).text;
  return "Einkaufsstatus";
}

export function ConflictView({
  conflicts,
  onResolve,
}: {
  conflicts: { local: Operation; remote: Row | null; changed?: boolean }[];
  onResolve: (id: string, choice: "local" | "remote") => void;
}) {
  return (
    <>
      <h2>Änderungen vergleichen</h2>
      <p>Beide Fassungen bleiben erhalten, bis du dich entscheidest.</p>
      {!conflicts.length && <p>Alle Konflikte sind gelöst.</p>}
      {conflicts.map((c) => (
        <section className="conflict" key={c.local.id}>
          {c.changed && (
            <p role="status">
              Die entfernte Fassung wurde erneut geändert. Bitte vergleiche die
              Fassungen noch einmal.
            </p>
          )}
          <h3>{conflictTitle(c.local)}</h3>
          <div className="conflict-columns">
            {(["local", "remote"] as const).map((choice) => (
              <div key={choice} className="conflict-version">
                <h4>
                  {choice === "local" ? "Auf diesem Gerät" : "Auf dem Server"}
                </h4>
                <div className="version-content">
                  <Version
                    kind={
                      choice === "local"
                        ? c.local.kind
                        : c.remote?.kind || c.local.kind
                    }
                    data={choice === "local" ? c.local.data : c.remote?.data}
                  />
                </div>
                <button
                  className="secondary"
                  onClick={() => onResolve(c.local.id, choice)}
                >
                  Diese Fassung verwenden
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
