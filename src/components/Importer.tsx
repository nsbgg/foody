import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Recipe } from "../../shared/domain.ts";
import { useAccount } from "../account.ts";

const invalidResponseMessage =
  "Der Importdienst hat keine gültige Antwort gesendet. Bitte versuche es erneut.";

export function Importer({ onImported }: { onImported: (r: Recipe) => void }) {
  const account = useAccount();
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const r = await fetch("/api/import", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": account.csrfToken,
              "X-Household-Id": account.activeHouseholdId || "",
            },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(60000),
          });
          const data = await r.json().catch(() => {
            throw new Error(invalidResponseMessage);
          });
          if (!r.ok)
            throw new Error(
              typeof data?.error === "string" && data.error.trim()
                ? data.error
                : "Import fehlgeschlagen. Bitte versuche es erneut.",
            );
          if (!data?.recipe || typeof data.recipe !== "object")
            throw new Error(invalidResponseMessage);
          onImported(data.recipe);
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Import fehlgeschlagen. Bitte Verbindung prüfen.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Rezept aus dem Internet</h2>
      <p>
        Füge einen Chefkoch-Link oder den Link zu einer anderen Rezeptseite ein.
        Prüfe und ergänze die Angaben vor dem Speichern.
      </p>
      <label>
        Rezeptadresse
        <input
          autoFocus
          type="url"
          required
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "Rezept wird gelesen …" : "Rezept übernehmen"}
        <ArrowUpRight size={17} />
      </button>
      <p className="muted">
        Der Import braucht eine Internetverbindung. Manche Websites stellen
        keine auslesbaren Rezeptdaten bereit.
      </p>
    </form>
  );
}
