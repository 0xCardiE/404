import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  maxMarketCapUsd: envNumber("MAX_MARKET_CAP_USD", 1_000_000),
  minMarketCapUsd: envNumber("MIN_MARKET_CAP_USD", 0),
  minLiquidityUsd: envNumber("MIN_LIQUIDITY_USD", 10_000),
  maxPairAgeDays: envNumber("MAX_PAIR_AGE_DAYS", 21),
  scanIntervalMs: envNumber("SCAN_INTERVAL_MS", 5 * 60 * 1000),
  port: envNumber("PORT", 3780),
  requestTimeoutMs: envNumber("REQUEST_TIMEOUT_MS", 12_000),
  tokenBatchSize: 30,
  checkConcurrency: envNumber("CHECK_CONCURRENCY", 4),
  dataDir: process.env.DATA_DIR ?? path.resolve(here, "../data"),
  webDir: path.resolve(here, "../web"),
  dexBaseUrl: "https://api.dexscreener.com",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

export function projectId(chainId: string, tokenAddress: string): string {
  return `${chainId.toLowerCase()}:${tokenAddress.toLowerCase()}`;
}
