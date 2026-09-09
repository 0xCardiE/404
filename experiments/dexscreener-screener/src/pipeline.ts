import { checkTwitter } from "./checks/twitter.js";
import { checkWebsite } from "./checks/website.js";
import { config, projectId } from "./config.js";
import { curate } from "./curator.js";
import {
  discoverFromFeeds,
  effectiveMarketCap,
  fetchLatestFeeds,
  fetchOrders,
  fetchTokenPairs,
  pairCreatedAtMs,
  pairIdentity,
  pickBestPair,
} from "./dexscreener.js";
import { mapPool, normalizeHttpUrl } from "./http.js";
import { ProjectStore } from "./store.js";
import type {
  DexLink,
  DexPair,
  DiscoveredToken,
  PaidOrder,
  ProjectRecord,
  PromoInfo,
  ScanSummary,
  SocialLink,
} from "./types.js";

export interface PipelineOptions {
  recheckKnown?: boolean;
  limit?: number;
  nowMs?: number;
}

function classifyLink(link: DexLink): { website?: string; social?: SocialLink } {
  const url = normalizeHttpUrl(link.url);
  if (!url) return {};
  const type = (link.type ?? link.label ?? "").toLowerCase();
  if (type.includes("twitter") || type.includes("x.com") || /https?:\/\/(www\.)?(x|twitter)\.com/i.test(url)) {
    return { social: { platform: "twitter", url } };
  }
  if (type.includes("telegram") || url.includes("t.me/")) return { social: { platform: "telegram", url } };
  if (type.includes("discord")) return { social: { platform: "discord", url } };
  if (type.includes("website") || type.includes("web") || type === "") return { website: url };
  return { social: { platform: type || "other", url } };
}

function collectLinks(discovered: DiscoveredToken, pair?: DexPair): { websites: string[]; socials: SocialLink[] } {
  const websites: string[] = [];
  const socials: SocialLink[] = [];
  const addWebsite = (url?: string) => {
    const normalized = url ? normalizeHttpUrl(url) : null;
    if (normalized && !websites.includes(normalized)) websites.push(normalized);
  };
  const addSocial = (social: SocialLink) => {
    if (!socials.some((item) => item.url === social.url)) socials.push(social);
  };

  for (const link of discovered.links) {
    const classified = classifyLink(link);
    if (classified.website) addWebsite(classified.website);
    if (classified.social) addSocial(classified.social);
  }
  for (const site of pair?.info?.websites ?? []) addWebsite(site.url);
  for (const social of pair?.info?.socials ?? []) {
    const url =
      social.url ??
      (social.handle && (social.platform === "twitter" || social.type === "twitter")
        ? `https://x.com/${social.handle.replace(/^@/, "")}`
        : undefined);
    if (!url) continue;
    const classified = classifyLink({ type: social.platform ?? social.type, url });
    if (classified.website) addWebsite(classified.website);
    if (classified.social) addSocial(classified.social);
  }
  return { websites, socials };
}

function withinMarketCap(marketCap: number | null, nowPairAgeMs: number | null): boolean {
  if (marketCap == null) return false;
  if (marketCap > config.maxMarketCapUsd) return false;
  if (marketCap < config.minMarketCapUsd) return false;
  if (config.maxPairAgeDays > 0 && nowPairAgeMs != null) {
    const maxAge = config.maxPairAgeDays * 24 * 60 * 60 * 1000;
    if (nowPairAgeMs > maxAge) return false;
  }
  return true;
}

