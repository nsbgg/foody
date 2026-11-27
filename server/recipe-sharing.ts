import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { recipeSchema, type Recipe } from "../shared/domain.ts";
import { isStoredRecipeImage } from "../shared/recipe-image.ts";
import {
  createRecipeShareSchema,
  recipeShareTokenSchema,
  type CreateRecipeShare,
  type RecipeShareContent,
  type RecipeShareTarget,
  type RecipeShareView,
} from "../shared/recipe-sharing.ts";
import type { AccountService } from "./accounts.ts";
import type { HouseholdService } from "./households.ts";
import type { Store } from "./store.ts";

const DAY = 86_400_000;
const MAX_BYTES = 8 * 1024 * 1024;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type ShareRow = {
  id: string;
  householdId: string;
  createdBy: string;
  tokenHash: string;
  target: string;
  snapshots: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
};
export class RecipeSharingError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const unavailable = () =>
  new RecipeSharingError(
    404,
    "share_unavailable",
    "Diese Freigabe ist nicht verfügbar oder abgelaufen.",
  );
function safeURL(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
function snapshot(value: unknown): Recipe {
  // Zod's object parser deliberately strips every unknown/private property.
  const recipe = recipeSchema.parse(value);
  const image = (value: string) =>
    isStoredRecipeImage(value) ? value : safeURL(value);
  return {
    ...recipe,
    image: image(recipe.image),
    images: recipe.images?.map(image).filter(Boolean),
    source: safeURL(recipe.source),
    archived: false,
  };
}

export class RecipeSharingService {
  db: DatabaseSync;
  households: HouseholdService;
  store: Store;
  constructor(db: DatabaseSync, households: HouseholdService, store: Store) {
    this.db = db;
    this.households = households;
    this.store = store;
    db.exec(`CREATE TABLE IF NOT EXISTS recipe_shares (
      id TEXT PRIMARY KEY, householdId TEXT NOT NULL REFERENCES households(id), createdBy TEXT NOT NULL REFERENCES users(id),
      tokenHash TEXT NOT NULL UNIQUE, target TEXT NOT NULL, snapshots TEXT NOT NULL, createdAt INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL, revokedAt INTEGER);
      CREATE INDEX IF NOT EXISTS recipe_shares_household ON recipe_shares(householdId,createdAt);
      CREATE TABLE IF NOT EXISTS recipe_share_limits(userId TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
      CREATE TRIGGER IF NOT EXISTS recipe_shares_member_removed AFTER DELETE ON household_members BEGIN
        UPDATE recipe_shares SET revokedAt=CAST(strftime('%s','now') AS INTEGER)*1000
        WHERE householdId=OLD.householdId AND createdBy=OLD.userId AND revokedAt IS NULL;
      END;`);
    // Receipts live with the copied recipes, so one SQLite transaction commits
    // both the entire batch and its idempotency receipt, even across restarts.
    store.db.exec(`CREATE TABLE IF NOT EXISTS recipe_share_receipts (
      shareId TEXT NOT NULL, householdId TEXT NOT NULL, recipeIds TEXT NOT NULL, PRIMARY KEY(shareId,householdId));`);
  }
  private view(row: ShareRow): RecipeShareView {
    const recipes = JSON.parse(row.snapshots) as Recipe[];
    return {
      id: row.id,
      sourceHouseholdName: String(
        this.db
          .prepare("SELECT name FROM households WHERE id=?")
          .get(row.householdId)?.name || "Haushalt",
      ),
      recipeTitles: recipes.map((r) => r.title),
      recipeCount: recipes.length,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revoked: row.revokedAt !== null,
      target: JSON.parse(row.target),
    };
  }
  create(userId: string, householdId: string, input: CreateRecipeShare) {
    this.households.requireMember(userId, householdId);
    const parsed = createRecipeShareSchema.parse(input);
    if (parsed.target.kind === "household")
      this.households.requireMember(userId, parsed.target.householdId);
    const now = Date.now();
    // Bound persistent storage and enforce a stricter creation quota than reads.
    this.db
      .prepare(
        "DELETE FROM recipe_shares WHERE expiresAt<=? OR revokedAt IS NOT NULL",
      )
      .run(now);
    const count = Number(
      this.db
        .prepare("SELECT count(*) AS n FROM recipe_shares WHERE householdId=?")
        .get(householdId)!.n,
    );
    this.db.prepare("DELETE FROM recipe_share_limits WHERE until<=?").run(now);
    this.db
      .prepare(
        "INSERT INTO recipe_share_limits VALUES (?,1,?) ON CONFLICT(userId) DO UPDATE SET count=count+1",
      )
      .run(userId, now + 60_000);
    const recent = Number(
      this.db
        .prepare("SELECT count FROM recipe_share_limits WHERE userId=?")
        .get(userId)!.count,
    );
    if (count >= 30 || recent > 10)
      throw new RecipeSharingError(
        429,
        "share_limit",
        "Zu viele Freigaben. Widerrufe alte Links oder warte kurz.",
      );
    const rows = new Map(
      this.store
        .rows(householdId)
        .filter((row) => row.kind === "recipe")
        .map((row) => [row.id, row]),
    );
    let bytes = 2; // JSON array brackets; stop before accumulating an oversized batch.
    const recipes = parsed.recipeIds.map((id, index) => {
      const row = rows.get(id);
      if (!row)
        throw new RecipeSharingError(
          404,
          "recipe_not_found",
          "Ein ausgewähltes Rezept ist nicht verfügbar.",
        );
      const serialized = JSON.stringify(snapshot(row.data));
      bytes += Buffer.byteLength(serialized) + (index > 0 ? 1 : 0);
      if (bytes > MAX_BYTES)
        throw new RecipeSharingError(
          413,
          "share_too_large",
          "Die ausgewählten Rezepte sind zusammen zu groß. Teile weniger Rezepte gleichzeitig.",
        );
      return serialized;
    });
    const snapshots = `[${recipes.join(",")}]`;
    const token = randomBytes(32).toString("base64url");
    const row: ShareRow = {
      id: randomUUID(),
      householdId,
      createdBy: userId,
      tokenHash: digest(token),
      target: JSON.stringify(parsed.target),
      snapshots,
      createdAt: now,
      expiresAt: now + parsed.expiresInDays * DAY,
      revokedAt: null,
    };
    this.db
      .prepare("INSERT INTO recipe_shares VALUES (?,?,?,?,?,?,?,?,?)")
      .run(
        row.id,
        row.householdId,
        row.createdBy,
        row.tokenHash,
        row.target,
        row.snapshots,
        row.createdAt,
        row.expiresAt,
        null,
      );
    return { share: this.view(row), token };
  }
  list(userId: string, householdId: string) {
    this.households.requireMember(userId, householdId);
    return (
      this.db
        .prepare(
          "SELECT * FROM recipe_shares WHERE householdId=? ORDER BY createdAt DESC LIMIT 30",
        )
        .all(householdId) as ShareRow[]
    ).map((row) => this.view(row));
  }
  revoke(userId: string, householdId: string, id: string) {
    this.households.requireMember(userId, householdId);
    const result = this.db
      .prepare(
        "UPDATE recipe_shares SET revokedAt=? WHERE id=? AND householdId=?",
      )
      .run(Date.now(), id, householdId);
    if (!result.changes) throw unavailable();
  }
  private authorize(token: string, userId: string | null): ShareRow {
    if (!recipeShareTokenSchema.safeParse(token).success) throw unavailable();
    const row = this.db
      .prepare("SELECT * FROM recipe_shares WHERE tokenHash=?")
      .get(digest(token)) as ShareRow | undefined;
    if (!row || row.revokedAt !== null || row.expiresAt <= Date.now())
      throw unavailable();
    // A removed member cannot leave links granting ongoing access behind.
    if (
      !this.db
        .prepare(
          "SELECT 1 FROM household_members WHERE householdId=? AND userId=?",
        )
        .get(row.householdId, row.createdBy)
    )
      throw unavailable();
    const target = JSON.parse(row.target) as RecipeShareTarget;
    if (target.kind !== "guest" && !userId)
      throw new RecipeSharingError(
        401,
        "share_signin_required",
        "Bitte anmelden, um diese Freigabe zu öffnen.",
      );
    if (target.kind === "user") {
      const user = this.db
        .prepare("SELECT email FROM users WHERE id=?")
        .get(userId!);
      if (!user || String(user.email).toLowerCase() !== target.email)
        throw unavailable();
    } else if (
      target.kind === "household" &&
      !this.db
        .prepare(
          "SELECT 1 FROM household_members WHERE householdId=? AND userId=?",
        )
        .get(target.householdId, userId!)
    )
      throw unavailable();
    return row;
  }
  resolve(token: string, userId: string | null): RecipeShareContent {
    const row = this.authorize(token, userId);
    const recipes = JSON.parse(row.snapshots) as Recipe[];
    const target = JSON.parse(row.target) as RecipeShareTarget;
    return {
      id: row.id,
      recipeCount: recipes.length,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      recipes,
      ...(target.kind === "household"
        ? { targetHouseholdId: target.householdId }
        : {}),
    };
  }
  accept(userId: string, id: string, token: string, householdId: string) {
    const row = this.authorize(token, userId);
    if (row.id !== id) throw unavailable();
    this.households.requireMember(userId, householdId);
    const target = JSON.parse(row.target) as RecipeShareTarget;
    if (target.kind === "household" && target.householdId !== householdId)
      throw unavailable();
    const db = this.store.db;
    db.exec("BEGIN IMMEDIATE");
    try {
      const prior = db
        .prepare(
          "SELECT recipeIds FROM recipe_share_receipts WHERE shareId=? AND householdId=?",
        )
        .get(id, householdId);
      if (prior) {
        db.exec("COMMIT");
        return {
          recipeIds: JSON.parse(String(prior.recipeIds)) as string[],
          alreadyAccepted: true,
        };
      }
      const recipes = (JSON.parse(row.snapshots) as unknown[]).map(snapshot);
      const ids = recipes.map(() => randomUUID());
      const insert = db.prepare(
        "INSERT INTO household_rows (householdId,id,kind,rev,data) VALUES (?,?,'recipe',1,?)",
      );
      recipes.forEach((recipe, index) =>
        insert.run(householdId, ids[index], JSON.stringify(recipe)),
      );
      db.prepare("INSERT INTO recipe_share_receipts VALUES (?,?,?)").run(
        id,
        householdId,
        JSON.stringify(ids),
      );
      db.exec("COMMIT");
      return { recipeIds: ids, alreadyAccepted: false };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function respondError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: "Bitte die Angaben zur Freigabe prüfen.",
      code: "validation_error",
    });
    return;
  }
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    "code" in error &&
    error instanceof Error
  ) {
    res
      .status(Number(error.status))
      .json({ error: error.message, code: error.code });
    return;
  }
  res
    .status(500)
    .json({ error: "Die Freigabe konnte nicht verarbeitet werden." });
}
export function installPublicRecipeSharing(
  app: Express,
  service: RecipeSharingService,
  accounts: AccountService,
) {
  const buckets = new Map<string, { count: number; until: number }>();
  app.post("/api/recipe-shares/resolve", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const now = Date.now();
    for (const [key, bucket] of buckets)
      if (bucket.until <= now) buckets.delete(key);
    const key = req.ip || req.socket.remoteAddress || "unknown";
    if (!buckets.has(key) && buckets.size >= 5000) {
      res.status(429).json({ error: "Bitte später erneut versuchen." });
      return;
    }
    const bucket = buckets.get(key) || { count: 0, until: now + 60_000 };
    buckets.set(key, bucket);
    if (++bucket.count > 60) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: "Zu viele Anfragen. Bitte kurz warten." });
      return;
    }
    try {
      const parsed = z
        .object({ token: recipeShareTokenSchema })
        .strict()
        .parse(req.body);
      // This endpoint is read-only: no anonymous sessions are allocated and no
      // CSRF exception grants a write capability. Protected targets still need login.
      res.json(
        service.resolve(parsed.token, accounts.authenticatedUserId(req)),
      );
    } catch (error) {
      respondError(res, error);
    }
  });
}
export function installRecipeSharing(
  app: Express,
  service: RecipeSharingService,
  accounts: AccountService,
  _households: HouseholdService,
) {
  function protectedRoute(
    req: Request,
    res: Response,
    callback: (userId: string) => void,
  ) {
    const session = accounts.requireUser(req, res);
    if (!session || (req.method !== "GET" && !accounts.csrf(req, res))) return;
    res.setHeader("Cache-Control", "no-store");
    try {
      callback(session.userId!);
    } catch (error) {
      respondError(res, error);
    }
  }
  app.post("/api/households/:householdId/recipe-shares", (req, res) =>
    protectedRoute(req, res, (userId) => {
      const input = createRecipeShareSchema.parse(req.body);
      res
        .status(201)
        .json(service.create(userId, String(req.params.householdId), input));
    }),
  );
  app.get("/api/households/:householdId/recipe-shares", (req, res) =>
    protectedRoute(req, res, (userId) =>
      res.json({
        shares: service.list(userId, String(req.params.householdId)),
      }),
    ),
  );
  app.delete(
    "/api/households/:householdId/recipe-shares/:shareId",
    (req, res) =>
      protectedRoute(req, res, (userId) => {
        service.revoke(
          userId,
          String(req.params.householdId),
          String(req.params.shareId),
        );
        res.status(204).end();
      }),
  );
  app.post("/api/recipe-shares/:shareId/accept", (req, res) =>
    protectedRoute(req, res, (userId) => {
      const input = z
        .object({
          token: recipeShareTokenSchema,
          householdId: z.string().uuid(),
        })
        .strict()
        .parse(req.body);
      res.json(
        service.accept(
          userId,
          String(req.params.shareId),
          input.token,
          input.householdId,
        ),
      );
    }),
  );
}
