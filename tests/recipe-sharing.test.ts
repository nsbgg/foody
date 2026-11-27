import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { HouseholdService } from "../server/households.ts";
import { Store } from "../server/store.ts";
import {
  RecipeSharingError,
  RecipeSharingService,
} from "../server/recipe-sharing.ts";
import {
  createRecipeShareSchema,
  type RecipeShareTarget,
} from "../shared/recipe-sharing.ts";
import type { Recipe } from "../shared/domain.ts";

const recipe: Recipe = {
  title: "Pasta",
  description: "Frisch",
  servings: 2,
  minutes: 20,
  ingredients: [{ name: "Pasta", amount: 200, unit: "g" }],
  steps: ["Kochen"],
  image: "",
  source: "https://example.com/pasta",
  category: "Vegetarisch",
  archived: false,
};
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
  const households = new HouseholdService(db),
    store = new Store(":memory:");
  const source = households.create("alice", "Private source"),
    destination = households.create("bob", "Other home");
  const service = new RecipeSharingService(db, households, store);
  const ids = ["recipe-a", "recipe-b"];
  ids.forEach((id) =>
    store.apply(
      {
        opId: randomUUID(),
        id,
        kind: "recipe",
        baseRev: 0,
        data: { ...recipe, title: id },
      },
      source.id,
    ),
  );
  const create = (target: RecipeShareTarget = { kind: "guest" }) =>
    service.create("alice", source.id, {
      recipeIds: ids,
      target,
      expiresInDays: 7,
    });
  const close = () => {
    store.db.close();
    db.close();
  };
  return {
    db,
    households,
    store,
    source,
    destination,
    service,
    ids,
    create,
    close,
  };
}
function isUnavailable(error: unknown) {
  return error instanceof RecipeSharingError && error.status === 404;
}

test("recipe shares are immutable bulk snapshots and tokens are hashed at rest", () => {
  const f = fixture();
  try {
    const { share, token } = f.create();
    assert.equal(token.length, 43);
    assert.ok(
      !JSON.stringify(
        f.db.prepare("SELECT * FROM recipe_shares").all(),
      ).includes(token),
    );
    f.store.apply(
      {
        opId: randomUUID(),
        id: f.ids[0],
        kind: "recipe",
        baseRev: 1,
        data: { ...recipe, title: "Changed" },
      },
      f.source.id,
    );
    const content = f.service.resolve(token, null);
    assert.equal(content.recipes[0].title, f.ids[0]);
    assert.equal(content.recipeCount, 2);
    assert.deepEqual(
      Object.keys(content).sort(),
      ["id", "recipeCount", "createdAt", "expiresAt", "recipes"].sort(),
    );
    assert.ok(!JSON.stringify(content).includes("Private source"));
    assert.equal(share.recipeCount, 2);
  } finally {
    f.close();
  }
});

test("sharing validates bounded lifetimes, recipe count, duplicates and target schema", () => {
  for (const expiresInDays of [0, 31, null, Infinity])
    assert.equal(
      createRecipeShareSchema.safeParse({
        recipeIds: ["a"],
        target: { kind: "guest" },
        expiresInDays,
      }).success,
      false,
    );
  for (const recipeIds of [
    [],
    ["a", "a"],
    Array.from({ length: 21 }, (_, i) => String(i)),
  ])
    assert.equal(
      createRecipeShareSchema.safeParse({
        recipeIds,
        target: { kind: "guest" },
      }).success,
      false,
    );
  assert.equal(
    createRecipeShareSchema.safeParse({
      recipeIds: ["a"],
      target: { kind: "user", email: "invalid" },
    }).success,
    false,
  );
});

test("archived recipes can be explicitly shared as active independent copies", () => {
  const f = fixture();
  try {
    f.store.apply(
      {
        opId: randomUUID(),
        id: f.ids[0],
        kind: "recipe",
        baseRev: 1,
        data: { ...recipe, archived: true },
      },
      f.source.id,
    );
    const { token } = f.create();
    assert.equal(f.service.resolve(token, null).recipes[0].archived, false);
    assert.equal((f.store.rows(f.source.id)[0].data as Recipe).archived, true);
  } finally {
    f.close();
  }
});

