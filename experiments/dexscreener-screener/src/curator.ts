import { isWebsiteFail } from "./checks/website.js";
import { twitterMatchesWebsite } from "./checks/twitter.js";
import { pairCreatedAtMs } from "./dexscreener.js";
import type { Category, CuratorInput, Flag } from "./types.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function pairAgeMs(pairCreatedAt: number | null | undefined, nowMs = Date.now()): number | null {
  const created = pairCreatedAtMs(pairCreatedAt);
  if (!created) return null;
  return Math.max(0, nowMs - created);
}

export function curate(input: CuratorInput): {
  category: Category;
  score: number;
  flags: Flag[];
  summary: string;
  skippedFuture: boolean;
} {
  const now = input.nowMs ?? Date.now();
  const flags: Flag[] = [...input.website.flags, ...input.twitter.flags];
  let score = 45;

  const listedWebsite = Boolean(input.website.url);
  const listedTwitter = Boolean(input.twitter.url);
  const websiteFailed = listedWebsite && isWebsiteFail(input.website.outcome);
  const twitterFailed =
    listedTwitter &&
    (input.twitter.outcome === "not_found" ||
      input.twitter.outcome === "suspended" ||
      input.twitter.outcome === "redirect_offsite");

  if (input.website.outcome === "ok") score += 22;
  else if (input.website.outcome === "missing") score -= 12;
  else if (websiteFailed) score -= 30;

  if (input.twitter.outcome === "ok") score += 16;
  else if (input.twitter.outcome === "unverified") score += 4;
  else if (input.twitter.outcome === "missing") score -= 8;
  else if (twitterFailed) score -= 22;

  if (input.twitter.kind === "tweet") score -= 6;
  if (typeof input.twitter.followers === "number" && input.twitter.followers >= 200) score += 4;
  if (twitterMatchesWebsite(input.twitter, input.website.url ?? input.websites[0] ?? null)) {
    score += 8;
    flags.push({
      code: "social_consistency",
      severity: "info",
      message: "Twitter profile website matches the listed project site.",
    });
  }

  const liquidity = input.liquidityUsd ?? 0;
  if (liquidity <= 0) {
    score -= 35;
    flags.push({ code: "no_liquidity", severity: "fail", message: "No measurable liquidity on DexScreener." });
  } else if (liquidity < input.minLiquidityUsd) {
    score -= 12;
    flags.push({
      code: "thin_liquidity",
      severity: "warn",
      message: `Liquidity $${Math.round(liquidity).toLocaleString()} is below the $${input.minLiquidityUsd.toLocaleString()} floor.`,
    });
  } else if (liquidity >= 50_000) {
    score += 10;
    flags.push({
      code: "liquidity_ok",
      severity: "info",
      message: `Liquidity $${Math.round(liquidity).toLocaleString()}.`,
    });
  } else {
    score += 5;
    flags.push({
      code: "liquidity_ok",
      severity: "info",
      message: `Liquidity $${Math.round(liquidity).toLocaleString()}.`,
    });
  }

  if (input.marketCap && liquidity > 0) {
    const ratio = liquidity / input.marketCap;
    if (ratio < 0.04) {
      score -= 8;
      flags.push({
        code: "weak_liq_mcap",
        severity: "warn",
        message: `Liquidity is only ${(ratio * 100).toFixed(1)}% of market cap.`,
      });
    }
  }

  if (input.promo.hasProfile) {
    score += 5;
    flags.push({ code: "paid_profile", severity: "info", message: "Paid DexScreener token profile." });
  }
  if (input.promo.hasBoost) {
    score += 3;
    flags.push({
      code: "paid_boost",
      severity: "info",
      message: `Paid DexScreener boost${input.promo.totalBoostAmount ? ` (total ${input.promo.totalBoostAmount})` : ""}. This is marketing, not safety.`,
    });
  }
  if (input.promo.hasAd) {
    score += 2;
    flags.push({
      code: "paid_ad",
      severity: "info",
      message: "Paid DexScreener ad inventory.",
    });
  }

  const age = pairAgeMs(input.pairCreatedAt, now);
  if (age != null && age < 2 * HOUR) {
    score -= 6;
    flags.push({
      code: "brand_new_pair",
      severity: "warn",
      message: "Pair is less than 2 hours old.",
    });
  } else if (age != null && age < 14 * DAY) {
    score += 3;
  }

  if (!listedWebsite && !listedTwitter) {
    score -= 15;
    flags.push({
      code: "no_public_presence",
      severity: "fail",
      message: "No website or Twitter listed.",
    });
  }

  score = Math.max(0, Math.min(100, score));

  const hardReject =
    websiteFailed ||
    twitterFailed ||
    liquidity <= 0 ||
    (!listedWebsite && !listedTwitter);

  let category: Category;
  if (hardReject || score < 40) category = "not_worthy";
  else if (
    score >= 70 &&
    input.website.outcome === "ok" &&
    (input.twitter.outcome === "ok" || input.twitter.outcome === "unverified") &&
    liquidity >= input.minLiquidityUsd
  ) {
    category = "should_check";
  } else {
    category = "watch";
  }

  const summary = summarize(category, input, liquidity, flags);
  return {
    category,
    score,
    flags,
    summary,
    skippedFuture: category === "not_worthy",
  };
}

function summarize(
  category: Category,
  input: CuratorInput,
  liquidity: number,
  flags: Flag[],
): string {
  if (category === "not_worthy") {
    const fail = flags.find((flag) => flag.severity === "fail");
    return fail?.message ?? "Too many broken or missing signals to keep checking.";
  }
  const bits = [
    input.website.outcome === "ok" ? "website looks real" : "website needs a look",
    input.twitter.outcome === "ok" ? "Twitter is live" : "Twitter is incomplete",
    liquidity > 0 ? `$${Math.round(liquidity).toLocaleString()} liquidity` : "no liquidity",
  ];
  if (input.promo.hasProfile || input.promo.hasBoost || input.promo.hasAd) {
    bits.push("paid DexScreener promo");
  }
  const prefix = category === "should_check" ? "Worth a closer look" : "Mixed signals";
  return `${prefix}: ${bits.join(", ")}.`;
}
