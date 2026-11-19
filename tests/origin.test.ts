import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import {
  allowedHosts,
  trustedHost,
  trustedApiRequest,
} from "../server/origin.ts";

const local = allowedHosts();

test("HTTP server enforces origins and returns accurate JSON body errors", async (t) => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const directory = await mkdtemp(join(tmpdir(), "foodie-origin-test-"));
  const server = spawn(process.execPath, ["server/index.ts"], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: directory,
      ALLOWED_HOSTS: "kitchen.example",
    },
    stdio: "ignore",
  });
  t.after(async () => {
    if (server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  const end = Date.now() + 8000;
  while (true) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    assert.equal(server.exitCode, null, "test server exited during startup");
    assert.ok(Date.now() < end, "test server startup timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const document = await fetch(base);
  assert.equal(document.headers.get("x-frame-options"), "DENY");
  assert.equal(
    document.headers.get("content-security-policy"),
    "frame-ancestors 'none'",
  );
  await document.arrayBuffer();
  const foreignImport = await fetch(`${base}/api/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://attacker.example",
    },
    body: JSON.stringify({ url: "http://127.0.0.1" }),
  });
  assert.equal(foreignImport.status, 403);
  await foreignImport.arrayBuffer();
  const privateImport = await fetch(`${base}/api/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1" }),
  });
  assert.equal(privateImport.status, 422);
  assert.deepEqual(await privateImport.json(), {
    error: "Diese Adresse ist keine öffentliche Rezeptseite.",
  });
  const status = (headers: Record<string, string | undefined>) =>
    new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${base}/api/state`, { headers }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      req.on("error", reject);
      req.end();
    });
  for (const headers of [
    { Host: `rebind.invalid:${port}`, Origin: `http://rebind.invalid:${port}` },
    { Host: `127.0.0.1:${port}`, Origin: "null" },
    { Host: `127.0.0.1:${port}`, Origin: "malformed" },
    { Host: `rebind.invalid:${port}`, "X-Forwarded-Host": "kitchen.example" },
  ]) {
    assert.equal(await status(headers), 403, JSON.stringify(headers));
  }
  assert.equal(
    await status({
      Host: "kitchen.example",
      Origin: "https://kitchen.example",
    }),
    200,
  );
  const post = (body: string) =>
    fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  assert.equal((await post("{")).status, 400);
  assert.equal(
    (await post(JSON.stringify({ padding: "x".repeat(8_500_000) }))).status,
    413,
  );
  const result = await post(
    JSON.stringify({
      operations: [
        {
          opId: randomUUID(),
          id: randomUUID(),
          kind: "recipe",
          baseRev: 0,
          data: {
            title: "Unicode fixture",
            description: "",
            servings: 2,
            minutes: 1,
            ingredients: [],
            steps: Array.from({ length: 200 }, () => "字".repeat(5000)),
            image: "",
            source: "",
            category: "Test",
            archived: false,
          },
        },
      ],
    }),
  );
  assert.equal(
    result.status,
    200,
    "schema-valid Unicode recipe exceeds old 2 MB limit",
  );
  await result.arrayBuffer();
});

test("permits loopback access, test server and the existing Vite proxy", () => {
  for (const [host, origin] of [
    ["127.0.0.1:4307", undefined],
    ["localhost:3002", "http://localhost:3002"],
    ["localhost:5173", "http://localhost:5173"],
    ["127.0.0.1:5173", "http://127.0.0.1:5173"],
    ["[::1]:4307", "http://[::1]:4307"],
  ])
    assert.equal(trustedApiRequest(host, origin, local), true, String(host));
});

test("rejects matching attacker Host and Origin, including absent Origin", () => {
  assert.equal(
    trustedApiRequest(
      "rebind.invalid:4307",
      "http://rebind.invalid:4307",
      local,
    ),
    false,
  );
  assert.equal(
    trustedApiRequest("rebind.invalid:4307", undefined, local),
    false,
  );
  assert.equal(trustedHost("192.168.1.5:4307", local), false);
});

test("allows only explicitly configured LAN and reverse-proxy hostnames", () => {
  const hosts = allowedHosts(" kitchen.example, 192.168.1.5, [fd00::5] ");
  assert.equal(
    trustedApiRequest("kitchen.example", "https://kitchen.example", hosts),
    true,
  );
  assert.equal(
    trustedApiRequest("192.168.1.5:4307", "http://192.168.1.5:4307", hosts),
    true,
  );
  assert.equal(trustedHost("[fd00::5]:4307", hosts), true);
  assert.equal(trustedHost("other.kitchen.example", hosts), false);
  // Forwarded host headers are never inputs to this boundary.
  assert.equal(
    trustedApiRequest("rebind.invalid", "https://kitchen.example", hosts),
    false,
  );
});

test("rejects null, malformed, foreign, credentialed and wrong-port origins", () => {
  for (const origin of [
    "null",
    "",
    "not a URL",
    "file://localhost",
    "http://localhost:3002/path",
    "http://localhost:3002?query",
    "http://localhost:3002#fragment",
    "http://user:pass@localhost:3002",
    "http://foreign.example:3002",
    "http://localhost:5173",
    "http://127.0.0.1:3002",
  ])
    assert.equal(
      trustedApiRequest("localhost:3002", origin, local),
      false,
      origin,
    );
});

test("rejects malformed or missing host headers", () => {
  for (const host of [
    undefined,
    "",
    "localhost/path",
    "localhost@evil.example",
    "localhost:bad",
    "localhost:3002\\evil",
    " localhost",
  ])
    assert.equal(trustedHost(host, local), false, String(host));
});

test("normalizes host case and default ports while rejecting invalid configuration", () => {
  const hosts = allowedHosts("KITCHEN.EXAMPLE");
  assert.equal(
    trustedApiRequest("KITCHEN.EXAMPLE:443", "https://kitchen.example", hosts),
    true,
  );
  assert.equal(
    trustedApiRequest("localhost:80", "http://localhost", hosts),
    true,
  );
  for (const config of [
    "https://kitchen.example",
    "*.example",
    "localhost:4307",
    "localhost:80",
    "kitchen.example/path",
  ])
    assert.throws(() => allowedHosts(config));
});
