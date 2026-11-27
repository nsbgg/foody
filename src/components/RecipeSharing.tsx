import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Link,
  Share2,
  Users,
  Home,
  Clock,
  Trash2,
  BookOpen,
  ArrowLeft,
} from "lucide-react";
import type { RecipeRow } from "../types.ts";
import type {
  RecipeShareContent,
  RecipeShareView,
} from "../../shared/recipe-sharing.ts";
import { accountRequest, useAccount } from "../account.ts";
import { sync, useStore } from "../store.ts";
import { AccountShell, AuthGate } from "./AuthGate.tsx";
import { FoodArt } from "./FoodArt.tsx";
import "../sharing.css";

const dateLabel = (value: number) =>
  new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
const errorText = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Die Freigabe konnte nicht geladen werden. Bitte erneut versuchen.";

/** Content for the application's existing modal. No share secret is persisted. */
export function ShareRecipes({
  rows,
  onClose,
}: {
  rows: RecipeRow[];
  onClose?: () => void;
}) {
  const account = useAccount();
  const store = useStore();
  const scope = `${account.user?.id}:${account.activeHouseholdId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const valid = (captured: string) =>
    alive.current && currentScope.current === captured;
  const householdId = account.activeHouseholdId;
  const households = account.households.filter((h) => h.id !== householdId);
  const [mode, setMode] = useState<"guest" | "user" | "household">("guest");
  const [email, setEmail] = useState("");
  const [targetId, setTargetId] = useState(households[0]?.id || "");
  const [days, setDays] = useState(7);
  const [shares, setShares] = useState<RecipeShareView[]>([]);
  const [created, setCreated] = useState<{
    url: string;
    expiresAt: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const base = `/api/households/${encodeURIComponent(householdId || "")}/recipe-shares`;
  useEffect(() => {
    let disposed = false;
    setCreated(null);
    setShares([]);
    setError("");
    setBusy(false);
    if (householdId)
      void accountRequest<{ shares: RecipeShareView[] }>(base)
        .then((result) => {
          if (!disposed)
            setShares((previous) => [
              ...previous,
              ...result.shares.filter(
                (share) => !previous.some((current) => current.id === share.id),
              ),
            ]);
        })
        .catch((cause) => {
          if (!disposed) setError(errorText(cause));
        });
    return () => {
      disposed = true;
    };
  }, [scope, householdId, base]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !householdId || !rows.length) return;
    const captured = scope;
    setBusy(true);
    setError("");
    setCreated(null);
    setCopied(false);
    try {
      // Flush local edits so the server snapshots the displayed recipes.
      await sync();
      if (!valid(captured)) return;
      const target =
        mode === "guest"
          ? { kind: "guest" }
          : mode === "user"
            ? { kind: "user", email }
            : { kind: "household", householdId: targetId };
      const result = await accountRequest<{
        share: RecipeShareView;
        token: string;
      }>(base, {
        recipeIds: rows.map((row) => row.id),
        target,
        expiresInDays: days,
      });
      if (!valid(captured)) return;
      setCreated({
        url: `${location.origin}/share#${encodeURIComponent(result.token)}`,
        expiresAt: result.share.expiresAt,
      });
      setShares((previous) => [result.share, ...previous]);
    } catch (cause) {
      if (valid(captured)) setError(errorText(cause));
    } finally {
      if (valid(captured)) setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (busy) return;
    const captured = scope;
    setBusy(true);
    setError("");
    try {
      await accountRequest(
        `${base}/${encodeURIComponent(id)}`,
        undefined,
        "DELETE",
      );
      if (!valid(captured)) return;
      setShares((previous) =>
        previous.map((share) =>
          share.id === id ? { ...share, revoked: true } : share,
        ),
      );
      setCreated(null);
      setConfirmId(null);
    } catch (cause) {
      if (valid(captured)) setError(errorText(cause));
    } finally {
      if (valid(captured)) setBusy(false);
    }
  }
  async function copyLink() {
    if (!created) return;
    const captured = scope;
    try {
      await navigator.clipboard.writeText(created.url);
      if (valid(captured)) setCopied(true);
    } catch {
      if (valid(captured))
        setError(
          "Kopieren ist hier nicht verfügbar. Markiere den Link und kopiere ihn manuell.",
        );
    }
  }
  return (
    <div className="recipe-sharing">
      <h2>{rows.length ? "Rezepte teilen" : "Geteilte Rezepte"}</h2>
      {rows.length > 0 && (
        <>
          <div className="share-recipe-summary">
            <Share2 size={22} />
            <div>
              <strong>
                {rows.length === 1
                  ? rows[0].data.title
                  : `${rows.length} Rezepte ausgewählt`}
              </strong>
              {rows.length > 1 && (
                <p>{rows.map((row) => row.data.title).join(", ")}</p>
              )}
            </div>
          </div>
          <p className="muted">
            Du teilst eine Kopie des aktuellen Rezeptstands. Spätere Änderungen
            bleiben in deinem Haushalt.
          </p>
          <form onSubmit={create}>
            <fieldset disabled={busy}>
              <legend>Wer darf die Rezepte öffnen?</legend>
              <div
                className="share-targets"
                role="group"
                aria-label="Empfänger wählen"
              >
                <button
                  type="button"
                  aria-pressed={mode === "guest"}
                  onClick={() => {
                    setMode("guest");
                    setCreated(null);
                  }}
                >
                  <Link size={19} />
                  <span>
                    Mit Link<small>Auch ohne Foody</small>
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "user"}
                  onClick={() => {
                    setMode("user");
                    setCreated(null);
                  }}
                >
                  <Users size={19} />
                  <span>
                    Person<small>Foody-Account</small>
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "household"}
                  disabled={!households.length}
                  title={
                    !households.length
                      ? "Du bist aktuell nur in einem Haushalt."
                      : undefined
                  }
                  onClick={() => {
                    setMode("household");
                    setCreated(null);
                  }}
                >
                  <Home size={19} />
                  <span>
                    Haushalt<small>Deine weiteren Haushalte</small>
                  </span>
                </button>
              </div>
              {mode === "user" && (
                <label>
                  E-Mail-Adresse der Person
                  <input
                    type="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setCreated(null);
                    }}
                  />
                  <span className="share-field-hint">
                    Nur dieser Foody-Account kann den Link öffnen. Du leitest
                    den Link selbst weiter.
                  </span>
                </label>
              )}
              {mode === "household" && (
                <label>
                  Empfangender Haushalt
                  <select
                    required
                    value={targetId}
                    onChange={(event) => {
                      setTargetId(event.target.value);
                      setCreated(null);
                    }}
                  >
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Gültigkeit
                <select
                  value={days}
                  onChange={(event) => {
                    setDays(Number(event.target.value));
                    setCreated(null);
                  }}
                >
                  <option value={1}>1 Tag</option>
                  <option value={7}>7 Tage</option>
                  <option value={30}>30 Tage</option>
                </select>
              </label>
              {mode === "guest" && (
                <p className="share-field-hint">
                  Jede Person mit diesem Link kann ausschließlich die
                  ausgewählten Rezepte ansehen, solange der Link gültig ist.
                </p>
              )}
              {store.pending.length > 0 && (
                <p className="share-field-hint">
                  Deine Änderungen werden noch synchronisiert. Danach kannst du
                  den aktuellen Rezeptstand teilen.
                </p>
              )}
              <button
                className="primary"
                disabled={
                  rows.length > 20 || !householdId || store.pending.length > 0
                }
              >
                <Link size={17} />
                {busy ? "Wird erstellt …" : "Freigabelink erstellen"}
              </button>
            </fieldset>
          </form>
        </>
      )}
      {created && (
        <div className="share-created" role="status">
          <strong>Dein Link ist bereit</strong>
          <p>
            Gültig bis {dateLabel(created.expiresAt)}. Bewahre ihn auf; er wird
            nur jetzt angezeigt.
          </p>
          <div className="share-copy">
            <input
              aria-label="Freigabelink"
              readOnly
              value={created.url}
              onFocus={(event) => event.target.select()}
            />
            <button
              className="secondary"
              type="button"
              onClick={() => void copyLink()}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="share-management" aria-label="Bestehende Freigaben">
        <h3>Freigaben dieses Haushalts</h3>
        <p className="muted">
          Widerrufen beendet den Zugriff über den Link. Bereits übernommene
          Rezeptkopien bleiben beim Empfänger.
        </p>
        {!shares.length && (
          <p className="muted">Noch keine Freigaben erstellt.</p>
        )}
        <ul>
          {shares.map((share) => {
            const inactive = share.revoked || share.expiresAt <= Date.now();
            return (
              <li key={share.id}>
                <div>
                  <strong>{share.recipeTitles.join(", ")}</strong>
                  <span>
                    {share.target.kind === "guest"
                      ? "Mit Link"
                      : share.target.kind === "user"
                        ? share.target.email
                        : "Haushalt"}{" "}
                    ·{" "}
                    {share.revoked
                      ? "Widerrufen"
                      : share.expiresAt <= Date.now()
                        ? "Abgelaufen"
                        : `Bis ${dateLabel(share.expiresAt)}`}
                  </span>
                  {confirmId === share.id && (
                    <div className="share-revoke-confirm">
                      <p>Zugriff über diesen Link beenden?</p>
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => void revoke(share.id)}
                      >
                        Jetzt widerrufen
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setConfirmId(null)}
                      >
                        Abbrechen
                      </button>
                    </div>
                  )}
                </div>
                {!inactive && confirmId !== share.id && (
                  <button
                    className="icon-button"
                    title="Freigabe widerrufen"
                    aria-label={`Freigabe für ${share.recipeTitles.join(", ")} widerrufen`}
                    disabled={busy}
                    onClick={() => setConfirmId(share.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {onClose && (
        <button
          className="secondary share-done"
          type="button"
          onClick={onClose}
        >
          Fertig
        </button>
      )}
    </div>
  );
}

export function SharedRecipesPage() {
  const account = useAccount();
  const [token] = useState(() => {
    try {
      return decodeURIComponent(location.hash.slice(1));
    } catch {
      return "";
    }
  });
  const [content, setContent] = useState<RecipeShareContent | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState(false);
  const [householdId, setHouseholdId] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptedHouseholdId, setAcceptedHouseholdId] = useState("");
  const [attempt, setAttempt] = useState(0);
  const identity = account.user?.id || "anonymous";
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const destinationHouseholds = account.households.filter(
    (household) =>
      !content?.targetHouseholdId || household.id === content.targetHouseholdId,
  );
  const destinationId =
    destinationHouseholds.find((household) => household.id === householdId)
      ?.id ||
    destinationHouseholds.find(
      (household) => household.id === account.activeHouseholdId,
    )?.id ||
    destinationHouseholds[0]?.id ||
    "";
  const accepted = !!destinationId && acceptedHouseholdId === destinationId;
  useEffect(() => {
    setHouseholdId("");
  }, [identity]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // The secret stays in memory; it never enters history, storage or referrers.
    history.replaceState(null, "", location.pathname);
    const element = document.createElement("meta");
    element.name = "robots";
    element.content = "noindex, nofollow, noarchive";
    document.head.append(element);
    return () => {
      element.remove();
    };
  }, []);
  useEffect(() => {
    if (!account.loaded) return;
    let disposed = false;
    let requestVersion = 0;
    setLoading(true);
    setContent(null);
    setError("");
    setAcceptedHouseholdId("");
    setBusy(false);
    async function resolve() {
      const version = ++requestVersion;
      if (!token) {
        setError(
          "Dieser Freigabelink ist unvollständig. Bitte öffne den ursprünglichen Link erneut.",
        );
        setLoading(false);
        return;
      }
      try {
        const response = await fetch("/api/recipe-shares/resolve", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": account.csrfToken,
          },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(15000),
          referrerPolicy: "no-referrer",
        });
        const result = await response.json();
        if (disposed || version !== requestVersion) return;
        if (!response.ok)
          throw new Error(
            result.error ||
              "Dieser Link ist abgelaufen, wurde widerrufen oder ist für einen anderen Account bestimmt.",
          );
        setContent(result as RecipeShareContent);
        setError("");
      } catch (cause) {
        if (!disposed && version === requestVersion) {
          setContent(null);
          setError(errorText(cause));
        }
      } finally {
        if (!disposed && version === requestVersion) setLoading(false);
      }
    }
    void resolve();
    const refresh = () => {
      if (document.visibilityState === "visible") void resolve();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [token, identity, account.loaded, account.csrfToken, attempt]);
  useEffect(() => {
    if (!content) return;
    const expire = () => {
      if (Date.now() >= content.expiresAt) {
        setContent(null);
        setError("Dieser Freigabelink ist abgelaufen.");
      }
    };
    const timeout = setTimeout(
      expire,
      Math.max(0, Math.min(content.expiresAt - Date.now(), 2147483647)),
    );
    const timer = setInterval(expire, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(timer);
    };
  }, [content]);
  async function accept() {
    if (!content || busy || !destinationId) return;
    const captured = identity;
    const capturedDestination = destinationId;
    setBusy(true);
    setError("");
    try {
      await accountRequest(
        `/api/recipe-shares/${encodeURIComponent(content.id)}/accept`,
        {
          token,
          householdId: capturedDestination,
        },
      );
      if (!mounted.current || captured !== identityRef.current) return;
      setAcceptedHouseholdId(capturedDestination);
      await sync();
    } catch (cause) {
      if (mounted.current && captured === identityRef.current) {
        setContent(null);
        setError(errorText(cause));
      }
    } finally {
      if (mounted.current && captured === identityRef.current) setBusy(false);
    }
  }
  if (login && !account.user)
    return (
      <>
        <AuthGate />
        <div className="share-login-return">
          <button className="secondary" onClick={() => setLogin(false)}>
            <ArrowLeft size={17} />
            Zurück zu den Rezepten
          </button>
        </div>
      </>
    );
  return (
    <AccountShell>
      <div className="shared-recipes-page">
        <div className="share-page-heading">
          <BookOpen size={28} />
          <div>
            <h1>Rezepte für dich</h1>
            <p>
              {content
                ? `${content.recipeCount} ${content.recipeCount === 1 ? "Rezept" : "Rezepte"} · Gültig bis ${dateLabel(content.expiresAt)}`
                : "Ein geteilter Einblick in eine andere Küche."}
            </p>
          </div>
        </div>
        {loading && <p role="status">Rezepte werden geladen …</p>}
        {error && (
          <div role="alert" className="error">
            <p>{error}</p>
            <button
              className="text-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Erneut versuchen
            </button>
            {!account.user && (
              <button className="text-button" onClick={() => setLogin(true)}>
                Bei Foody anmelden
              </button>
            )}
          </div>
        )}
        {content && (
          <>
            <div className="share-save-bar">
              {account.user && destinationHouseholds.length ? (
                <>
                  <label>
                    In deinen Haushalt übernehmen
                    <select
                      aria-label="Empfangender Haushalt"
                      value={destinationId}
                      disabled={busy || !!content.targetHouseholdId}
                      onChange={(event) => {
                        if (busy) return;
                        setHouseholdId(event.target.value);
                        setAcceptedHouseholdId("");
                      }}
                    >
                      {destinationHouseholds.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={busy || accepted || !destinationId}
                    onClick={() => void accept()}
                  >
                    {accepted ? <Check size={18} /> : <BookOpen size={18} />}
                    {accepted
                      ? "Rezepte übernommen"
                      : busy
                        ? "Wird übernommen …"
                        : "Rezepte übernehmen"}
                  </button>
                </>
              ) : account.user ? (
                <p>
                  Erstelle zuerst in <a href="/">Foody einen Haushalt</a>. Öffne
                  danach diesen Freigabelink erneut, um die Rezepte zu
                  übernehmen.
                </p>
              ) : (
                <>
                  <p>Die Rezepte kannst du hier ohne Account lesen.</p>
                  <button className="secondary" onClick={() => setLogin(true)}>
                    Mit Foody speichern
                  </button>
                </>
              )}
            </div>
            <div className="shared-recipe-list">
              {content.recipes.map((recipe, index) => (
                <article className="shared-recipe" key={index}>
                  <FoodArt recipe={recipe} />
                  <div className="shared-recipe-content">
                    <span className="recipe-context">{recipe.category}</span>
                    <h2>{recipe.title}</h2>
                    <div className="shared-recipe-meta">
                      <span>
                        <Clock size={16} />
                        {recipe.minutes} Minuten
                      </span>
                      <span>
                        <Users size={16} />
                        {recipe.servings} Portionen
                      </span>
                    </div>
                    {recipe.description && <p>{recipe.description}</p>}
                    <h3>Zutaten</h3>
                    <ul className="ingredient-list">
                      {recipe.ingredients.map((ingredient, item) => (
                        <li key={item}>
                          <span>{ingredient.name}</span>
                          <strong>
                            {ingredient.amount === null
                              ? ""
                              : new Intl.NumberFormat("de-DE").format(
                                  ingredient.amount,
                                )}{" "}
                            {ingredient.unit}
                          </strong>
                        </li>
                      ))}
                    </ul>
                    <h3>Zubereitung</h3>
                    <ol className="recipe-steps">
                      {recipe.steps.map((step, item) => (
                        <li key={item}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        <a className="share-home-link" href="/">
          Zu Foody
        </a>
      </div>
    </AccountShell>
  );
}
