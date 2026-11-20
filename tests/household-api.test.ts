import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

test("HTTP household data requires auth, CSRF and explicit authorized scope", async () => {
  const dir = mkdtempSync(join(tmpdir(), "foody-households-"));
  const port = 39_000 + Math.floor(Math.random() * 10_000),
    origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, ["server/index.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      APP_ORIGIN: origin,
      DATA_DIR: dir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (b) => (output += b.toString()));
  try {
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        if ((await fetch(`${origin}/api/health`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal((await fetch(`${origin}/api/state`)).status, 401);
    async function client(name: string) {
      let cookie = "",
        csrf = "";
      async function request(
        path: string,
        method = "GET",
        body?: unknown,
        scope?: string,
        withCsrf = true,
      ) {
        const headers: Record<string, string> = { Origin: origin };
        if (cookie) headers.Cookie = cookie;
        if (withCsrf && csrf) headers["X-CSRF-Token"] = csrf;
        if (scope) headers["X-Household-Id"] = scope;
        if (body !== undefined) headers["Content-Type"] = "application/json";
        const res = await fetch(origin + path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const next = res.headers.get("set-cookie");
        if (next) cookie = next.split(";")[0];
        const value = res.status === 204 ? null : await res.json();
        if (value?.csrfToken) csrf = value.csrfToken;
        return { status: res.status, value };
      }
      await request("/api/session");
      assert.equal(
        (
          await request("/api/auth/register", "POST", {
            name,
            email: `${name}@example.com`,
            password: "a secure test password 123!",
          })
        ).status,
        201,
      );
      return request;
    }
    const alice = await client("alice"),
      bob = await client("bob");
    assert.equal((await alice("/api/state")).status, 409);
    assert.equal(
      (
        await alice(
          "/api/households",
          "POST",
          { name: "Home" },
          undefined,
          false,
        )
      ).status,
      403,
    );
    const a = (await alice("/api/households", "POST", { name: "Alice" })).value
      .household;
    const b = (await bob("/api/households", "POST", { name: "Bob" })).value
      .household;
    assert.equal((await bob("/api/state", "GET", undefined, a.id)).status, 404);
    assert.equal((await bob(`/api/households/${a.id}/members`)).status, 404);
    const op = {
      id: "same",
      opId: crypto.randomUUID(),
      kind: "check",
      baseRev: 0,
      data: { checked: true },
    };
    assert.equal(
      (await alice("/api/sync", "POST", { operations: [op] }, a.id)).status,
      200,
    );
    assert.equal(
      (await bob("/api/state", "GET", undefined, b.id)).value.rows.length,
      0,
    );
    const invitation = (
      await alice(`/api/households/${a.id}/invitations`, "POST", {
        email: "bob@example.com",
      })
    ).value;
    assert.equal(
      (
        await bob("/api/household-memberships", "POST", {
          token: invitation.token,
        })
      ).status,
      201,
    );
    assert.equal(
      (await bob("/api/state", "GET", undefined, a.id)).value.rows.length,
      1,
    );
    // A different selected household must not redirect explicitly scoped requests.
    await bob(`/api/households/${b.id}/selection`, "POST", {});
    assert.equal(
      (await bob("/api/state", "GET", undefined, a.id)).value.rows.length,
      1,
    );
    assert.equal(
      (
        await alice(
          `/api/households/${a.id}/members/${(await bob("/api/session")).value.user.id}`,
          "DELETE",
        )
      ).status,
      204,
    );
    assert.equal((await bob("/api/state", "GET", undefined, a.id)).status, 404);
    assert.equal(
      (
        await bob("/api/household-memberships", "POST", {
          token: invitation.token,
        })
      ).status,
      400,
    );
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
