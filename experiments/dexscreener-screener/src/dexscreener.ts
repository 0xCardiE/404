import { config } from "./config.js";
import type {
  DexLink,
  DexPair,
  DiscoveredToken,
  OrdersResponse,
  TokenAd,
  TokenBoost,
  TokenProfile,
} from "./types.js";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, config.dexBaseUrl), {
    headers: {
      accept: "application/json",
      "user-agent": config.userAgent,
    },
  });
  if (!response.ok) {
    throw new Error(`DexScreener ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function tokenKey(chainId: string, tokenAddress: string): string {
  return `${chainId.toLowerCase()}:${tokenAddress.toLowerCase()}`;
}

function mergeLinks(existing: DexLink[], incoming?: DexLink[] | null): DexLink[] {
  const seen = new Set(existing.map((link) => link.url));
  const next = [...existing];
  for (const link of incoming ?? []) {
    if (!link?.url || seen.has(link.url)) continue;
    seen.add(link.url);
    next.push(link);
  }
  return next;
}

export function discoverFromFeeds(input: {
  profiles: TokenProfile[];
  boosts: TokenBoost[];
  ads: TokenAd[];
}): DiscoveredToken[] {
  const byKey = new Map<string, DiscoveredToken>();

  const upsert = (
    item: { chainId: string; tokenAddress: string; url?: string; icon?: string; description?: string | null; links?: DexLink[] | null },
    source: string,
    extras: Partial<DiscoveredToken> = {},
  ) => {
    const key = tokenKey(item.chainId, item.tokenAddress);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, {
        chainId: item.chainId,
        tokenAddress: item.tokenAddress,
        sources: [source],
        profileUrl: item.url,
        icon: item.icon,
        description: item.description,
        links: mergeLinks([], item.links),
        ...extras,
      });
      return;
    }
    if (!current.sources.includes(source)) current.sources.push(source);
    current.links = mergeLinks(current.links, item.links);
    current.icon ||= item.icon;
    current.description ||= item.description;
    current.profileUrl ||= item.url;
    Object.assign(current, extras);
  };

  for (const profile of input.profiles) upsert(profile, "profile");
  for (const boost of input.boosts) {
    upsert(boost, "boost", {
      boostAmount: boost.amount,
      totalBoostAmount: boost.totalAmount,
    });
  }
  for (const ad of input.ads) {
    upsert(ad, "ad", { adImpressions: ad.impressions ?? undefined });
  }

  return [...byKey.values()];
}

export async function fetchLatestFeeds(): Promise<{
  profiles: TokenProfile[];
  boosts: TokenBoost[];
  ads: TokenAd[];
}> {
  const [profiles, boosts, ads] = await Promise.all([
    getJson<TokenProfile[] | TokenProfile>("/token-profiles/latest/v1"),
    getJson<TokenBoost[] | TokenBoost>("/token-boosts/latest/v1"),
    getJson<TokenAd[] | TokenAd>("/ads/latest/v1"),
  ]);
  return {
    profiles: asArray(profiles),
    boosts: asArray(boosts),
    ads: asArray(ads),
  };
}

export async function fetchTokenPairs(chainId: string, tokenAddresses: string[]): Promise<DexPair[]> {
  if (tokenAddresses.length === 0) return [];
  const pairs: DexPair[] = [];
  for (let i = 0; i < tokenAddresses.length; i += config.tokenBatchSize) {
    const batch = tokenAddresses.slice(i, i + config.tokenBatchSize);
    const data = await getJson<DexPair[] | { pairs?: DexPair[] }>(
      `/tokens/v1/${encodeURIComponent(chainId)}/${batch.join(",")}`,
    );
    if (Array.isArray(data)) pairs.push(...data);
    else if (data.pairs) pairs.push(...data.pairs);
  }
  return pairs;
}

export async function fetchOrders(chainId: string, tokenAddress: string): Promise<OrdersResponse> {
  const data = await getJson<OrdersResponse | OrdersResponse["orders"]>(
    `/orders/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`,
  );
  if (Array.isArray(data)) return { orders: data };
  return data ?? {};
}

export function pickBestPair(pairs: DexPair[], tokenAddress: string): DexPair | undefined {
  const lower = tokenAddress.toLowerCase();
  const relevant = pairs.filter(
    (pair) =>
      pair.baseToken?.address?.toLowerCase() === lower ||
      pair.quoteToken?.address?.toLowerCase() === lower,
  );
  const pool = relevant.length > 0 ? relevant : pairs;
  return [...pool].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

export function pairIdentity(pair: DexPair, fallbackAddress: string): { name: string; symbol: string } {
  const lower = fallbackAddress.toLowerCase();
  if (pair.baseToken?.address?.toLowerCase() === lower) {
    return { name: pair.baseToken.name, symbol: pair.baseToken.symbol };
  }
  if (pair.quoteToken?.address?.toLowerCase() === lower) {
    return { name: pair.quoteToken.name, symbol: pair.quoteToken.symbol };
  }
  return { name: pair.baseToken?.name ?? "Unknown", symbol: pair.baseToken?.symbol ?? "?" };
}

export function pairCreatedAtMs(value: number | null | undefined): number | null {
  if (!value) return null;
  return value < 1e12 ? value * 1000 : value;
}

export function effectiveMarketCap(pair: DexPair | undefined): number | null {
  if (!pair) return null;
  if (typeof pair.marketCap === "number") return pair.marketCap;
  if (typeof pair.fdv === "number") return pair.fdv;
  return null;
}
