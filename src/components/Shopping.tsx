import React, { useState } from "react";
import { List, Store, Carrot, Utensils, Plus, X } from "lucide-react";
import { shoppingList, formatAmount, type Row } from "../../shared/domain.ts";
import { change } from "../store.ts";
import type { EntryRow } from "../types.ts";
import { supermarketArea, supermarketAreas } from "../../shared/supermarket.ts";

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
  const [grouped, setGrouped] = useState(() => {
    try {
      return localStorage.getItem("foody-shopping-grouped") === "true";
    } catch {
      return false;
    }
  });
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
  const listItems = [
    ...items.map((i) => ({
      key: i.key,
      name: i.name,
      area: supermarketArea(i.name, i.unit),
      content: (
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
      ),
    })),
    ...extras.map((r) => ({
      key: r.id,
      name: (r.data as any).text as string,
      area: supermarketArea((r.data as any).text),
      content: (
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
      ),
    })),
  ];
  const groups = grouped
    ? supermarketAreas
        .map((area) => ({
          title: area,
          items: listItems
            .filter((item) => item.area === area)
            .sort((a, b) => a.name.localeCompare(b.name, "de")),
        }))
        .filter((group) => group.items.length > 0)
    : [{ title: "", items: listItems }];
  return (
    <section className="shopping-page">
      <div className="shopping-toolbar">
        <div className="shopping-week-nav">{weekNav}</div>
        <div
          className="shopping-counts"
          role="group"
          aria-label="Umfang der Einkaufsliste"
        >
          <span title={`${items.length} Zutaten`}>
            <Carrot size={17} aria-hidden="true" />
            <span className="sr-only">Zutaten: </span>
            {items.length}
          </span>
          <span title={`${entries.length} geplante Gerichte`}>
            <Utensils size={17} aria-hidden="true" />
            <span className="sr-only">Geplante Gerichte: </span>
            {entries.length}
          </span>
        </div>
        <div
          className="shopping-grouping"
          role="group"
          aria-label="Ansicht der Einkaufsliste"
        >
          {[
            {
              enabled: false,
              label: "Normale Liste",
              description: "Alle Artikel als einfache Liste",
              Icon: List,
            },
            {
              enabled: true,
              label: "Nach Supermarktbereich",
              description: "Artikel nach Supermarktbereich gruppieren",
              Icon: Store,
            },
          ].map(({ enabled, label, description, Icon }) => (
            <div className="shopping-grouping-option" key={String(enabled)}>
              <button
                type="button"
                aria-label={label}
                aria-pressed={grouped === enabled}
                title={description}
                onClick={() => {
                  setGrouped(enabled);
                  try {
                    localStorage.setItem(
                      "foody-shopping-grouped",
                      String(enabled),
                    );
                  } catch {
                    /* Preference remains available for this visit. */
                  }
                }}
              >
                <Icon size={20} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>
      {items.length === 0 && (
        <p className="empty">
          Plane ein Gericht ein. Seine Zutaten erscheinen hier automatisch.
        </p>
      )}
      <div className="shopping-groups">
        {groups.map((group) => (
          <div className="shopping-group" key={group.title}>
            {group.title && (
              <h2>
                {group.title}
                <span>{group.items.length} Artikel</span>
              </h2>
            )}
            {group.items.length > 0 && (
              <ul
                className="shopping-list"
                aria-label={group.title || "Alle Einkaufsartikel"}
              >
                {group.items.map((item) => item.content)}
              </ul>
            )}
          </div>
        ))}
      </div>
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
