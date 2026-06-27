# Session Monitor

A clean, glanceable page for your **Claude Code session state** — built as a
static site for GitHub Pages. Open it and instantly see:

- **Has the session re-initialised / compacted, and how long ago** (the big number).
- **Context fullness** — a gauge counting toward the next auto-compaction.
- **Vitals** — started, last activity, message count, model, session id.
- **Lifecycle log** — recent re-inits & compactions with timestamps.

No build step, no dependencies, no backend. Light/dark per your device.

---

## See it (works from your phone)

1. Push this repo to GitHub.
2. **Settings → Pages → Source: _Deploy from a branch_** → branch
   `claude/github-token-status-ui-lfrqpx` (or `main`), folder `/ (root)` → Save.
3. Open the URL. It works immediately on demo data so it's never blank.

---

## Wire in your REAL session (one command)

The page reads `status.json`. A small watcher generates it from Claude Code's
own logs — run it on the machine where you use the **Claude Code CLI**:

```bash
node scripts/watch-session.mjs --push
```

It follows your most recent session and rewrites `status.json` continuously,
and (with `--push`) commits + pushes whenever the session re-initialises or
compacts — so the GitHub Pages copy updates itself and you can watch from your
phone. The page polls every 10s and ticks the timers live.

Prefer to keep it local and instant (no commits)? Run the watcher without
`--push` and open `index.html` from the same folder with any static server:

```bash
node scripts/watch-session.mjs &
python3 -m http.server 8000   # then open http://localhost:8000
```

### Options

```
--dir <path>        Claude projects dir   (default ~/.claude/projects)
--out <path>        output file           (default ./status.json)
--interval <ms>     poll interval         (default 4000)
--limit <n>         context window tokens (default 200000)
--compact-at <n>    auto-compaction point (default 160000)
--push              git commit+push status.json when the state changes
--once              write once and exit (handy for testing)
```

> **Important:** the watcher can only see Claude Code running **on that machine
> (the CLI)**. A session you run in **Claude Code on the web** lives in the
> cloud — it isn't on your disk, so an outside page can't observe it. For
> CLI sessions it's fully automatic.

---

## The data shape (`status.json`)

```jsonc
{
  "updatedAt": "2026-06-27T...",
  "isDemo": false,
  "state": "active",                       // active | compacted | new_session
  "lastEvent": { "type": "compacted", "at": "..." },
  "session": {
    "shortId": "a7f3c9", "model": "claude-opus-4-8",
    "startedAt": "...", "lastActivityAt": "...",
    "messages": 168, "project": "TokenMerdiken"
  },
  "context": { "used": 128400, "limit": 200000, "compactAt": 160000 },
  "events": [ { "type": "compacted", "at": "..." } ]   // newest first
}
```

## Files

| File | What it is |
|------|------------|
| `index.html` | markup |
| `styles.css` | the whole look (no framework, light + dark) |
| `app.js` | polling, live timers, gauge, lifecycle log |
| `data.js` | loads `status.json`, falls back to demo |
| `scripts/watch-session.mjs` | Claude Code logs → `status.json` |
