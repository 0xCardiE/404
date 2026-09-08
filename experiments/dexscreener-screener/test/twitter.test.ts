import { afterEach, describe, expect, it, vi } from "vitest";
import { checkTwitter, parseTwitterUrl } from "../src/checks/twitter.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseTwitterUrl", () => {
  it("reads profile and tweet URLs", () => {
    expect(parseTwitterUrl("https://x.com/AcmeLabs")).toEqual({ handle: "AcmeLabs", kind: "profile" });
    expect(parseTwitterUrl("https://twitter.com/AcmeLabs/status/123")).toEqual({
      handle: "AcmeLabs",
      statusId: "123",
      kind: "tweet",
    });
  });

  it("handles missing links", () => {
    expect(parseTwitterUrl(null).kind).toBe("missing");
  });
});

describe("checkTwitter", () => {
  it("uses FixTweet JSON when the account exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("api.fxtwitter.com")) {
          return new Response(
            JSON.stringify({
              code: 200,
              user: {
                screen_name: "AcmeLabs",
                name: "Acme",
                description: "building",
                followers: 400,
                tweets: 12,
                website: { url: "https://acme.xyz" },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const result = await checkTwitter("https://x.com/AcmeLabs");
    expect(result.outcome).toBe("ok");
    expect(result.followers).toBe(400);
    expect(result.website).toBe("https://acme.xyz");
  });

  it("treats a FixTweet redirect as a missing account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(null, {
          status: 302,
          headers: { location: "https://github.com/FxEmbed/FxEmbed" },
        });
      }),
    );

    const result = await checkTwitter("https://x.com/nope404");
    expect(result.outcome).toBe("not_found");
  });
});
