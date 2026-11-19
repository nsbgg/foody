import type { Kind, Operation, Row } from "../shared/domain.ts";

export type Conflict = {
  local: Operation;
  remote: Row | null;
  changed?: boolean;
};
export type DurableState = {
  version: 2;
  generation: number;
  rows: Row[];
  pending: Operation[];
  conflicts: Conflict[];
};
export type SyncResponse = {
  rows: Row[];
  results?: { opId: string; accepted?: Row; conflict?: Row | null }[];
};
export function normalize(saved?: Partial<DurableState>): DurableState {
  return {
    version: 2,
    generation: saved?.generation ?? 0,
    rows: saved?.rows ?? [],
    pending: saved?.pending ?? [],
    conflicts: saved?.conflicts ?? [],
  };
}
export function visibleRows(saved: DurableState): Row[] {
  const rows = new Map(saved.rows.map((row) => [row.id, row]));
  for (const op of saved.pending)
    rows.set(op.id, {
      id: op.id,
      kind: op.kind,
      data: op.data,
      rev: op.baseRev + 1,
    });
  return [...rows.values()];
}
export function queueChange(saved: DurableState, op: Operation): DurableState {
  if (saved.pending.some((p) => p.opId === op.opId)) return saved;
  return {
    ...saved,
    pending: [...saved.pending, op],
    conflicts: saved.conflicts.map((c) =>
      c.local.id === op.id ? { ...c, local: op } : c,
    ),
  };
}
export function makeChange(
  rows: Row[],
  kind: Kind,
  id: string,
  data: Row["data"],
  observedRev?: number,
): Operation {
  return {
    opId: crypto.randomUUID(),
    id,
    kind,
    baseRev: observedRev ?? rows.find((r) => r.id === id)?.rev ?? 0,
    data: structuredClone(data),
  };
}
export function nextOperations(saved: DurableState): Operation[] {
  const seen = new Set(saved.conflicts.map((c) => c.local.id));
  const result: Operation[] = [];
  let bytes = 0;
  for (const op of saved.pending) {
    if (seen.has(op.id)) continue;
    seen.add(op.id);
    const size = new TextEncoder().encode(JSON.stringify(op)).length;
    if (result.length && bytes + size > 6_000_000) break;
    result.push(op);
    bytes += size;
    if (result.length === 100) break;
  }
  // A dependent edit must never overtake a conflicting ancestor of the same row.
  return result;
}
export function mergeResponse(
  saved: DurableState,
  response: SyncResponse,
): DurableState {
  const rows = new Map(saved.rows.map((r) => [r.id, r]));
  for (const row of response.rows)
    if ((rows.get(row.id)?.rev ?? -1) <= row.rev) rows.set(row.id, row);
  let pending = [...saved.pending];
  let conflicts = [...saved.conflicts];
  for (const result of response.results ?? []) {
    const op = pending.find((p) => p.opId === result.opId);
    // A reply from another tab may already have acknowledged or resolved this operation.
    if (!op) continue;
    if (result.accepted) {
      pending = pending.filter((p) => p.opId !== result.opId);
    } else if ("conflict" in result) {
      const latest = pending.filter((p) => p.id === op.id).at(-1)!;
      const remote = rows.get(op.id) ?? result.conflict ?? null;
      conflicts = [
        ...conflicts.filter((c) => c.local.id !== op.id),
        { local: latest, remote },
      ];
    }
  }
  return { ...saved, rows: [...rows.values()], pending, conflicts };
}
export function chooseConflict(
  saved: DurableState,
  id: string,
  choice: "local" | "remote",
): DurableState {
  const conflict = saved.conflicts.find((c) => c.local.id === id);
  if (!conflict) return saved;
  const remote = saved.rows.find((r) => r.id === id) ?? conflict.remote;
  if ((remote?.rev ?? 0) > (conflict.remote?.rev ?? 0)) {
    return {
      ...saved,
      conflicts: saved.conflicts.map((c) =>
        c.local.id === id ? { ...c, remote, changed: true } : c,
      ),
    };
  }
  const rows = saved.rows.filter((r) => r.id !== id);
  if (remote) rows.push(remote);
  const next = {
    ...saved,
    rows,
    pending: saved.pending.filter((p) => p.id !== id),
    conflicts: saved.conflicts.filter((c) => c.local.id !== id),
  };
  return choice === "local"
    ? queueChange(next, {
        ...conflict.local,
        opId: crypto.randomUUID(),
        baseRev: remote?.rev ?? 0,
      })
    : next;
}
