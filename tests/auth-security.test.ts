import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  AccountService,
  passwordHash,
  passwordMatches,
} from "../server/accounts.ts";

async function fixture() {
  const service = new AccountService(":memory:");
  const app = express();
  app.use(express.json());
  service.install(app);
  app.get("/private", (req, res) => {
    const session = service.requireUser(req, res);
    if (session) res.json({ userId: session.userId });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let cookie = "",
    csrfToken = "";
  async function request(
    path: string,
    body?: unknown,
    overrides: Record<string, string> = {},
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-CSRF-Token": csrfToken,
        ...overrides,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const data = await response.json();
    if (data.csrfToken) csrfToken = data.csrfToken;
    return { status: response.status, data, cookie, headers: response.headers };
  }
  return {
    service,
    request,
    close: () => {
      server.closeAllConnections();
      server.close();
      service.db.close();
    },
  };
}
const credentials = {
  name: "Test User",
  email: "test@example.com",
  password: "a-secure-password-123",
};

test("passwords use random salted scrypt and reject wrong passwords", async () => {
  const first = await passwordHash(credentials.password),
    second = await passwordHash(credentials.password);
  assert.notEqual(first, second);
  assert.ok(await passwordMatches(credentials.password, first));
  assert.equal(await passwordMatches("wrong", first), false);
});
test("anonymous bootstrap, CSRF, session rotation, generic login and logout", async () => {
  const f = await fixture();
  try {
    const initial = await f.request("/api/session");
    assert.equal(initial.data.user, null);
    assert.match(initial.headers.get("set-cookie") || "", /HttpOnly/i);
    assert.equal((await f.request("/private")).status, 401);
    assert.equal(
      (
        await f.request("/api/auth/register", credentials, {
          "X-CSRF-Token": "",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request("/api/auth/register", credentials, {
          "X-CSRF-Token": "ü".repeat(43),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request("/api/auth/register", credentials, {
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );
    const registered = await f.request("/api/auth/register", credentials);
    assert.equal(registered.status, 201);
    assert.notEqual(registered.cookie, initial.cookie);
    assert.equal((await f.request("/private")).status, 200);
    const stored = f.service.db
      .prepare("SELECT * FROM sessions WHERE userId IS NOT NULL")
      .get()!;
    assert.ok(!registered.cookie.includes(String(stored.id)));
    const loggedOut = await f.request("/api/auth/logout", {});
    assert.equal(loggedOut.data.user, null);
    assert.equal((await f.request("/private")).status, 401);
    const unknown = await f.request("/api/auth/login", {
      email: "unknown@example.com",
      password: credentials.password,
    });
    const wrong = await f.request("/api/auth/login", {
      email: credentials.email,
      password: "wrong",
    });
    assert.deepEqual(wrong.data, unknown.data);
    assert.equal(wrong.status, 401);
    assert.equal((await f.request("/api/auth/login", credentials)).status, 200);
  } finally {
    f.close();
  }
});
test("passkey challenges are single use, session and purpose bound, expiring", async () => {
  const f = await fixture();
  try {
    await f.request("/api/session");
    await f.request("/api/auth/register", credentials);
    const options = await f.request(
      "/api/auth/passkeys/registration/options",
      {},
    );
    assert.equal(options.status, 200);
    assert.equal(
      options.data.authenticatorSelection.userVerification,
      "required",
    );
    assert.equal(options.data.authenticatorSelection.residentKey, "required");
    assert.equal(
      (
        await f.request("/api/auth/passkeys/authentication/verify", {
          response: {},
        })
      ).status,
      400,
    );
    assert.equal(
      Number(
        f.service.db
          .prepare(
            "SELECT count(*) AS n FROM challenges WHERE purpose='register'",
          )
          .get()!.n,
      ),
      1,
    );
    assert.equal(
      (
        await f.request("/api/auth/passkeys/registration/verify", {
          response: {},
        })
      ).status,
      400,
    );
    assert.equal(
      Number(
        f.service.db.prepare("SELECT count(*) AS n FROM challenges").get()!.n,
      ),
      0,
    );
    await f.request("/api/auth/passkeys/authentication/options", {});
    f.service.db.prepare("UPDATE challenges SET expiresAt=0").run();
    assert.equal(
      (
        await f.request("/api/auth/passkeys/authentication/verify", {
          response: {},
        })
      ).status,
      400,
    );
    assert.equal(
      Number(
        f.service.db.prepare("SELECT count(*) AS n FROM challenges").get()!.n,
      ),
      0,
    );
    f.service.db.prepare("UPDATE sessions SET authenticatedAt=0").run();
    assert.equal(
      (await f.request("/api/auth/passkeys/registration/options", {})).status,
      403,
    );
  } finally {
    f.close();
  }
});
test("auth limits persist in database and untrusted RP origins are rejected", async () => {
  const f = await fixture();
  try {
    await f.request("/api/session");
    for (let i = 0; i < 15; i++)
      await f.request("/api/auth/login", {
        email: credentials.email,
        password: "",
      });
    assert.equal(
      (
        await f.request("/api/auth/login", {
          email: credentials.email,
          password: "",
        })
      ).status,
      429,
    );
    assert.throws(
      () => new AccountService(":memory:", { origin: "http://example.com" }),
    );
    assert.throws(
      () =>
        new AccountService(":memory:", {
          origin: "https://app.example.com",
          rpID: "evil.com",
        }),
    );
  } finally {
    f.close();
  }
});

test("session bootstrap removes a household selection after membership revocation", async () => {
  const f = await fixture();
  try {
    await f.request("/api/session");
    await f.request("/api/auth/register", credentials);
    f.service.setHouseholdGetter(() => [
      { id: "household", name: "Home", role: "member" },
    ]);
    f.service.db
      .prepare(
        "UPDATE sessions SET activeHouseholdId='household' WHERE userId IS NOT NULL",
      )
      .run();
    const selected = await f.request("/api/session");
    assert.equal(selected.data.activeHouseholdId, "household");
    assert.ok(selected.data.expiresAt > Date.now());
    f.service.setHouseholdGetter(() => []);
    const revoked = await f.request("/api/session");
    assert.equal(revoked.data.activeHouseholdId, null);
    assert.equal(
      f.service.db
        .prepare(
          "SELECT activeHouseholdId FROM sessions WHERE userId IS NOT NULL",
        )
        .get()!.activeHouseholdId,
      null,
    );
  } finally {
    f.close();
  }
});

test("authenticated bootstrap reads do not consume anonymous allocation limits", async () => {
  const f = await fixture();
  try {
    await f.request("/api/session");
    await f.request("/api/auth/register", credentials);
    const initial = Number(
      f.service.db
        .prepare("SELECT count FROM auth_limits WHERE key LIKE 'session:ip:%'")
        .get()!.count,
    );
    await f.request("/api/session");
    await f.request("/api/session");
    assert.equal(
      Number(
        f.service.db
          .prepare(
            "SELECT count FROM auth_limits WHERE key LIKE 'session:ip:%'",
          )
          .get()!.count,
      ),
      initial,
    );
    assert.equal(
      Number(
        f.service.db
          .prepare(
            "SELECT count FROM auth_limits WHERE key LIKE 'session:user:%'",
          )
          .get()!.count,
      ),
      2,
    );
    // An untrusted or fabricated cookie never selects a user-specific bucket.
    await f.request("/api/session", undefined, {
      Cookie: `foody_session=${"x".repeat(43)}`,
    });
    assert.equal(
      Number(
        f.service.db
          .prepare(
            "SELECT count FROM auth_limits WHERE key LIKE 'session:ip:%'",
          )
          .get()!.count,
      ),
      initial + 1,
    );
  } finally {
    f.close();
  }
});

test("authenticated passkey metadata does not consume login attempts behind a shared IP", async () => {
  const f = await fixture();
  try {
    await f.request("/api/session");
    await f.request("/api/auth/register", credentials);
    const count = () =>
      Number(
        f.service.db
          .prepare("SELECT count FROM auth_limits WHERE key LIKE 'auth:ip:%'")
          .get()!.count,
      );
    const before = count();
    assert.equal((await f.request("/api/auth/passkeys")).status, 200);
    assert.equal((await f.request("/api/auth/passkeys")).status, 200);
    assert.equal(count(), before);
    assert.equal(
      Number(
        f.service.db
          .prepare(
            "SELECT count FROM auth_limits WHERE key LIKE 'management:user:%'",
          )
          .get()!.count,
      ),
      2,
    );
    await f.request("/api/auth/passkeys/authentication/options", {});
    assert.equal(count(), before + 1);
  } finally {
    f.close();
  }
});

test("rejected protected and CSRF requests cannot bypass the session allocation limit", async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 120; i++)
      assert.equal(
        (await f.request("/api/session", undefined, { Cookie: "" })).status,
        200,
      );
    assert.equal(
      (await f.request("/api/session", undefined, { Cookie: "" })).status,
      429,
    );
    const count = () =>
      Number(
        f.service.db.prepare("SELECT count(*) AS n FROM sessions").get()!.n,
      );
    const before = count();
    for (const Cookie of ["", `foody_session=${"x".repeat(43)}`]) {
      const denied = await f.request("/private", undefined, { Cookie });
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.get("set-cookie"), null);
      const csrf = await f.request("/api/auth/login", credentials, { Cookie });
      assert.equal(csrf.status, 403);
      assert.equal(csrf.headers.get("set-cookie"), null);
    }
    assert.equal(count(), before);
  } finally {
    f.close();
  }
});

test("logout revokes the session despite exhausted read, bootstrap and login limits", async () => {
  const f = await fixture();
  try {
    await f.request("/api/session");
    const registered = await f.request("/api/auth/register", credentials);
    for (let i = 0; i < 120; i++)
      assert.equal((await f.request("/api/auth/passkeys")).status, 200);
    assert.equal((await f.request("/api/auth/passkeys")).status, 429);
    f.service.db.prepare("UPDATE auth_limits SET count=999").run();
    const invalid = await f.request(
      "/api/auth/logout",
      {},
      { "X-CSRF-Token": "" },
    );
    assert.equal(invalid.status, 403);
    assert.equal((await f.request("/private")).status, 200);
    const loggedOut = await f.request("/api/auth/logout", {});
    assert.equal(loggedOut.status, 200);
    assert.equal(loggedOut.data.user, null);
    const replay = await f.request("/private", undefined, {
      Cookie: registered.cookie,
    });
    assert.equal(replay.status, 401);
    assert.equal(replay.headers.get("set-cookie"), null);
    const before = f.service.db
      .prepare("SELECT count(*) AS n FROM sessions")
      .get()!.n;
    assert.equal((await f.request("/api/auth/logout", {})).status, 401);
    assert.equal(
      f.service.db.prepare("SELECT count(*) AS n FROM sessions").get()!.n,
      before,
    );
  } finally {
    f.close();
  }
});
