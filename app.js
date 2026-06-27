/* ──────────────────────────────────────────────────────────────────────────
   SESSION MONITOR · interactions
   - polls status.json (via data.js) every 10s
   - live-ticking relative times
   - context gauge, state colours, lifecycle log
   ────────────────────────────────────────────────────────────────────────── */

const $ = (s, r = document) => r.querySelector(s);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATE = {
  active:      { label: "Active",         color: "var(--ok)"   },
  compacted:   { label: "Compacted",      color: "var(--info)" },
  new_session: { label: "New session",    color: "var(--info)" },
};

const EVENT_LABEL = {
  compacted:   "Context compacted",
  new_session: "Session re-initialised",
  active:      "Active",
};

let latest = null; // last status payload (for re-ticking relative times)

/* ── time helpers ─────────────────────────────────────────────────────── */
function rel(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return { v: Math.round(s), u: "sec" };
  const m = s / 60;
  if (m < 60) return { v: Math.round(m), u: m < 1.5 ? "min" : "min" };
  const h = m / 60;
  if (h < 24) return { v: +h.toFixed(h < 10 ? 1 : 0), u: "hr" };
  return { v: +(h / 24).toFixed(1), u: "days" };
}
function relText(iso) {
  const { v, u } = rel(iso);
  const unit = u === "sec" ? "s" : u === "min" ? "m" : u === "hr" ? "h" : "d";
  return `${v}${unit} ago`;
}
function clock(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/* ── easing count for the gauge percentage ────────────────────────────── */
function animateNumber(el, to, dur, fmt) {
  if (reduceMotion) { el.innerHTML = fmt(to); return; }
  const from = parseFloat(el.dataset.cur || "0");
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const p = Math.min(1, (now - start) / dur);
    const val = from + (to - from) * ease(p);
    el.innerHTML = fmt(val);
    if (p < 1) requestAnimationFrame(frame);
    else el.dataset.cur = to;
  }
  requestAnimationFrame(frame);
}

/* ── render ───────────────────────────────────────────────────────────── */
function render(d) {
  latest = d;
  const st = STATE[d.state] || STATE.active;

  // hero state colour + ribbon
  $("#hero").style.setProperty("--state", st.color);
  $("#statePill").style.setProperty("--state", st.color);
  $("#stateLabel").textContent = st.label;
  $("#demoPill").hidden = !d.isDemo;

  // the big glance: time since last lifecycle change
  const ev = d.lastEvent || { type: d.state, at: d.session?.startedAt };
  const r = rel(ev.at);
  $("#sinceValue").textContent = r.v;
  $("#sinceUnit").textContent = " " + r.u + " ago";
  $("#heroLead").textContent =
    d.state === "active" ? "Last lifecycle change" : "Changed";
  $("#heroSub").textContent =
    `${EVENT_LABEL[ev.type] || "Event"} · ${clock(ev.at)}`;

  // context gauge
  const ctx = d.context || { used: 0, limit: 1, compactAt: 1 };
  const pct = Math.min(100, Math.round((ctx.used / ctx.limit) * 100));
  const toCompact = Math.max(0, ctx.compactAt - ctx.used);
  const compactPct = ctx.used / ctx.compactAt; // 0..1 toward auto-compaction

  const C = 326.7;
  const fill = $("#gaugeFill");
  const off = C * (1 - Math.min(1, compactPct));
  // colour shifts calm → amber as it approaches compaction
  const gaugeColor = compactPct < 0.7 ? "var(--ok)" : compactPct < 0.9 ? "var(--warn)" : "var(--warn)";
  fill.style.stroke = gaugeColor;
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.strokeDashoffset = off; }));

  animateNumber($("#ctxPct"), pct, 900, (v) => `${Math.round(v)}<span>%</span>`);
  $("#ctxNote").textContent =
    toCompact > 0
      ? `${fmtTokens(toCompact)} tokens before auto-compaction`
      : `compaction threshold reached`;

  // vitals
  const s = d.session || {};
  setSince($("#vStarted"), s.startedAt);
  setSince($("#vActive"), s.lastActivityAt);
  $("#vMsgs").textContent = s.messages != null ? String(s.messages) : "—";
  $("#vModel").textContent = (s.model || "—").replace(/^claude-/, "");
  $("#vId").textContent = s.shortId || "—";

  // lifecycle log
  const log = $("#log");
  const events = (d.events || []).slice(0, 6);
  if (!events.length) {
    log.innerHTML = `<li class="log__empty">No lifecycle events recorded yet.</li>`;
  } else {
    log.innerHTML = events.map((e) => {
      const color = (STATE[e.type] || STATE.active).color;
      return `<li>
        <span class="log__dot" style="background:${color}"></span>
        <span class="log__label">${EVENT_LABEL[e.type] || e.type}</span>
        <span class="log__time" data-since data-at="${e.at}">${relText(e.at)} · ${clock(e.at)}</span>
      </li>`;
    }).join("");
  }

  // footer + sync state (honest about staleness)
  const dot = $("#syncDot");
  if (d.isDemo) {
    dot.classList.remove("is-live");
    $("#syncText").textContent = "demo data";
  } else {
    const ageS = (Date.now() - new Date(d.updatedAt).getTime()) / 1000;
    if (ageS < 90) {
      dot.classList.add("is-live");
      $("#syncText").textContent = "live · " + clock(d.updatedAt);
    } else {
      dot.classList.remove("is-live");
      $("#syncText").textContent = "last sync " + relText(d.updatedAt);
    }
  }
}

function setSince(el, iso) {
  if (!iso) { el.textContent = "—"; return; }
  el.dataset.at = iso;
  el.textContent = relText(iso);
}

function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K";
  return String(Math.round(n));
}

/* re-tick all relative times every second so the glance stays honest */
function tick() {
  if (!latest) return;
  // hero
  const ev = latest.lastEvent || { at: latest.session?.startedAt };
  if (ev?.at) {
    const r = rel(ev.at);
    $("#sinceValue").textContent = r.v;
    $("#sinceUnit").textContent = " " + r.u + " ago";
  }
  // every [data-since]
  document.querySelectorAll("[data-since][data-at]").forEach((el) => {
    el.firstChild
      ? (el.childNodes[0].nodeValue = relText(el.dataset.at) + (el.dataset.at && el.classList.contains("log__time") ? " · " + clock(el.dataset.at) : ""))
      : (el.textContent = relText(el.dataset.at));
  });
}

/* ── polling ──────────────────────────────────────────────────────────── */
async function refresh() {
  const dot = $("#syncDot");
  dot.classList.remove("is-live");
  $("#syncText").textContent = "syncing…";
  const d = await window.SessionMonitor.getStatus();
  render(d);
}

(function init() {
  const app = $("#app");

  // entrance
  [["#hero", 0], [".tile--gauge", 0.05], [".tile--vitals", 0.1], [".tile--log", 0.15]]
    .forEach(([sel, d]) => { const el = $(sel); if (el) { el.classList.add("rise"); el.style.setProperty("--d", d + "s"); } });

  refresh().then(() => {
    app.removeAttribute("data-loading");
    app.classList.add("is-ready");
  });

  $("#refresh").addEventListener("click", refresh);
  setInterval(refresh, 10000); // poll status.json
  setInterval(tick, 1000);     // keep relative times live
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
