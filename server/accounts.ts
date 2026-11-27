import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";

export interface AuthSession {
  id: string;
  userId: string | null;
  activeHouseholdId: string | null;
  csrfToken: string;
  authenticatedAt: number;
  expiresAt: number;
}
type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  webauthnId: string;
};
type Passkey = {
  id: string;
  userId: string;
  name: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string;
  createdAt: number;
};
type Household = { id: string; name: string; role: "owner" | "member" };
const token = () => randomBytes(32).toString("base64url");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_MS = 10 * 60 * 1000;
const passwordSchema = z.string().min(12).max(256);
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
const registerSchema = loginSchema.extend({
  name: z.string().trim().min(1).max(80),
  password: passwordSchema,
});

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, value) => (error ? reject(error) : resolve(value)),
    ),
  );
}
export async function passwordHash(password: string) {
  const salt = token();
  return `scrypt:${salt}:${(await derive(password, salt)).toString("base64url")}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const [algorithm, salt, expected] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = await derive(password, salt);
  const stored = Buffer.from(expected, "base64url");
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

/** Persisted opaque cookie sessions; request context never trusts a caller-supplied user ID. */
export class AccountService {
  public db: DatabaseSync;
  public origins: string[];
  public rpID: string;
  private secure: boolean;
  private householdGetter: (userId: string) => Household[] = () => [];
  private requests = new WeakMap<Request, AuthSession>();
  constructor(
    path: string,
    configuration: { origin?: string; rpID?: string } = {},
  ) {
    const configured = configuration.origin || process.env.APP_ORIGIN;
    this.origins = configured
      ? [configured]
      : [
          "http://localhost:5173",
          "http://localhost:3002",
          "http://localhost:4307",
        ];
    for (const origin of this.origins) {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        (url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
          ))
      )
        throw new Error(
          "APP_ORIGIN muss eine HTTPS-Origin ohne Pfad sein (lokal ist HTTP erlaubt).",
        );
    }
    if (process.env.NODE_ENV === "production" && !configured)
      throw new Error("APP_ORIGIN ist in Produktion erforderlich.");
    this.secure = this.origins.every((origin) => origin.startsWith("https:"));
    this.rpID =
      configuration.rpID ||
      process.env.WEBAUTHN_RP_ID ||
      new URL(this.origins[0]).hostname;
    if (
      this.origins.some((origin) => {
        const host = new URL(origin).hostname;
        return host !== this.rpID && !host.endsWith(`.${this.rpID}`);
      })
    )
      throw new Error("WEBAUTHN_RP_ID passt nicht zu APP_ORIGIN.");
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,passwordHash TEXT NOT NULL,webauthnId TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,userId TEXT REFERENCES users(id) ON DELETE CASCADE,activeHouseholdId TEXT,csrfToken TEXT NOT NULL,authenticatedAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,publicKey BLOB NOT NULL,counter INTEGER NOT NULL,transports TEXT NOT NULL,createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,purpose TEXT NOT NULL,challenge TEXT NOT NULL,userId TEXT,expiresAt INTEGER NOT NULL,PRIMARY KEY(sessionId,purpose));
      CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expiresAt INTEGER NOT NULL);`);
  }
  setHouseholdGetter(getter: (userId: string) => Household[]) {
    this.householdGetter = getter;
  }
  setActiveHousehold(session: AuthSession, id: string | null) {
    this.db
      .prepare("UPDATE sessions SET activeHouseholdId=? WHERE id=?")
      .run(id, session.id);
    session.activeHouseholdId = id;
  }
  private cookie(res: Response, value: string) {
    res.cookie(this.secure ? "__Host-foody_session" : "foody_session", value, {
      httpOnly: true,
      secure: this.secure,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MS,
    });
  }
  private existingSession(req: Request): AuthSession | undefined {
    const cookieName = this.secure ? "__Host-foody_session" : "foody_session";
    const raw = req.headers.cookie
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    return raw && /^[\w-]{43}$/.test(raw)
      ? (this.db
          .prepare("SELECT * FROM sessions WHERE id=? AND expiresAt>?")
          .get(hash(raw), Date.now()) as unknown as AuthSession | undefined)
      : undefined;
  }
  private requestSession(req: Request): AuthSession | undefined {
    const cached = this.requests.get(req);
    if (cached) return cached;
    const session = this.existingSession(req);
    if (session) this.requests.set(req, session);
    return session;
  }
  /** Read an existing login without allocating an anonymous session. */
  authenticatedUserId(req: Request): string | null {
    return this.requestSession(req)?.userId || null;
  }
  session(req: Request, res: Response): AuthSession {
    let session = this.requestSession(req);
    if (!session) {
      const rawToken = token();
      session = {
        id: hash(rawToken),
        userId: null,
        activeHouseholdId: null,
        csrfToken: token(),
        authenticatedAt: 0,
        expiresAt: Date.now() + SESSION_MS,
      };
      this.db
        .prepare("DELETE FROM sessions WHERE expiresAt<=?")
        .run(Date.now());
      this.db
        .prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?)")
        .run(session.id, null, null, session.csrfToken, 0, session.expiresAt);
      this.cookie(res, rawToken);
    }
    this.requests.set(req, session);
    return session;
  }
  sessionView(session: AuthSession) {
    const user = session.userId
      ? this.db
          .prepare("SELECT id,name,email FROM users WHERE id=?")
          .get(session.userId)
      : null;
    const households = user ? this.householdGetter(session.userId!) : [];
    // Membership can be revoked while a session remains valid. Never advertise
    // an inaccessible selection that could rehydrate a previously cached scope.
    if (
      session.activeHouseholdId &&
      !households.some(
        (household) => household.id === session.activeHouseholdId,
      )
    ) {
      this.setActiveHousehold(session, null);
    }
    return {
      user: user || null,
      households,
      activeHouseholdId: session.activeHouseholdId,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    };
  }
  requireUser(req: Request, res: Response): AuthSession | null {
    // Reject absent/expired cookies without allocating an anonymous session.
    const session = this.requestSession(req);
    if (!session?.userId) {
      res.status(401).json({ error: "Bitte zuerst anmelden." });
      return null;
    }
    return session;
  }
  csrf(req: Request, res: Response): boolean {
    const session = this.requestSession(req);
    const supplied = req.get("X-CSRF-Token") || "";
    const origin = req.get("Origin");
    if (
      !session ||
      (origin && !this.origins.includes(origin)) ||
      !/^[\w-]{43}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(session.csrfToken))
    ) {
      res.status(403).json({
        error: "Sicherheitsprüfung fehlgeschlagen. Bitte Seite neu laden.",
      });
      return false;
    }
    return true;
  }
  private recent(req: Request, res: Response): AuthSession | null {
    const session = this.requireUser(req, res);
    if (!session) return null;
    if (Date.now() - session.authenticatedAt > RECENT_MS) {
      res.status(403).json({
        error: "Bitte erneut anmelden, um Passkeys zu verwalten.",
        code: "reauth_required",
      });
      return null;
    }
    return session;
  }
  private rotate(req: Request, res: Response, userId: string | null) {
    const old = this.session(req, res);
    const raw = token();
    const session: AuthSession = {
      id: hash(raw),
      userId,
      activeHouseholdId:
        userId && old.userId === userId ? old.activeHouseholdId : null,
      csrfToken: token(),
      authenticatedAt: userId ? Date.now() : 0,
      expiresAt: Date.now() + SESSION_MS,
    };
    this.db.prepare("DELETE FROM sessions WHERE id=?").run(old.id);
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?)")
      .run(
        session.id,
        session.userId,
        session.activeHouseholdId,
        session.csrfToken,
        session.authenticatedAt,
        session.expiresAt,
      );
    this.requests.set(req, session);
    this.cookie(res, raw);
    return session;
  }
  private limited(req: Request, res: Response, bootstrap = false): boolean {
    const now = Date.now();
    this.db.prepare("DELETE FROM auth_limits WHERE expiresAt<=?").run(now);
    // Reading one's own passkeys and managing credentials are not password
    // guesses. Authenticated household members behind one NAT must not consume
    // the shared login bucket merely by opening their account panel.
    const management =
      !bootstrap &&
      (req.method === "GET" ||
        req.method === "DELETE" ||
        req.path === "/logout" ||
        req.path.startsWith("/passkeys/registration/"));
    const authenticated =
      bootstrap || management ? this.existingSession(req)?.userId : null;
    const keys = [
      authenticated
        ? `${bootstrap ? "session" : "management"}:user:${hash(authenticated)}`
        : `${bootstrap ? "session" : "auth"}:ip:${hash(req.ip || "unknown")}`,
    ];
    if (!bootstrap && !management && typeof req.body?.email === "string")
      keys.push(`email:${hash(req.body.email.trim().toLowerCase())}`);
    for (const key of keys) {
      this.db
        .prepare(
          "INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
        )
        .run(key, now + 15 * 60 * 1000);
      const row = this.db
        .prepare("SELECT count FROM auth_limits WHERE key=?")
        .get(key)!;
      if (
        Number(row.count) >
        (bootstrap || key.startsWith("management:user:")
          ? 120
          : key.startsWith("auth:ip:")
            ? 60
            : 15)
      ) {
        res.setHeader("Retry-After", "900");
        res.status(429).json({
          error: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.",
        });
        return true;
      }
    }
    return false;
  }
  private saveChallenge(
    session: AuthSession,
    purpose: string,
    challenge: string,
  ) {
    this.db
      .prepare("INSERT OR REPLACE INTO challenges VALUES(?,?,?,?,?)")
      .run(
        session.id,
        purpose,
        challenge,
        session.userId,
        Date.now() + 5 * 60 * 1000,
      );
  }
  private takeChallenge(session: AuthSession, purpose: string) {
    const row = this.db
      .prepare(
        "DELETE FROM challenges WHERE sessionId=? AND purpose=? RETURNING *",
      )
      .get(session.id, purpose);
    if (
      !row ||
      Number(row.expiresAt) <= Date.now() ||
      row.userId !== session.userId
    )
      throw new Error("Challenge abgelaufen.");
    return String(row.challenge);
  }
  install(app: Express) {
    app.get("/api/session", (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      if (this.limited(req, res, true)) return;
      res.json(this.sessionView(this.session(req, res)));
    });
    // Session revocation must remain possible after any read/login limit is
    // exhausted. Only an existing authenticated session with valid CSRF can
    // reach the rotation; anonymous retries never allocate database sessions.
    app.post("/api/auth/logout", (req, res) => {
      const session = this.requireUser(req, res);
      if (!session || !this.csrf(req, res)) return;
      res.json(this.sessionView(this.rotate(req, res, null)));
    });
    app.use("/api/auth", (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      if (this.limited(req, res)) return;
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        !this.csrf(req, res)
      )
        return;
      next();
    });
    app.post("/api/auth/register", async (req, res) => {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error:
            "Name, gültige E-Mail und Passwort mit 12–256 Zeichen erforderlich.",
        });
        return;
      }
      const { name, email, password } = parsed.data;
      const encoded = await passwordHash(password);
      if (this.db.prepare("SELECT id FROM users WHERE email=?").get(email)) {
        res.status(409).json({
          error:
            "Konto konnte nicht erstellt werden. Bitte anmelden oder andere E-Mail verwenden.",
        });
        return;
      }
      const id = randomUUID();
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?,?)")
        .run(id, name, email, encoded, token(), Date.now());
      res.status(201).json(this.sessionView(this.rotate(req, res, id)));
    });
    app.post("/api/auth/login", async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Bitte E-Mail und Passwort eingeben." });
        return;
      }
      const user = this.db
        .prepare("SELECT * FROM users WHERE email=?")
        .get(parsed.data.email) as User | undefined;
      // A real expensive hash also for unknown users avoids a cheap timing oracle.
      const valid = user
        ? await passwordMatches(parsed.data.password, user.passwordHash)
        : (await passwordHash(parsed.data.password), false);
      if (!user || !valid) {
        res.status(401).json({ error: "E-Mail oder Passwort stimmt nicht." });
        return;
      }
      res.json(this.sessionView(this.rotate(req, res, user.id)));
    });
    app.post("/api/auth/reauthenticate", async (req, res) => {
      const session = this.requireUser(req, res);
      if (!session) return;
      const parsed = z
        .object({ password: z.string().min(1).max(256) })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Bitte dein Passwort eingeben." });
        return;
      }
      const user = this.db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(session.userId!) as User;
      if (
        !user ||
        !(await passwordMatches(parsed.data.password, user.passwordHash))
      ) {
        res.status(400).json({ error: "Das Passwort stimmt nicht." });
        return;
      }
      res.json(this.sessionView(this.rotate(req, res, user.id)));
    });
    app.get("/api/auth/passkeys", (req, res) => {
      const session = this.requireUser(req, res);
      if (!session) return;
      res.json({
        passkeys: this.db
          .prepare(
            "SELECT id,name,createdAt FROM passkeys WHERE userId=? ORDER BY createdAt",
          )
          .all(session.userId!),
      });
    });
    app.delete("/api/auth/passkeys/:id", (req, res) => {
      const session = this.recent(req, res);
      if (!session) return;
      const result = this.db
        .prepare("DELETE FROM passkeys WHERE id=? AND userId=?")
        .run(String(req.params.id), session.userId!);
      if (!result.changes) {
        res.status(404).json({ error: "Passkey nicht gefunden." });
        return;
      }
      res.status(204).end();
    });
    app.post("/api/auth/passkeys/registration/options", async (req, res) => {
      const session = this.recent(req, res);
      if (!session) return;
      const user = this.db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(session.userId!) as User;
      const existing = this.db
        .prepare("SELECT id FROM passkeys WHERE userId=?")
        .all(user.id);
      if (existing.length >= 10) {
        res.status(400).json({ error: "Maximal 10 Passkeys pro Konto." });
        return;
      }
      const options = await generateRegistrationOptions({
        rpName: "Foody",
        rpID: this.rpID,
        userID: Buffer.from(user.webauthnId, "base64url"),
        userName: user.email,
        userDisplayName: user.name,
        attestationType: "none",
        excludeCredentials: existing.map((value) => ({ id: String(value.id) })),
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
      });
      this.saveChallenge(session, "register", options.challenge);
      res.json(options);
    });
    app.post("/api/auth/passkeys/registration/verify", async (req, res) => {
      const session = this.recent(req, res);
      if (!session) return;
      try {
        const challenge = this.takeChallenge(session, "register");
        const name = z
          .string()
          .trim()
          .min(1)
          .max(80)
          .parse(req.body.name || "Mein Passkey");
        const verification = await verifyRegistrationResponse({
          response: req.body.response as RegistrationResponseJSON,
          expectedChallenge: challenge,
          expectedOrigin: this.origins,
          expectedRPID: this.rpID,
          requireUserVerification: true,
        });
        if (!verification.verified || !verification.registrationInfo)
          throw new Error("Not verified");
        const credential = verification.registrationInfo.credential;
        this.db
          .prepare("INSERT INTO passkeys VALUES(?,?,?,?,?,?,?)")
          .run(
            credential.id,
            session.userId!,
            name,
            credential.publicKey,
            credential.counter,
            JSON.stringify(credential.transports || []),
            Date.now(),
          );
        res.status(201).json({ verified: true });
      } catch {
        res.status(400).json({
          error:
            "Passkey konnte nicht bestätigt werden. Bitte erneut versuchen.",
        });
      }
    });
    app.post("/api/auth/passkeys/authentication/options", async (req, res) => {
      const reauthenticate = req.body.reauthenticate === true;
      const session = reauthenticate
        ? this.requireUser(req, res)
        : this.session(req, res);
      if (!session) return;
      const options = await generateAuthenticationOptions({
        rpID: this.rpID,
        userVerification: "required",
        ...(reauthenticate
          ? {
              allowCredentials: this.db
                .prepare("SELECT id,transports FROM passkeys WHERE userId=?")
                .all(session.userId!)
                .map((key) => ({
                  id: String(key.id),
                  transports: JSON.parse(String(key.transports)),
                })),
            }
          : {}),
      });
      this.saveChallenge(
        session,
        reauthenticate ? "reauthenticate" : "authenticate",
        options.challenge,
      );
      res.json(options);
    });
    app.post("/api/auth/passkeys/authentication/verify", async (req, res) => {
      const reauthenticate = req.body.reauthenticate === true;
      const session = reauthenticate
        ? this.requireUser(req, res)
        : this.session(req, res);
      if (!session) return;
      try {
        const challenge = this.takeChallenge(
          session,
          reauthenticate ? "reauthenticate" : "authenticate",
        );
        const response = req.body.response as AuthenticationResponseJSON;
        const passkey = this.db
          .prepare("SELECT * FROM passkeys WHERE id=?")
          .get(response.id) as unknown as Passkey | undefined;
        if (!passkey) throw new Error("Unknown credential");
        if (reauthenticate && passkey.userId !== session.userId)
          throw new Error("Wrong account");
        const user = this.db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(passkey.userId) as User;
        if (
          !response.response.userHandle ||
          response.response.userHandle !== user.webauthnId
        )
          throw new Error("Wrong user handle");
        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: this.origins,
          expectedRPID: this.rpID,
          requireUserVerification: true,
          credential: {
            id: passkey.id,
            publicKey: new Uint8Array(passkey.publicKey),
            counter: passkey.counter,
            transports: JSON.parse(passkey.transports) as string[],
          },
        });
        if (!verification.verified) throw new Error("Not verified");
        const changed = this.db
          .prepare("UPDATE passkeys SET counter=? WHERE id=? AND counter=?")
          .run(
            verification.authenticationInfo.newCounter,
            passkey.id,
            passkey.counter,
          );
        if (!changed.changes) throw new Error("Concurrent assertion");
        res.json(this.sessionView(this.rotate(req, res, user.id)));
      } catch {
        res.status(400).json({
          error:
            "Anmeldung mit Passkey fehlgeschlagen. Bitte erneut versuchen.",
        });
      }
    });
  }
}
