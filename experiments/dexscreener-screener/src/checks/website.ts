import {
  extractTitle,
  fetchWithRedirects,
  htmlLooksBlocked,
  htmlLooksParked,
  isShortener,
  sameRegistrableDomain,
} from "../http.js";
import type { Flag, UrlHop, WebsiteCheck, WebsiteOutcome } from "../types.js";

export function offsiteRedirectTarget(originalUrl: string, hops: UrlHop[], finalUrl?: string): string | undefined {
  for (const hop of hops) {
    if (!hop.location) continue;
    try {
      const next = new URL(hop.location, hop.url).href;
      if (!sameRegistrableDomain(originalUrl, next)) return next;
    } catch {
      return hop.location;
    }
  }
  if (finalUrl && !sameRegistrableDomain(originalUrl, finalUrl)) return finalUrl;
  return undefined;
}

const DEAD_OUTCOMES: WebsiteOutcome[] = [
  "unreachable",
  "http_error",
  "blocked",
  "parked",
  "not_found",
  "redirect_offsite",
  "redirect_loop",
  "empty",
  "shortener",
];

export function isWebsiteFail(outcome: WebsiteOutcome): boolean {
  return DEAD_OUTCOMES.includes(outcome);
}

export async function checkWebsite(url: string | null): Promise<WebsiteCheck> {
  if (!url) {
    return {
      url: null,
      outcome: "missing",
      hops: [],
      flags: [{ code: "website_missing", severity: "warn", message: "No website listed on DexScreener." }],
    };
  }

  if (isShortener(url)) {
    return {
      url,
      outcome: "shortener",
      hops: [],
      flags: [
        {
          code: "website_shortener",
          severity: "fail",
          message: "Homepage is a link shortener, so the real destination is hidden.",
        },
      ],
    };
  }

  const fetched = await fetchWithRedirects(url, { stopOnOffsite: true });
  const flags: Flag[] = [];
  const offsiteTarget = offsiteRedirectTarget(url, fetched.hops, fetched.finalUrl);

  if (offsiteTarget) {
    flags.push({
      code: "website_redirect_offsite",
      severity: "fail",
      message: `Website redirected from ${url} to ${offsiteTarget}.`,
    });
    return {
      url,
      outcome: "redirect_offsite",
      hops: fetched.hops,
      finalUrl: fetched.finalUrl,
      flags,
    };
  }

  if (fetched.error === "too many redirects") {
    return {
      url,
      outcome: "redirect_loop",
      hops: fetched.hops,
      finalUrl: fetched.finalUrl,
      flags: [{ code: "website_redirect_loop", severity: "fail", message: "Website redirect loop." }],
    };
  }

  if (!fetched.response) {
    return {
      url,
      outcome: "unreachable",
      hops: fetched.hops,
      finalUrl: fetched.finalUrl,
      flags: [
        {
          code: "website_unreachable",
          severity: "fail",
          message: `Website did not respond (${fetched.error ?? "network error"}).`,
        },
      ],
    };
  }

  const status = fetched.response.status;
  if (status === 404) {
    flags.push({ code: "website_not_found", severity: "fail", message: "Website returned 404." });
    return { url, outcome: "not_found", hops: fetched.hops, finalUrl: fetched.finalUrl, flags };
  }
  if (status === 403 || status === 401 || status === 429) {
    flags.push({
      code: "website_blocked",
      severity: "fail",
      message: `Website blocked the check (HTTP ${status}).`,
    });
    return { url, outcome: "blocked", hops: fetched.hops, finalUrl: fetched.finalUrl, flags };
  }
  if (status >= 400) {
    flags.push({
      code: "website_http_error",
      severity: "fail",
      message: `Website returned HTTP ${status}.`,
    });
    return { url, outcome: "http_error", hops: fetched.hops, finalUrl: fetched.finalUrl, flags };
  }

  const body = await fetched.response.text();
  const title = extractTitle(body);

  if (htmlLooksBlocked(body)) {
    flags.push({
      code: "website_blocked",
      severity: "fail",
      message: "Website looks like a bot-challenge or access wall.",
    });
    return { url, outcome: "blocked", hops: fetched.hops, finalUrl: fetched.finalUrl, title, flags };
  }

  if (htmlLooksParked(body)) {
    flags.push({
      code: "website_parked",
      severity: "fail",
      message: "Website looks parked or is a default host page.",
    });
    return { url, outcome: "parked", hops: fetched.hops, finalUrl: fetched.finalUrl, title, flags };
  }

  const text = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (text.length < 20 && !title) {
    flags.push({ code: "website_empty", severity: "fail", message: "Website body is empty or nearly empty." });
    return { url, outcome: "empty", hops: fetched.hops, finalUrl: fetched.finalUrl, title, flags };
  }

  flags.push({
    code: "website_ok",
    severity: "info",
    message: `Website responded ${status}${title ? ` (${title})` : ""}.`,
  });
  return { url, outcome: "ok", hops: fetched.hops, finalUrl: fetched.finalUrl, title, flags };
}
