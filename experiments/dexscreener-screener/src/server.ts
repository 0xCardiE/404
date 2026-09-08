import express from "express";
import { config } from "./config.js";
import { runScan } from "./pipeline.js";
import { ProjectStore } from "./store.js";
import type { Category } from "./types.js";

const categories = new Set<Category>(["should_check", "watch", "not_worthy"]);

export function createServer(store = new ProjectStore()) {
  const app = express();
  app.use(express.json());
  app.use(express.static(config.webDir));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, intervalMs: config.scanIntervalMs, maxMarketCapUsd: config.maxMarketCapUsd });
  });

  app.get("/api/projects", async (req, res) => {
    const data = await store.load();
    const category = typeof req.query.category === "string" && categories.has(req.query.category as Category)
      ? (req.query.category as Category)
      : undefined;
    res.json({
      projects: store.list(data, category),
      lastScan: data.scans.at(-1) ?? null,
    });
  });

  app.get("/api/stats", async (_req, res) => {
    const data = await store.load();
    const projects = Object.values(data.projects);
    const count = (category: Category) => projects.filter((project) => project.category === category).length;
    res.json({
      total: projects.length,
      should_check: count("should_check"),
      watch: count("watch"),
      not_worthy: count("not_worthy"),
      lastScan: data.scans.at(-1) ?? null,
    });
  });

  app.post("/api/scan", async (req, res) => {
    try {
      const summary = await runScan(store, {
        recheckKnown: Boolean(req.body?.recheckKnown),
        limit: typeof req.body?.limit === "number" ? req.body.limit : undefined,
      });
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/projects/:id/override", async (req, res) => {
    const category = req.body?.category as Category;
    if (!categories.has(category)) {
      res.status(400).json({ error: "category must be should_check, watch, or not_worthy" });
      return;
    }
    const data = await store.load();
    const updated = store.override(data, req.params.id, category);
    if (!updated) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    await store.save(data);
    res.json(updated);
  });

  return app;
}

export async function listen(port = config.port): Promise<{ close: () => Promise<void> }> {
  const app = createServer();
  const server = app.listen(port, "0.0.0.0");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
