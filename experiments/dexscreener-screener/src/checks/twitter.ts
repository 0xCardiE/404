import { fetchWithRedirects, hostOf, sameRegistrableDomain } from "../http.js";
import type { Flag, TwitterCheck, TwitterKind } from "../types.js";

const X_HOSTS = new Set(["x.com", "twitter.com", "mobile.twitter.com", "www.x.com", "www.twitter.com"]);

export function parseTwitterUrl(url: string | null): { handle?: string; statusId?: string; kind: TwitterKind } {
  if (!url) return { kind: "missing" };
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!X_HOSTS.has(parsed.hostname.toLowerCase()) && !X_HOSTS.has(host)) {
      return { kind: "unknown" };
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return { kind: "unknown" };
    const reserved = new Set(["home", "explore", "search", "intent", "i", "share", "compose"]);
    if (reserved.has(parts[0].toLowerCase())) return { kind: "unknown" };
    const handle = parts[0].replace(/^@/, "");
    if (parts[1]?.toLowerCase() === "status" && parts[2]) {
      return { handle, statusId: parts[2], kind: "tweet" };
    }
    return { handle, kind: "profile" };
  } catch {
    return { kind: "unknown" };
  }
}

interface FxUser {
  screen_name?: string;
  name?: string;
  description?: string;
  followers?: number;
  tweets?: number;
  website?: { url?: string } | string | null;
}

interface FxResponse {
  code?: number;
  message?: string;
  user?: FxUser;
  tweet?: { text?: string; author?: FxUser };
}

function websiteFromFx(user?: FxUser): string | undefined {
  if (!user?.website) return undefined;
  if (typeof user.website === "string") return user.website;
  return user.website.url;
}

export async function checkTwitter(url: string | null): Promise<TwitterCheck> {
  if (!url) {
    return {
      url: null,
      kind: "missing",
      outcome: "missing",
      flags: [{ code: "twitter_missing", severity: "warn", message: "No Twitter/X link listed." }],
    };
  }

  const parsed = parseTwitterUrl(url);
  if (!parsed.handle) {
    return {
      url,
      kind: parsed.kind,
      outcome: "unreachable",
      flags: [{ code: "twitter_unparsed", severity: "warn", message: `Could not parse a handle from ${url}.` }],
    };
  }

  const flags: Flag[] = [];
  if (parsed.kind === "tweet") {
    flags.push({
      code: "twitter_is_tweet",
      severity: "warn",
      message: "Listed X link is a tweet, not a project profile.",
    });
  }

  const fxPath = parsed.statusId
    ? `https://api.fxtwitter.com/${parsed.handle}/status/${parsed.statusId}`
    : `https://api.fxtwitter.com/${parsed.handle}`;

  const fx = await fetchWithRedirects(fxPath, {
    headers: { accept: "application/json" },
    maxHops: 1,
  });

  if (fx.response && fx.response.status >= 200 && fx.response.status < 300) {
    let payload: FxResponse | undefined;
    try {
      payload = (await fx.response.json()) as FxResponse;
    } catch {
      payload = undefined;
    }
    const user = payload?.user ?? payload?.tweet?.author;
    if (user?.screen_name) {
      const handleChanged = user.screen_name.toLowerCase() !== parsed.handle.toLowerCase();
      if (handleChanged) {
        flags.push({
          code: "twitter_redirect_offsite",
          severity: "fail",
          message: `X handle redirected from @${parsed.handle} to @${user.screen_name}.`,
        });
        return {
          url,
          handle: parsed.handle,
          kind: parsed.kind,
          outcome: "redirect_offsite",
          name: user.name,
          bio: user.description,
          followers: user.followers,
          tweets: user.tweets,
          website: websiteFromFx(user),
          recentText: payload?.tweet?.text,
          flags,
        };
      }

      flags.push({
        code: "twitter_ok",
        severity: "info",
        message: `@${user.screen_name} is live${typeof user.followers === "number" ? ` · ${user.followers} followers` : ""}.`,
      });
      return {
        url,
        handle: user.screen_name,
        kind: parsed.kind,
        outcome: "ok",
        name: user.name,
        bio: user.description,
        followers: user.followers,
        tweets: user.tweets,
        website: websiteFromFx(user),
        recentText: payload?.tweet?.text,
        flags,
      };
    }
  }

  const redirectedHost = fx.hops[0]?.location ? hostOf(new URL(fx.hops[0].location, fxPath).href) : null;
  if (fx.hops[0] && [301, 302, 303, 307, 308].includes(fx.hops[0].status) && redirectedHost && redirectedHost !== "api.fxtwitter.com") {
    flags.push({
      code: "twitter_not_found",
      severity: "fail",
      message: `X account @${parsed.handle} does not resolve (lookup redirected away).`,
    });
    return { url, handle: parsed.handle, kind: parsed.kind, outcome: "not_found", flags };
  }

  const page = await fetchWithRedirects(`https://x.com/${parsed.handle}`, { maxHops: 4 });
  const body = page.response ? await page.response.text() : "";

  if (/account suspended|this account.*(is)?\s*suspended/i.test(body)) {
    flags.push({
      code: "twitter_suspended",
      severity: "fail",
      message: `X account @${parsed.handle} appears suspended.`,
    });
    return { url, handle: parsed.handle, kind: parsed.kind, outcome: "suspended", flags };
  }
  if (/this account doesn.?t exist|account does not exist|hmm\.\.\. this page doesn.?t exist/i.test(body)) {
    flags.push({
      code: "twitter_not_found",
      severity: "fail",
      message: `X account @${parsed.handle} does not exist.`,
    });
    return { url, handle: parsed.handle, kind: parsed.kind, outcome: "not_found", flags };
  }

  if (page.finalUrl && !sameRegistrableDomain(page.finalUrl, "https://x.com") && !sameRegistrableDomain(page.finalUrl, "https://twitter.com")) {
    flags.push({
      code: "twitter_redirect_offsite",
      severity: "fail",
      message: `X link redirected off X/Twitter to ${page.finalUrl}.`,
    });
    return { url, handle: parsed.handle, kind: parsed.kind, outcome: "redirect_offsite", flags };
  }

  flags.push({
    code: "twitter_unverified",
    severity: "warn",
    message: `Could not confirm @${parsed.handle} profile contents; X page was reachable but not readable.`,
  });
  return { url, handle: parsed.handle, kind: parsed.kind, outcome: "unverified", flags };
}

export function twitterMatchesWebsite(twitter: TwitterCheck, websiteUrl: string | null): boolean {
  if (!twitter.website || !websiteUrl) return false;
  return sameRegistrableDomain(twitter.website, websiteUrl);
}
