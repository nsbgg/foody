import { Minimize2, Pause, Play, RotateCcw } from "lucide-react";
import { useId } from "react";
import type { StepDuration } from "../../shared/cook-durations.ts";

export type TimerMode = "ready" | "running" | "paused" | "finished";
export function timerReadout(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function CookTimer({
  mode,
  remaining,
  duration,
  minutes,
  choices,
  onMinutes,
  onStart,
  onPause,
  onResume,
  onReset,
  onEnd,
  onMinimize,
}: {
  mode: TimerMode;
  remaining: number;
  duration: number;
  minutes: number;
  choices: StepDuration[];
  onMinutes: (minutes: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onEnd: () => void;
  onMinimize: () => void;
}) {
  const inputId = useId();
  const ready = mode === "ready";
  const inputSeconds = Math.round(minutes * 60);
  const valid =
    Number.isFinite(minutes) && inputSeconds >= 1 && inputSeconds <= 86400;
  const seconds = ready ? (valid ? inputSeconds : 0) : remaining;
  const readout = ready && !valid ? "--:--" : timerReadout(seconds);
  const total = Math.max(1, ready ? seconds : duration);
  const ratio = Math.min(1, Math.max(0, seconds / total));
  const state = {
    ready: "Bereit",
    running: "Läuft",
    paused: "Pausiert",
    finished: "Fertig",
  }[mode];
  return (
    <div className="timer-panel" data-state={mode}>
      <div className={`timer-face${readout.length > 5 ? " long" : ""}`}>
        <progress
          className="sr-only"
          aria-label="Timerfortschritt"
          max={total}
          value={Math.max(0, total - seconds)}
          aria-valuetext={`${readout} verbleibend, ${state}`}
        />
        <svg className="timer-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="timer-ring-track" cx="60" cy="60" r="52" />
          <circle
            className="timer-ring-progress"
            cx="60"
            cy="60"
            r="52"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 * (1 - ratio)}
          />
        </svg>
        <div className="timer-readout" aria-hidden="true">
          {readout}
        </div>
        <span className="timer-state">{state}</span>
      </div>
      {ready && (
        <>
          {choices.length > 1 && (
            <label
              className="timer-recipe-duration"
              htmlFor={`${inputId}-recipe`}
            >
              Zeit im Rezept
              <select
                id={`${inputId}-recipe`}
                value={
                  choices.some((choice) => choice.seconds === inputSeconds)
                    ? inputSeconds
                    : ""
                }
                onChange={(event) => onMinutes(Number(event.target.value) / 60)}
              >
                <option value="" disabled>
                  Eigene Zeit
                </option>
                {choices.map((choice) => (
                  <option key={choice.seconds} value={choice.seconds}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="timer-duration">
            <label htmlFor={inputId}>Timer Minuten</label>
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min={1 / 60}
              max="1440"
              step="any"
              value={Number.isFinite(minutes) ? minutes : ""}
              onChange={(event) => onMinutes(event.target.valueAsNumber)}
            />
          </div>
        </>
      )}
      <div className="timer-actions">
        {ready || mode === "finished" ? (
          <button className="primary" disabled={!valid} onClick={onStart}>
            <Play size={18} aria-hidden="true" />
            {ready ? "Timer starten" : "Erneut starten"}
          </button>
        ) : mode === "running" ? (
          <button className="primary" onClick={onPause}>
            <Pause size={18} aria-hidden="true" />
            Pausieren
          </button>
        ) : (
          <button className="primary" onClick={onResume}>
            <Play size={18} aria-hidden="true" />
            Fortsetzen
          </button>
        )}
        {!ready && (
          <button className="secondary" onClick={onReset}>
            <RotateCcw size={18} aria-hidden="true" />
            Zurücksetzen
          </button>
        )}
      </div>
      <p className="timer-hint">
        {ready
          ? "Geräte-Timer hier nicht verfügbar"
          : mode === "paused"
            ? "Timer in Foody pausiert"
            : mode === "finished"
              ? "Timer in Foody beendet"
              : "Timer läuft in Foody"}
      </p>
      <div className="timer-bottom">
        {!ready && (
          <button className="text-button" onClick={onEnd}>
            Beenden
          </button>
        )}
        <button className="secondary timer-minimize" onClick={onMinimize}>
          <Minimize2 size={18} aria-hidden="true" />
          Minimieren
        </button>
      </div>
    </div>
  );
}
