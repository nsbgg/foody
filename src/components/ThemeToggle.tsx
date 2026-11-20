import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme.ts";

export function ThemeToggle() {
  const [theme, toggleTheme] = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle icon-button"
      aria-label="Dunkelmodus"
      aria-pressed={dark}
      title={dark ? "Hellen Modus aktivieren" : "Dunkelmodus aktivieren"}
      onClick={toggleTheme}
    >
      {dark ? (
        <Sun size={19} aria-hidden="true" />
      ) : (
        <Moon size={19} aria-hidden="true" />
      )}
    </button>
  );
}
