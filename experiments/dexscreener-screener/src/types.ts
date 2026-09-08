export type Category = "should_check" | "watch" | "not_worthy";

export type FlagSeverity = "info" | "warn" | "fail";

export interface Flag {
  code: string;
  severity: FlagSeverity;
  message: string;
}

export interface UrlHop {
  url: string;
  status: number;
  location?: string;
}

export type WebsiteOutcome =
  | "ok"
  | "missing"
  | "unreachable"
  | "http_error"
  | "blocked"
  | "parked"
  | "not_found"
  | "redirect_offsite"
  | "redirect_loop"
  | "empty"
  | "shortener";

export interface WebsiteCheck {
  url: string | null;
  outcome: WebsiteOutcome;
  finalUrl?: string;
  title?: string;
  hops: UrlHop[];
  flags: Flag[];
}

export type TwitterKind = "profile" | "tweet" | "unknown" | "missing";

export type TwitterOutcome =
  | "ok"
  | "missing"
  | "not_found"
  | "suspended"
  | "redirect_offsite"
  | "unreachable"
  | "unverified";

export interface TwitterCheck {
  url: string | null;
  handle?: string;
  kind: TwitterKind;
  outcome: TwitterOutcome;
  name?: string;
  bio?: string;
  followers?: number;
  tweets?: number;
  website?: string;
  recentText?: string;
  flags: Flag[];
}

export interface PaidOrder {
  type: string;
  status?: string;
  paymentTimestamp?: number;
  amount?: number;
}

export interface PromoInfo {
  hasProfile: boolean;
  hasBoost: boolean;
  hasAd: boolean;
  activeBoosts?: number;
  totalBoostAmount?: number;
  adImpressions?: number;
  paidOrders: PaidOrder[];
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface ProjectRecord {
  id: string;
  chainId: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  pairCreatedAt: number | null;
  pairUrl: string | null;
  pairAddress: string | null;
  icon: string | null;
  description: string | null;
  websites: string[];
  socials: SocialLink[];
  sources: string[];
  promo: PromoInfo;
  website: WebsiteCheck;
  twitter: TwitterCheck;
  category: Category;
  score: number;
  flags: Flag[];
  summary: string;
  firstSeenAt: string;
  lastScannedAt: string;
  skippedFuture: boolean;
  overrideCategory?: Category;
}

export interface ScanSummary {
  startedAt: string;
  finishedAt: string;
  discovered: number;
  eligible: number;
  checked: number;
  skippedNotWorthy: number;
  skippedKnown: number;
  errors: string[];
}

export interface StoreData {
  version: 1;
  projects: Record<string, ProjectRecord>;
  scans: ScanSummary[];
}

export interface DexLink {
  type?: string | null;
  label?: string | null;
  url: string;
}

export interface TokenProfile {
  url: string;
  chainId: string;
  tokenAddress: string;
  icon?: string;
  header?: string | null;
  description?: string | null;
  links?: DexLink[] | null;
  cto?: boolean;
}

export interface TokenBoost extends TokenProfile {
  amount?: number;
  totalAmount?: number;
}

export interface TokenAd {
  url: string;
  chainId: string;
  tokenAddress: string;
  date?: string;
  type?: string;
  durationHours?: number | null;
  impressions?: number | null;
}

export interface PairToken {
  address: string;
  name: string;
  symbol: string;
}

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[] | null;
  baseToken: PairToken;
  quoteToken: PairToken;
  priceNative?: string;
  priceUsd?: string | null;
  volume?: Record<string, number>;
  priceChange?: Record<string, number> | null;
  liquidity?: { usd?: number | null; base?: number; quote?: number } | null;
  fdv?: number | null;
  marketCap?: number | null;
  pairCreatedAt?: number | null;
  info?: {
    imageUrl?: string | null;
    websites?: Array<{ url: string; label?: string }>;
    socials?: Array<{ platform?: string; type?: string; url?: string; handle?: string }>;
  };
  boosts?: { active?: number };
}

export interface OrdersResponse {
  orders?: Array<{
    chainId?: string;
    tokenAddress?: string;
    type?: string;
    status?: string;
    paymentTimestamp?: number;
  }>;
  boosts?: Array<{
    chainId?: string;
    tokenAddress?: string;
    id?: string;
    amount?: number;
    paymentTimestamp?: number;
  }>;
}

export interface DiscoveredToken {
  chainId: string;
  tokenAddress: string;
  sources: string[];
  profileUrl?: string;
  icon?: string;
  description?: string | null;
  links: DexLink[];
  boostAmount?: number;
  totalBoostAmount?: number;
  adImpressions?: number;
}

export interface CuratorInput {
  marketCap: number | null;
  liquidityUsd: number | null;
  pairCreatedAt: number | null;
  website: WebsiteCheck;
  twitter: TwitterCheck;
  promo: PromoInfo;
  websites: string[];
  socials: SocialLink[];
  maxMarketCapUsd: number;
  minLiquidityUsd: number;
  nowMs?: number;
}