test("source and household targets require membership and hide inaccessible recipes", () => {
  const f = fixture();
  try {
    assert.throws(() =>
      f.service.create("bob", f.source.id, {
        recipeIds: f.ids,
        target: { kind: "guest" },
        expiresInDays: 7,
      }),
    );
    assert.throws(() =>
      f.create({ kind: "household", householdId: f.destination.id }),
    );
    assert.throws(
      () =>
        f.service.create("alice", f.source.id, {
          recipeIds: ["missing"],
          target: { kind: "guest" },
          expiresInDays: 7,
        }),
      isUnavailable,
    );
    assert.throws(() => f.service.list("eve", f.source.id));
  } finally {
    f.close();
  }
});

test("expired, revoked, random and malformed share capabilities fail closed", () => {
  const f = fixture();
  try {
    const expired = f.create();
    f.db
      .prepare("UPDATE recipe_shares SET expiresAt=? WHERE id=?")
      .run(Date.now() - 1, expired.share.id);
    assert.throws(() => f.service.resolve(expired.token, null), isUnavailable);
    const revoked = f.create();
    f.service.revoke("alice", f.source.id, revoked.share.id);
    assert.throws(() => f.service.resolve(revoked.token, null), isUnavailable);
    assert.throws(() => f.service.resolve("x".repeat(43), null), isUnavailable);
    assert.throws(() => f.service.resolve("bad", null), isUnavailable);
    assert.throws(
      () => f.service.revoke("bob", f.destination.id, revoked.share.id),
      isUnavailable,
    );
  } finally {
    f.close();
  }
});

test("removing and rejoining a creator never reactivates an old link", () => {
  const f = fixture();
  try {
    const { token } = f.create();
    f.db
      .prepare("DELETE FROM household_members WHERE householdId=? AND userId=?")
      .run(f.source.id, "alice");
    assert.throws(() => f.service.resolve(token, null), isUnavailable);
    f.db
      .prepare("INSERT INTO household_members VALUES (?,?,?,?)")
      .run(f.source.id, "alice", "owner", Date.now());
    assert.throws(() => f.service.resolve(token, "alice"), isUnavailable);
  } finally {
    f.close();
  }
});

test("email-bound sharing requires both secret and signed-in matching recipient", () => {
  const f = fixture();
  try {
    const { token, share } = f.create({
      kind: "user",
      email: "bob@example.com",
    });
    assert.throws(
      () => f.service.resolve(token, null),
      (e) => e instanceof RecipeSharingError && e.status === 401,
    );
    assert.throws(() => f.service.resolve(token, "eve"), isUnavailable);
    assert.equal(f.service.resolve(token, "bob").targetHouseholdId, undefined);
    assert.equal(f.service.resolve(token, "bob").recipes.length, 2);
    assert.throws(
      () => f.service.accept("bob", share.id, "x".repeat(43), f.destination.id),
      isUnavailable,
    );
    assert.throws(() => f.service.accept("bob", share.id, token, f.source.id));
  } finally {
    f.close();
  }
});

test("acceptance copies all recipes with fresh IDs and is idempotent per household", () => {
  const f = fixture();
  try {
    const { token, share } = f.create();
    const first = f.service.accept("bob", share.id, token, f.destination.id);
    const again = f.service.accept("bob", share.id, token, f.destination.id);
    assert.equal(first.alreadyAccepted, false);
    assert.equal(again.alreadyAccepted, true);
    assert.deepEqual(first.recipeIds, again.recipeIds);
    assert.ok(first.recipeIds.every((id) => !f.ids.includes(id)));
    assert.equal(f.store.rows(f.destination.id).length, 2);
    assert.equal(f.store.rows(f.source.id).length, 2);
    assert.throws(
      () => f.service.accept("bob", randomUUID(), token, f.destination.id),
      isUnavailable,
    );
    f.service.revoke("alice", f.source.id, share.id);
    assert.equal(f.store.rows(f.destination.id).length, 2);
  } finally {
    f.close();
  }
});

