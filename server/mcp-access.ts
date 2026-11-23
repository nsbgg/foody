import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { HouseholdError, type HouseholdService } from "./households.ts";

export const mcpPermissions = [
  "recipes:read",
  "recipes:write",
  "recipes:delete",
  "plan:read",
  "plan:write",
  "plan:delete",
  "shopping:read",
  "shopping:write",
  "shopping:delete",
] as const;
export const connectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    permissions: z.array(z.enum(mcpPermissions)).min(1).max(9),
    days: z.number().int().min(1).max(90).nullable().default(30),
  })
  .strict();
export type McpPermission = (typeof mcpPermissions)[number];
export type McpAccess = {
  id: string;
  userId: string;
  householdId: string;
  permissions: McpPermission[];
};
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class McpAccessService {
  db: DatabaseSync;
  households: HouseholdService;
  constructor(db: DatabaseSync, households: HouseholdService) {
    this.db = db;
    this.households = households;
    db.exec(`CREATE TABLE IF NOT EXISTS mcp_connections (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id),
      householdId TEXT NOT NULL REFERENCES households(id), name TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE, permissions TEXT NOT NULL,
      createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, revokedAt INTEGER, lastUsedAt INTEGER
    ); CREATE INDEX IF NOT EXISTS mcp_connections_user ON mcp_connections(userId, householdId);
    CREATE TRIGGER IF NOT EXISTS revoke_removed_member_mcp AFTER DELETE ON household_members
    BEGIN
      UPDATE mcp_connections SET revokedAt=CAST(strftime('%s','now') AS INTEGER)*1000
      WHERE userId=OLD.userId AND householdId=OLD.householdId AND revokedAt IS NULL;
    END;`);
  }
  list(userId: string, householdId: string) {
    this.households.requireMember(userId, householdId);
    return this.db
      .prepare(
        "SELECT id,name,permissions,createdAt,expiresAt,revokedAt,lastUsedAt FROM mcp_connections WHERE userId=? AND householdId=? ORDER BY createdAt DESC",
      )
      .all(userId, householdId)
      .map((row) => ({
        ...row,
        permissions: JSON.parse(String(row.permissions)),
        expiresAt: row.expiresAt === 0 ? null : row.expiresAt,
      }));
  }
  create(userId: string, householdId: string, input: unknown) {
    this.households.requireMember(userId, householdId);
    const data = connectionSchema.parse(input);
    const now = Date.now();
    const count = this.db
      .prepare(
        "SELECT count(*) AS n FROM mcp_connections WHERE userId=? AND revokedAt IS NULL AND (expiresAt=0 OR expiresAt>?)",
      )
      .get(userId, now)!;
    if (Number(count.n) >= 20)
      throw new HouseholdError(
        409,
        "connection_limit",
        "Bitte zuerst eine bestehende KI-Verbindung widerrufen.",
      );
    const id = randomUUID();
    const token = `foody_mcp_${randomBytes(32).toString("base64url")}`;
    // Zero represents no expiry in the existing NOT NULL database column.
    const expiresAt = data.days === null ? 0 : now + data.days * 86_400_000;
    this.db
      .prepare(
        "INSERT INTO mcp_connections (id,userId,householdId,name,tokenHash,permissions,createdAt,expiresAt) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        userId,
        householdId,
        data.name,
        digest(token),
        JSON.stringify([...new Set(data.permissions)]),
        now,
        expiresAt,
      );
    return { id, token, expiresAt: expiresAt === 0 ? null : expiresAt };
  }
  revoke(userId: string, householdId: string, id: string) {
    this.households.requireMember(userId, householdId);
    this.db
      .prepare(
        "UPDATE mcp_connections SET revokedAt=? WHERE id=? AND userId=? AND householdId=?",
      )
      .run(Date.now(), id, userId, householdId);
  }
  authenticate(header: string | undefined): McpAccess | null {
    if (!header || !/^Bearer foody_mcp_[A-Za-z0-9_-]{43}$/.test(header))
      return null;
    const row = this.db
      .prepare(
        "SELECT id,userId,householdId,permissions FROM mcp_connections WHERE tokenHash=? AND revokedAt IS NULL AND (expiresAt=0 OR expiresAt>?)",
      )
      .get(digest(header.slice(7)), Date.now());
    if (!row) return null;
    try {
      this.households.requireMember(
        String(row.userId),
        String(row.householdId),
      );
    } catch {
      return null;
    }
    this.db
      .prepare("UPDATE mcp_connections SET lastUsedAt=? WHERE id=?")
      .run(Date.now(), String(row.id));
    return {
      id: String(row.id),
      userId: String(row.userId),
      householdId: String(row.householdId),
      permissions: JSON.parse(String(row.permissions)),
    };
  }
}
