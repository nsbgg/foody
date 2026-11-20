import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays,
  BookOpen,
  ShoppingBasket,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUpRight,
  Clock3,
  Users,
  Search,
  GripVertical,
  CookingPot,
  Leaf,
  Check,
  RefreshCw,
  Download,
  Link,
  Archive,
  Pencil,
  Play,
  Minus,
  WifiOff,
} from "lucide-react";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "./style.css";
import { PwaUpdate } from "./PwaUpdate.tsx";
import { initStore, useStore, change, sync, resolveConflict } from "./store.ts";
import {
  dateKey,
  monday,
  addDays,
  prettyDate,
  dayNames,
  shoppingList,
  parseIngredient,
  formatAmount,
  recipeSchema,
  type Recipe,
  type Entry,
  type Row,
} from "../shared/domain.ts";
import type { RecipeRow, EntryRow } from "./types.ts";
import { FoodArt } from "./components/FoodArt.tsx";
import { Dialog } from "./components/Dialog.tsx";
import { Editor } from "./components/Editor.tsx";
import { Importer } from "./components/Importer.tsx";
import { RecipeDetail } from "./components/RecipeDetail.tsx";
import { PlanDialog } from "./components/PlanDialog.tsx";
import { Shopping } from "./components/Shopping.tsx";
import { Cook } from "./components/Cook.tsx";
import { ConflictView } from "./components/ConflictView.tsx";
type Modal =
  | { type: "recipe"; row: RecipeRow }
  | { type: "edit"; row?: RecipeRow; draft?: Recipe }
  | { type: "import" }
  | { type: "plan"; row: RecipeRow | EntryRow }
  | { type: "cook"; row: RecipeRow | EntryRow }
  | { type: "conflicts" };
