const grid = document.getElementById("grid");
const statsEl = document.getElementById("stats");
const statusEl = document.getElementById("status");
const scanBtn = document.getElementById("scan");
const tabs = document.querySelectorAll(".tabs button");

const initialCategory = new URLSearchParams(location.search).get("category");
let category = initialCategory === null ? "should_check" : initialCategory;
tabs.forEach((tab) => {
  tab.classList.toggle("active", tab.dataset.category === category);
});

const money = (value) => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
};

const age = (ms) => {
  if (!ms) return "unknown age";
  const hours = Math.max(0, (Date.now() - ms) / 36e5);
  if (hours < 24) return `${hours.toFixed(1)}h old`;
  return `${(hours / 24).toFixed(1)}d old`;
};

const pillClass = (categoryName) => {
  if (categoryName === "should_check") return "check";
  if (categoryName === "watch") return "watch";
  return "skip";
};

async function loadStats() {
  const res = await fetch("/api/stats");
  const stats = await res.json();
  statsEl.innerHTML = `
    <div class="stat"><span>Should check</span><strong>${stats.should_check}</strong></div>
    <div class="stat"><span>Watch</span><strong>${stats.watch}</strong></div>
    <div class="stat"><span>Not worthy</span><strong>${stats.not_worthy}</strong></div>
    <div class="stat"><span>Last scan checked</span><strong>${stats.lastScan?.checked ?? 0}</strong></div>
  `;
  if (stats.lastScan) {
    statusEl.textContent = `Last scan ${new Date(stats.lastScan.finishedAt).toLocaleTimeString()} · discovered ${stats.lastScan.discovered}`;
  }
}

function card(project) {
  const twitter = project.twitter.handle ? `@${project.twitter.handle}` : "No X";
  const failFlags = project.flags.filter((flag) => flag.severity !== "info").slice(0, 4);
  return `
    <article class="card">
      <div class="card-head">
        <img src="${project.icon ?? ""}" alt="" />
        <div>
          <h2>${project.name} <span class="meta">${project.symbol}</span></h2>
          <div class="meta">${project.chainId} · score ${project.score} · ${age(project.pairCreatedAt)}</div>
        </div>
      </div>
      <div class="pills">
        <span class="pill ${pillClass(project.category)}">${project.category.replaceAll("_", " ")}</span>
        <span class="pill ${project.website.outcome === "ok" ? "ok" : "fail"}">web: ${project.website.outcome}</span>
        <span class="pill ${project.twitter.outcome === "ok" ? "ok" : "fail"}">x: ${project.twitter.outcome}</span>
        ${project.promo.hasProfile ? `<span class="pill">profile</span>` : ""}
        ${project.promo.hasBoost ? `<span class="pill">boost</span>` : ""}
        ${project.promo.hasAd ? `<span class="pill">ad</span>` : ""}
      </div>
      <div class="metrics">
        <div><span>Price</span>${project.priceUsd == null ? "—" : `$${Number(project.priceUsd).toPrecision(4)}`}</div>
        <div><span>Market cap</span>${money(project.marketCap)}</div>
        <div><span>Liquidity</span>${money(project.liquidityUsd)}</div>
      </div>
      <p class="summary">${project.summary}</p>
      <ul class="flags">${failFlags.map((flag) => `<li>${flag.message}</li>`).join("")}</ul>
      <div class="links">
        ${project.pairUrl ? `<a href="${project.pairUrl}" target="_blank" rel="noreferrer">DexScreener</a>` : ""}
        ${project.websites[0] ? `<a href="${project.websites[0]}" target="_blank" rel="noreferrer">Website</a>` : ""}
        ${project.twitter.url ? `<a href="${project.twitter.url}" target="_blank" rel="noreferrer">${twitter}</a>` : ""}
      </div>
      <div class="card-actions">
        <button class="secondary" data-id="${project.id}" data-cat="should_check">Mark should check</button>
        <button class="secondary" data-id="${project.id}" data-cat="not_worthy">Not worthy</button>
      </div>
    </article>
  `;
}

async function loadProjects() {
  const query = category ? `?category=${category}` : "";
  const res = await fetch(`/api/projects${query}`);
  const data = await res.json();
  if (!data.projects.length) {
    grid.innerHTML = `<p class="empty">Nothing in this category yet. Run a scan.</p>`;
    return;
  }
  grid.innerHTML = data.projects.map(card).join("");
}

async function refresh() {
  await Promise.all([loadStats(), loadProjects()]);
}

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  statusEl.textContent = "Scanning DexScreener and checking links…";
  try {
    const res = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const summary = await res.json();
    statusEl.textContent = `Checked ${summary.checked} · skipped ${summary.skippedNotWorthy} already rejected`;
    await refresh();
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    scanBtn.disabled = false;
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    tabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    category = tab.dataset.category;
    const url = new URL(location.href);
    if (category) url.searchParams.set("category", category);
    else url.searchParams.delete("category");
    history.replaceState(null, "", url);
    await loadProjects();
  });
});

grid.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  await fetch(`/api/projects/${encodeURIComponent(button.dataset.id)}/override`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category: button.dataset.cat }),
  });
  await refresh();
});

refresh().catch((error) => {
  statusEl.textContent = error.message;
});
