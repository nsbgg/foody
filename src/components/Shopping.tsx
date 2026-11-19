import React, { useState } from "react";
import { ShoppingBasket, Plus, X } from "lucide-react";
import { shoppingList, formatAmount, type Row } from "../../shared/domain.ts";
import { change } from "../store.ts";
import type { EntryRow } from "../types.ts";

export function Shopping({
  entries,
  rows,
  weekKey,
  weekNav,
}: {
  entries: EntryRow[];
  rows: Row[];
  weekKey: string;
  weekNav: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const items = shoppingList(entries.map((e) => e.data));
  const extras = rows.filter(
    (r) =>
      r.kind === "extra" &&
      (r.data as any).week === weekKey &&
      !(r.data as any).deleted,
  );
  const checked = (key: string) =>
    Boolean(
      (rows.find((r) => r.id === `check:${weekKey}:${key}`)?.data as any)
        ?.checked,
    );
  return (
    <section className="shopping-page">
      <div className="section-heading">
        <h2>
          <ShoppingBasket size={18} />
          Einkaufsliste
        </h2>
        {weekNav}
      </div>
      <p className="muted">
        {items.length} Zutaten aus {entries.length} geplanten Gerichten. Gleiche
        Zutaten mit passenden Einheiten sind zusammengefasst.
      </p>
      {items.length === 0 && (
        <p className="empty">
          Plane ein Gericht ein. Seine Zutaten erscheinen hier automatisch.
        </p>
      )}
      <ul className="shopping-list">
        {items.map((i) => (
          <li key={i.key}>
            <label className={checked(i.key) ? "checked" : ""}>
              <input
                type="checkbox"
                checked={checked(i.key)}
                onChange={(e) =>
                  change("check", `check:${weekKey}:${i.key}`, {
                    checked: e.target.checked,
                  })
                }
              />
              <span>{i.name}</span>
              <strong>{formatAmount(i.amount, i.unit)}</strong>
            </label>
          </li>
        ))}
        {extras.map((r) => (
          <li key={r.id}>
            <label className={(r.data as any).checked ? "checked" : ""}>
              <input
                type="checkbox"
                checked={(r.data as any).checked}
                onChange={(e) =>
                  change("extra", r.id, {
                    ...r.data,
                    checked: e.target.checked,
                  } as any)
                }
              />
              <span>{(r.data as any).text}</span>
              <small>Zusätzlich</small>
            </label>
            <button
              className="icon-button"
              aria-label={`${(r.data as any).text} entfernen`}
              onClick={() =>
                change("extra", r.id, { ...r.data, deleted: true } as any)
              }
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="add-shopping"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            change("extra", crypto.randomUUID(), {
              week: weekKey,
              text: text.trim(),
              checked: false,
              deleted: false,
            });
            setText("");
          }
        }}
      >
        <label>
          <span className="sr-only">Zusätzlicher Einkaufsartikel</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Noch etwas? Zum Beispiel Kaffee"
            maxLength={300}
            required
          />
        </label>
        <button className="secondary">
          <Plus size={17} />
          Ergänzen
        </button>
      </form>
    </section>
  );
}
