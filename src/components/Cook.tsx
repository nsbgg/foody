import { useState, useEffect, useLayoutEffect, useRef, useId } from "react";
import {
  RotateCcw,
  Clock3,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  MonitorCheck,
  Monitor,
  X,
  Pause,
} from "lucide-react";
import { formatAmount, type Recipe, type Entry } from "../../shared/domain.ts";
import { useMemo } from "react";
import { cookingStepSegments } from "../../shared/cook-instructions.ts";
import { CookText, measureCookText } from "./cook-text.tsx";
import { CookComplete } from "./CookComplete.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { extractStepDurations } from "../../shared/cook-durations.ts";
import type { RecipeRow, EntryRow } from "../types.ts";
import { CookTimer, timerReadout, type TimerMode } from "./CookTimer.tsx";

function savedCook(key: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// Measure using the visible paragraph's typography. Retain every character and
// split long unbroken text on grapheme boundaries instead of shrinking its type.
function useMeasuredPages(
  text: string,
  active = true,
  parts?: ReturnType<typeof cookingStepSegments>,
  renderMeasure?: (
    probe: HTMLParagraphElement,
    text: string,
    start: number,
  ) => void,
) {
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
    const offsets = [0];
    for (const character of characters)
      offsets.push(offsets[offsets.length - 1] + character.length);
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
          if (parts)
            measureCookText(
              probe,
              parts,
              offsets[start],
              offsets[start + count],
            );
          else if (renderMeasure)
            renderMeasure(
              probe,
              characters.slice(start, start + count).join(""),
              offsets[start],
            );
          else
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
        if (parts) {
          // Sentence boundaries can change as text is shortened. Verify the
          // actual final fragment rather than trusting an earlier trial.
          measureCookText(probe, parts, offsets[start], offsets[start + fits]);
          while (fits > 1 && probe.getBoundingClientRect().height > limit) {
            fits--;
            measureCookText(
              probe,
              parts,
              offsets[start],
              offsets[start + fits],
            );
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
  }, [text, active, parts, renderMeasure]);
  return { viewport, measure, pages };
}

function ingredientFragments(lines: string[], text: string, start: number) {
  const end = start + text.length;
  let offset = 0;
  return lines.flatMap((line, index) => {
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + line.length);
    const fragment = line.slice(from - offset, to - offset);
    offset += line.length + 2;
    return to > from ? [{ index, text: fragment }] : [];
  });
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

export function Cook({
  row,
  onDone,
}: {
  row: RecipeRow | EntryRow;
  onDone: () => void;
}) {
  const entry = row.kind === "entry" ? (row.data as Entry) : null;
  const recipe = entry?.recipe || (row.data as Recipe);
  const servings = entry?.servings || recipe.servings;
  const key = `foodie-cook:${row.id}`;
  const ingredientKeys = useMemo(
    () =>
      recipe.ingredients.map(
        (ingredient, index) => `${index}:${JSON.stringify(ingredient)}`,
      ),
    [recipe.ingredients],
  );
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>(() => {
    const saved = savedCook(key).checkedIngredients;
    return Array.isArray(saved)
      ? saved.filter(
          (item): item is string =>
            typeof item === "string" && ingredientKeys.includes(item),
        )
      : [];
  });
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
  const [minutes, setMinutes] = useState(() => {
    const saved = savedCook(key).durationSeconds;
    return typeof saved === "number" &&
      Number.isInteger(saved) &&
      saved >= 1 &&
      saved <= 86400
      ? saved / 60
      : 5;
  });
  const [durationSeconds, setDurationSeconds] = useState(() => minutes * 60);
  const [pausedSeconds, setPausedSeconds] = useState<number | null>(() => {
    const saved = savedCook(key).pausedSeconds;
    return typeof saved === "number" &&
      Number.isInteger(saved) &&
      saved > 0 &&
      saved <= 86400
      ? saved
      : null;
  });
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
  const [page, setPage] = useState(0);
  const [ingredientPage, setIngredientPage] = useState(0);
  const done = step >= recipe.steps.length;
  const stepDurations = extractStepDurations(done ? "" : recipe.steps[step]);
  const stepParts = useMemo(
    () =>
      cookingStepSegments(
        done ? "" : recipe.steps[step],
        recipe.ingredients,
        servings / recipe.servings,
      ),
    [done, step, recipe.steps, recipe.ingredients, recipe.servings, servings],
  );
  const stepText = stepParts.map((part) => part.text).join("");
  const stepPages = useMeasuredPages(stepText, true, stepParts);
  const ingredientLines = useMemo(
    () =>
      recipe.ingredients.map((ingredient) =>
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
      ),
    [recipe.ingredients, servings, recipe.servings],
  );
  const ingredientText = ingredientLines.join("\n\n");
  const measureIngredients = useMemo(
    () => (probe: HTMLParagraphElement, text: string, start: number) => {
      const rows = ingredientFragments(ingredientLines, text, start).map(
        (fragment) => {
          const label = document.createElement("label");
          label.className = "cook-ingredient-row";
          const checkbox = document.createElement("span");
          checkbox.className = "cook-ingredient-box";
          const name = document.createElement("span");
          name.textContent = fragment.text;
          label.append(checkbox, name);
          return label;
        },
      );
      probe.replaceChildren(...rows);
    },
    [ingredientLines],
  );
  const ingredientPages = useMeasuredPages(
    ingredientText,
    panel === "ingredients",
    undefined,
    measureIngredients,
  );
  const currentPage = Math.min(page, Math.max(0, stepPages.pages.length - 1));
  const currentTextStart = stepPages.pages
    .slice(0, currentPage)
    .reduce((sum, text) => sum + text.length, 0);
  const currentIngredientPage = Math.min(
    ingredientPage,
    Math.max(0, ingredientPages.pages.length - 1),
  );
  const ingredientPageStart = ingredientPages.pages
    .slice(0, currentIngredientPage)
    .reduce((sum, text) => sum + text.length, 0);
  const visibleIngredients = ingredientFragments(
    ingredientLines,
    ingredientPages.pages[currentIngredientPage] || "",
    ingredientPageStart,
  );
  const readyIngredients = ingredientKeys.filter((key) =>
    checkedIngredients.includes(key),
  ).length;

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
      localStorage.setItem(
        key,
        JSON.stringify({
          step,
          deadline,
          pausedSeconds,
          durationSeconds,
          checkedIngredients,
        }),
      );
    } catch {}
  }, [step, deadline, pausedSeconds, durationSeconds, checkedIngredients, key]);
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
    : (pausedSeconds ?? 0);
  const timerMode: TimerMode =
    deadline !== null
      ? remaining === 0
        ? "finished"
        : "running"
      : pausedSeconds !== null
        ? "paused"
        : "ready";
  const timerActive = timerMode !== "ready";
  const startTimer = () => {
    const seconds = Math.round(minutes * 60);
    if (!Number.isFinite(minutes) || seconds < 1 || seconds > 86400) return;
    const timestamp = Date.now();
    setNow(timestamp);
    setDurationSeconds(seconds);
    setPausedSeconds(null);
    setDeadline(timestamp + seconds * 1000);
  };
  const resetTimer = () => {
    setDeadline(null);
    setPausedSeconds(null);
    if (stepDurations.length) {
      setMinutes(stepDurations[0].seconds / 60);
      setDurationSeconds(stepDurations[0].seconds);
    } else panelRef.current?.close();
  };
  return (
    <div className="cook">
      <header className="cook-header">
        <h2 title={recipe.title}>{recipe.title}</h2>
        <div className="cook-tools">
          <ThemeToggle />
          <button className="secondary" onClick={() => setPanel("ingredients")}>
            <ListChecks size={18} aria-hidden="true" />
            Zutaten
          </button>
          {(stepDurations.length > 0 || timerActive) && (
            <button
              className={`secondary cook-timer-chip${timerActive ? " active" : ""}`}
              aria-label={
                timerActive
                  ? `Timer ${timerMode === "finished" ? "abgelaufen" : timerReadout(remaining) + " verbleibend"}${timerMode === "paused" ? ", pausiert" : ""}`
                  : "Timer"
              }
              onClick={() => {
                if (!timerActive && stepDurations.length) {
                  setMinutes(stepDurations[0].seconds / 60);
                  setDurationSeconds(stepDurations[0].seconds);
                }
                setPanel("timer");
              }}
            >
              <Clock3 size={18} aria-hidden="true" />
              Timer{" "}
              {timerActive && (
                <span
                  className="cook-timer-count timer-chip-value"
                  aria-hidden="true"
                >
                  {remaining === 0 ? "Fertig" : timerReadout(remaining)}
                </span>
              )}
              {timerMode === "paused" && <Pause size={14} aria-hidden="true" />}
            </button>
          )}
        </div>
      </header>
      <div className="cook-progress">
        <span>
          {done
            ? "Geschafft"
            : `Schritt ${step + 1} von ${recipe.steps.length}`}
        </span>
        <span
          className="cook-display-status"
          role="status"
          title={
            wake
              ? "Foody hält den Bildschirm während des Kochens wach."
              : "Foody kann das automatische Abschalten gerade nicht verhindern."
          }
        >
          {wake ? (
            <MonitorCheck size={18} aria-hidden="true" />
          ) : (
            <Monitor size={18} aria-hidden="true" />
          )}
          {wake ? "Display bleibt an" : "Display kann ausgehen"}
        </span>
        <progress
          max={recipe.steps.length}
          value={Math.min(step + 1, recipe.steps.length)}
          aria-label="Kochfortschritt"
        />
      </div>
      <div className={`cook-stage${done ? " is-complete" : ""}`}>
        {done ? (
          <CookComplete />
        ) : (
          <div className="cook-step" ref={stepPages.viewport}>
            <p className="cook-step-text" aria-live="polite" aria-atomic="true">
              <CookText
                parts={stepParts}
                start={currentTextStart}
                end={
                  currentTextStart + (stepPages.pages[currentPage]?.length || 0)
                }
              />
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
      <footer className={`cook-nav${done ? " is-complete" : ""}`}>
        <button
          className="secondary"
          disabled={step === 0}
          onClick={() => {
            if (done) setCheckedIngredients([]);
            setStep(done ? 0 : step - 1);
          }}
        >
          {done ? (
            <RotateCcw size={22} aria-hidden="true" />
          ) : (
            <ChevronLeft size={24} aria-hidden="true" />
          )}
          <span>{done ? "Noch einmal" : "Zurück"}</span>
        </button>
        <button
          className="primary"
          disabled={
            !done &&
            (stepPages.pages.length === 0 ||
              currentPage < stepPages.pages.length - 1)
          }
          onClick={() => (done ? onDone() : setStep(step + 1))}
        >
          <span>
            {done
              ? "Zum Wochenplan"
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
            {panel === "ingredients" ? (
              <div className="ingredient-panel-title">
                <span className="ingredient-panel-icon" aria-hidden="true">
                  <ListChecks size={23} />
                </span>
                <div>
                  <h3 id={panelHeading}>Zutaten</h3>
                  <p>{servings} Portionen</p>
                </div>
              </div>
            ) : (
              <h3 id={panelHeading}>Timer</h3>
            )}
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
              <div className="ingredient-panel-progress">
                <div role="status">
                  <span>
                    {ingredientKeys.length > 0 &&
                    readyIngredients === ingredientKeys.length
                      ? "Alles bereit zum Kochen"
                      : "Zutaten bereitstellen"}
                  </span>
                  <strong>
                    {readyIngredients} / {ingredientKeys.length}
                  </strong>
                </div>
                <progress
                  aria-label="Bereitgestellte Zutaten"
                  value={readyIngredients}
                  max={Math.max(1, ingredientKeys.length)}
                />
              </div>
              <div className="cook-panel-body" ref={ingredientPages.viewport}>
                {ingredientLines.length ? (
                  <ul
                    className="cook-panel-text cook-ingredient-list"
                    aria-label="Zutaten zum Bereitstellen"
                  >
                    {visibleIngredients.map(({ index, text }) => {
                      const ingredientKey = ingredientKeys[index];
                      const checked =
                        checkedIngredients.includes(ingredientKey);
                      return (
                        <li key={ingredientKey}>
                          <label
                            className={`cook-ingredient-row${checked ? " is-checked" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              aria-label={ingredientLines[index]}
                              onChange={(event) => {
                                const next = event.target.checked;
                                setCheckedIngredients((previous) =>
                                  next
                                    ? [...previous, ingredientKey]
                                    : previous.filter(
                                        (key) => key !== ingredientKey,
                                      ),
                                );
                              }}
                            />
                            <span className="cook-ingredient-label">
                              {text}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>Keine Zutaten hinterlegt.</p>
                )}
                <p
                  className="cook-measure cook-ingredient-list"
                  ref={ingredientPages.measure}
                  aria-hidden="true"
                />
              </div>
              <footer className="ingredient-panel-footer">
                <PageControls
                  page={currentIngredientPage}
                  count={ingredientPages.pages.length}
                  onPage={setIngredientPage}
                  ingredients
                />
                <button
                  className="primary"
                  onClick={() => panelRef.current?.close()}
                >
                  Weiterkochen
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </footer>
            </>
          ) : (
            <CookTimer
              mode={timerMode}
              remaining={remaining}
              duration={durationSeconds}
              minutes={minutes}
              choices={stepDurations}
              onMinutes={setMinutes}
              onStart={startTimer}
              onPause={() => {
                const seconds = Math.max(
                  0,
                  Math.ceil(((deadline ?? Date.now()) - Date.now()) / 1000),
                );
                if (seconds > 0) {
                  setPausedSeconds(seconds);
                  setDeadline(null);
                }
                setNow(Date.now());
              }}
              onResume={() => {
                if (!pausedSeconds) return;
                const timestamp = Date.now();
                setNow(timestamp);
                setDeadline(timestamp + pausedSeconds * 1000);
                setPausedSeconds(null);
              }}
              onReset={resetTimer}
              onEnd={() => {
                resetTimer();
                panelRef.current?.close();
              }}
              onMinimize={() => panelRef.current?.close()}
            />
          )}
        </dialog>
      )}
    </div>
  );
}
