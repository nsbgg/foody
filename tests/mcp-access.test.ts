import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { HouseholdService } from "../server/households.ts";
import { McpAccessService } from "../server/mcp-access.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT); CREATE TABLE sessions(userId TEXT,activeHouseholdId TEXT)",
  );
  for (const id of ["alice", "bob"])
    db.prepare("INSERT INTO users VALUES (?,?,?)").run(
      id,
      id,
      `${id}@example.com`,
    );
  const households = new HouseholdService(db);
  const access = new McpAccessService(db, households);
  return { db, households, access };
}
test("unlimited MCP keys have no expiry and remain revocable", () => {
  const { db, households, access } = fixture();
  try {
    const household = households.create("alice", "Home");
    const key = access.create("alice", household.id, {
      name: "Unlimited",
      permissions: ["recipes:read", "recipes:delete"],
      days: null,
    });
    assert.equal(key.expiresAt, null);
    assert.equal(access.list("alice", household.id)[0].expiresAt, null);
    assert.equal(
      db
        .prepare("SELECT expiresAt FROM mcp_connections WHERE id=?")
        .get(key.id)!.expiresAt,
      0,
    );
    assert.ok(access.authenticate(`Bearer ${key.token}`));
    access.revoke("alice", household.id, key.id);
    assert.equal(access.authenticate(`Bearer ${key.token}`), null);
    assert.throws(() =>
      access.create("alice", household.id, {
        name: "Bad",
        permissions: ["recipes:read"],
        days: 0,
      }),
    );
  } finally {
    db.close();
  }
});
test("MCP credentials are scoped, hashed, expiring and individually revocable", () => {
  const { db, households, access } = fixture();
  try {
    const alice = households.create("alice", "Alice");
    const bob = households.create("bob", "Bob");
    const created = access.create("alice", alice.id, {
      name: "KI",
      permissions: ["recipes:read"],
      days: 7,
    });
    assert.ok(
      !JSON.stringify(
        db.prepare("SELECT * FROM mcp_connections").all(),
      ).includes(created.token),
    );
    assert.ok(
      !JSON.stringify(access.list("alice", alice.id)).includes(created.token),
    );
    assert.equal(
      access.authenticate(`Bearer ${created.token}`)?.householdId,
      alice.id,
    );
    assert.equal(
      access.authenticate(`Bearer ${created.token}`)?.permissions.length,
      1,
    );
    assert.throws(() =>
      access.create("alice", bob.id, {
        name: "No",
        permissions: ["recipes:read"],
      }),
    );
    assert.throws(() => access.list("bob", alice.id));
    access.revoke("bob", bob.id, created.id);
    assert.ok(access.authenticate(`Bearer ${created.token}`));
    db.prepare("UPDATE mcp_connections SET expiresAt=1 WHERE id=?").run(
      created.id,
    );
    assert.equal(access.authenticate(`Bearer ${created.token}`), null);
    db.prepare("UPDATE mcp_connections SET expiresAt=? WHERE id=?").run(
      Date.now() + 10000,
      created.id,
    );
    access.revoke("alice", alice.id, created.id);
    assert.equal(access.authenticate(`Bearer ${created.token}`), null);
    assert.equal(access.authenticate(created.token), null);
  } finally {
    db.close();
  }
});
test("removing a member invalidates their MCP credentials and connection inputs are bounded", () => {
  const { db, households, access } = fixture();
  try {
    const household = households.create("alice", "Home");
    households.join(
      "bob",
      households.invite("alice", household.id, "bob@example.com").token,
    );
    const created = access.create("bob", household.id, {
      name: "KI",
      permissions: ["shopping:read", "shopping:write"],
    });
    assert.ok(access.authenticate(`Bearer ${created.token}`));
    households.removeMember("alice", household.id, "bob");
    assert.equal(access.authenticate(`Bearer ${created.token}`), null);
    households.join(
      "bob",
      households.invite("alice", household.id, "bob@example.com").token,
    );
    assert.equal(access.authenticate(`Bearer ${created.token}`), null);
    assert.throws(() =>
      access.create("alice", household.id, {
        name: "KI",
        permissions: ["admin"],
        days: 7,
      }),
    );
    assert.throws(() =>
      access.create("alice", household.id, {
        name: "KI",
        permissions: [],
        days: 7,
      }),
    );
    assert.throws(() =>
      access.create("alice", household.id, {
        name: "KI",
        permissions: ["recipes:read"],
        days: 91,
      }),
    );
  } finally {
    db.close();
  }
});
