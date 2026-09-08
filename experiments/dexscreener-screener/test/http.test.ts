import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fetchWithRedirects,
  isShortener,
  registrableDomain,
  sameRegistrableDomain,
} from "../src/http.js";

describe("domain helpers", () => {
  it("treats www and apex as the same site", () => {
    expect(sameRegistrableDomain("https://www.example.com/app", "https://example.com")).toBe(true);
    expect(registrableDomain("https://app.example.co.uk/x")).toBe("example.co.uk");
  });

  it("detects off-site hops", () => {
    expect(sameRegistrableDomain("https://token.xyz", "https://unrelated.com")).toBe(false);
  });

  it("flags common shorteners", () => {
    expect(isShortener("https://bit.ly/abc")).toBe(true);
    expect(isShortener("https://realproject.xyz")).toBe(false);
  });
});

describe("fetchWithRedirects", () => {
  let base = "";
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/ok") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><title>Real Project</title><body>hello world content here</body></html>");
        return;
      }
      if (req.url === "/away") {
        res.writeHead(302, { location: "https://evil.example/phish" });
        res.end();
        return;
      }
      if (req.url === "/local") {
        res.writeHead(302, { location: "/ok" });
        res.end();
        return;
      }
      res.writeHead(404);
      res.end("missing");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address && typeof address === "object") base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("follows a same-origin redirect and keeps hops", async () => {
    const result = await fetchWithRedirects(`${base}/local`);
    expect(result.response?.status).toBe(200);
    expect(result.finalUrl).toBe(`${base}/ok`);
    expect(result.hops.map((hop) => hop.status)).toEqual([302, 200]);
  });

  it("records an off-site redirect without following off the fixture host unless told to", async () => {
    const result = await fetchWithRedirects(`${base}/away`);
    expect(result.hops[0]?.status).toBe(302);
    expect(result.hops[0]?.location).toContain("evil.example");
  });
});
