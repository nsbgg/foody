import type { Express } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpAccessService, connectionSchema } from "./mcp-access.ts";
import { createFoodyMcp } from "./mcp-tools.ts";
import type { AccountService } from "./accounts.ts";
import type { HouseholdService } from "./households.ts";
import type { Store } from "./store.ts";

export function installMcpTransport(
  app: Express,
  access: McpAccessService,
  store: Store,
) {
  const limits = new Map<string, { count: number; until: number }>();
  app.all("/api/mcp", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const identity = access.authenticate(req.get("Authorization"));
    if (!identity) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="Foody MCP"');
      res.status(401).json({
        error: "MCP-Schlüssel fehlt, ist abgelaufen oder wurde widerrufen.",
      });
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).end();
      return;
    }
    const now = Date.now();
    for (const [key, bucket] of limits)
      if (bucket.until <= now) limits.delete(key);
    const bucket = limits.get(identity.userId) ?? {
      count: 0,
      until: now + 60_000,
    };
    limits.set(identity.userId, bucket);
    if (++bucket.count > 120) {
      res.setHeader("Retry-After", Math.ceil((bucket.until - now) / 1000));
      res.status(429).json({ error: "Zu viele MCP-Anfragen." });
      return;
    }
    const server = createFoodyMcp(store, identity);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res.status(500).json({ error: "MCP-Anfrage fehlgeschlagen." });
    }
  });
}

export function installMcpManagement(
  app: Express,
  accounts: AccountService,
  households: HouseholdService,
  access: McpAccessService,
) {
  const scope = (
    req: Parameters<AccountService["requireUser"]>[0],
    res: Parameters<AccountService["requireUser"]>[1],
  ) => {
    const session = accounts.requireUser(req, res)!;
    const householdId = req.get("X-Household-Id");
    if (!householdId || householdId.length > 100) {
      res.status(409).json({ error: "Bitte zuerst einen Haushalt auswählen." });
      return null;
    }
    households.requireMember(session.userId!, householdId);
    return { userId: session.userId!, householdId };
  };
  app.get("/api/mcp-connections", (req, res) => {
    const identity = scope(req, res);
    if (identity)
      res.json({
        connections: access.list(identity.userId, identity.householdId),
      });
  });
  app.post("/api/mcp-connections", (req, res) => {
    const identity = scope(req, res);
    if (!identity) return;
    const session = accounts.requireUser(req, res)!;
    if (Date.now() - session.authenticatedAt > 10 * 60_000) {
      res.status(403).json({
        error: "Bitte erneut anmelden, um einen KI-Zugriff freizugeben.",
        code: "reauth_required",
      });
      return;
    }
    const parsed = connectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          "Bitte Namen, Berechtigungen und eine Laufzeit von 1 bis 90 Tagen oder unbegrenzt wählen.",
      });
      return;
    }
    res
      .status(201)
      .json(access.create(identity.userId, identity.householdId, parsed.data));
  });
  app.delete("/api/mcp-connections/:id", (req, res) => {
    const identity = scope(req, res);
    if (!identity) return;
    access.revoke(identity.userId, identity.householdId, String(req.params.id));
    res.status(204).end();
  });
}
