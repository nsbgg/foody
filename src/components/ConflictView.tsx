import {
  formatAmount,
  type Row,
  type Operation,
  type Recipe,
  type Entry,
} from "../../shared/domain.ts";

function Version({ data }: { data?: Row["data"] }) {
  if (!data)
    return <p>Dieser Eintrag ist in dieser Fassung nicht vorhanden.</p>;
  if ("recipe" in data) {
    const entry = data as Entry;
    return (
      <>
        <p>
          {entry.date} · {entry.servings} Portionen
        </p>
        {entry.deleted && <p>Aus dem Plan entfernt</p>}
        <Version data={entry.recipe} />
      </>
    );
  }
  if ("title" in data) {
    const recipe = data as Recipe;
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
        {recipe.image && (
          <img
            src={recipe.image}
            alt="Rezeptbild dieser Fassung"
            referrerPolicy="no-referrer"
          />
        )}
      </>
    );
  }
  return (
    <>
      <p>{"text" in data ? data.text : "Einkaufsartikel"}</p>
      <p>{data.checked ? "Bereits eingekauft" : "Noch einkaufen"}</p>
      {"deleted" in data && data.deleted && <p>Entfernt</p>}
    </>
  );
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
          <h3>
            {"title" in c.local.data
              ? c.local.data.title
              : "recipe" in c.local.data
                ? c.local.data.recipe.title
                : "text" in c.local.data
                  ? c.local.data.text
                  : "Einkaufsstatus"}
          </h3>
          <div className="conflict-columns">
            {(["local", "remote"] as const).map((choice) => (
              <div key={choice} className="conflict-version">
                <h4>
                  {choice === "local" ? "Auf diesem Gerät" : "Auf dem Server"}
                </h4>
                <div className="version-content">
                  <Version
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
