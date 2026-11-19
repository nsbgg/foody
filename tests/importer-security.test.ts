import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";
import { Agent, Response } from "undici";
import {
  createRecipeFetcher,
  extractRecipe,
  ImportError,
} from "../server/importer.ts";

const publicIp = { address: "8.8.8.8", family: 4 };
type Address = typeof publicIp;
function setup({
  resolve = async (_host: string) => [publicIp],
  respond = async () =>
    new Response("<html></html>", { headers: { "content-type": "text/html" } }),
  timeoutMs = 1000,
}: {
  resolve?: (host: string) => Promise<Address[]>;
  respond?: (url: string, signal: AbortSignal) => Promise<Response>;
  timeoutMs?: number;
} = {}) {
  const pins: Address[] = [];
  const requests: { url: string; signal: AbortSignal }[] = [];
  const state = { destroyed: 0, created: 0 };
  const fetcher = createRecipeFetcher({
    resolve,
    timeoutMs,
    createAgent(options) {
      assert.ok(options.connect && typeof options.connect === "object");
      assert.ok("autoSelectFamily" in options.connect);
      assert.equal(options.connect.autoSelectFamily, false);
      assert.ok("lookup" in options.connect);
      assert.ok(options.connect.lookup);
      // Exercise the actual lookup callback supplied by production logic. The
      // hostname is deliberately different: the callback must use the pinned IP.
      const lookup = options.connect.lookup as (
        hostname: string,
        options: object,
        callback: (
          error: Error | null,
          address: string,
          family: number,
        ) => void,
      ) => void;
      lookup("rebound.example", {}, (error, address, family) => {
        assert.equal(error, null);
        pins.push({ address, family });
      });
      const agent = new Agent(options);
      mock.method(agent, "destroy", async () => {
        state.destroyed++;
      });
      mock.method(agent, "close", async () => {
        assert.fail("Graceful close must not wait on an unread response body");
      });
      state.created++;
      return agent;
    },
    request: async (url, options) => {
      assert.equal(options?.redirect, "manual");
      assert.ok(options?.dispatcher);
      assert.ok(options.signal);
      const signal = options.signal;
      requests.push({ url: String(url), signal });
      return respond(String(url), signal);
    },
  });
  return { fetcher, pins, requests, state };
}
function streamingResponse({
  status = 200,
  type = "text/html",
  location,
  bytes,
}: {
  status?: number;
  type?: string;
  location?: string;
  bytes?: number;
} = {}) {
  const state = { cancelled: 0 };
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        if (bytes) controller.enqueue(new Uint8Array(bytes));
      },
      cancel() {
        state.cancelled++;
        // Deliberately never resolves: cancellation must not prolong the import.
        return new Promise<void>(() => {});
      },
    }),
    {
      status,
      headers: { "content-type": type, ...(location ? { location } : {}) },
    },
  );
  return { response, state };
}

test("all DNS answers must be public, including mixed and IPv4-mapped results", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:192.168.1.1",
  ]) {
    const h = setup({
      resolve: async () => [
        publicIp,
        { address, family: address.includes(":") ? 6 : 4 },
      ],
    });
    await assert.rejects(h.fetcher("https://recipe.example/"), ImportError);
    assert.equal(h.state.created, 0);
    assert.equal(h.requests.length, 0);
  }
});

test("URL restrictions are checked before DNS and again after redirect", async () => {
  for (const url of [
    "file:///recipe",
    "https://name:password@recipe.example/",
    "https://recipe.example:8080/",
  ]) {
    const h = setup({
      resolve: async () => assert.fail("Invalid URLs must not resolve DNS"),
    });
    await assert.rejects(h.fetcher(url), ImportError);
  }
  const redirect = streamingResponse({
    status: 302,
    location: "http://recipe.example:8080/",
  });
  const h = setup({ respond: async () => redirect.response });
  await assert.rejects(h.fetcher("https://recipe.example/"), /HTTP/);
  assert.equal(h.requests.length, 1);
  assert.equal(redirect.state.cancelled, 1);
  assert.equal(h.state.destroyed, 1);
});

test("redirects resolve and validate anew while each actual connection stays pinned", async () => {
  const resolved: string[] = [];
  const first = streamingResponse({
    status: 302,
    location: "https://other.example/next",
  });
  const h = setup({
    resolve: async (host) => {
      resolved.push(host);
      return [
        resolved.length === 1 ? publicIp : { address: "1.1.1.1", family: 4 },
      ];
    },
    respond: async (url) =>
      url.includes("other.example")
        ? new Response("recipe", {
            headers: { "content-type": "Text/HTML; charset=utf-8" },
          })
        : first.response,
  });
  assert.deepEqual(await h.fetcher("https://recipe.example/start"), {
    html: "recipe",
    url: "https://other.example/next",
  });
  assert.deepEqual(resolved, ["recipe.example", "other.example"]);
  assert.deepEqual(h.pins, [publicIp, { address: "1.1.1.1", family: 4 }]);
  assert.equal(h.requests[0].signal, h.requests[1].signal);
  assert.equal(first.state.cancelled, 1);
  assert.equal(h.state.destroyed, 2);
});

