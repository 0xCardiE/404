import { getDomain } from "tldts";
import { config } from "./config.js";
import type { UrlHop } from "./types.js";

export const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "cutt.ly",
  "is.gd",
  "ow.ly",
  "buff.ly",
  "rebrand.ly",
  "rb.gy",
  "shorturl.at",
  "goo.gl",
]);

export function registrableDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return getDomain(parsed.hostname, { allowPrivateDomains: true });
  } catch {
    return null;
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isShortener(url: string): boolean {
  const host = hostOf(url);
  return host ? SHORTENER_HOSTS.has(host) : false;
}

export function sameRegistrableDomain(a: string, b: string): boolean {
  const left = registrableDomain(a);
  const right = registrableDomain(b);
  return Boolean(left && right && left === right);
}

export function normalizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function fetchWithRedirects(
  url: string,
  options: {
    maxHops?: number;
    timeoutMs?: number;
    headers?: Record<string, string>;
    method?: string;
    stopOnOffsite?: boolean;
  } = {},
): Promise<{ hops: UrlHop[]; response: Response | null; finalUrl: string; error?: string }> {
  const maxHops = options.maxHops ?? 8;
  const timeoutMs = options.timeoutMs ?? config.requestTimeoutMs;
  const hops: UrlHop[] = [];
  let current = url;

  for (let i = 0; i < maxHops; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, {
        method: options.method ?? "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": config.userAgent,
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          ...options.headers,
        },
      });
      const location = response.headers.get("location") ?? undefined;
      hops.push({ url: current, status: response.status, location });

      if (location && [301, 302, 303, 307, 308].includes(response.status)) {
        const next = new URL(location, current).href;
        if (options.stopOnOffsite && !sameRegistrableDomain(url, next)) {
          return { hops, response, finalUrl: next };
        }
        current = next;
        continue;
      }

      return { hops, response, finalUrl: current };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      hops.push({ url: current, status: 0 });
      return { hops, response: null, finalUrl: current, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  return { hops, response: null, finalUrl: current, error: "too many redirects" };
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || undefined;
}

export function htmlLooksBlocked(html: string): boolean {
  return /just a moment|attention required|cf-browser-verification|checking your browser|unusual traffic|access denied|enable javascript and cookies to continue/i.test(
    html,
  );
}

export function htmlLooksParked(html: string): boolean {
  return /domain is for sale|buy this domain|this domain may be for sale|hugedomains|sedoparking|godaddy\.com\/domainsearch|parked free|this webpage is parked|welcome to nginx!|apache2 ubuntu default page/i.test(
    html,
  );
}
