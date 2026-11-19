import express from "express";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { operationSchema, type Operation } from "../shared/domain.ts";
import { seedRows } from "../shared/seed.ts";
import { Store } from "./store.ts";
import { safeFetch, extractRecipe } from "./importer.ts";
import { allowedHosts, trustedHost, trustedApiRequest } from "./origin.ts";
const hosts = allowedHosts(process.env.ALLOWED_HOSTS);
mkdirSync(process.env.DATA_DIR || "data", { recursive: true });
const store = new Store(
  resolve(process.env.DATA_DIR || "data", "foodie.sqlite"),
  seedRows(),
);
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
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
app.get("/api/state", (_req, res) => res.json({ rows: store.rows() }));
app.post("/api/sync", (req, res) => {
  const parsed = z
    .object({ operations: z.array(operationSchema).max(100) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültige Änderungen." });
    return;
  }
  const results = parsed.data.operations.map((op) =>
    store.apply(op as Operation),
  );
  res.json({ results, rows: store.rows() });
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
    const page = await safeFetch(parsed.data.url);
    res.json({ recipe: extractRecipe(page.html, page.url) });
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : "Import fehlgeschlagen.",
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
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      (error.status === 400 || error.status === 413)
        ? error.status
        : 500;
    if (status === 500) console.error("Foodie: Anfrage fehlgeschlagen (500).");
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
  console.log(`Foodie Backend: http://localhost:${port}`),
);
