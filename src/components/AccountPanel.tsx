import { useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Fingerprint,
  Home,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  WifiOff,
} from "lucide-react";
import {
  accountRequest,
  createHousehold,
  joinHousehold,
  logoutAccount,
  registerPasskey,
  selectHousehold,
  useAccount,
} from "../account.ts";
import { passkeysAvailable } from "./AuthGate.tsx";
import { useStore } from "../store.ts";

type Member = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "member";
};
type Passkey = { id: string; name: string; createdAt: number };
export function AccountPanel({
  onboarding = false,
  syncStatus = "",
}: {
  onboarding?: boolean;
  syncStatus?: string;
}) {
  const account = useAccount();
  const store = useStore();
  const active = account.households.find(
    (household) => household.id === account.activeHouseholdId,
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invitation, setInvitation] = useState<{
    token: string;
    email: string;
    expiresAt: number;
  } | null>(null);
  const [remove, setRemove] = useState<{
    type: "member" | "passkey";
    id: string;
    name: string;
  } | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  async function reloadMembers() {
    if (!account.activeHouseholdId) {
      setMembers([]);
      return;
    }
    const response = await accountRequest<{ members: Member[] }>(
      `/api/households/${account.activeHouseholdId}/members`,
    );
    setMembers(response.members);
  }
  async function reloadPasskeys() {
    const response = await accountRequest<{ passkeys: Passkey[] }>(
      "/api/auth/passkeys",
    );
    setPasskeys(response.passkeys);
  }
  useEffect(() => {
    let current = true;
    setMembers([]);
    setInvitation(null);
    setRemove(null);
    if (!account.activeHouseholdId) return;
    void accountRequest<{ members: Member[] }>(
      `/api/households/${account.activeHouseholdId}/members`,
    )
      .then((response) => {
        if (current) setMembers(response.members);
      })
      .catch((cause) => {
        if (current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Mitglieder konnten nicht geladen werden.",
          );
      });
    return () => {
      current = false;
    };
  }, [account.activeHouseholdId]);
  useEffect(() => {
    void reloadPasskeys().catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Passkeys konnten nicht geladen werden.",
      ),
    );
  }, []);
  async function perform(action: () => Promise<unknown>, success = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Das hat nicht geklappt. Bitte erneut versuchen.",
      );
    } finally {
      setBusy(false);
    }
  }
  function householdSubmit(event: FormEvent<HTMLFormElement>, join: boolean) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(
      new FormData(form).get(join ? "token" : "householdName"),
    ).trim();
    void perform(async () => {
      if (join) await joinHousehold(value);
      else await createHousehold(value);
      form.reset();
    });
  }
  return (
    <div
      className={`account-panel${onboarding ? " account-onboarding" : ""}`}
      aria-busy={busy}
    >
      <div className="account-identity">
        <span className="avatar" aria-hidden="true">
          {account.user?.name.slice(0, 1).toLocaleUpperCase("de")}
        </span>
        <div>
          <h2>{account.user?.name}</h2>
          <p>{account.user?.email}</p>
        </div>
      </div>
      {onboarding && (
        <div className="account-onboarding-title">
          <h1>
            {account.households.length
              ? "Wähle deinen Haushalt"
              : "Wer sitzt mit am Tisch?"}
          </h1>
          <p>
            {account.households.length
              ? "Wähle den Haushalt, für den du planen möchtest. Du kannst auch einen weiteren Haushalt erstellen oder einer Einladung folgen."
              : "Erstelle euren Haushalt oder tritt mit einem Einladungscode bei. Rezepte und Einkaufslisten bleiben innerhalb eures Haushalts."}
          </p>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="account-notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      <section className="account-section">
        <h3>
          <Home size={17} />
          {onboarding ? "Dein Haushalt" : "Haushalte"}
        </h3>
        {account.households.length > 0 && (
          <label>
            Aktiver Haushalt
            <select
              disabled={busy}
              value={account.activeHouseholdId || ""}
              onChange={(event) =>
                void perform(() => selectHousehold(event.target.value))
              }
            >
              {!account.activeHouseholdId && (
                <option value="" disabled>
                  Haushalt wählen
                </option>
              )}
              {account.households.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.name}
                  {household.role === "owner" ? " · Verwaltung" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <details open={onboarding && account.households.length === 0}>
          <summary>Haushalt erstellen</summary>
          <form onSubmit={(event) => householdSubmit(event, false)}>
            <fieldset disabled={busy}>
              <label>
                Name des Haushalts
                <input
                  name="householdName"
                  placeholder="Zum Beispiel: Unsere Küche"
                  required
                  maxLength={80}
                />
              </label>
              <button className={onboarding ? "primary" : "secondary"}>
                <Plus size={16} />
                Haushalt erstellen
              </button>
            </fieldset>
          </form>
        </details>
        <details>
          <summary>Mit Einladung beitreten</summary>
          <form onSubmit={(event) => householdSubmit(event, true)}>
            <fieldset disabled={busy}>
              <label>
                Einladungscode
                <input
                  name="token"
                  autoComplete="off"
                  required
                  maxLength={256}
                />
              </label>
              <button className="secondary">
                <Users size={16} />
                Haushalt beitreten
              </button>
            </fieldset>
          </form>
        </details>
      </section>
      {active && (
        <section className="account-section">
          <h3>
            <Users size={17} />
            {active.name}
          </h3>
          <ul className="account-rows" aria-label="Haushaltsmitglieder">
            {members.map((member) => (
              <li key={member.id}>
                <div>
                  <strong>
                    {member.name}
                    {member.id === account.user?.id ? " (du)" : ""}
                  </strong>
                  <span>{member.email}</span>
                  <span>
                    {member.role === "owner" ? "Verwaltung" : "Mitglied"}
                  </span>
                </div>
                {active.role === "owner" && member.id !== account.user?.id && (
                  <button
                    className="icon-button"
                    type="button"
                    title={`${member.name} aus Haushalt entfernen`}
                    aria-label={`${member.name} aus Haushalt entfernen`}
                    disabled={busy}
                    onClick={() =>
                      setRemove({
                        type: "member",
                        id: member.id,
                        name: member.name,
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {active.role === "owner" && (
            <details>
              <summary>Person einladen</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const email = String(
                    new FormData(event.currentTarget).get("inviteEmail"),
                  );
                  void perform(async () => {
                    const result = await accountRequest<{
                      token: string;
                      invitation: { expiresAt: number };
                    }>(`/api/households/${active.id}/invitations`, { email });
                    setInvitation({
                      token: result.token,
                      email,
                      expiresAt: result.invitation.expiresAt,
                    });
                  });
                }}
              >
                <fieldset disabled={busy}>
                  <label>
                    E-Mail-Adresse der Person
                    <input
                      type="email"
                      name="inviteEmail"
                      required
                      maxLength={254}
                    />
                  </label>
                  <button className="secondary">Einladung erstellen</button>
                </fieldset>
              </form>
              {invitation && (
                <div className="account-invitation">
                  <p>
                    Teile diesen Code persönlich mit{" "}
                    <strong>{invitation.email}</strong>. Er wird nur einmal
                    angezeigt und kann nur mit dieser E-Mail-Adresse eingelöst
                    werden.
                  </p>
                  <label>
                    Einladungscode
                    <input
                      readOnly
                      value={invitation.token}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </label>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        () => navigator.clipboard.writeText(invitation.token),
                        "Einladungscode kopiert",
                      )
                    }
                  >
                    <Copy size={16} />
                    Code kopieren
                  </button>
                  <p className="account-hint">
                    Gültig bis{" "}
                    {new Date(invitation.expiresAt).toLocaleString("de-DE")}.
                  </p>
                </div>
              )}
            </details>
          )}
        </section>
      )}
      <section className="account-section">
        <h3>
          <Fingerprint size={18} />
          Passkeys
        </h3>
        <p className="account-hint">
          Mit Fingerabdruck, Gesichtserkennung oder Sicherheitsschlüssel
          anmelden.
        </p>
        <ul className="account-rows" aria-label="Deine Passkeys">
          {passkeys.map((passkey) => (
            <li key={passkey.id}>
              <div>
                <strong>{passkey.name}</strong>
                <span>
                  Hinzugefügt am{" "}
                  {new Date(passkey.createdAt).toLocaleDateString("de-DE")}
                </span>
              </div>
              <button
                className="icon-button"
                type="button"
                title={`${passkey.name} entfernen`}
                aria-label={`${passkey.name} entfernen`}
                disabled={busy}
                onClick={() =>
                  setRemove({
                    type: "passkey",
                    id: passkey.id,
                    name: passkey.name,
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        {passkeys.length === 0 && (
          <p className="account-hint">Noch kein Passkey hinterlegt.</p>
        )}
        {passkeysAvailable() ? (
          <details>
            <summary>Passkey hinzufügen</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const name = String(new FormData(form).get("passkeyName"));
                void perform(async () => {
                  await registerPasskey(name);
                  await reloadPasskeys();
                  form.reset();
                }, "Passkey hinzugefügt");
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  Name des Passkeys
                  <input
                    name="passkeyName"
                    required
                    placeholder="Zum Beispiel: Mein Handy"
                    maxLength={80}
                  />
                </label>
                <button className="secondary">
                  <Fingerprint size={17} />
                  Passkey hinzufügen
                </button>
              </fieldset>
            </form>
          </details>
        ) : (
          <p className="account-hint">
            Passkeys benötigen einen unterstützten Browser und HTTPS oder
            localhost.
          </p>
        )}
      </section>
      {remove && (
        <div
          className="account-confirm"
          role="group"
          aria-label="Entfernen bestätigen"
        >
          <p>
            <strong>{remove.name}</strong>{" "}
            {remove.type === "member"
              ? "aus diesem Haushalt entfernen?"
              : "als Passkey entfernen?"}
          </p>
          <div className="account-inline-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await accountRequest(
                    remove.type === "member"
                      ? `/api/households/${active?.id}/members/${remove.id}`
                      : `/api/auth/passkeys/${remove.id}`,
                    undefined,
                    "DELETE",
                  );
                  setRemove(null);
                  if (remove.type === "member") await reloadMembers();
                  else await reloadPasskeys();
                }, "Entfernt")
              }
            >
              Entfernen
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setRemove(null)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {syncStatus && (
        <section className="account-section">
          <span
            className="sync-status"
            role="status"
            title="Automatischer Datenabgleich"
          >
            {syncStatus === "Alles synchronisiert" ? (
              <Check size={15} />
            ) : syncStatus.startsWith("Offline") ? (
              <WifiOff size={15} />
            ) : (
              <RefreshCw size={15} />
            )}
            {syncStatus}
          </span>
          <p className="account-hint">
            Änderungen werden automatisch im Hintergrund abgeglichen.
          </p>
        </section>
      )}
      {confirmLogout ? (
        <div
          className="account-confirm"
          role="group"
          aria-label="Abmelden bestätigen"
        >
          <p>
            Es gibt noch nicht synchronisierte Änderungen. Beim Abmelden werden
            sie von diesem Gerät entfernt.
          </p>
          <div className="account-inline-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void perform(logoutAccount)}
            >
              Trotzdem abmelden
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setConfirmLogout(false)}
            >
              Angemeldet bleiben
            </button>
          </div>
        </div>
      ) : (
        <button
          className="text-button account-logout"
          disabled={busy}
          onClick={() => {
            if (store.pending.length) setConfirmLogout(true);
            else void perform(logoutAccount);
          }}
        >
          {busy ? (
            <LoaderCircle className="account-spinner" size={17} />
          ) : (
            <LogOut size={17} />
          )}
          Abmelden
        </button>
      )}
    </div>
  );
}
