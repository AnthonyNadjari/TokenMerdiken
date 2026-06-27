#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   watch-session.mjs — turn Claude Code's local logs into status.json

   Claude Code (the CLI) records every session as a .jsonl transcript under
   ~/.claude/projects/<project>/<sessionId>.jsonl. This watcher follows the
   most recently active one and writes ./status.json with your session vitals:
   context fullness, last activity, message count, and — the point — a flag
   the moment the session RE-INITIALISES or the context gets COMPACTED.

   USAGE
     node scripts/watch-session.mjs                 # follow + write status.json
     node scripts/watch-session.mjs --push          # also git-commit+push on change
     node scripts/watch-session.mjs --once          # write once and exit (testing)

   FLAGS
     --dir <path>        Claude projects dir   (default ~/.claude/projects)
     --out <path>        output file           (default ./status.json)
     --interval <ms>     poll interval         (default 4000)
     --limit <n>         context window tokens (default 200000)
     --compact-at <n>    auto-compaction point (default 160000)
     --push              git add/commit/push status.json when state changes

   ⚠️  This sees Claude Code running on THIS machine (the CLI). A session you
       run in the cloud (Claude Code on the web) is not on disk here, so it
       can't be watched from outside — the page shows demo data until a local
       session writes status.json.
   ────────────────────────────────────────────────────────────────────────── */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const has = (name) => args.includes(name);

const DIR      = flag("--dir", join(homedir(), ".claude", "projects"));
const OUT      = flag("--out", "status.json");
const INTERVAL = +flag("--interval", "4000");
const LIMIT    = +flag("--limit", "1000000");
const COMPACT  = +flag("--compact-at", "800000");
const PUSH     = has("--push");
const ONCE     = has("--once");

let lastSessionId = null;
let knownCompactions = new Set();
let events = []; // newest first

/* read events from an existing status.json so history survives restarts */
async function seedHistory() {
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(await readFile(OUT, "utf8"));
      events = prev.events || [];
      lastSessionId = prev.session?._id || prev.session?.shortId || null;
      for (const e of events) if (e.type === "compacted") knownCompactions.add(e.at);
    } catch { /* ignore */ }
  }
}

/* find the most-recently-modified transcript across all project dirs */
async function newestTranscript() {
  if (!existsSync(DIR)) return null;
  let best = null;
  const projects = await readdir(DIR, { withFileTypes: true });
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const pdir = join(DIR, p.name);
    let files;
    try { files = await readdir(pdir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const full = join(pdir, f);
      const s = await stat(full);
      if (!best || s.mtimeMs > best.mtimeMs) {
        best = { path: full, mtimeMs: s.mtimeMs, project: p.name, sessionId: basename(f, ".jsonl") };
      }
    }
  }
  return best;
}

const looksCompacted = (o) =>
  o?.type === "summary" ||
  o?.isCompactSummary === true ||
  o?.subtype === "compact_boundary" ||
  o?.compactMetadata != null ||
  (o?.message?.role === "system" && /compact/i.test(JSON.stringify(o.message.content || "")));

function tokensFromUsage(u) {
  if (!u) return 0;
  return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) +
         (u.cache_creation_input_tokens || 0);
}

async function parseTranscript(file) {
  const text = await readFile(file.path, "utf8");
  const lines = text.split("\n").filter(Boolean);

  let firstTs = null, lastTs = null, model = null, messages = 0, used = 0;
  const compactions = [];
  const msgTimes = [];

  for (const line of lines) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    const ts = o.timestamp || o.ts || o.time;
    if (ts) { firstTs ??= ts; lastTs = ts; }
    const role = o.message?.role || o.role;
    if (role === "user" || role === "assistant") { messages++; if (ts) msgTimes.push(new Date(ts).getTime()); }
    if (o.message?.model) model = o.message.model;
    const u = o.message?.usage || o.usage;
    const t = tokensFromUsage(u);
    if (t > 0) used = t; // last known prompt size ≈ current context
    if (looksCompacted(o)) compactions.push(ts || new Date().toISOString());
  }

  // bucket message cadence across the session → activity sparkline
  const BUCKETS = 14;
  const activity = new Array(BUCKETS).fill(0);
  if (msgTimes.length) {
    const t0 = Math.min(...msgTimes), t1 = Math.max(...msgTimes), span = Math.max(1, t1 - t0);
    for (const t of msgTimes) activity[Math.min(BUCKETS - 1, Math.floor(((t - t0) / span) * BUCKETS))]++;
  }

  return {
    sessionId: file.sessionId,
    project: decodeProject(file.project),
    startedAt: firstTs || new Date(file.mtimeMs).toISOString(),
    lastActivityAt: lastTs || new Date(file.mtimeMs).toISOString(),
    model: model || "claude-opus-4-8",
    messages,
    used,
    compactions,
    activity,
  };
}

/* Claude Code encodes the cwd into the project dir name; show a readable tail */
function decodeProject(name) {
  const parts = name.replace(/^-/, "").split("-");
  return parts[parts.length - 1] || name;
}

function pushEvent(type, at) {
  events.unshift({ type, at });
  events = events.slice(0, 20);
}

async function gitPush() {
  const run = (cmd, a) => new Promise((res) => execFile(cmd, a, (e) => res(!e)));
  await run("git", ["add", OUT]);
  await run("git", ["commit", "-m", "session status update"]);
  await run("git", ["push"]);
}

async function tickOnce() {
  const file = await newestTranscript();
  if (!file) {
    console.error(`No transcripts under ${DIR}. Is the Claude Code CLI installed/used on this machine?`);
    return false;
  }

  const p = await parseTranscript(file);
  let stateChanged = false;

  // new session?
  if (lastSessionId && lastSessionId !== p.sessionId) {
    pushEvent("new_session", p.startedAt);
    stateChanged = true;
  }
  lastSessionId = p.sessionId;

  // new compactions?
  for (const at of p.compactions) {
    if (!knownCompactions.has(at)) {
      knownCompactions.add(at);
      pushEvent("compacted", at);
      stateChanged = true;
    }
  }

  const lastEvent = events[0] || { type: "new_session", at: p.startedAt };
  // highlight the state briefly after a change, otherwise "active"
  const sinceEventMin = (Date.now() - new Date(lastEvent.at).getTime()) / 60000;
  const state = sinceEventMin < 3 ? lastEvent.type : "active";

  const status = {
    updatedAt: new Date().toISOString(),
    isDemo: false,
    state,
    lastEvent,
    session: {
      _id: p.sessionId,
      shortId: p.sessionId.slice(0, 6),
      model: p.model,
      startedAt: p.startedAt,
      lastActivityAt: p.lastActivityAt,
      messages: p.messages,
      project: p.project,
    },
    context: { used: p.used, limit: LIMIT, compactAt: COMPACT },
    activity: p.activity,
    events,
  };

  await writeFile(OUT, JSON.stringify(status, null, 2) + "\n");
  if (PUSH && stateChanged) await gitPush();

  if (stateChanged) console.log(`▸ ${lastEvent.type} @ ${lastEvent.at}`);
  return true;
}

/* ── run ──────────────────────────────────────────────────────────────── */
await seedHistory();
const ok = await tickOnce();
if (ONCE || !ok) process.exit(ok ? 0 : 1);

console.log(`watching ${DIR}\nwriting ${OUT} every ${INTERVAL}ms${PUSH ? " (+push on change)" : ""}`);
setInterval(() => { tickOnce().catch((e) => console.error(e.message)); }, INTERVAL);
