import { config } from "./config.js";
import { runScan } from "./pipeline.js";
import { listen } from "./server.js";
import { ProjectStore } from "./store.js";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function scanOnce(): Promise<void> {
  const store = new ProjectStore();
  const limitRaw = argValue("--limit");
  const summary = await runScan(store, {
    recheckKnown: hasFlag("--recheck"),
    limit: limitRaw ? Number(limitRaw) : undefined,
  });
  console.log(JSON.stringify(summary, null, 2));
}

async function watch(): Promise<void> {
  const store = new ProjectStore();
  const { close } = await listen();
  console.log(`Dashboard http://localhost:${config.port}`);
  const tick = async () => {
    try {
      const summary = await runScan(store);
      console.log(
        `[${summary.finishedAt}] discovered=${summary.discovered} checked=${summary.checked} skippedNotWorthy=${summary.skippedNotWorthy} skippedKnown=${summary.skippedKnown}`,
      );
      if (summary.errors.length) console.warn("scan errors:", summary.errors);
    } catch (error) {
      console.error("scan failed", error);
    }
  };
  await tick();
  const timer = setInterval(() => {
    void tick();
  }, config.scanIntervalMs);
  const shutdown = async () => {
    clearInterval(timer);
    await close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

const command = process.argv[2] ?? "watch";

if (command === "scan") {
  await scanOnce();
} else if (command === "dashboard") {
  await listen();
  console.log(`Dashboard http://localhost:${config.port}`);
} else if (command === "watch") {
  await watch();
} else {
  console.error("Usage: tsx src/cli.ts <scan|watch|dashboard> [--limit N] [--recheck]");
  process.exit(1);
}