test("household-bound sharing cannot be read or imported by other households", () => {
  const f = fixture();
  try {
    f.db
      .prepare("INSERT INTO household_members VALUES (?,?,?,?)")
      .run(f.destination.id, "alice", "member", Date.now());
    const { token, share } = f.create({
      kind: "household",
      householdId: f.destination.id,
    });
    assert.equal(
      f.service.resolve(token, "bob").targetHouseholdId,
      f.destination.id,
    );
    assert.throws(() => f.service.resolve(token, "eve"), isUnavailable);
    assert.throws(
      () => f.service.accept("alice", share.id, token, f.source.id),
      isUnavailable,
    );
    assert.equal(
      f.service.accept("bob", share.id, token, f.destination.id).recipeIds
        .length,
      2,
    );
  } finally {
    f.close();
  }
});

test("private metadata and unsafe resource protocols never enter shared snapshots", () => {
  const f = fixture();
  try {
    f.store.apply(
      {
        opId: randomUUID(),
        id: f.ids[0],
        kind: "recipe",
        baseRev: 1,
        data: {
          ...recipe,
          image: "javascript:alert(1)",
          images: ["https://user:password@example.com/x", "file:///private"],
          source: "javascript:alert(1)",
          secret: "private",
        } as Recipe,
      },
      f.source.id,
    );
    const { token } = f.create();
    const content = f.service.resolve(token, null);
    assert.equal(content.recipes[0].image, "");
    assert.deepEqual(content.recipes[0].images, []);
    assert.equal(content.recipes[0].source, "");
    assert.ok(!JSON.stringify(content).includes("private"));
  } finally {
    f.close();
  }
});

test("batch copy rollback leaves neither recipes nor receipt on storage failure", () => {
  const f = fixture();
  try {
    const { token, share } = f.create();
    f.store.db.exec(
      "CREATE TRIGGER reject_second BEFORE INSERT ON household_rows WHEN json_extract(NEW.data,'$.title')='recipe-b' BEGIN SELECT RAISE(ABORT,'test failure'); END;",
    );
    assert.throws(() =>
      f.service.accept("bob", share.id, token, f.destination.id),
    );
    assert.equal(f.store.rows(f.destination.id).length, 0);
    assert.equal(
      f.store.db
        .prepare("SELECT count(*) AS n FROM recipe_share_receipts")
        .get()!.n,
      0,
    );
  } finally {
    f.close();
  }
});

test("revoking and cleaning old links cannot bypass the persistent creation limit", () => {
  const f = fixture();
  try {
    for (let index = 0; index < 10; index++) {
      const { share } = f.create();
      f.service.revoke("alice", f.source.id, share.id);
    }
    assert.throws(
      () => f.create(),
      (error) => error instanceof RecipeSharingError && error.status === 429,
    );
  } finally {
    f.close();
  }
});

test("oversized inline-image batches are rejected before persisting snapshots", () => {
  const f = fixture();
  try {
    const largeImage = "data:image/jpeg;base64,/9j/" + "A".repeat(490_000);
    f.ids.push("recipe-c");
    f.ids.forEach((id, index) =>
      f.store.apply(
        {
          opId: randomUUID(),
          id,
          kind: "recipe",
          baseRev: index === 2 ? 0 : 1,
          data: {
            ...recipe,
            image: largeImage,
            images: Array(7).fill(largeImage),
          },
        },
        f.source.id,
      ),
    );
    assert.throws(
      () => f.create(),
      (error) => error instanceof RecipeSharingError && error.status === 413,
    );
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM recipe_shares").get()!.n,
      0,
    );
  } finally {
    f.close();
  }
});
