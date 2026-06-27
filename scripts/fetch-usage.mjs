#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Fetch real Claude usage + cost from Anthropic's Admin API and write a
   usage.json that the page can render.

   WHY a script (and not the browser): the Admin Usage & Cost API needs an
   ADMIN key, which must never ship in a public page, and the API doesn't send
   CORS headers for browser calls. So you run this locally / in CI, commit the
   resulting usage.json, and GitHub Pages serves static numbers. No secrets in
   the repo.

   USAGE:
     export ANTHROPIC_ADMIN_KEY=sk-ant-admin-...
     node scripts/fetch-usage.mjs > usage.json

   Then in data.js, replace getUsage() with:
     async function getUsage() {
       const r = await fetch("./usage.json", { cache: "no-store" });
       return r.json();
     }

   Docs: https://platform.claude.com/docs  (Admin API → Usage & Cost report)
   Endpoints used:
     GET https://api.anthropic.com/v1/organizations/usage_report/messages
     GET https://api.anthropic.com/v1/organizations/cost_report
   ────────────────────────────────────────────────────────────────────────── */

const KEY = process.env.ANTHROPIC_ADMIN_KEY;
if (!KEY) {
  console.error("Set ANTHROPIC_ADMIN_KEY (an admin key, sk-ant-admin-…).");
  process.exit(1);
}

const BASE = "https://api.anthropic.com/v1/organizations";
const HEADERS = { "x-api-key": KEY, "anthropic-version": "2023-06-01" };

const DAYS = 14;
const now = new Date();
const start = new Date(now);
start.setDate(now.getDate() - DAYS);
const iso = (d) => d.toISOString();

async function getJSON(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// Pull all pages (the Admin API paginates with next_page).
async function getAll(path, params) {
  const out = [];
  let qs = new URLSearchParams(params).toString();
  let url = `${BASE}/${path}?${qs}`;
  for (let i = 0; i < 50; i++) {
    const page = await getJSON(url);
    out.push(...(page.data ?? []));
    if (!page.has_more || !page.next_page) break;
    url = `${BASE}/${path}?${new URLSearchParams({ ...params, page: page.next_page })}`;
  }
  return out;
}

try {
  // Token usage, bucketed by day, grouped by model.
  const usage = await getAll("usage_report/messages", {
    starting_at: iso(start),
    ending_at: iso(now),
    bucket_width: "1d",
    "group_by[]": "model",
  });

  // Cost, bucketed by day.
  const cost = await getAll("cost_report", {
    starting_at: iso(start),
    ending_at: iso(now),
    bucket_width: "1d",
  });

  // ── reshape into the page's schema ──────────────────────────────────────
  const dayMap = new Map();
  const modelMap = new Map();
  let totalTokens = 0, totalRequests = 0;
  let inputTok = 0, outputTok = 0, cacheRead = 0, cacheWrite = 0;

  for (const bucket of usage) {
    const date = (bucket.starting_at || "").slice(0, 10);
    for (const r of bucket.results ?? []) {
      const t =
        (r.uncached_input_tokens ?? r.input_tokens ?? 0) +
        (r.output_tokens ?? 0) +
        (r.cache_read_input_tokens ?? 0) +
        (r.cache_creation?.ephemeral_5m_input_tokens ?? r.cache_creation_input_tokens ?? 0);
      totalTokens += t;
      totalRequests += r.server_tool_use?.web_search_requests ?? 0; // approx; see note
      inputTok += r.uncached_input_tokens ?? r.input_tokens ?? 0;
      outputTok += r.output_tokens ?? 0;
      cacheRead += r.cache_read_input_tokens ?? 0;
      cacheWrite += r.cache_creation_input_tokens ?? r.cache_creation?.ephemeral_5m_input_tokens ?? 0;

      dayMap.set(date, (dayMap.get(date) ?? 0) + t);
      const model = r.model ?? "unknown";
      modelMap.set(model, (modelMap.get(model) ?? 0) + t);
    }
  }

  let totalCost = 0;
  for (const bucket of cost) {
    for (const r of bucket.results ?? []) {
      totalCost += Number(r.amount ?? 0);
    }
  }

  const tints = ["lime", "teal", "coral", "muted"];
  const days = [...dayMap.entries()].sort().map(([date, tokens]) => ({
    date,
    label: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
    tokens,
  }));

  const models = [...modelMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, tokens], i) => ({
      name: name.replace(/^claude-/, "").replace(/-\d{8}$/, ""),
      tokens,
      cost: totalTokens ? totalCost * (tokens / totalTokens) : 0,
      tint: tints[i % tints.length],
    }));

  const totalTyped = inputTok + outputTok + cacheRead + cacheWrite || 1;
  const tokenTypes = [
    { name: "Input",       value: inputTok / totalTyped,  tint: "teal" },
    { name: "Output",      value: outputTok / totalTyped, tint: "lime" },
    { name: "Cache read",  value: cacheRead / totalTyped, tint: "coral" },
    { name: "Cache write", value: cacheWrite / totalTyped, tint: "muted" },
  ];

  const payload = {
    updatedAt: iso(now),
    isDemo: false,
    kpis: {
      tokens: totalTokens,
      cost: totalCost,
      requests: totalRequests || usage.length, // refine to your needs
      cacheHitRate: cacheRead / (cacheRead + inputTok || 1),
    },
    days,
    models,
    tokenTypes,
  };

  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
} catch (err) {
  console.error("Failed:", err.message);
  console.error("Check that ANTHROPIC_ADMIN_KEY is an admin key and the field names match the current API (see docs).");
  process.exit(1);
}
