/* ──────────────────────────────────────────────────────────────────────────
   SESSION MONITOR · data layer
   ----------------------------------------------------------------------------
   The page reads ./status.json (written by scripts/watch-session.mjs) and
   renders your live Claude Code session vitals. If status.json isn't there
   yet, it shows a realistic demo so the page is never blank.

   status.json schema (keep these keys):
   {
     "updatedAt":  ISO string,
     "isDemo":     false,
     "state":      "active" | "compacted" | "new_session",
     "lastEvent":  { "type": <state>, "at": ISO },
     "session":    { "shortId", "model", "startedAt", "lastActivityAt",
                     "messages", "project" },
     "context":    { "used": int, "limit": int, "compactAt": int },
     "events":     [ { "type", "at" }, ... ]   // newest first, a few recent
   }
   ────────────────────────────────────────────────────────────────────────── */

function minsAgo(n) { return new Date(Date.now() - n * 60000).toISOString(); }

function buildDemo() {
  const used = 412000;
  return {
    updatedAt: new Date().toISOString(),
    isDemo: true,
    state: "active",
    lastEvent: { type: "compacted", at: minsAgo(37) },
    session: {
      shortId: "a7f3c9",
      model: "claude-opus-4-8",
      startedAt: minsAgo(214),
      lastActivityAt: minsAgo(0.4),
      messages: 168,
      project: "TokenMerdiken",
    },
    context: { used, limit: 1000000, compactAt: 800000 },
    events: [
      { type: "compacted",    at: minsAgo(37) },
      { type: "new_session",  at: minsAgo(214) },
      { type: "compacted",    at: minsAgo(286) },
      { type: "new_session",  at: minsAgo(540) },
    ],
  };
}

async function getStatus() {
  try {
    const res = await fetch("./status.json", { cache: "no-store" });
    if (res.ok) {
      const real = await res.json();
      real.isDemo = false;
      return real;
    }
  } catch (_) { /* no status.json yet → demo */ }
  await new Promise((r) => setTimeout(r, 200));
  return buildDemo();
}

window.SessionMonitor = { getStatus };
