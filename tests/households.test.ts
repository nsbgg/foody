import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { HouseholdError, HouseholdService } from "../server/households.ts";
import { Store } from "../server/store.ts";
import type { Operation } from "../shared/domain.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT); CREATE TABLE sessions(userId TEXT,activeHouseholdId TEXT)",
  );
  for (const id of ["alice", "bob", "eve"])
    db.prepare("INSERT INTO users VALUES (?,?,?)").run(
      id,
      id,
      `${id}@example.com`,
    );
  return { db, households: new HouseholdService(db) };
}
test("households isolate membership and reject cross-household reads", () => {
  const { db, households: h } = fixture();
  try {
    const a = h.create("alice", "Alice's home"),
      b = h.create("bob", "Bob's home");
    assert.equal(h.list("alice").length, 1);
    assert.equal(h.list("alice")[0].id, a.id);
    assert.throws(
      () => h.members("alice", b.id),
      (e) => e instanceof HouseholdError && e.status === 404,
    );
    assert.throws(
      () => h.invite("eve", a.id, "bob@example.com"),
      (e) => e instanceof HouseholdError && e.status === 404,
    );
  } finally {
    db.close();
  }
});
test("invitations are email-bound, hashed at rest, expiring and single use", () => {
  const { db, households: h } = fixture();
  try {
    const a = h.create("alice", "Home");
    const invitation = h.invite("alice", a.id, "bob@example.com");
    assert.ok(
      !JSON.stringify(
        db.prepare("SELECT * FROM household_invitations").all(),
      ).includes(invitation.token),
    );
    assert.throws(() => h.join("eve", invitation.token), HouseholdError);
    assert.equal(h.join("bob", invitation.token).role, "member");
    assert.throws(() => h.join("bob", invitation.token), HouseholdError);
    assert.throws(
      () => h.invite("bob", a.id, "eve@example.com"),
      (e) => e instanceof HouseholdError && e.status === 403,
    );
    const expired = h.invite("alice", a.id, "eve@example.com");
    db.prepare("UPDATE household_invitations SET expiresAt=0 WHERE id=?").run(
      expired.invitation.id,
    );
    assert.throws(() => h.join("eve", expired.token), HouseholdError);
  } finally {
    db.close();
  }
});
test("removal revokes access immediately and last owner remains", () => {
  const { db, households: h } = fixture();
  try {
    const a = h.create("alice", "Home");
    h.join("bob", h.invite("alice", a.id, "bob@example.com").token);
    db.prepare("INSERT INTO sessions VALUES (?,?)").run("bob", a.id);
    assert.throws(() => h.removeMember("bob", a.id, "alice"), HouseholdError);
    assert.throws(
      () => h.removeMember("alice", a.id, "alice"),
      (e) => e instanceof HouseholdError && e.code === "last_owner",
    );
    h.removeMember("alice", a.id, "bob");
    assert.throws(() => h.requireMember("bob", a.id), HouseholdError);
    assert.equal(
      db
        .prepare("SELECT activeHouseholdId FROM sessions WHERE userId='bob'")
        .get()!.activeHouseholdId,
      null,
    );
  } finally {
    db.close();
  }
});
test("row IDs and operation replay IDs are scoped and legacy data stays isolated", () => {
  const store = new Store(":memory:", [
    { id: "legacy", kind: "check", rev: 1, data: { checked: true } },
  ]);
  try {
    const op: Operation = {
      opId: "same-op",
      id: "same-row",
      kind: "check",
      baseRev: 0,
      data: { checked: true },
    };
    assert.deepEqual(store.rows("a"), []);
    assert.ok(store.apply(op, "a").accepted);
    assert.ok(store.apply({ ...op, data: { checked: false } }, "b").accepted);
    assert.deepEqual(store.rows("a")[0].data, { checked: true });
    assert.deepEqual(store.rows("b")[0].data, { checked: false });
    assert.equal(store.rows()[0].id, "legacy");
    assert.deepEqual(store.apply(op, "a"), store.apply(op, "a"));
    assert.equal(
      store.apply({ ...op, opId: "conflict" }, "a").conflict?.rev,
      1,
    );
  } finally {
    store.db.close();
  }
});
