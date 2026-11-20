import { get, update, keys, del } from "idb-keyval";
import { useSyncExternalStore } from "react";
import type { Row, Kind, Operation } from "../shared/domain.ts";
import {
  normalize,
  visibleRows,
  makeChange,
  queueChange,
  nextOperations,
  mergeResponse,
  chooseConflict,
  type DurableState,
  type Conflict,
  type SyncResponse,
} from "./sync-model.ts";
export type StoreScope = {
  userId: string;
  householdId: string;
  csrfToken: string;
};
type State = {
  rows: Row[];
  pending: DurableState["pending"];
  conflicts: Conflict[];
  loaded: boolean;
  status: string;
  error: string;
};
const emptyState = (): State => ({
  rows: [],
  pending: [],
  conflicts: [],
  loaded: false,
  status: "Lädt …",
  error: "",
});
let scope: StoreScope | null = null;
let generation = 0;
let durable = normalize();
let state = emptyState();
let writes: Promise<unknown> = Promise.resolve();
let syncing: number | null = null;
let initialized = false;
let channel: BroadcastChannel | undefined;
let controller: AbortController | undefined;
let savingEdits: Operation[] = [];
let denied: (() => void) | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const scopeKey = (value: StoreScope) =>
  `foody-state-v3:${encodeURIComponent(value.userId)}:${encodeURIComponent(value.householdId)}`;
export const privateStoragePrefix = () =>
  scope
    ? `foody-private:${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.householdId)}:`
    : "foody-private:unavailable:";
export function onStoreAccessDenied(callback: () => void) {
  denied = callback;
}
function publish(next: DurableState, version: number) {
  if (version !== generation || next.generation < durable.generation) return;
  durable = next;
  const pending = [
    ...next.pending,
    ...savingEdits.filter(
      (op) => !next.pending.some((saved) => saved.opId === op.opId),
    ),
  ];
  state = {
    ...state,
    rows: visibleRows({ ...next, pending }),
    pending,
    conflicts: next.conflicts,
  };
  emit();
}
function storageError(version = generation) {
  if (version !== generation) return;
  state = {
    ...state,
    error:
      "Der lokale Speicher ist nicht verfügbar. Die Änderung wurde nicht gespeichert. Bitte erneut versuchen.",
  };
  emit();
}
function persist(
  transform: (current: DurableState) => DurableState,
  context = scope,
  version = generation,
): Promise<boolean> {
  if (!context) return Promise.resolve(false);
  const key = scopeKey(context);
  const attempt = writes
    .catch(() => undefined)
    .then(async () => {
      // Captured account/household cannot be changed by an in-flight selection.
      if (version !== generation) return false;
      let committed: DurableState | undefined;
      await update(key, (saved) => {
        const current = normalize(saved);
        committed = {
          ...transform(current),
          generation: current.generation + 1,
        };
        return committed;
      });
      if (version !== generation) return false;
      publish(committed!, version);
      state = { ...state, error: "" };
      channel?.postMessage({ generation: committed!.generation });
      emit();
      return true;
    })
    .catch(() => {
      storageError(version);
      return false;
    });
  writes = attempt;
  return attempt;
}
async function refresh(context = scope, version = generation) {
  if (!context) return;
  await writes;
  const saved = await get(scopeKey(context));
  publish(normalize(saved), version);
}
export async function setStoreScope(next: StoreScope | null) {
  if (
    scope &&
    next &&
    scope.userId === next.userId &&
    scope.householdId === next.householdId &&
    state.loaded
  ) {
    scope = next;
    return;
  }
  const version = ++generation;
  controller?.abort();
  channel?.close();
  channel = undefined;
  scope = next;
  durable = normalize();
  savingEdits = [];
  state = emptyState();
  emit();
  if (!next) return;
  try {
    await refresh(next, version);
    if (version !== generation) return;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(scopeKey(next));
      channel.onmessage = () => {
        void refresh(next, version).catch(() => storageError(version));
      };
    }
  } catch {
    storageError(version);
  }
  if (version !== generation) return;
  state = { ...state, loaded: true };
  emit();
  void sync();
}
export async function clearPrivateStore(userId: string) {
  await setStoreScope(null);
  await writes;
  const prefix = `foody-state-v3:${encodeURIComponent(userId)}:`;
  for (const key of await keys())
    if (typeof key === "string" && key.startsWith(prefix)) await del(key);
  const cookPrefix = `foody-private:${encodeURIComponent(userId)}:`;
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(cookPrefix)) localStorage.removeItem(key);
  } catch {
    /* Visible state is already cleared. */
  }
}
export function initStore() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("online", () => void sync());
  window.addEventListener("focus", () => void sync());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") void sync();
  }, 15000);
}
export function useStore() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
}
export async function change(
  kind: Kind,
  id: string,
  data: Row["data"],
  observedRev?: number,
): Promise<boolean> {
  if (!scope || !state.loaded) return false;
  const version = generation;
  const context = scope;
  const op = makeChange(state.rows, kind, id, data, observedRev);
  savingEdits.push(op);
  state = { ...state, status: "Wird gespeichert …" };
  publish(durable, version);
  const saved = await persist(
    (current) => queueChange(current, op),
    context,
    version,
  );
  if (version !== generation) return false;
  savingEdits = savingEdits.filter((edit) => edit.opId !== op.opId);
  publish(durable, version);
  if (saved) void sync();
  return saved;
}
export async function resolveConflict(id: string, choice: "local" | "remote") {
  const saved = await persist((current) => chooseConflict(current, id, choice));
  if (saved) void sync();
}
export async function sync() {
  const context = scope;
  const version = generation;
  if (!context || !state.loaded || syncing === version) return;
  syncing = version;
  const abort = new AbortController();
  controller = abort;
  let success = false;
  try {
    await refresh(context, version);
    if (version !== generation) return;
    const sent = nextOperations(durable);
    const response = await fetch(sent.length ? "/api/sync" : "/api/state", {
      method: sent.length ? "POST" : "GET",
      credentials: "same-origin",
      headers: {
        "X-Household-Id": context.householdId,
        ...(sent.length
          ? {
              "Content-Type": "application/json",
              "X-CSRF-Token": scope?.csrfToken || context.csrfToken,
            }
          : {}),
      },
      body: sent.length ? JSON.stringify({ operations: sent }) : undefined,
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
    });
    if (version !== generation) return;
    if ([401, 403, 404, 409].includes(response.status)) {
      state = {
        ...emptyState(),
        status: "Anmeldung oder Haushaltszugriff prüfen",
      };
      emit();
      denied?.();
      return;
    }
    if (!response.ok) throw new Error("Server nicht erreichbar");
    const result = (await response.json()) as SyncResponse;
    if (version !== generation) return;
    success = await persist(
      (current) => mergeResponse(current, result),
      context,
      version,
    );
    if (success && version === generation) {
      state = {
        ...state,
        status: state.conflicts.length
          ? "Konflikt prüfen"
          : state.pending.length
            ? "Änderungen ausstehend"
            : "Alles synchronisiert",
      };
      emit();
    }
  } catch {
    if (version === generation && !abort.signal.aborted) {
      state = {
        ...state,
        status: state.pending.length
          ? "Offline · Änderungen auf diesem Gerät"
          : "Offline verfügbar",
      };
      emit();
    }
  } finally {
    if (syncing === version) syncing = null;
  }
  if (success && version === generation && nextOperations(durable).length)
    void sync();
}
