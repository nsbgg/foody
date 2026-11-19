import { useState, useEffect, useLayoutEffect, useRef, useId } from "react";
import {
  CookingPot,
  Clock3,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Sun,
  Moon,
  X,
} from "lucide-react";
import { formatAmount, type Recipe, type Entry } from "../../shared/domain.ts";
import type { RecipeRow, EntryRow } from "../types.ts";

// Measure using the visible paragraph's typography. Retain every character and
// split long unbroken text on grapheme boundaries instead of shrinking its type.
function useMeasuredPages(text: string, active = true) {
  const viewport = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLParagraphElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (!active || !viewport.current || !measure.current) return;
    const host = viewport.current;
    const probe = measure.current;
    let cancelled = false;
    const segmenter = new Intl.Segmenter("de", { granularity: "grapheme" });
    const characters = Array.from(
      segmenter.segment(text),
      (part) => part.segment,
    );
    const paginate = () => {
      if (cancelled || host.clientHeight <= 0 || host.clientWidth <= 0) return;
      const limit = host.clientHeight - 2;
      const next: string[] = [];
      let start = 0;
      while (start < characters.length) {
        let low = 1;
        let high = characters.length - start;
        let fits = 1;
        while (low <= high) {
          const count = Math.floor((low + high) / 2);
          probe.textContent = characters.slice(start, start + count).join("");
          if (probe.getBoundingClientRect().height <= limit) {
            fits = count;
            low = count + 1;
          } else high = count - 1;
        }
        // Prefer a word boundary when it does not waste most of the page.
        if (start + fits < characters.length) {
          for (let index = fits - 1; index >= fits * 0.7; index--) {
            if (/\s/u.test(characters[start + index])) {
              fits = index + 1;
              break;
            }
          }
        }
        next.push(characters.slice(start, start + fits).join(""));
        start += fits;
      }
      probe.textContent = "";
      setPages((previous) =>
        previous.length === next.length &&
        previous.every((page, index) => page === next[index])
          ? previous
          : next,
      );
    };
    paginate();
    const observer = new ResizeObserver(paginate);
    observer.observe(host);
    void document.fonts.ready.then(paginate);
    document.fonts.addEventListener("loadingdone", paginate);
    return () => {
      cancelled = true;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", paginate);
    };
  }, [text, active]);
  return { viewport, measure, pages };
}

