import { get, update } from "idb-keyval";
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
const KEY = "foodie-state-v1";
type State = {
  rows: Row[];
  pending: DurableState["pending"];
  conflicts: Conflict[];
  loaded: boolean;
  status: string;
  error: string;
};
let durable = normalize();
let state: State = {
  rows: [],
  pending: [],
  conflicts: [],
  loaded: false,
  status: "Lädt …",
  error: "",
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
let writes: Promise<unknown> = Promise.resolve();
let syncing = false;
let initialized = false;
let channel: BroadcastChannel | undefined;
let savingEdits: Operation[] = [];
function publish(next: DurableState) {
  if (next.generation < durable.generation) return;
  durable = next;
  const pending = [
    ...next.pending,
    ...savingEdits.filter(
      (op) => !next.pending.some((p) => p.opId === op.opId),
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
function storageError() {
  state = {
    ...state,
    error:
      "Der lokale Speicher ist nicht verfügbar. Die Änderung wurde nicht gespeichert. Bitte erneut versuchen.",
  };
  emit();
}
function persist(
  transform: (current: DurableState) => DurableState,
): Promise<boolean> {
  const attempt = writes
    .catch(() => undefined)
    .then(async () => {
      let committed: DurableState | undefined;
      // update() performs read + reduction + write in ONE IndexedDB transaction.
      // Each tab edits the current durable outbox rather than replacing its stale snapshot.
      await update(KEY, (saved) => {
        const current = normalize(saved);
        committed = {
          ...transform(current),
          generation: current.generation + 1,
        };
        return committed;
      });
      publish(committed!);
      state = { ...state, error: "" };
      channel?.postMessage({ generation: committed!.generation });
      emit();
      return true;
    })
    .catch(() => {
      storageError();
      return false;
    });
  // A failed attempt is contained; future writes can always retry.
  writes = attempt;
  return attempt;
}
async function refresh() {
  await writes;
  const saved = await get(KEY);
  publish(normalize(saved));
}
export async function initStore() {
  if (initialized) return;
  initialized = true;
  try {
    await refresh();
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("foodie-state");
      channel.onmessage = () => {
        void refresh().catch(storageError);
      };
    }
  } catch {
    storageError();
  }
  state = { ...state, loaded: true };
  emit();
  void sync();
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
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
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
  const op = makeChange(state.rows, kind, id, data, observedRev);
  savingEdits.push(op);
  state = { ...state, status: "Wird gespeichert …" };
  publish(durable);
  const saved = await persist((current) => queueChange(current, op));
  savingEdits = savingEdits.filter((edit) => edit.opId !== op.opId);
  publish(durable);
  if (saved) void sync();
  return saved;
}
export async function resolveConflict(id: string, choice: "local" | "remote") {
  const saved = await persist((current) => chooseConflict(current, id, choice));
  if (saved) void sync();
}
export async function sync() {
  if (syncing || !state.loaded) return;
  syncing = true;
  let success = false;
  try {
    await refresh();
    const sent = nextOperations(durable);
    const response = await fetch(sent.length ? "/api/sync" : "/api/state", {
      method: sent.length ? "POST" : "GET",
      headers: sent.length ? { "Content-Type": "application/json" } : {},
      body: sent.length ? JSON.stringify({ operations: sent }) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Server nicht erreichbar");
    const result = (await response.json()) as SyncResponse;
    success = await persist((current) => mergeResponse(current, result));
    if (success) {
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
    state = {
      ...state,
      status: state.pending.length
        ? "Offline · Änderungen auf diesem Gerät"
        : "Offline verfügbar",
    };
    emit();
  } finally {
    syncing = false;
  }
  if (success && nextOperations(durable).length) void sync();
}
