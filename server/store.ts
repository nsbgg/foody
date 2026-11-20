import { DatabaseSync } from "node:sqlite";
import type { Row, Operation } from "../shared/domain.ts";
export class Store {
  db: DatabaseSync;
  constructor(path: string, seed: Row[] = []) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS rows (id TEXT PRIMARY KEY, kind TEXT NOT NULL, rev INTEGER NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, result TEXT NOT NULL)",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS household_rows (householdId TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,rev INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(householdId,id)); CREATE TABLE IF NOT EXISTS household_operations (householdId TEXT NOT NULL,id TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(householdId,id))",
    );
    if (!this.db.prepare("SELECT count(*) AS n FROM rows").get()!.n) {
      const insert = this.db.prepare("INSERT INTO rows VALUES (?,?,?,?)");
      for (const r of seed)
        insert.run(r.id, r.kind, r.rev, JSON.stringify(r.data));
    }
  }
  rows(householdId?: string): Row[] {
    if (householdId !== undefined) {
      return this.db
        .prepare(
          "SELECT id, kind, rev, data FROM household_rows WHERE householdId=?",
        )
        .all(householdId)
        .map((r) => ({ ...r, data: JSON.parse(String(r.data)) })) as Row[];
    }
    return this.db
      .prepare("SELECT * FROM rows")
      .all()
      .map((r) => ({ ...r, data: JSON.parse(String(r.data)) })) as Row[];
  }
  apply(
    op: Operation,
    householdId?: string,
  ): {
    accepted?: Row;
    conflict?: Row | null;
    opId: string;
  } {
    if (householdId !== undefined) return this.applyScoped(op, householdId);
    const previous = this.db
      .prepare("SELECT result FROM operations WHERE id=?")
      .get(op.opId);
    if (previous) return JSON.parse(String(previous.result));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const raw = this.db.prepare("SELECT * FROM rows WHERE id=?").get(op.id);
      const current = raw
        ? ({ ...raw, data: JSON.parse(String(raw.data)) } as Row)
        : null;
      if (
        (current?.rev || 0) !== op.baseRev ||
        (current && current.kind !== op.kind)
      ) {
        this.db.exec("ROLLBACK");
        return { opId: op.opId, conflict: current };
      }
      const row: Row = {
        id: op.id,
        kind: op.kind,
        rev: op.baseRev + 1,
        data: op.data,
      };
      this.db
        .prepare(
          "INSERT INTO rows VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET rev=excluded.rev,data=excluded.data",
        )
        .run(row.id, row.kind, row.rev, JSON.stringify(row.data));
      const result = { opId: op.opId, accepted: row };
      this.db
        .prepare("INSERT INTO operations VALUES (?,?)")
        .run(op.opId, JSON.stringify(result));
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private applyScoped(op: Operation, householdId: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare(
          "SELECT result FROM household_operations WHERE householdId=? AND id=?",
        )
        .get(householdId, op.opId);
      if (previous) {
        this.db.exec("COMMIT");
        return JSON.parse(String(previous.result));
      }
      const raw = this.db
        .prepare(
          "SELECT id,kind,rev,data FROM household_rows WHERE householdId=? AND id=?",
        )
        .get(householdId, op.id);
      const current = raw
        ? ({ ...raw, data: JSON.parse(String(raw.data)) } as Row)
        : null;
      if (
        (current?.rev || 0) !== op.baseRev ||
        (current && current.kind !== op.kind)
      ) {
        this.db.exec("ROLLBACK");
        return { opId: op.opId, conflict: current };
      }
      const row: Row = {
        id: op.id,
        kind: op.kind,
        rev: op.baseRev + 1,
        data: op.data,
      };
      this.db
        .prepare(
          "INSERT INTO household_rows VALUES (?,?,?,?,?) ON CONFLICT(householdId,id) DO UPDATE SET rev=excluded.rev,data=excluded.data",
        )
        .run(householdId, row.id, row.kind, row.rev, JSON.stringify(row.data));
      const result = { opId: op.opId, accepted: row };
      this.db
        .prepare("INSERT INTO household_operations VALUES (?,?,?)")
        .run(householdId, op.opId, JSON.stringify(result));
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
