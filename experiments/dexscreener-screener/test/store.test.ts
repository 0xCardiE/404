import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectStore } from "../src/store.js";
import type { ProjectRecord } from "../src/types.js";

function record(id: string, category: ProjectRecord["category"]): ProjectRecord {
  return {
    id,
    chainId: "solana",
    tokenAddress: id.split(":")[1] ?? "x",
    name: "Test",
    symbol: "TST",
    priceUsd: 0.1,
    marketCap: 100_000,
    fdv: 100_000,
    liquidityUsd: 20_000,
    volume24h: 1000,
    priceChange24h: 1,
    pairCreatedAt: Date.now(),
    pairUrl: "https://dexscreener.com/solana/x",
    pairAddress: "pair",
    icon: null,
    description: null,
    websites: [],
    socials: [],
    sources: ["profile"],
    promo: { hasProfile: true, hasBoost: false, hasAd: false, paidOrders: [] },
    website: { url: null, outcome: "missing", hops: [], flags: [] },
    twitter: { url: null, kind: "missing", outcome: "missing", flags: [] },
    category,
    score: category === "should_check" ? 80 : 20,
    flags: [],
    summary: "test",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastScannedAt: "2026-01-01T00:00:00.000Z",
    skippedFuture: category === "not_worthy",
  };
}

describe("ProjectStore", () => {
  it("skips tokens already marked not worthy", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dex-screen-"));
    const store = new ProjectStore(path.join(dir, "projects.json"));
    const data = await store.load();
    store.upsert(data, record("solana:aaa", "not_worthy"));
    expect(store.shouldSkip(data.projects["solana:aaa"])).toBe(true);
    await store.save(data);
    const raw = await readFile(path.join(dir, "projects.json"), "utf8");
    expect(raw).toContain("not_worthy");
  });

  it("keeps firstSeenAt and honors a human override", async () => {
    const store = new ProjectStore();
    const data = await store.load();
    store.upsert(data, record("base:bbb", "watch"));
    const later = record("base:bbb", "should_check");
    later.firstSeenAt = "2099-01-01T00:00:00.000Z";
    store.upsert(data, later);
    expect(data.projects["base:bbb"].firstSeenAt).toBe("2026-01-01T00:00:00.000Z");
    store.override(data, "base:bbb", "not_worthy");
    expect(data.projects["base:bbb"].skippedFuture).toBe(true);
    expect(data.projects["base:bbb"].category).toBe("not_worthy");
  });
});
