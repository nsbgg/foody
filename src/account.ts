import { useEffect, useSyncExternalStore } from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type { SessionView } from "../shared/accounts.ts";
import {
  clearPrivateStore,
  initStore,
  onStoreAccessDenied,
  setStoreScope,
} from "./store.ts";

type AccountState = SessionView & { loaded: boolean; error: string };
const anonymous = (): AccountState => ({
  user: null,
  households: [],
  activeHouseholdId: null,
  csrfToken: "",
  expiresAt: 0,
  loaded: false,
  error: "",
});
let state: AccountState = anonymous();
const listeners = new Set<() => void>();
let started = false;
let refreshing: Promise<void> | null = null;
let revision = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const cacheKey = "foody-account-metadata-v1";
function cache(session: SessionView | null) {
  try {
    if (session?.user)
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ session, savedAt: Date.now() }),
      );
    else localStorage.removeItem(cacheKey);
  } catch {
    /* Offline startup is optional when storage is unavailable. */
  }
}
function cachedSession(): SessionView | null {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey) || "null");
    const session = saved?.session as SessionView | undefined;
    if (
      session?.user?.id &&
      session.expiresAt > Date.now() &&
      saved.savedAt > Date.now() - 12 * 60 * 60 * 1000 &&
      Array.isArray(session.households) &&
      typeof session.csrfToken === "string"
    )
      return session;
  } catch {
    /* Invalid metadata never grants a local scope. */
  }
  return null;
}
async function applySession(
  session: SessionView,
  version: number,
  verifiedAt = Date.now(),
) {
  clearTimeout(expiryTimer);
  if (session.user)
    expiryTimer = setTimeout(
      () => {
        revision++;
        cache(null);
        state = {
          ...anonymous(),
          loaded: true,
          error: "Bitte erneut anmelden, um deinen Haushalt zu öffnen.",
        };
        emit();
        void setStoreScope(null);
      },
      Math.max(
        0,
        Math.min(session.expiresAt, verifiedAt + 12 * 60 * 60 * 1000) -
          Date.now(),
      ),
    );
  const activeHouseholdId = session.households.some(
    (household) => household.id === session.activeHouseholdId,
  )
    ? session.activeHouseholdId
    : null;
  const changed =
    session.user?.id !== state.user?.id ||
    activeHouseholdId !== state.activeHouseholdId;
  state = {
    ...session,
    activeHouseholdId,
    loaded: !changed && state.loaded,
    error: "",
  };
  emit();
  await setStoreScope(
    session.user && activeHouseholdId
      ? {
          userId: session.user.id,
          householdId: activeHouseholdId,
          csrfToken: session.csrfToken,
        }
      : null,
  );
  if (version === revision) {
    state = { ...state, loaded: true };
    emit();
  }
}
const channel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("foody-account");
function emit() {
  listeners.forEach((listener) => listener());
}
async function rawRequest<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(method !== "GET"
        ? {
            "Content-Type": "application/json",
            "X-CSRF-Token": state.csrfToken,
          }
        : {}),
      ...(state.activeHouseholdId
        ? { "X-Household-Id": state.activeHouseholdId }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "Die Anfrage konnte nicht abgeschlossen werden.",
    );
  return result as T;
}
export async function accountRequest<T = unknown>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  if (!state.loaded) await refreshAccount();
  return rawRequest<T>(path, body, method);
}
export function refreshAccount(): Promise<void> {
  if (refreshing) return refreshing;
  const version = revision;
  refreshing = (async () => {
    try {
      const session = await rawRequest<SessionView>("/api/session");
      if (version !== revision) return;
      cache(session);
      await applySession(session, version);
    } catch (cause) {
      if (version !== revision) return;
      // A failed connection may restore a bounded local identity, never a server credential.
      if (
        !state.user &&
        (cause instanceof TypeError ||
          (cause instanceof DOMException && cause.name === "TimeoutError"))
      ) {
        const saved = cachedSession();
        if (saved) {
          const verifiedAt = JSON.parse(
            localStorage.getItem(cacheKey) || "{}",
          ).savedAt;
          await applySession(saved, version, verifiedAt);
          return;
        }
      }
      state = {
        ...state,
        loaded: true,
        error:
          cause instanceof Error ? cause.message : "Verbindung fehlgeschlagen.",
      };
      emit();
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}
function initialize() {
  if (started) return;
  started = true;
  initStore();
  onStoreAccessDenied(() => {
    revision++;
    clearTimeout(expiryTimer);
    cache(null);
    state = { ...state, activeHouseholdId: null };
    emit();
    void setStoreScope(null);
    void (async () => {
      if (refreshing) await refreshing;
      await refreshAccount();
    })();
  });
  window.addEventListener("online", () => {
    void refreshAccount();
  });
  window.addEventListener("focus", () => {
    void refreshAccount();
  });
  channel?.addEventListener("message", (event) => {
    if (event.data?.type === "logout") {
      if (event.data.userId !== state.user?.id) return;
      revision++;
      clearTimeout(expiryTimer);
      const userId = state.user?.id;
      cache(null);
      state = { ...anonymous(), loaded: true };
      emit();
      void (userId ? clearPrivateStore(userId) : setStoreScope(null)).catch(
        () => {
          state = {
            ...state,
            error:
              "Du bist abgemeldet. Lokale Daten konnten nicht vollständig entfernt werden. Bitte die Website-Daten im Browser löschen.",
          };
          emit();
        },
      );
    } else {
      void refreshAccount();
    }
  });
  void refreshAccount();
}
export function useAccount() {
  useEffect(initialize, []);
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => state,
  );
}
async function mutation(path: string, body: unknown) {
  if (refreshing) await refreshing;
  await accountRequest(path, body);
  if (refreshing) await refreshing;
  await refreshAccount();
  channel?.postMessage("refresh");
}
export function registerAccount(body: {
  name: string;
  email: string;
  password: string;
}) {
  return mutation("/api/auth/register", body);
}
export function loginAccount(body: { email: string; password: string }) {
  return mutation("/api/auth/login", body);
}
export function createHousehold(name: string) {
  return mutation("/api/households", { name });
}
export function joinHousehold(token: string) {
  return mutation("/api/household-memberships", { token });
}
export function selectHousehold(id: string) {
  return mutation(`/api/households/${encodeURIComponent(id)}/selection`, {});
}
export async function logoutAccount() {
  if (refreshing) await refreshing;
  await accountRequest("/api/auth/logout", {});
  revision++;
  clearTimeout(expiryTimer);
  const userId = state.user?.id;
  cache(null);
  state = anonymous();
  emit();
  channel?.postMessage({ type: "logout", userId });
  let cleanupFailed = false;
  try {
    if (userId) await clearPrivateStore(userId);
    else await setStoreScope(null);
  } catch {
    cleanupFailed = true;
    await setStoreScope(null);
  }
  if (refreshing) await refreshing;
  await refreshAccount();
  if (cleanupFailed) {
    state = {
      ...state,
      error:
        "Du bist abgemeldet. Lokale Daten konnten nicht vollständig entfernt werden. Bitte die Website-Daten im Browser löschen.",
    };
    emit();
  }
}
export async function loginWithPasskey() {
  const optionsJSON = await accountRequest<
    Parameters<typeof startAuthentication>[0]["optionsJSON"]
  >("/api/auth/passkeys/authentication/options", {});
  const response = await startAuthentication({ optionsJSON });
  await mutation("/api/auth/passkeys/authentication/verify", { response });
}
export async function registerPasskey(name: string) {
  const optionsJSON = await accountRequest<
    Parameters<typeof startRegistration>[0]["optionsJSON"]
  >("/api/auth/passkeys/registration/options", {});
  const response = await startRegistration({ optionsJSON });
  await accountRequest("/api/auth/passkeys/registration/verify", {
    response,
    name,
  });
  await refreshAccount();
}
