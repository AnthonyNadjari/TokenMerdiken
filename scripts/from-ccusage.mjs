#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Build usage.json from your LOCAL Claude Code usage — no API key needed.

   Claude Code records every session locally. `ccusage` reads those logs and
   reports your real token consumption. This adapter converts its JSON into the
   shape the page expects.

   USAGE (run on the machine where you use Claude Code):
     npx ccusage@latest daily --json | node scripts/from-ccusage.mjs > usage.json

   Then commit usage.json. The page picks it up automatically.

   If ccusage changes its field names, tweak the picks below — they're defensive.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";

const raw = readFileSync(0, "utf8"); // read stdin
let doc;
try { doc = JSON.parse(raw); }
catch { console.error("Could not parse ccusage JSON from stdin."); process.exit(1); }

const daily = doc.daily ?? doc.data ?? [];
if (!daily.length) { console.error("No daily entries found in ccusage output."); process.exit(1); }

const pick = (o, ...keys) => { for (const k of keys) if (o[k] != null) return o[k]; return 0; };

const last = daily.slice(-14);
const tints = ["lime", "teal", "coral", "muted"];

let totalTokens = 0, totalCost = 0;
let inTok = 0, outTok = 0, cacheRead = 0, cacheWrite = 0;
const modelMap = new Map();

const days = last.map((d) => {
  const i  = pick(d, "inputTokens", "input_tokens");
  const o  = pick(d, "outputTokens", "output_tokens");
  const cr = pick(d, "cacheReadTokens", "cache_read_tokens", "cacheReadInputTokens");
  const cw = pick(d, "cacheCreationTokens", "cache_creation_tokens", "cacheCreationInputTokens");
  const tokens = pick(d, "totalTokens", "total_tokens") || (i + o + cr + cw);

  totalTokens += tokens; totalCost += pick(d, "totalCost", "total_cost", "costUSD");
  inTok += i; outTok += o; cacheRead += cr; cacheWrite += cw;

  for (const m of d.modelBreakdowns ?? d.modelBreakdown ?? []) {
    const name = (m.modelName ?? m.model ?? "model").replace(/^claude-/, "").replace(/-\d{8}$/, "");
    const mt = pick(m, "totalTokens", "total_tokens") ||
      (pick(m, "inputTokens", "input_tokens") + pick(m, "outputTokens", "output_tokens") +
       pick(m, "cacheReadTokens") + pick(m, "cacheCreationTokens"));
    const e = modelMap.get(name) ?? { tokens: 0, cost: 0 };
    e.tokens += mt;
    e.cost += pick(m, "cost", "totalCost", "costUSD");
    modelMap.set(name, e);
  }

  const date = pick(d, "date") || "";
  return {
    date,
    label: date ? new Date(date).toLocaleDateString("en-US", { weekday: "short" }) : "",
    tokens,
  };
});

const models = [...modelMap.entries()]
  .sort((a, b) => b[1].tokens - a[1].tokens)
  .map(([name, e], i) => ({ name, tokens: e.tokens, cost: e.cost, tint: tints[i % tints.length] }));

const typed = inTok + outTok + cacheRead + cacheWrite || 1;
const tokenTypes = [
  { name: "Input",       value: inTok / typed,     tint: "teal" },
  { name: "Output",      value: outTok / typed,    tint: "lime" },
  { name: "Cache read",  value: cacheRead / typed, tint: "coral" },
  { name: "Cache write", value: cacheWrite / typed, tint: "muted" },
];

const payload = {
  updatedAt: new Date().toISOString(),
  isDemo: false,
  kpis: {
    tokens: totalTokens,
    cost: totalCost,
    requests: last.length, // ccusage reports days, not request counts
    cacheHitRate: cacheRead / (cacheRead + inTok || 1),
  },
  days,
  models: models.length ? models : [{ name: "all", tokens: totalTokens, cost: totalCost, tint: "lime" }],
  tokenTypes,
};

process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
