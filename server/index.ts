import express from "express";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { operationSchema, type Operation } from "../shared/domain.ts";
import { seedRows } from "../shared/seed.ts";
import { Store } from "./store.ts";
import { ImportError } from "./importer.ts";
import { importRecipe } from "./recipe-import.ts";
import { allowedHosts, trustedHost, trustedApiRequest } from "./origin.ts";
import { AccountService } from "./accounts.ts";
import { HouseholdService, HouseholdError } from "./households.ts";
import { McpAccessService } from "./mcp-access.ts";
import { installMcpTransport, installMcpManagement } from "./mcp.ts";
import {
  RecipeSharingService,
  RecipeSharingError,
  installPublicRecipeSharing,
  installRecipeSharing,
} from "./recipe-sharing.ts";
const hosts = allowedHosts(process.env.ALLOWED_HOSTS);
mkdirSync(process.env.DATA_DIR || "data", { recursive: true });
const store = new Store(
  resolve(process.env.DATA_DIR || "data", "foodie.sqlite"),
  seedRows(),
);
const app = express();
const accounts = new AccountService(
  resolve(process.env.DATA_DIR || "data", "accounts.sqlite"),
  {
    origin: process.env.APP_ORIGIN,
    rpID: process.env.WEBAUTHN_RP_ID,
  },
);
const households = new HouseholdService(accounts.db);
accounts.setHouseholdGetter((userId) => households.list(userId));
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), screen-wake-lock=(self)",
  );
  if (!trustedHost(req.headers.host, hosts)) {
    res
      .status(403)
      .json({ error: "Diese Serveradresse ist nicht freigegeben." });
    return;
  }
  if (req.path.startsWith("/api")) {
    res.setHeader("Cache-Control", "no-store");
    if (!trustedApiRequest(req.headers.host, req.headers.origin, hosts)) {
      res.status(403).json({ error: "Fremde Herkunft ist nicht erlaubt." });
      return;
    }
  }
  next();
});
app.use(express.json({ limit: "8mb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
accounts.install(app);
const recipeSharing = new RecipeSharingService(accounts.db, households, store);
installPublicRecipeSharing(app, recipeSharing, accounts);
const mcpAccess = new McpAccessService(accounts.db, households);
installMcpTransport(app, mcpAccess, store);
const apiLimit = new Map<string, { count: number; until: number }>();
app.use("/api", (req, res, next) => {
  const session = accounts.requireUser(req, res);
  if (!session) return;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !accounts.csrf(req, res)
  )
    return;
  const now = Date.now();
  for (const [key, bucket] of apiLimit)
    if (bucket.until <= now) apiLimit.delete(key);
  const bucket = apiLimit.get(session.userId!) || {
    count: 0,
    until: now + 60_000,
  };
  apiLimit.set(session.userId!, bucket);
  if (++bucket.count > 240) {
    res.setHeader("Retry-After", Math.ceil((bucket.until - now) / 1000));
    res.status(429).json({
      error: "Zu viele Anfragen. Bitte kurz warten.",
      code: "rate_limit",
    });
    return;
  }
  next();
});
installMcpManagement(app, accounts, households, mcpAccess);
installRecipeSharing(app, recipeSharing, accounts, households);
app.get("/api/households", (req, res) => {
  const session = accounts.requireUser(req, res)!;
  res.json({ households: households.list(session.userId!) });
});
app.post("/api/households", (req, res) => {
  const session = accounts.requireUser(req, res)!;
  const parsed = z
    .object({ name: z.string().trim().min(1).max(80) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Bitte einen Haushaltsnamen mit höchstens 80 Zeichen eingeben.",
      code: "validation_error",
    });
    return;
  }
  const household = households.create(session.userId!, parsed.data.name);
  accounts.setActiveHousehold(session, household.id);
  res
    .location(`/api/households/${household.id}`)
    .status(201)
    .json({ household });
});
app.post("/api/households/:id/selection", (req, res) => {
  const session = accounts.requireUser(req, res)!;
  households.requireMember(session.userId!, req.params.id);
  accounts.setActiveHousehold(session, req.params.id);
  res.json(accounts.sessionView(session));
});
app.get("/api/households/:id/members", (req, res) => {
  const session = accounts.requireUser(req, res)!;
  res.json({ members: households.members(session.userId!, req.params.id) });
});
app.post("/api/households/:id/invitations", (req, res) => {
  const session = accounts.requireUser(req, res)!;
  households.requireMember(session.userId!, req.params.id, true);
  const parsed = z
    .object({
      email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Bitte eine gültige E-Mail-Adresse eingeben.",
      code: "validation_error",
    });
    return;
  }
  const result = households.invite(
    session.userId!,
    req.params.id,
    parsed.data.email,
  );
  res
    .location(
      `/api/households/${req.params.id}/invitations/${result.invitation.id}`,
    )
    .status(201)
    .json(result);
});
app.delete("/api/households/:id/invitations/:invitationId", (req, res) => {
  const session = accounts.requireUser(req, res)!;
  households.revoke(session.userId!, req.params.id, req.params.invitationId);
  res.status(204).end();
});
app.post("/api/household-memberships", (req, res) => {
  const session = accounts.requireUser(req, res)!;
  const parsed = z
    .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Bitte einen gültigen Einladungscode eingeben.",
      code: "invalid_invitation",
    });
    return;
  }
  const household = households.join(session.userId!, parsed.data.token);
  accounts.setActiveHousehold(session, household.id);
  res.status(201).json({ household });
});
app.delete("/api/households/:id/members/:userId", (req, res) => {
  const session = accounts.requireUser(req, res)!;
  households.removeMember(session.userId!, req.params.id, req.params.userId);
  res.status(204).end();
});
// Explicit scope prevents one tab's selection from redirecting another tab's outbox.
app.use(["/api/state", "/api/sync", "/api/import"], (req, res, next) => {
  const session = accounts.requireUser(req, res)!;
  const scope = req.get("X-Household-Id");
  if (!scope || scope.length > 100) {
    res.status(409).json({
      error: "Bitte zuerst einen Haushalt auswählen.",
      code: "selection_required",
    });
    return;
  }
  households.requireMember(session.userId!, scope);
  res.locals.householdId = scope;
  next();
});
app.get("/api/state", (_req, res) =>
  res.json({ rows: store.rows(res.locals.householdId) }),
);
app.post("/api/sync", (req, res) => {
  const parsed = z
    .object({ operations: z.array(operationSchema).max(100) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültige Änderungen." });
    return;
  }
  const results = parsed.data.operations.map((op) =>
    store.apply(op as Operation, res.locals.householdId),
  );
  res.json({ results, rows: store.rows(res.locals.householdId) });
});
let imports = 0;
app.post("/api/import", async (req, res) => {
  const parsed = z.object({ url: z.url().max(2000) }).safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Bitte eine gültige Rezeptadresse eingeben." });
    return;
  }
  if (imports >= 3) {
    res.status(429).json({
      error: "Gerade laufen mehrere Importe. Bitte gleich erneut versuchen.",
    });
    return;
  }
  imports++;
  try {
    res.json({ recipe: await importRecipe(parsed.data.url) });
  } catch (error) {
    res.status(422).json({
      error:
        error instanceof ImportError
          ? error.message
          : "Import fehlgeschlagen. Bitte die Rezeptadresse prüfen und erneut versuchen.",
    });
  } finally {
    imports--;
  }
});
app.use(express.static(resolve("dist")));
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Nicht gefunden." });
    return;
  }
  res.sendFile(resolve("dist/index.html"));
});
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (
      error instanceof HouseholdError ||
      error instanceof RecipeSharingError
    ) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      (error.status === 400 || error.status === 413)
        ? error.status
        : 500;
    if (status === 500) console.error("Foody: Anfrage fehlgeschlagen (500).");
    res.status(status).json({
      error:
        status === 413
          ? "Die Anfrage ist zu groß. Bitte weniger Änderungen zugleich senden."
          : status === 400
            ? "Die Anfrage enthält ungültiges JSON."
            : "Die Anfrage konnte nicht gespeichert werden. Bitte erneut versuchen.",
    });
  },
);
const port = Number(process.env.PORT) || 4307;
app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Foody Backend: http://localhost:${port}`),
);
