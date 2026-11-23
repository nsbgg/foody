import { useState, type FormEvent } from "react";
import { ArrowRight, Fingerprint, LoaderCircle } from "lucide-react";
import {
  useAccount,
  registerAccount,
  loginAccount,
  loginWithPasskey,
  refreshAccount,
} from "../account.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";

export function passkeysAvailable() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof PublicKeyCredential !== "undefined"
  );
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <header className="app-header auth-header">
        <a href="/" aria-label="Foody Startseite">
          <img
            className="brand-logo"
            src="/foody_green.svg"
            alt="Foody"
            width="84"
            height="42"
          />
        </a>
        <ThemeToggle />
      </header>
      <main className="auth-main" id="main">
        {children}
      </main>
    </div>
  );
}

export function AuthGate() {
  const account = useAccount();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function perform(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const credentials = {
      email: String(data.get("email")),
      password: String(data.get("password")),
    };
    void perform(() =>
      mode === "register"
        ? registerAccount({ ...credentials, name: String(data.get("name")) })
        : loginAccount(credentials),
    );
  }
  if (!account.loaded)
    return (
      <AccountShell>
        <div className="auth-loading" role="status">
          <LoaderCircle className="account-spinner" size={22} />
          <p>Dein Account wird geladen …</p>
        </div>
      </AccountShell>
    );
  return (
    <AccountShell>
      <div className="auth-layout">
        <section className="auth-intro">
          <h1>
            Eine Küche.
            <br />
            Euer Wochenplan.
          </h1>
          <p>
            Rezepte sammeln, gemeinsam planen und mit einer Einkaufsliste
            losgehen. Dein Account verbindet euren Haushalt.
          </p>
          <div className="auth-kitchen-note">
            <span>Für alle am Tisch.</span>
            <p>
              Jede Person hat ihren eigenen Zugang. Gerichte, Wochenplan und
              Einkaufsliste teilt ihr im Haushalt.
            </p>
          </div>
        </section>
        <section className="auth-form-panel" aria-labelledby="auth-title">
          <div className="auth-mode" role="group" aria-label="Zugang wählen">
            <button
              type="button"
              aria-pressed={mode === "login"}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Anmelden
            </button>
            <button
              type="button"
              aria-pressed={mode === "register"}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Account erstellen
            </button>
          </div>
          <h2 id="auth-title">
            {mode === "login" ? "Dein Platz am Tisch" : "Dein eigener Zugang"}
          </h2>
          <form onSubmit={submit} key={mode}>
            <fieldset disabled={busy}>
              {mode === "register" && (
                <label>
                  Dein Name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={80}
                  />
                </label>
              )}
              <label>
                E-Mail-Adresse
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                />
              </label>
              <label>
                Passwort
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                  minLength={mode === "register" ? 12 : undefined}
                  maxLength={256}
                  aria-describedby={
                    mode === "register" ? "password-hint" : undefined
                  }
                />
              </label>
              {mode === "register" && (
                <p className="account-hint" id="password-hint">
                  Mindestens 12 Zeichen. Ein Passkey lässt sich danach im
                  Account hinzufügen.
                </p>
              )}
              {(error || account.error) && (
                <p className="error" role="alert">
                  {error || account.error}
                </p>
              )}
              <button className="primary auth-submit" type="submit">
                {busy ? (
                  <LoaderCircle size={17} className="account-spinner" />
                ) : (
                  <ArrowRight size={17} />
                )}
                {mode === "register" ? "Account erstellen" : "Anmelden"}
              </button>
            </fieldset>
          </form>
          {mode === "login" && (
            <>
              <div className="auth-alternative">
                <span>oder ohne Passwort</span>
              </div>
              <button
                className="secondary auth-passkey"
                disabled={busy || !passkeysAvailable()}
                onClick={() => void perform(loginWithPasskey)}
              >
                <Fingerprint size={20} />
                Mit Passkey anmelden
              </button>
              {!passkeysAvailable() && (
                <p className="account-hint">
                  Passkeys benötigen einen unterstützten Browser und HTTPS oder
                  localhost.
                </p>
              )}
            </>
          )}
          {account.error && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void perform(refreshAccount)}
            >
              Verbindung erneut prüfen
            </button>
          )}
        </section>
      </div>
    </AccountShell>
  );
}
