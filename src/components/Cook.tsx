import { useState, useEffect } from "react";
import { CookingPot, Clock3, ChevronLeft, ChevronRight } from "lucide-react";
import { formatAmount, type Recipe, type Entry } from "../../shared/domain.ts";
import type { RecipeRow, EntryRow } from "../types.ts";

export function Cook({ row }: { row: RecipeRow | EntryRow }) {
  const entry = row.kind === "entry" ? (row.data as Entry) : null;
  const recipe = entry?.recipe || (row.data as Recipe);
  const servings = entry?.servings || recipe.servings;
  const key = `foodie-cook:${row.id}`;
  const [step, setStep] = useState(() => {
    try {
      return Math.min(
        Math.max(
          0,
          Number(JSON.parse(localStorage.getItem(key) || "{}").step) || 0,
        ),
        recipe.steps.length,
      );
    } catch {
      return 0;
    }
  });
  const [minutes, setMinutes] = useState(5);
  const [deadline, setDeadline] = useState<number | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}").deadline || null;
    } catch {
      return null;
    }
  });
  const [now, setNow] = useState(Date.now());
  const [wake, setWake] = useState(false);
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
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible")
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
  const done = step >= recipe.steps.length;
  return (
    <div className="cook">
      <span className="recipe-context">Kochmodus · {servings} Portionen</span>
      <h2>{recipe.title}</h2>
      <div className="cook-progress">
        <span>
          {done
            ? "Geschafft"
            : `Schritt ${step + 1} von ${recipe.steps.length}`}
        </span>
        <span>
          {wake
            ? "Display bleibt wach"
            : "Display-Ruhemodus gegebenenfalls manuell ausschalten"}
        </span>
      </div>
      <progress
        max={recipe.steps.length}
        value={Math.min(step + 1, recipe.steps.length)}
        aria-label="Kochfortschritt"
      />
      <div className="cook-step" aria-live="polite">
        {done ? (
          <>
            <CookingPot size={42} />
            <h3>Guten Appetit!</h3>
            <p>Das Essen ist fertig. Zeit, es euch schmecken zu lassen.</p>
          </>
        ) : (
          <p>{recipe.steps[step]}</p>
        )}
      </div>
      <details>
        <summary>Zutaten für {servings} Portionen</summary>
        <ul className="ingredient-list">
          {recipe.ingredients.map((i, n) => (
            <li key={n}>
              <span>{i.name}</span>
              <strong>
                {formatAmount(
                  i.amount === null
                    ? null
                    : (i.amount * servings) / recipe.servings,
                  i.unit,
                )}
              </strong>
            </li>
          ))}
        </ul>
      </details>
      <div className="timer">
        <Clock3 size={20} />
        {deadline ? (
          <>
            <span role={remaining === 0 ? "status" : undefined}>
              {remaining === 0
                ? "Timer abgelaufen"
                : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
            </span>
            <button className="text-button" onClick={() => setDeadline(null)}>
              Beenden
            </button>
          </>
        ) : (
          <>
            <label>
              <span className="sr-only">Timer Minuten</span>
              <input
                type="number"
                min="1"
                max="1440"
                value={minutes}
                onChange={(e) => setMinutes(e.target.valueAsNumber)}
              />
            </label>
            <span>Minuten</span>
            <button
              className="secondary"
              disabled={
                !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440
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
      <div className="cook-nav">
        <button
          className="secondary"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          <ChevronLeft size={22} />
          Zurück
        </button>
        <button
          className="primary"
          onClick={() => setStep(done ? 0 : step + 1)}
        >
          {done
            ? "Noch einmal kochen"
            : step === recipe.steps.length - 1
              ? "Fertig"
              : "Nächster Schritt"}
          <ChevronRight size={22} />
        </button>
      </div>
      <p className="muted">
        Dein Fortschritt wird auf diesem Gerät gespeichert. Timer melden sich
        sichtbar in der geöffneten App.
      </p>
    </div>
  );
}
