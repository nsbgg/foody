import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Fingerprint, Plug, Trash2 } from "lucide-react";
import {
  accountRequest,
  AccountRequestError,
  confirmAccountWithPassword,
  confirmAccountWithPasskey,
} from "../account.ts";
import { passkeysAvailable } from "./AuthGate.tsx";

type Connection = {
  id: string;
  name: string;
  permissions: string[];
  expiresAt: number | null;
  revokedAt: number | null;
  lastUsedAt: number | null;
};
const areas = [
  { key: "recipes", label: "Rezepte" },
  { key: "plan", label: "Wochenplan" },
  { key: "shopping", label: "Einkaufsliste" },
];
export function McpConnections({ householdName }: { householdName: string }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [created, setCreated] = useState<{
    token: string;
    expiresAt: number | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revoke, setRevoke] = useState<Connection | null>(null);
  const [confirm, setConfirm] = useState(false);
  const confirmationPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirm) confirmationPanel.current?.querySelector("input")?.focus();
  }, [confirm]);
  const pendingCreate = useRef<{
    form: HTMLFormElement;
    body: { name: string; permissions: string[]; days: number | null };
  } | null>(null);
  const alive = useRef(true);
  const menuGeneration = useRef(0);
  const url = `${location.origin}/api/mcp`;
  const config = (token: string) =>
    JSON.stringify(
      {
        mcpServers: {
          foody: {
            type: "http",
            url,
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      },
      null,
      2,
    );
  async function reload() {
    const result = await accountRequest<{ connections: Connection[] }>(
      "/api/mcp-connections",
    );
    if (alive.current) setConnections(result.connections);
  }
  useEffect(() => {
    alive.current = true;
    void reload().catch(() => {
      if (alive.current) setError("Verbindungen konnten nicht geladen werden.");
    });
    const menu = document.getElementById("account-menu");
    const hideKey = (event: Event) => {
      if ((event as ToggleEvent).newState === "closed") {
        menuGeneration.current++;
        setCreated(null);
        setConfirm(false);
        pendingCreate.current = null;
      }
    };
    menu?.addEventListener("beforetoggle", hideKey);
    return () => {
      alive.current = false;
      menuGeneration.current++;
      menu?.removeEventListener("beforetoggle", hideKey);
    };
  }, []);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    const generation = menuGeneration.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      if (!alive.current || generation !== menuGeneration.current) return;
      if (
        alive.current &&
        cause instanceof AccountRequestError &&
        cause.code === "reauth_required"
      ) {
        setConfirm(true);
        return;
      }
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Die Verbindung konnte nicht geändert werden.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = {
      name: String(data.get("connectionName")),
      permissions: data.getAll("permissions").map(String),
      days: data.get("days") === "unlimited" ? null : Number(data.get("days")),
    };
    pendingCreate.current = { form, body };
    void perform(() => saveConnection(form, body));
  }
  async function saveConnection(
    form: HTMLFormElement,
    body: { name: string; permissions: string[]; days: number | null },
  ) {
    const generation = menuGeneration.current;
    const result = await accountRequest<{
      token: string;
      expiresAt: number | null;
    }>("/api/mcp-connections", body);
    if (!alive.current) return;
    if (
      generation !== menuGeneration.current ||
      !document.getElementById("account-menu")?.matches(":popover-open")
    ) {
      await reload();
      return;
    }
    setCreated(result);
    pendingCreate.current = null;
    setConfirm(false);
    form.reset();
    await reload();
  }
  function verify(password?: string) {
    const generation = menuGeneration.current;
    void perform(async () => {
      if (password !== undefined) await confirmAccountWithPassword(password);
      else await confirmAccountWithPasskey();
      if (!alive.current || generation !== menuGeneration.current) return;
      const pending = pendingCreate.current;
      if (pending) await saveConnection(pending.form, pending.body);
    });
  }
  return (
    <section className="account-section mcp-connections">
      <h3>
        <Plug size={17} />
        KI-Verbindungen
      </h3>
      <p className="account-hint">
        Gib deiner KI Zugriff auf „{householdName}“. Du bestimmst die Rechte und
        kannst den Zugriff jederzeit widerrufen.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="account-notice" role="status">
          {notice}
        </p>
      )}
      <ul className="account-rows" aria-label="Deine KI-Verbindungen">
        {connections
          .filter(
            (connection) =>
              !connection.revokedAt &&
              (connection.expiresAt === null ||
                connection.expiresAt > Date.now()),
          )
          .map((connection) => (
            <li key={connection.id}>
              <div>
                <strong>{connection.name}</strong>
                <span>
                  {connection.expiresAt === null
                    ? "Unbegrenzt gültig"
                    : `Bis ${new Date(connection.expiresAt).toLocaleDateString("de-DE")}`}
                </span>
                <span>
                  {connection.permissions
                    .map(
                      (permission) =>
                        `${areas.find((area) => permission.startsWith(area.key))?.label}: ${permission.endsWith(":delete") ? "Löschen" : permission.endsWith(":write") ? "Schreiben" : "Lesen"}`,
                    )
                    .join(" · ")}
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={`${connection.name} widerrufen`}
                title="Zugriff widerrufen"
                disabled={busy}
                onClick={() => setRevoke(connection)}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
      </ul>
      {revoke && (
        <div className="account-confirm">
          <p>Zugriff für „{revoke.name}“ sofort widerrufen?</p>
          <div className="account-inline-actions">
            <button
              type="button"
              className="secondary danger"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await accountRequest(
                    `/api/mcp-connections/${revoke.id}`,
                    undefined,
                    "DELETE",
                  );
                  if (!alive.current) return;
                  setCreated(null);
                  setRevoke(null);
                  await reload();
                  setNotice("Zugriff widerrufen.");
                })
              }
            >
              Widerrufen
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRevoke(null)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
      <details>
        <summary>KI verbinden</summary>
        <form onSubmit={create}>
          <fieldset disabled={busy}>
            <label>
              Name der Verbindung
              <input
                name="connectionName"
                placeholder="Zum Beispiel: Mein KI-Assistent"
                maxLength={80}
                required
              />
            </label>
            <fieldset className="mcp-permissions">
              <legend>Berechtigungen</legend>
              <p className="account-hint">
                Lesen ist vorausgewählt. Entfernen und Archivieren benötigen das
                separate Recht „Löschen“.
              </p>
              {areas.map((area) => (
                <div key={area.key} className="mcp-permission-row">
                  <strong>{area.label}</strong>
                  <label>
                    <input
                      type="checkbox"
                      name="permissions"
                      value={`${area.key}:read`}
                      defaultChecked
                    />
                    Lesen
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="permissions"
                      value={`${area.key}:write`}
                    />
                    Schreiben
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="permissions"
                      value={`${area.key}:delete`}
                    />
                    Löschen
                  </label>
                </div>
              ))}
            </fieldset>
            <label>
              Gültigkeit
              <select name="days" defaultValue="30">
                <option value="7">7 Tage</option>
                <option value="30">30 Tage</option>
                <option value="90">90 Tage</option>
                <option value="unlimited">Unbegrenzt</option>
              </select>
            </label>
            <button className="secondary">Verbindung erstellen</button>
          </fieldset>
        </form>
      </details>
      {confirm && (
        <div
          className="account-confirm"
          ref={confirmationPanel}
          aria-label="KI-Zugriff bestätigen"
          role="group"
        >
          <h3>KI-Zugriff bestätigen</h3>
          <p className="account-hint">
            Bestätige kurz deine Anmeldung. Danach wird die Verbindung mit
            deinen gewählten Rechten erstellt.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const password = String(
                new FormData(form).get("confirmPassword"),
              );
              form.reset();
              verify(password);
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Dein Passwort
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                />
              </label>
              <button className="secondary">Bestätigen und erstellen</button>
            </fieldset>
          </form>
          <div className="account-inline-actions">
            {passkeysAvailable() && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => verify()}
              >
                <Fingerprint size={17} />
                Mit Passkey bestätigen
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirm(false);
                pendingCreate.current = null;
                setError("");
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {created && (
        <div className="account-invitation">
          <h3>Schlüssel jetzt sichern</h3>
          <p className="account-hint">
            Er wird nur jetzt angezeigt und beim Schließen des Account-Menüs
            ausgeblendet. Wer ihn besitzt, erhält die gewählten Rechte.
          </p>
          <label>
            MCP-Adresse
            <input readOnly value={url} />
          </label>
          <label>
            MCP-Schlüssel
            <input
              readOnly
              value={created.token}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void perform(async () => {
                await navigator.clipboard.writeText(config(created.token));
                if (alive.current)
                  setNotice("Verbindungskonfiguration kopiert.");
              })
            }
          >
            <Copy size={15} />
            Konfiguration kopieren
          </button>
          <p className="account-hint">
            Streamable HTTP mit Authorization-Bearer-Header. Füge die
            Konfiguration bei einem MCP-Client mit HTTP- und
            Header-Unterstützung ein. Für entfernte Clients muss Foody unter
            einer erreichbaren HTTPS-Adresse laufen. OAuth wird nicht
            unterstützt.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => setCreated(null)}
          >
            Schlüssel ausblenden
          </button>
        </div>
      )}
    </section>
  );
}
