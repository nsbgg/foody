import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const storageKey = "foody-theme";
const system = window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

let preference = savedTheme();
let theme: Theme = preference ?? (system.matches ? "dark" : "light");
const listeners = new Set<() => void>();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let activeTransition: ViewTransition | undefined;
let transitionVersion = 0;
let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

function updateTheme(next: Theme) {
  theme = next;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#101a15" : "#00b74c");
  listeners.forEach((listener) => listener());
}

function applyTheme(next: Theme, animate = true) {
  const root = document.documentElement;
  const version = ++transitionVersion;
  activeTransition?.skipTransition();
  clearTimeout(fallbackTimer);
  const update = () => {
    if (version === transitionVersion) updateTheme(next);
  };
  if (!animate || reducedMotion.matches || document.hidden) {
    root.classList.remove("theme-crossfade", "theme-color-transition");
    update();
    return;
  }
  if (typeof document.startViewTransition === "function") {
    root.classList.remove("theme-color-transition");
    root.classList.add("theme-crossfade");
    const transition = document.startViewTransition(update);
    activeTransition = transition;
    // A rapid second switch may skip the first snapshot. Its update must not
    // overwrite the latest choice, and skipping must not reject into the UI.
    void transition.ready.catch(() => {});
    void transition.finished
      .catch(() => {})
      .finally(() => {
        if (version !== transitionVersion) return;
        activeTransition = undefined;
        root.classList.remove("theme-crossfade");
      });
  } else {
    root.classList.add("theme-color-transition");
    // Register the transition before changing the palette on the same frame.
    void getComputedStyle(root).backgroundColor;
    update();
    const duration = parseFloat(
      getComputedStyle(root).getPropertyValue("--theme-duration"),
    );
    fallbackTimer = setTimeout(() => {
      root.classList.remove("theme-color-transition");
    }, duration + 80);
  }
}

applyTheme(theme, false);
system.addEventListener("change", () => {
  if (!preference) applyTheme(system.matches ? "dark" : "light");
});
window.addEventListener("storage", (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  preference = savedTheme();
  applyTheme(preference ?? (system.matches ? "dark" : "light"));
});

function toggleTheme() {
  preference = (preference ?? theme) === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(storageKey, preference);
  } catch {
    // Keep the choice for this session when browser storage is unavailable.
  }
  applyTheme(preference);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme() {
  return [useSyncExternalStore(subscribe, () => theme), toggleTheme] as const;
}