export async function runScan(store: ProjectStore, options: PipelineOptions = {}): Promise<ScanSummary> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const data = await store.load();
  const feeds = await fetchLatestFeeds();
  let discovered = discoverFromFeeds(feeds);
  if (options.limit && options.limit > 0) discovered = discovered.slice(0, options.limit);

  const byChain = new Map<string, DiscoveredToken[]>();
  for (const token of discovered) {
    const list = byChain.get(token.chainId) ?? [];
    list.push(token);
    byChain.set(token.chainId, list);
  }

  const pairsByToken = new Map<string, DexPair[]>();
  for (const [chainId, tokens] of byChain) {
    try {
      const pairs = await fetchTokenPairs(
        chainId,
        tokens.map((token) => token.tokenAddress),
      );
      for (const pair of pairs) {
        for (const address of [pair.baseToken?.address, pair.quoteToken?.address]) {
          if (!address) continue;
          const key = projectId(chainId, address);
          const list = pairsByToken.get(key) ?? [];
          list.push(pair);
          pairsByToken.set(key, list);
        }
      }
    } catch (error) {
      errors.push(`pairs ${chainId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const now = options.nowMs ?? Date.now();
  const eligible: Array<{ token: DiscoveredToken; pair?: DexPair; marketCap: number | null }> = [];
  let skippedNotWorthy = 0;
  let skippedKnown = 0;

  for (const token of discovered) {
    const id = projectId(token.chainId, token.tokenAddress);
    const existing = data.projects[id];
    if (store.shouldSkip(existing)) {
      skippedNotWorthy += 1;
      continue;
    }
    const pair = pickBestPair(pairsByToken.get(id) ?? [], token.tokenAddress);
    const marketCap = effectiveMarketCap(pair);
    const created = pairCreatedAtMs(pair?.pairCreatedAt);
    const age = created ? now - created : null;
    if (!withinMarketCap(marketCap, age)) continue;
    if (existing && !options.recheckKnown) {
      skippedKnown += 1;
      const refreshed = refreshMarket(existing, pair, marketCap, now);
      store.upsert(data, refreshed);
      continue;
    }
    eligible.push({ token, pair, marketCap });
  }

  const checkedRecords = await mapPool(eligible, config.checkConcurrency, async ({ token, pair, marketCap }) => {
    const id = projectId(token.chainId, token.tokenAddress);
    const links = collectLinks(token, pair);
    const websiteUrl = links.websites[0] ?? null;
    const twitterUrl = links.socials.find((item) => item.platform === "twitter")?.url ?? null;

    let orders;
    try {
      orders = await fetchOrders(token.chainId, token.tokenAddress);
    } catch (error) {
      errors.push(`orders ${id}: ${error instanceof Error ? error.message : String(error)}`);
      orders = {};
    }

    const paidOrders: PaidOrder[] = [
      ...(orders.orders ?? []).map((order) => ({
        type: order.type ?? "order",
        status: order.status,
        paymentTimestamp: order.paymentTimestamp,
      })),
      ...(orders.boosts ?? []).map((boost) => ({
        type: "boost",
        amount: boost.amount,
        paymentTimestamp: boost.paymentTimestamp,
      })),
    ];

    const promo: PromoInfo = {
      hasProfile: token.sources.includes("profile") || paidOrders.some((order) => order.type === "tokenProfile"),
      hasBoost: token.sources.includes("boost") || (pair?.boosts?.active ?? 0) > 0 || paidOrders.some((order) => order.type === "boost"),
      hasAd: token.sources.includes("ad"),
      activeBoosts: pair?.boosts?.active,
      totalBoostAmount: token.totalBoostAmount,
      adImpressions: token.adImpressions,
      paidOrders,
    };

    const [website, twitter] = await Promise.all([checkWebsite(websiteUrl), checkTwitter(twitterUrl)]);
    const identity = pair ? pairIdentity(pair, token.tokenAddress) : { name: token.tokenAddress.slice(0, 8), symbol: "?" };
    const verdict = curate({
      marketCap,
      liquidityUsd: pair?.liquidity?.usd ?? null,
      pairCreatedAt: pair?.pairCreatedAt ?? null,
      website,
      twitter,
      promo,
      websites: links.websites,
      socials: links.socials,
      maxMarketCapUsd: config.maxMarketCapUsd,
      minLiquidityUsd: config.minLiquidityUsd,
      nowMs: now,
    });

    const existing = data.projects[id];
    const record: ProjectRecord = {
      id,
      chainId: token.chainId,
      tokenAddress: token.tokenAddress,
      name: identity.name,
      symbol: identity.symbol,
      priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : null,
      marketCap,
      fdv: pair?.fdv ?? null,
      liquidityUsd: pair?.liquidity?.usd ?? null,
      volume24h: pair?.volume?.h24 ?? null,
      priceChange24h: pair?.priceChange?.h24 ?? null,
      pairCreatedAt: pairCreatedAtMs(pair?.pairCreatedAt),
      pairUrl: pair?.url ?? token.profileUrl ?? null,
      pairAddress: pair?.pairAddress ?? null,
      icon: pair?.info?.imageUrl ?? token.icon ?? null,
      description: token.description ?? null,
      websites: links.websites,
      socials: links.socials,
      sources: token.sources,
      promo,
      website,
      twitter,
      category: verdict.category,
      score: verdict.score,
      flags: verdict.flags,
      summary: verdict.summary,
      firstSeenAt: existing?.firstSeenAt ?? new Date(now).toISOString(),
      lastScannedAt: new Date(now).toISOString(),
      skippedFuture: verdict.skippedFuture,
    };
    return record;
  });

  for (const record of checkedRecords) store.upsert(data, record);

  const summary: ScanSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    discovered: discovered.length,
    eligible: eligible.length + skippedKnown,
    checked: checkedRecords.length,
    skippedNotWorthy,
    skippedKnown,
    errors,
  };
  store.appendScan(data, summary);
  await store.save(data);
  return summary;
}

function refreshMarket(existing: ProjectRecord, pair: DexPair | undefined, marketCap: number | null, now: number): ProjectRecord {
  if (!pair) {
    return { ...existing, lastScannedAt: new Date(now).toISOString() };
  }
  return {
    ...existing,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : existing.priceUsd,
    marketCap: marketCap ?? existing.marketCap,
    fdv: pair.fdv ?? existing.fdv,
    liquidityUsd: pair.liquidity?.usd ?? existing.liquidityUsd,
    volume24h: pair.volume?.h24 ?? existing.volume24h,
    priceChange24h: pair.priceChange?.h24 ?? existing.priceChange24h,
    pairUrl: pair.url ?? existing.pairUrl,
    lastScannedAt: new Date(now).toISOString(),
  };
}
