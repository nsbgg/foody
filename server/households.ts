import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  Household,
  HouseholdMember,
  HouseholdRole,
  InvitationView,
} from "../shared/accounts.ts";

export class HouseholdError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class HouseholdService {
  db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY,name TEXT NOT NULL,createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS household_members (householdId TEXT NOT NULL REFERENCES households(id),userId TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('owner','member')),createdAt INTEGER NOT NULL,PRIMARY KEY(householdId,userId));
      CREATE INDEX IF NOT EXISTS household_members_user ON household_members(userId);
      CREATE TABLE IF NOT EXISTS household_invitations (id TEXT PRIMARY KEY,householdId TEXT NOT NULL REFERENCES households(id),email TEXT NOT NULL,tokenHash TEXT NOT NULL UNIQUE,expiresAt INTEGER NOT NULL,usedAt INTEGER,createdBy TEXT NOT NULL REFERENCES users(id));
    `);
  }
  list(userId: string): Household[] {
    return this.db
      .prepare(
        "SELECT h.id,h.name,m.role FROM households h JOIN household_members m ON h.id=m.householdId WHERE m.userId=? ORDER BY h.createdAt,h.id",
      )
      .all(userId) as Household[];
  }
  requireMember(
    userId: string,
    householdId: string,
    owner = false,
  ): HouseholdRole {
    const membership = this.db
      .prepare(
        "SELECT role FROM household_members WHERE userId=? AND householdId=?",
      )
      .get(userId, householdId);
    // A missing household and an inaccessible household share the same response.
    if (!membership)
      throw new HouseholdError(
        404,
        "household_not_found",
        "Haushalt nicht gefunden.",
      );
    if (owner && membership.role !== "owner")
      throw new HouseholdError(
        403,
        "owner_required",
        "Nur die Haushaltsverwaltung darf das ändern.",
      );
    return membership.role as HouseholdRole;
  }
  create(userId: string, name: string): Household {
    if (this.list(userId).length >= 20)
      throw new HouseholdError(
        409,
        "household_limit",
        "Du kannst höchstens 20 Haushalten angehören.",
      );
    const id = randomUUID(),
      now = Date.now();
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO households VALUES (?,?,?)")
        .run(id, name, now);
      this.db
        .prepare("INSERT INTO household_members VALUES (?,?,?,?)")
        .run(id, userId, "owner", now);
    });
    return { id, name, role: "owner" };
  }
  members(userId: string, householdId: string): HouseholdMember[] {
    this.requireMember(userId, householdId);
    return this.db
      .prepare(
        "SELECT u.id,u.name,u.email,m.role FROM household_members m JOIN users u ON m.userId=u.id WHERE m.householdId=? ORDER BY m.createdAt,u.id",
      )
      .all(householdId) as HouseholdMember[];
  }
  invite(
    userId: string,
    householdId: string,
    email: string,
  ): { invitation: InvitationView; token: string } {
    this.requireMember(userId, householdId, true);
    const now = Date.now();
    this.db
      .prepare(
        "DELETE FROM household_invitations WHERE expiresAt<? OR usedAt IS NOT NULL",
      )
      .run(now);
    if (
      Number(
        this.db
          .prepare(
            "SELECT count(*) AS n FROM household_invitations WHERE householdId=?",
          )
          .get(householdId)!.n,
      ) >= 50
    )
      throw new HouseholdError(
        409,
        "invitation_limit",
        "Zu viele offene Einladungen in diesem Haushalt.",
      );
    if (this.members(userId, householdId).some((m) => m.email === email))
      throw new HouseholdError(
        409,
        "already_member",
        "Diese Person ist bereits im Haushalt.",
      );
    const invitation = {
      id: randomUUID(),
      email,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    };
    const token = randomBytes(32).toString("base64url");
    this.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM household_invitations WHERE householdId=? AND email=?",
        )
        .run(householdId, email);
      this.db
        .prepare("INSERT INTO household_invitations VALUES (?,?,?,?,?,NULL,?)")
        .run(
          invitation.id,
          householdId,
          email,
          digest(token),
          invitation.expiresAt,
          userId,
        );
    });
    return { invitation, token };
  }
  join(userId: string, token: string): Household {
    return this.transaction(() => {
      const invite = this.db
        .prepare(
          "SELECT * FROM household_invitations WHERE tokenHash=? AND usedAt IS NULL AND expiresAt>?",
        )
        .get(digest(token), Date.now());
      const user = this.db
        .prepare("SELECT email FROM users WHERE id=?")
        .get(userId);
      if (!invite || !user || user.email !== invite.email)
        throw new HouseholdError(
          400,
          "invalid_invitation",
          "Die Einladung ist ungültig, abgelaufen oder für eine andere E-Mail-Adresse bestimmt.",
        );
      if (this.list(userId).length >= 20)
        throw new HouseholdError(
          409,
          "household_limit",
          "Du kannst höchstens 20 Haushalten angehören.",
        );
      if (
        Number(
          this.db
            .prepare(
              "SELECT count(*) AS n FROM household_members WHERE householdId=?",
            )
            .get(invite.householdId)!.n,
        ) >= 100
      )
        throw new HouseholdError(
          409,
          "member_limit",
          "Dieser Haushalt hat die maximale Mitgliederzahl erreicht.",
        );
      // The inviter must still own the household when the token is redeemed.
      this.requireMember(
        String(invite.createdBy),
        String(invite.householdId),
        true,
      );
      this.db
        .prepare("INSERT OR IGNORE INTO household_members VALUES (?,?,?,?)")
        .run(invite.householdId, userId, "member", Date.now());
      this.db
        .prepare("UPDATE household_invitations SET usedAt=? WHERE id=?")
        .run(Date.now(), invite.id);
      const h = this.list(userId).find((h) => h.id === invite.householdId)!;
      return h;
    });
  }
  removeMember(userId: string, householdId: string, targetId: string) {
    this.requireMember(userId, householdId, targetId !== userId);
    const targetRole = this.requireMember(targetId, householdId);
    if (
      targetRole === "owner" &&
      Number(
        this.db
          .prepare(
            "SELECT count(*) AS n FROM household_members WHERE householdId=? AND role='owner'",
          )
          .get(householdId)!.n,
      ) <= 1
    )
      throw new HouseholdError(
        409,
        "last_owner",
        "Die letzte Haushaltsverwaltung kann nicht entfernt werden.",
      );
    this.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM household_members WHERE householdId=? AND userId=?",
        )
        .run(householdId, targetId);
      this.db
        .prepare(
          "DELETE FROM household_invitations WHERE householdId=? AND createdBy=?",
        )
        .run(householdId, targetId);
      this.db
        .prepare(
          "UPDATE sessions SET activeHouseholdId=NULL WHERE userId=? AND activeHouseholdId=?",
        )
        .run(targetId, householdId);
    });
  }
  revoke(userId: string, householdId: string, invitationId: string) {
    this.requireMember(userId, householdId, true);
    this.db
      .prepare("DELETE FROM household_invitations WHERE householdId=? AND id=?")
      .run(householdId, invitationId);
  }
  private transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