test("redirect to a private address is blocked before its request", async () => {
  const redirect = streamingResponse({
    status: 302,
    location: "http://private.example/",
  });
  const h = setup({
    resolve: async (host) => [
      host === "private.example"
        ? { address: "192.168.1.1", family: 4 }
        : publicIp,
    ],
    respond: async () => redirect.response,
  });
  await assert.rejects(h.fetcher("https://recipe.example/"), /öffentliche/);
  assert.equal(h.requests.length, 1);
  assert.equal(h.state.destroyed, 1);
  assert.equal(redirect.state.cancelled, 1);
});

test("slow DNS is bounded by the whole-operation deadline", async () => {
  const h = setup({ timeoutMs: 20, resolve: () => new Promise(() => {}) });
  await assert.rejects(
    h.fetcher("https://recipe.example/"),
    (error) => error instanceof ImportError && /zu lange/.test(error.message),
  );
  assert.equal(h.state.created, 0);
});

test("DNS time from earlier redirects consumes the same operation budget", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const redirect = streamingResponse({ status: 302, location: "/next" });
  const h = setup({
    timeoutMs: 100,
    resolve: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return [publicIp];
    },
    respond: async () => redirect.response,
  });
  const rejected = assert.rejects(
    h.fetcher("https://recipe.example/"),
    /zu lange/,
  );
  t.mock.timers.tick(60);
  // Let the first response, dispatcher teardown and second DNS lookup start.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.requests.length, 1);
  t.mock.timers.tick(40);
  await rejected;
  assert.equal(h.requests.length, 1);
  assert.equal(h.state.destroyed, 1);
  assert.equal(redirect.state.cancelled, 1);
});

test("a stalled request is aborted and its dispatcher destroyed at the deadline", async () => {
  const h = setup({ timeoutMs: 20, respond: () => new Promise(() => {}) });
  await assert.rejects(h.fetcher("https://recipe.example/"), /zu lange/);
  assert.ok(h.requests[0].signal.aborted);
  assert.equal(h.state.destroyed, 1);
});

test("the same deadline covers redirects and a stalled response body", async () => {
  const responses = [
    streamingResponse({ status: 302, location: "/next" }),
    streamingResponse(),
  ];
  let index = 0;
  const h = setup({
    timeoutMs: 30,
    respond: async () => responses[index++].response,
  });
  await assert.rejects(h.fetcher("https://recipe.example/"), /zu lange/);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].signal, h.requests[1].signal);
  assert.ok(h.requests[0].signal.aborted);
  assert.deepEqual(
    responses.map((r) => r.state.cancelled),
    [1, 1],
  );
  assert.equal(h.state.destroyed, 2);
});

test("non-OK and unsupported responses cancel bodies and destroy dispatchers promptly", async () => {
  for (const options of [
    { status: 503 },
    { type: "application/json" },
    { type: "text/html-not-really" },
  ]) {
    const stream = streamingResponse(options);
    const h = setup({ respond: async () => stream.response });
    await assert.rejects(h.fetcher("https://recipe.example/"), ImportError);
    assert.equal(stream.state.cancelled, 1);
    assert.equal(h.state.destroyed, 1);
  }
});

test("oversized bodies are cancelled and cannot hold a dispatcher open", async () => {
  const stream = streamingResponse({ bytes: 2_000_001 });
  const h = setup({ respond: async () => stream.response });
  await assert.rejects(h.fetcher("https://recipe.example/"), /zu groß/);
  assert.equal(stream.state.cancelled, 1);
  assert.equal(h.state.destroyed, 1);
});

test("redirect budget is finite and every discarded body is cleaned up", async () => {
  const streams: ReturnType<typeof streamingResponse>[] = [];
  const h = setup({
    respond: async () => {
      const stream = streamingResponse({ status: 302, location: "/again" });
      streams.push(stream);
      return stream.response;
    },
  });
  await assert.rejects(
    h.fetcher("https://recipe.example/"),
    /Zu viele Weiterleitungen/,
  );
  assert.equal(h.requests.length, 5);
  assert.equal(h.state.destroyed, 5);
  assert.ok(streams.every((r) => r.state.cancelled === 1));
});

test("DNS, transport and parser internals are never exposed as public errors", async () => {
  const internal = "synthetic internal resolver detail";
  for (const overrides of [
    {
      resolve: async () => {
        throw new Error(internal);
      },
    },
    {
      respond: async () => {
        throw new Error(internal);
      },
    },
  ]) {
    const h = setup(overrides);
    await assert.rejects(
      h.fetcher("https://recipe.example/"),
      (error) =>
        error instanceof ImportError && !error.message.includes(internal),
    );
    assert.equal(h.state.destroyed, h.state.created);
  }
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", recipeIngredient: [null] })}</script>`;
  assert.throws(
    () => extractRecipe(html, "https://recipe.example/"),
    (error) =>
      error instanceof ImportError && /manuell ergänzen/.test(error.message),
  );
});
