import { afterAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { ProjectStore } from "../src/store.js";

const app = createServer(new ProjectStore());
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", () => resolve()));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const base = `http://127.0.0.1:${port}`;

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("dashboard API", () => {
  it("serves health and an empty project list", async () => {
    const health = (await fetch(`${base}/api/health`).then((res) => res.json())) as {
      ok: boolean;
      maxMarketCapUsd: number;
    };
    expect(health.ok).toBe(true);
    expect(health.maxMarketCapUsd).toBe(1_000_000);

    const page = await fetch(`${base}/`).then((res) => res.text());
    expect(page).toContain("Sub-$1M project desk");

    const projects = (await fetch(`${base}/api/projects?category=should_check`).then((res) => res.json())) as {
      projects: unknown[];
    };
    expect(Array.isArray(projects.projects)).toBe(true);
  });
});
