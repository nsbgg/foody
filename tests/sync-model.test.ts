import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  visibleRows,
  queueChange,
  mergeResponse,
  nextOperations,
  chooseConflict,
  makeChange,
} from "../src/sync-model.ts";
import type { Operation, Row } from "../shared/domain.ts";
const op = (id: string, baseRev = 0, checked = true): Operation => ({
  opId: crypto.randomUUID(),
  id,
  kind: "check",
  baseRev,
  data: { checked },
});
const row = (id: string, rev: number, checked = false): Row => ({
  id,
  kind: "check",
  rev,
  data: { checked },
});
test("atomic queue reducers retain unrelated operations from two stale tabs", () => {
  const first = op("a"),
    second = op("b");
  const durable = queueChange(queueChange(normalize(), first), second);
  assert.deepEqual(
    durable.pending.map((p) => p.id),
    ["a", "b"],
  );
  assert.equal(visibleRows(durable).length, 2);
});
test("only oldest per-row operations are sent and descendants freeze on conflict", () => {
  const first = op("a", 1),
    child = op("a", 2),
    unrelated = op("b");
  let durable = queueChange(
    queueChange(queueChange(normalize({ rows: [row("a", 1)] }), first), child),
    unrelated,
  );
  assert.deepEqual(
    nextOperations(durable).map((p) => p.opId),
    [first.opId, unrelated.opId],
  );
  durable = mergeResponse(durable, {
    rows: [row("a", 2)],
    results: [{ opId: first.opId, conflict: row("a", 2) }],
  });
  assert.deepEqual(
    nextOperations(durable).map((p) => p.id),
    ["b"],
  );
  assert.equal(durable.conflicts[0].local.opId, child.opId);
  assert.equal(durable.pending.length, 3);
});
test("accepted requests do not rebase concurrent same-base edits", () => {
  const a = op("x", 1),
    b = op("x", 1, false);
  let durable = queueChange(
    queueChange(normalize({ rows: [row("x", 1)] }), a),
    b,
  );
  durable = mergeResponse(durable, {
    rows: [row("x", 2, true)],
    results: [{ opId: a.opId, accepted: row("x", 2, true) }],
  });
  assert.equal(durable.pending[0].baseRev, 1);
  durable = mergeResponse(durable, {
    rows: [row("x", 2, true)],
    results: [{ opId: b.opId, conflict: row("x", 2, true) }],
  });
  assert.equal(durable.conflicts.length, 1);
});
test("late repeated replies preserve newer acknowledged rows and queued edits", () => {
  const a = op("x"),
    b = op("x", 1, false);
  let durable = queueChange(queueChange(normalize(), a), b);
  durable = mergeResponse(durable, {
    rows: [row("x", 1, true)],
    results: [{ opId: a.opId, accepted: row("x", 1, true) }],
  });
  durable = mergeResponse(durable, {
    rows: [row("x", 2, false)],
    results: [{ opId: b.opId, accepted: row("x", 2, false) }],
  });
  durable = mergeResponse(durable, {
    rows: [row("x", 1, true)],
    results: [{ opId: a.opId, accepted: row("x", 1, true) }],
  });
  assert.equal(durable.rows[0].rev, 2);
  assert.equal(durable.pending.length, 0);
});
test("explicit editor revisions survive store refresh and choices get new immutable operations", () => {
  const edit = makeChange([row("x", 5)], "check", "x", { checked: true }, 1);
  assert.equal(edit.baseRev, 1);
  let durable = queueChange(normalize({ rows: [row("x", 5)] }), edit);
  durable = mergeResponse(durable, {
    rows: [row("x", 5)],
    results: [{ opId: edit.opId, conflict: row("x", 5) }],
  });
  const local = chooseConflict(durable, "x", "local");
  assert.equal(local.pending[0].baseRev, 5);
  assert.notEqual(local.pending[0].opId, edit.opId);
  assert.equal(edit.baseRev, 1);
  const remote = chooseConflict(durable, "x", "remote");
  assert.equal(remote.pending.length, 0);
  assert.deepEqual(visibleRows(remote)[0].data, { checked: false });
});
test("previous persisted state migrates without dropping pending operations", () => {
  const change = op("x", 2);
  const durable = normalize({ rows: [row("x", 2)], pending: [change] });
  assert.equal(durable.version, 2);
  assert.equal(visibleRows(durable)[0].rev, 3);
  assert.equal(nextOperations(durable)[0].opId, change.opId);
});
test("conflict choices require reviewing a newly arrived remote revision", () => {
  const edit = op("x", 1);
  let durable = queueChange(normalize({ rows: [row("x", 2)] }), edit);
  durable = mergeResponse(durable, {
    rows: [row("x", 2)],
    results: [{ opId: edit.opId, conflict: row("x", 2) }],
  });
  durable = mergeResponse(durable, { rows: [row("x", 3, true)] });
  for (const choice of ["local", "remote"] as const) {
    const review = chooseConflict(durable, "x", choice);
    assert.equal(review.pending[0].opId, edit.opId);
    assert.equal(review.conflicts[0].remote?.rev, 3);
    assert.equal(review.conflicts[0].changed, true);
    const resolved = chooseConflict(review, "x", choice);
    assert.equal(resolved.conflicts.length, 0);
    assert.equal(resolved.pending.length, choice === "local" ? 1 : 0);
    if (choice === "local") assert.equal(resolved.pending[0].baseRev, 3);
  }
});
