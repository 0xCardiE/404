import { describe, expect, it } from "vitest";
import { curate } from "../src/curator.js";
import { discoverFromFeeds } from "../src/dexscreener.js";
import type { CuratorInput, TwitterCheck, WebsiteCheck } from "../src/types.js";

const websiteOk: WebsiteCheck = {
  url: "https://acme.xyz",
  outcome: "ok",
  hops: [],
  flags: [],
};

const twitterOk: TwitterCheck = {
  url: "https://x.com/acme",
  handle: "acme",
  kind: "profile",
  outcome: "ok",
  followers: 300,
  website: "https://acme.xyz",
  flags: [],
};

function input(overrides: Partial<CuratorInput> = {}): CuratorInput {
  return {
    marketCap: 250_000,
    liquidityUsd: 40_000,
    pairCreatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    website: websiteOk,
    twitter: twitterOk,
    promo: { hasProfile: true, hasBoost: true, hasAd: false, paidOrders: [] },
    websites: ["https://acme.xyz"],
    socials: [{ platform: "twitter", url: "https://x.com/acme" }],
    maxMarketCapUsd: 1_000_000,
    minLiquidityUsd: 10_000,
    ...overrides,
  };
}

describe("curate", () => {
  it("promotes a liquid project with a live site and Twitter", () => {
    const result = curate(input());
    expect(result.category).toBe("should_check");
    expect(result.skippedFuture).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("rejects a dead website and never checks it again", () => {
    const result = curate(
      input({
        website: {
          url: "https://dead.xyz",
          outcome: "parked",
          hops: [],
          flags: [{ code: "website_parked", severity: "fail", message: "parked" }],
        },
      }),
    );
    expect(result.category).toBe("not_worthy");
    expect(result.skippedFuture).toBe(true);
  });

  it("rejects missing liquidity", () => {
    const result = curate(input({ liquidityUsd: 0 }));
    expect(result.category).toBe("not_worthy");
  });

  it("puts mixed socials into watch instead of should_check", () => {
    const result = curate(
      input({
        twitter: { url: null, kind: "missing", outcome: "missing", flags: [] },
        liquidityUsd: 12_000,
      }),
    );
    expect(result.category).toBe("watch");
  });
});

describe("discoverFromFeeds", () => {
  it("merges profile, boost, and ad rows for the same token", () => {
    const tokens = discoverFromFeeds({
      profiles: [
        {
          url: "https://dexscreener.com/solana/abc",
          chainId: "solana",
          tokenAddress: "Abc",
          links: [{ type: "website", url: "https://acme.xyz" }],
        },
      ],
      boosts: [
        {
          url: "https://dexscreener.com/solana/abc",
          chainId: "solana",
          tokenAddress: "abc",
          amount: 50,
          totalAmount: 80,
          links: [{ type: "twitter", url: "https://x.com/acme" }],
        },
      ],
      ads: [{ url: "https://dexscreener.com/solana/abc", chainId: "solana", tokenAddress: "ABC", impressions: 1000 }],
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].sources.sort()).toEqual(["ad", "boost", "profile"]);
    expect(tokens[0].links).toHaveLength(2);
    expect(tokens[0].totalBoostAmount).toBe(80);
  });
});
