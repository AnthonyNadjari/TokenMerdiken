# Token Meridian

A clean, animated dashboard for your **Claude token consumption** — built as a
single static site for GitHub Pages. Click one button, watch your numbers count
up across animated charts.

No build step, no dependencies, no backend.

---

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: _Deploy from a branch_**.
3. Pick branch `claude/github-token-status-ui-lfrqpx` (or merge to `main`) and
   folder `/ (root)`. Save.
4. Open the URL it gives you (`https://<you>.github.io/<repo>/`). Done.

The page works immediately — it ships with realistic sample data so it's never
blank.

---

## Show your REAL tokens

The page automatically loads `usage.json` if it exists in the repo root, and
falls back to sample data otherwise. So getting real numbers is: **generate
`usage.json`, commit it.** Nothing else changes.

> A static page can't fetch your usage live: the browser is blocked by CORS from
> calling Anthropic's API, and any key embedded in the page would be public.
> That's why you generate the file with a key/logs that stay on your machine.

Pick whichever source fits:

### Option A — your Claude Code usage (no API key)

Claude Code logs every session locally. [`ccusage`](https://github.com/ryoppippi/ccusage)
reads those logs:

```bash
npx ccusage@latest daily --json | node scripts/from-ccusage.mjs > usage.json
git add usage.json && git commit -m "real usage" && git push
```

### Option B — your whole org's API usage (admin key)

Uses Anthropic's Admin Usage & Cost API. Needs an **admin** key
(`sk-ant-admin-…`, Console → Organization).

```bash
export ANTHROPIC_ADMIN_KEY=sk-ant-admin-...
node scripts/fetch-usage.mjs > usage.json
git add usage.json && git commit -m "real usage" && git push
```

Re-run either command whenever you want fresh numbers (or wire it into a daily
GitHub Action). The "demo data" badge disappears once real data loads.

---

## The data shape

Everything the UI needs lives in one small JSON object (see `data.js` for the
annotated schema):

```jsonc
{
  "updatedAt": "2026-06-27T...",
  "isDemo": false,
  "kpis": { "tokens": 0, "cost": 0, "requests": 0, "cacheHitRate": 0.0 },
  "days":  [ { "date": "2026-06-14", "label": "Sat", "tokens": 0 } ],
  "models":[ { "name": "Opus 4.8", "tokens": 0, "cost": 0, "tint": "lime" } ],
  "tokenTypes": [ { "name": "Input", "value": 0.41, "tint": "teal" } ]
}
```

## Files

| File | What it is |
|------|------------|
| `index.html` | markup |
| `styles.css` | the whole look (no framework) |
| `app.js` | counters, charts, reveal animation |
| `data.js` | the data layer — loads `usage.json` or falls back to sample data |
| `scripts/from-ccusage.mjs` | local Claude Code usage → `usage.json` |
| `scripts/fetch-usage.mjs` | Admin API → `usage.json` |