function App() {
  const state = useStore();
  const [view, setView] = useState<"week" | "recipes" | "shopping">("week");
  useEffect(() => {
    document.title = `${view === "week" ? "Wochenplan" : view === "recipes" ? "Gerichte" : "Einkaufsliste"} · Foody`;
  }, [view]);
  const [week, setWeek] = useState(monday());
  const [day, setDay] = useState((new Date().getDay() + 6) % 7);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Alle");
  const [modal, setModal] = useState<Modal | null>(null);
  const [notice, setNotice] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [install, setInstall] = useState<any>(null);
  const weekKey = dateKey(week),
    dates = dayNames.map((_, i) => dateKey(addDays(week, i)));
  const recipes = state.rows.filter((r) => r.kind === "recipe") as RecipeRow[];
  const entries = (state.rows.filter((r) => r.kind === "entry") as EntryRow[])
    .filter((r) => !r.data.deleted && dates.includes(r.data.date))
    .sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
  const filtered = recipes.filter(
    (r) =>
      r.data.archived === showArchive &&
      `${r.data.title} ${r.data.ingredients.map((i) => i.name).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "Alle" ||
        (filter === "Schnell" && r.data.minutes <= 25) ||
        r.data.category === filter),
  );
  const today = entries.find((e) => e.data.date === dateKey(new Date()));
  useEffect(() => {
    void initStore();
    const listener = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  function plan(row: RecipeRow, date: string) {
    const recipe = structuredClone(row.data);
    change("entry", crypto.randomUUID(), {
      date,
      recipeId: row.id,
      recipe,
      servings: recipe.servings,
      order: Date.now(),
      deleted: false,
    });
    setNotice(`${recipe.title} eingeplant`);
  }
  function move(row: EntryRow, date: string, before?: EntryRow) {
    if (before?.id === row.id && row.data.date === date) return;
    const same = entries.filter((e) => e.data.date === date && e.id !== row.id);
    const pos = before ? same.findIndex((e) => e.id === before.id) : -1;
    const next =
      pos >= 0 ? same[pos].data.order : (same.at(-1)?.data.order ?? 0) + 2000;
    const prev =
      pos > 0
        ? same[pos - 1].data.order
        : pos === 0
          ? next - 2000
          : next - 2000;
    void change(
      "entry",
      row.id,
      { ...row.data, date, order: (prev + next) / 2 },
      row.rev,
    );
    setNotice(
      `${row.data.recipe.title} auf ${prettyDate(new Date(date + "T12:00:00"))} verschoben`,
    );
  }
  const dragRef = useRef<{
    row: RecipeRow | EntryRow;
    pointer: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const [dropDay, setDropDay] = useState("");
  function pointerDown(e: React.PointerEvent, row: RecipeRow | EntryRow) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      row,
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      active: false,
    };
  }
  function pointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointer !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.active = true;
    if (!d.active) return;
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-date]");
    setDropDay(target?.dataset.date || "");
    document.documentElement.classList.add("dragging");
  }
  function pointerEnd(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointer !== e.pointerId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const date = el?.closest<HTMLElement>("[data-date]")?.dataset.date;
    const before = entries.find(
      (r) => r.id === el?.closest<HTMLElement>("[data-entry]")?.dataset.entry,
    );
    if (d.active && date) {
      if (d.row.kind === "entry") move(d.row as EntryRow, date, before);
      else plan(d.row as RecipeRow, date);
    }
    cancelDrag();
  }
  function cancelDrag() {
    dragRef.current = null;
    setDropDay("");
    document.documentElement.classList.remove("dragging");
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDrag();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  function handle(row: RecipeRow | EntryRow) {
    return (
      <button
        className="drag-handle"
        aria-label={`${row.kind === "recipe" ? (row.data as Recipe).title : (row.data as Entry).recipe.title} verschieben. Alternativ Einplanen verwenden.`}
        onPointerDown={(e) => pointerDown(e, row)}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
      >
        <GripVertical size={17} />
      </button>
    );
  }
  const weekNav = (
    <div className="week-nav">
      <button
        className="icon-button"
        aria-label="Vorherige Woche"
        onClick={() => setWeek(addDays(week, -7))}
      >
        <ChevronLeft size={19} />
      </button>
      <span>
        {prettyDate(week, { day: "numeric", month: "short" })} –{" "}
        {prettyDate(addDays(week, 6), {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </span>
      <button
        className="icon-button"
        aria-label="Nächste Woche"
        onClick={() => setWeek(addDays(week, 7))}
      >
        <ChevronRight size={19} />
      </button>
      <button
        className="text-button"
        onClick={() => {
          setWeek(monday());
          setDay((new Date().getDay() + 6) % 7);
        }}
      >
        Heute
      </button>
    </div>
  );
  function recipeCard(row: RecipeRow) {
    return (
      <article className="recipe-card" key={row.id}>
        <button
          className="image-button"
          onClick={() => setModal({ type: "recipe", row })}
          aria-label={`${row.data.title} öffnen`}
        >
          <FoodArt recipe={row.data} index={recipes.indexOf(row)} />
        </button>
        <div className="recipe-copy">
          <div className="card-top">
            <span className="category">{row.data.category}</span>
            {handle(row)}
          </div>
          <button
            className="title-button"
            onClick={() => setModal({ type: "recipe", row })}
          >
            {row.data.title}
          </button>
          <div className="card-foot">
            <span>
              <Clock3 size={13} />
              {row.data.minutes} Min.
            </span>
            <button
              className="text-button"
              onClick={() => setModal({ type: "plan", row })}
            >
              Einplanen <Plus size={14} />
            </button>
          </div>
        </div>
      </article>
    );
  }
  return (
    <>
      <a href="#main" className="skip-link">
        Zum Inhalt
      </a>
      <header className="app-header">
        <a className="brand" href="/" aria-label="Foody Startseite">
          <span className="brand-mark">
            <CookingPot size={25} />
            <Leaf size={12} />
          </span>
          foody<span className="brand-note">Gemeinsam gut essen.</span>
        </a>
        <nav aria-label="Hauptnavigation">
          {(
            [
              ["week", "Wochenplan", CalendarDays],
              ["recipes", "Gerichte", BookOpen],
              ["shopping", "Einkaufsliste", ShoppingBasket],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              className={view === v ? "nav-link active" : "nav-link"}
              aria-current={view === v ? "page" : undefined}
              onClick={() => setView(v)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <span className="household">
          <span className="avatar">Z</span>Unser Zuhause
        </span>
      </header>
      <main id="main">
        <div className="page-heading">
          <div>
            <h1>
              {view === "week"
                ? "Eine gute Woche beginnt hier."
                : view === "recipes"
                  ? "Was kochen wir als Nächstes?"
                  : "Alles für deine Kochwoche."}
            </h1>
            <p>
              {view === "week"
                ? "Lieblingsgerichte sammeln. Die Woche entspannt planen."
                : view === "recipes"
                  ? "Deine Rezepte, immer griffbereit."
                  : "Aus deinem Wochenplan, passend für eure Portionen."}
            </p>
          </div>
          <button
            className="primary"
            onClick={() => setModal({ type: "edit" })}
          >
            <Plus size={17} />
            Neues Gericht
          </button>
        </div>
        {!state.loaded ? (
          <div className="empty">Deine Küche wird geladen …</div>
        ) : (
          <>
            {state.error && (
              <p className="error" role="alert">
                {state.error}
              </p>
            )}
            <div className="utility-row">
              <div className="scope">
                <span className="status-dot" />
                Unser Wochenplan
              </div>
              <div className="sync-state">
                <PwaUpdate />
                <button className="text-button" onClick={() => void sync()}>
                  <RefreshCw size={13} />
                  {state.status}
                </button>
                {state.conflicts.length > 0 && (
                  <button onClick={() => setModal({ type: "conflicts" })}>
                    Konflikte ({state.conflicts.length})
                  </button>
                )}
                {install && (
                  <button
                    className="text-button"
                    onClick={async () => {
                      await install.prompt();
                      setInstall(null);
                    }}
                  >
                    <Download size={14} />
                    App installieren
                  </button>
                )}
              </div>
            </div>
            {view === "week" ? (
              <>
                <div className="planner-layout">
                  <section className="planner">
                    <div className="section-heading">
                      <h2>
                        <CalendarDays size={18} />
                        Diese Woche
                      </h2>
                      {weekNav}
                    </div>
                    <div className="mobile-week" aria-label="Wochentag">
                      {dates.map((date, i) => (
                        <button
                          key={date}
                          aria-pressed={day === i}
                          className={day === i ? "selected" : ""}
                          onClick={() => setDay(i)}
                        >
                          <span>{dayNames[i].slice(0, 2)}</span>
                          <strong>{addDays(week, i).getDate()}</strong>
                          <i
                            className={
                              entries.some((e) => e.data.date === date)
                                ? "has-meal"
                                : ""
                            }
                          />
                        </button>
                      ))}
                    </div>
                    <div className="board">
                      {dates.map((date, i) => {
                        const meals = entries.filter(
                          (e) => e.data.date === date,
                        );
                        return (
                          <section
                            key={date}
                            data-date={date}
                            className={`day-column ${day !== i ? "mobile-hidden" : ""} ${date === dateKey(new Date()) ? "today" : ""} ${dropDay === date ? "drop-target" : ""}`}
                          >
                            <div className="day-heading">
                              <h3>
                                {dayNames[i].slice(0, 2)}
                                <span className="full-day">
                                  {dayNames[i].slice(2)}
                                </span>
                              </h3>
                              <span>{addDays(week, i).getDate()}</span>
                            </div>
                            <div className="day-meals">
                              {meals.map((row) => (
                                <article
                                  className="meal"
                                  key={row.id}
                                  data-entry={row.id}
                                >
                                  <FoodArt
                                    recipe={row.data.recipe}
                                    index={recipes.findIndex(
                                      (r) => r.id === row.data.recipeId,
                                    )}
                                  />
                                  <div className="meal-body">
                                    <span className="meal-category">
                                      {row.data.recipe.category}
                                    </span>
                                    <button
                                      className="title-button"
                                      onClick={() =>
                                        setModal({ type: "cook", row })
                                      }
                                    >
                                      {row.data.recipe.title}
                                    </button>
                                    <span className="meal-meta">
                                      <Clock3 size={12} />
                                      {row.data.recipe.minutes} Min.{" "}
                                      <Users size={12} />
                                      {row.data.servings}
                                    </span>
                                    <div className="meal-actions">
                                      {handle(row)}
                                      <button
                                        className="text-button"
                                        onClick={() =>
                                          setModal({ type: "plan", row })
                                        }
                                        aria-label={`Ändern: ${row.data.recipe.title}`}
                                      >
                                        Ändern
                                      </button>
                                      <button
                                        className="icon-button"
                                        onClick={() =>
                                          setModal({ type: "cook", row })
                                        }
                                        aria-label={`${row.data.recipe.title} kochen`}
                                      >
                                        <Play size={14} />
                                      </button>
                                    </div>
                                  </div>
                                </article>
                              ))}
                              <button
                                className="add-slot"
                                aria-label={`${meals.length ? "Gericht ergänzen" : "Was gibt’s?"} für ${dayNames[i]}`}
                                onClick={() => {
                                  setDay(i);
                                  setModal({
                                    type: "plan",
                                    row: filtered[0] || recipes[0],
                                  });
                                }}
                                disabled={
                                  !recipes.some((r) => !r.data.archived)
                                }
                              >
                                <Plus size={18} />
                                <span>
                                  {meals.length
                                    ? "Gericht ergänzen"
                                    : "Was gibt’s?"}
                                </span>
                              </button>
                            </div>
                          </section>
                        );
                      })}
                    </div>
                    <div className="board-footer">
                      <span>{entries.length} Gerichte geplant</span>
                      <span>
                        {new Set(entries.map((e) => e.data.date)).size} von 7
                        Tagen belegt
                      </span>
                    </div>
                  </section>
                  <aside className="recipe-stack">
                    <div className="section-heading">
                      <h2>
                        <BookOpen size={18} />
                        Dein Gerichtestapel
                      </h2>
                      <span>
                        {recipes.filter((r) => !r.data.archived).length}
                      </span>
                    </div>
                    <label className="search">
                      <Search size={16} />
                      <span className="sr-only">Gerichte suchen</span>
                      <input
                        type="search"
                        placeholder="Worauf hast du Lust?"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <div className="filters">
                      {["Alle", "Vegetarisch", "Schnell"].map((f) => (
                        <button
                          key={f}
                          aria-pressed={filter === f}
                          onClick={() => setFilter(f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div className="stack-list">
                      {filtered.map(recipeCard)}
                      {!filtered.length && (
                        <p className="empty">
                          Keine passenden Gerichte. Ändere die Suche oder lege
                          ein Gericht an.
                        </p>
                      )}
                    </div>
                    <button
                      className="import-button"
                      onClick={() => setModal({ type: "import" })}
                    >
                      <Link size={16} />
                      Rezept aus dem Internet
                      <ArrowUpRight size={16} />
                    </button>
                  </aside>
                </div>
                <div className="under-board">
                  <section className="cooking-invitation">
                    <CookingPot size={28} />
                    <div>
                      <h2>
                        {today ? "Heute auf dem Tisch" : "Zeit zum Kochen?"}
                      </h2>
                      <p>
                        {today
                          ? today.data.recipe.title
                          : "Öffne ein Gericht und koche Schritt für Schritt."}
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() =>
                        today
                          ? setModal({ type: "cook", row: today })
                          : setView("recipes")
                      }
                    >
                      {today ? "Kochmodus starten" : "Gericht auswählen"}
                      <ChevronRight size={16} />
                    </button>
                  </section>
                  <button
                    className="shopping-shortcut"
                    onClick={() => setView("shopping")}
                  >
                    <ShoppingBasket size={23} />
                    <span>
                      <strong>Dein Einkauf ist schon geplant.</strong>
                      <small>
                        {shoppingList(entries.map((e) => e.data)).length}{" "}
                        Zutaten für diese Woche
                      </small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </>
            ) : view === "recipes" ? (
              <section>
                <div className="library-tools">
                  <label className="search">
                    <Search size={17} />
                    <span className="sr-only">Gerichte suchen</span>
                    <input
                      placeholder="Gerichte oder Zutaten suchen"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <button
                    className="secondary"
                    onClick={() => setModal({ type: "import" })}
                  >
                    <Link size={16} />
                    Rezept importieren
                  </button>
                  <button
                    className="text-button"
                    aria-pressed={showArchive}
                    onClick={() => setShowArchive(!showArchive)}
                  >
                    <Archive size={16} />
                    {showArchive ? "Aktive Gerichte" : "Archiv anzeigen"}
                  </button>
                </div>
                <h2 className="library-label">
                  {showArchive
                    ? "Archivierte Gerichte"
                    : "Deine Rezeptsammlung"}{" "}
                  <span>{filtered.length}</span>
                </h2>
                <div className="recipe-grid">{filtered.map(recipeCard)}</div>
                {!filtered.length && (
                  <p className="empty">
                    Hier sind noch keine passenden Gerichte. Lege dein erstes
                    Rezept an.
                  </p>
                )}
              </section>
            ) : (
              <Shopping
                weekKey={weekKey}
                entries={entries}
                rows={state.rows}
                weekNav={weekNav}
              />
            )}
          </>
        )}
        <footer className="app-footer">
          <span>Weniger überlegen. Mehr zusammen essen.</span>
          <span>Foody · Für eure Alltagsküche</span>
        </footer>
      </main>
      <div className="toast" role="status">
        {notice}
      </div>
      {modal && (
        <Dialog
          onClose={() => setModal(null)}
          fullscreen={modal.type === "cook"}
        >
          {modal.type === "edit" ? (
            <Editor
              row={modal.row}
              draft={modal.draft}
              onDone={() => {
                setModal(null);
                setNotice("Gericht gespeichert");
              }}
            />
          ) : modal.type === "import" ? (
            <Importer
              onImported={(recipe) => setModal({ type: "edit", draft: recipe })}
            />
          ) : modal.type === "recipe" ? (
            <RecipeDetail
              row={modal.row}
              onEdit={() => setModal({ type: "edit", row: modal.row })}
              onPlan={() => setModal({ type: "plan", row: modal.row })}
              onCook={() => setModal({ type: "cook", row: modal.row })}
              onArchive={async () => {
                const saved = await change(
                  "recipe",
                  modal.row.id,
                  {
                    ...modal.row.data,
                    archived: !modal.row.data.archived,
                  },
                  modal.row.rev,
                );
                if (saved) setModal(null);
              }}
            />
          ) : modal.type === "plan" ? (
            <PlanDialog
              key={modal.row?.id}
              row={modal.row}
              recipes={recipes.filter((r) => !r.data.archived)}
              entries={(
                state.rows.filter((r) => r.kind === "entry") as EntryRow[]
              ).filter((r) => !r.data.deleted)}
              week={week}
              initialDay={day}
              onSave={async (row, date, servings, order) => {
                let saved: boolean;
                if (row.kind === "entry") {
                  const current = row.data as Entry;
                  saved = await change(
                    "entry",
                    row.id,
                    {
                      ...current,
                      date,
                      servings,
                      order,
                    },
                    row.rev,
                  );
                } else {
                  const r = row as RecipeRow;
                  saved = await change("entry", crypto.randomUUID(), {
                    date,
                    recipeId: r.id,
                    recipe: structuredClone(r.data),
                    servings,
                    order,
                    deleted: false,
                  });
                }
                if (saved) {
                  setModal(null);
                  setNotice("Wochenplan gespeichert");
                }
                return saved;
              }}
              onRemove={async (row) => {
                const saved = await change(
                  "entry",
                  row.id,
                  { ...row.data, deleted: true },
                  row.rev,
                );
                if (saved) setModal(null);
              }}
              onRefresh={async (row) => {
                const latest = recipes.find((r) => r.id === row.data.recipeId);
                if (latest) {
                  const updated = {
                    ...row,
                    data: { ...row.data, recipe: structuredClone(latest.data) },
                  };
                  const saved = await change(
                    "entry",
                    row.id,
                    updated.data,
                    row.rev,
                  );
                  if (saved) {
                    setModal({
                      type: "plan",
                      row: { ...updated, rev: row.rev + 1 },
                    });
                    setNotice("Rezeptfassung aktualisiert");
                  }
                }
              }}
            />
          ) : modal.type === "cook" ? (
            <Cook
              row={modal.row}
              onDone={() => {
                setView("week");
                setModal(null);
              }}
            />
          ) : (
            <ConflictView
              conflicts={state.conflicts}
              onResolve={resolveConflict}
            />
          )}
        </Dialog>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
