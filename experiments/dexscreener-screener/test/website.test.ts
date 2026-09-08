import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkWebsite } from "../src/checks/website.js";

let base = "";
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        "<html><title>Acme</title><body><h1>Acme</h1><p>Protocol docs, app download, and token info.</p></body></html>",
      );
      return;
    }
    if (req.url === "/park") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>This domain is for sale at HugeDomains</body></html>");
      return;
    }
    if (req.url === "/gone") {
      res.writeHead(404);
      res.end("nope");
      return;
    }
    if (req.url === "/leave") {
      res.writeHead(302, { location: "https://unrelated-destination.test/" });
      res.end();
      return;
    }
    res.writeHead(403);
    res.end("no");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address && typeof address === "object") base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("checkWebsite", () => {
  it("accepts a live page", async () => {
    const result = await checkWebsite(base);
    expect(result.outcome).toBe("ok");
    expect(result.title).toBe("Acme");
  });

  it("flags parked pages", async () => {
    const result = await checkWebsite(`${base}/park`);
    expect(result.outcome).toBe("parked");
  });

  it("flags 404", async () => {
    const result = await checkWebsite(`${base}/gone`);
    expect(result.outcome).toBe("not_found");
  });

  it("flags off-site redirects", async () => {
    const result = await checkWebsite(`${base}/leave`);
    expect(result.outcome).toBe("redirect_offsite");
  });

  it("flags shorteners without fetching", async () => {
    const result = await checkWebsite("https://bit.ly/hidden");
    expect(result.outcome).toBe("shortener");
  });

  it("warns when no site is listed", async () => {
    const result = await checkWebsite(null);
    expect(result.outcome).toBe("missing");
  });
});