function PageControls({
  page,
  count,
  onPage,
  ingredients = false,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
  ingredients?: boolean;
}) {
  return (
    <nav
      className={`cook-page-controls${count <= 1 ? " single-page" : ""}`}
      aria-label={ingredients ? "Zutatenseiten" : "Textseiten"}
    >
      <button
        className="secondary"
        aria-label={
          ingredients ? "Vorherige Zutatenseite" : "Vorherige Textseite"
        }
        disabled={page === 0 || count <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <span>
        Seite {page + 1} von {Math.max(1, count)}
      </span>
      <button
        className="secondary"
        aria-label={ingredients ? "Nächste Zutatenseite" : "Nächste Textseite"}
        disabled={page >= count - 1}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </nav>
  );
}

export function Cook({ row }: { row: RecipeRow | EntryRow }) {
  const entry = row.kind === "entry" ? (row.data as Entry) : null;
  const recipe = entry?.recipe || (row.data as Recipe);
  const servings = entry?.servings || recipe.servings;
  const key = `foodie-cook:${row.id}`;
  const [step, setStep] = useState(() => {
    try {
      const saved = Number(JSON.parse(localStorage.getItem(key) || "{}").step);
      return Number.isInteger(saved)
        ? Math.min(Math.max(0, saved), recipe.steps.length)
        : 0;
    } catch {
      return 0;
    }
  });
  const [minutes, setMinutes] = useState(5);
  const [deadline, setDeadline] = useState<number | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}").deadline;
      return typeof saved === "number" && Number.isFinite(saved) && saved > 0
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const [now, setNow] = useState(Date.now());
  const [wake, setWake] = useState(false);
  const [panel, setPanel] = useState<"ingredients" | "timer" | null>(null);
  const panelRef = useRef<HTMLDialogElement>(null);
  const panelHeading = useId();
  const timerInput = useId();
  const [page, setPage] = useState(0);
  const [ingredientPage, setIngredientPage] = useState(0);
  const done = step >= recipe.steps.length;
  const stepPages = useMeasuredPages(done ? "" : recipe.steps[step]);
  const ingredientText =
    recipe.ingredients
      .map((ingredient) =>
        [
          formatAmount(
            ingredient.amount === null
              ? null
              : (ingredient.amount * servings) / recipe.servings,
            ingredient.unit,
          ),
          ingredient.name,
        ]
          .filter(Boolean)
          .join(" "),
      )
      .join("\n\n") || "Keine Zutaten hinterlegt.";
  const ingredientPages = useMeasuredPages(
    ingredientText,
    panel === "ingredients",
  );
  const currentPage = Math.min(page, Math.max(0, stepPages.pages.length - 1));
  const currentIngredientPage = Math.min(
    ingredientPage,
    Math.max(0, ingredientPages.pages.length - 1),
  );

  useLayoutEffect(() => {
    setPage(0);
  }, [step]);
  useLayoutEffect(() => {
    if (!panel || !panelRef.current) return;
    setIngredientPage(0);
    if (!panelRef.current.open) panelRef.current.showModal();
  }, [panel]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ step, deadline }));
    } catch {}
  }, [step, deadline, key]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    const request = async () => {
      if (
        !("wakeLock" in navigator) ||
        document.visibilityState !== "visible" ||
        (lock && !lock.released)
      )
        return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await next.release();
          return;
        }
        lock = next;
        setWake(true);
        next.addEventListener("release", () => setWake(false));
      } catch {
        setWake(false);
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, []);
  const remaining = deadline
    ? Math.max(0, Math.ceil((deadline - now) / 1000))
    : 0;
  const timerLabel =
    remaining === 0
      ? "Timer abgelaufen"
      : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  return (
    <div className="cook">
      <header className="cook-header">
        <h2 title={recipe.title}>{recipe.title}</h2>
        <div className="cook-tools">
          <button className="secondary" onClick={() => setPanel("ingredients")}>
            <ListChecks size={18} aria-hidden="true" />
            Zutaten
          </button>
          <button className="secondary" onClick={() => setPanel("timer")}>
            <Clock3 size={18} aria-hidden="true" />
            Timer
            {deadline && (
              <span className="cook-timer-count" aria-hidden="true">
                {remaining === 0 ? "Fertig" : timerLabel}
              </span>
            )}
          </button>
        </div>
      </header>
      <div className="cook-progress">
        <span>
          {done
            ? "Geschafft"
            : `Schritt ${step + 1} von ${recipe.steps.length}`}
        </span>
        <span
          role="img"
          aria-label={wake ? "Display bleibt wach" : "Display-Ruhemodus aktiv"}
          title={wake ? "Display bleibt wach" : "Display-Ruhemodus aktiv"}
        >
          {wake ? (
            <Sun size={18} aria-hidden="true" />
          ) : (
            <Moon size={18} aria-hidden="true" />
          )}
        </span>
        <progress
          max={recipe.steps.length}
          value={Math.min(step + 1, recipe.steps.length)}
          aria-label="Kochfortschritt"
        />
      </div>
      <div className="cook-stage">
        {done ? (
          <div className="cook-step cook-complete">
            <CookingPot size={40} aria-hidden="true" />
            <h3>Guten Appetit!</h3>
            <p>Das Essen ist fertig.</p>
          </div>
        ) : (
          <div className="cook-step" ref={stepPages.viewport}>
            <p className="cook-step-text" aria-live="polite" aria-atomic="true">
              {stepPages.pages[currentPage] || ""}
            </p>
            <p
              className="cook-measure"
              ref={stepPages.measure}
              aria-hidden="true"
            />
          </div>
        )}
        <PageControls
          page={currentPage}
          count={done ? 0 : stepPages.pages.length}
          onPage={setPage}
        />
      </div>
      <footer className="cook-nav">
        <button
          className="secondary"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          <ChevronLeft size={24} aria-hidden="true" />
          <span>Zurück</span>
        </button>
        <button
          className="primary"
          disabled={
            !done &&
            (stepPages.pages.length === 0 ||
              currentPage < stepPages.pages.length - 1)
          }
          onClick={() => setStep(done ? 0 : step + 1)}
        >
          <span>
            {done
              ? "Noch einmal kochen"
              : step === recipe.steps.length - 1
                ? "Fertig"
                : "Nächster Schritt"}
          </span>
          <ChevronRight size={24} aria-hidden="true" />
        </button>
      </footer>
      <span className="sr-only" role="status">
        {deadline && remaining === 0 ? "Timer abgelaufen" : ""}
      </span>
      {panel && (
        <dialog
          ref={panelRef}
          className={`cook-panel cook-panel-${panel}`}
          aria-labelledby={panelHeading}
          onClose={() => setPanel(null)}
        >
          <header className="cook-panel-heading">
            <h3 id={panelHeading}>
              {panel === "ingredients"
                ? `Zutaten · ${servings} Portionen`
                : "Timer"}
            </h3>
            <button
              className="icon-button"
              aria-label="Zurück zum Schritt"
              autoFocus
              onClick={() => panelRef.current?.close()}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          {panel === "ingredients" ? (
            <>
              <div className="cook-panel-body" ref={ingredientPages.viewport}>
                <p
                  className="cook-panel-text"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {ingredientPages.pages[currentIngredientPage] || ""}
                </p>
                <p
                  className="cook-measure"
                  ref={ingredientPages.measure}
                  aria-hidden="true"
                />
              </div>
              <PageControls
                page={currentIngredientPage}
                count={ingredientPages.pages.length}
                onPage={setIngredientPage}
                ingredients
              />
            </>
          ) : (
            <div className="timer">
              {deadline ? (
                <>
                  <span
                    className="cook-timer-display"
                    role={remaining === 0 ? "status" : undefined}
                  >
                    {timerLabel}
                  </span>
                  <button
                    className="secondary"
                    onClick={() => setDeadline(null)}
                  >
                    Beenden
                  </button>
                </>
              ) : (
                <>
                  <label htmlFor={timerInput}>Timer Minuten</label>
                  <input
                    id={timerInput}
                    type="number"
                    min="1"
                    max="1440"
                    value={minutes}
                    onChange={(event) => setMinutes(event.target.valueAsNumber)}
                  />
                  <button
                    className="primary"
                    disabled={
                      !Number.isFinite(minutes) ||
                      minutes <= 0 ||
                      minutes > 1440
                    }
                    onClick={() => {
                      setNow(Date.now());
                      setDeadline(Date.now() + minutes * 60000);
                    }}
                  >
                    Timer starten
                  </button>
                </>
              )}
            </div>
          )}
        </dialog>
      )}
    </div>
  );
}
