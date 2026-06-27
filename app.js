/* ──────────────────────────────────────────────────────────────────────────
   TOKEN MERIDIAN · interactions
   - magnetic button
   - reveal sequence
   - count-up odometers
   - SVG donut + bar chart + model bars, all animated on enter
   ────────────────────────────────────────────────────────────────────────── */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── helpers ──────────────────────────────────────────────────────────── */
const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

function formatTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
function formatInt(n) { return Math.round(n).toLocaleString("en-US"); }
function formatMoney(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* animate a number from 0 → target, calling render(value) each frame */
function countUp(target, duration, render) {
  if (reduceMotion) { render(target); return; }
  const start = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    render(target * easeOutExpo(p));
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ── cursor glow ──────────────────────────────────────────────────────── */
(function cursorGlow() {
  const glow = $(".cursor-glow");
  if (!glow || matchMedia("(pointer: coarse)").matches) return;
  window.addEventListener("pointermove", (e) => {
    glow.style.opacity = "1";
    glow.style.left = e.clientX + "px";
    glow.style.top = e.clientY + "px";
  });
})();

/* ── magnetic button ──────────────────────────────────────────────────── */
(function magnetic() {
  const btn = $("#revealBtn");
  if (!btn || matchMedia("(pointer: coarse)").matches) return;
  const strength = 0.35;
  btn.addEventListener("pointermove", (e) => {
    const r = btn.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    btn.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  });
  btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
})();

/* ── KPI counters ─────────────────────────────────────────────────────── */
function renderKpis(kpis) {
  $$("[data-counter]").forEach((el) => {
    const key = el.dataset.key;
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    let target = kpis[key];
    let render;

    if (key === "tokens") {
      render = (v) => (el.textContent = formatTokens(v));
    } else if (key === "cost") {
      render = (v) => (el.textContent = prefix + formatMoney(v));
    } else if (key === "cacheHitRate") {
      target = kpis[key] * 100;
      render = (v) => (el.textContent = v.toFixed(0) + suffix);
    } else {
      render = (v) => (el.textContent = formatInt(v) + suffix);
    }
    countUp(target, 1400, render);
  });

  $("#tokensFoot").textContent = formatInt(kpis.tokens) + " tokens · last 14 days";
}

/* ── bar chart ────────────────────────────────────────────────────────── */
function renderBars(days) {
  const wrap = $("#barChart");
  wrap.innerHTML = "";
  const max = Math.max(...days.map((d) => d.tokens));

  days.forEach((d, i) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    const h = Math.max(0.04, d.tokens / max);
    bar.innerHTML = `
      <div class="bar__fill" data-val="${formatTokens(d.tokens)}" style="height:${h * 100}%"></div>
      <span class="bar__lbl">${d.label}</span>`;
    wrap.appendChild(bar);

    const fill = bar.querySelector(".bar__fill");
    if (reduceMotion) { fill.style.transform = "scaleY(1)"; }
    else {
      fill.style.transitionDelay = `${i * 55}ms`;
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transform = "scaleY(1)"; }));
    }
  });
}

/* ── donut (SVG) ──────────────────────────────────────────────────────── */
const TINT = { lime: "var(--lime)", coral: "var(--coral)", teal: "var(--teal)", muted: "var(--muted-2)" };

function renderDonut(types) {
  const host = $("#donut");
  const size = 150, sw = 18, r = (size - sw) / 2, c = 2 * Math.PI * r, cx = size / 2;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");

  // track
  const track = document.createElementNS(ns, "circle");
  track.setAttribute("cx", cx); track.setAttribute("cy", cx); track.setAttribute("r", r);
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "var(--surface-2)");
  track.setAttribute("stroke-width", sw);
  svg.appendChild(track);

  let offset = 0;
  const segs = [];
  types.forEach((t) => {
    const len = t.value * c;
    const seg = document.createElementNS(ns, "circle");
    seg.setAttribute("cx", cx); seg.setAttribute("cy", cx); seg.setAttribute("r", r);
    seg.setAttribute("fill", "none");
    seg.setAttribute("stroke", TINT[t.tint] || "var(--lime)");
    seg.setAttribute("stroke-width", sw);
    seg.setAttribute("stroke-linecap", "round");
    seg.setAttribute("stroke-dasharray", `${len} ${c - len}`);
    seg.setAttribute("stroke-dashoffset", -offset);
    seg.setAttribute("transform", `rotate(-90 ${cx} ${cx})`);
    if (!reduceMotion) {
      seg.style.opacity = "0";
      seg.style.transition = "stroke-dasharray 0.9s var(--ease), opacity 0.5s ease";
      seg.style.transitionDelay = `${segs.length * 120}ms`;
      seg.setAttribute("stroke-dasharray", `0 ${c}`);
      seg.dataset.len = len;
    }
    svg.appendChild(seg);
    segs.push(seg);
    offset += len;
  });

  // center label
  const total = document.createElementNS(ns, "text");
  total.setAttribute("x", cx); total.setAttribute("y", cx - 4);
  total.setAttribute("text-anchor", "middle");
  total.setAttribute("fill", "var(--ink)");
  total.setAttribute("font-family", "IBM Plex Mono, monospace");
  total.setAttribute("font-size", "20");
  total.setAttribute("font-weight", "600");
  total.textContent = "100%";
  const sub = document.createElementNS(ns, "text");
  sub.setAttribute("x", cx); sub.setAttribute("y", cx + 14);
  sub.setAttribute("text-anchor", "middle");
  sub.setAttribute("fill", "var(--muted)");
  sub.setAttribute("font-family", "IBM Plex Mono, monospace");
  sub.setAttribute("font-size", "9");
  sub.textContent = "tokens";
  svg.appendChild(total); svg.appendChild(sub);

  host.innerHTML = "";
  host.appendChild(svg);

  if (!reduceMotion) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      segs.forEach((seg) => {
        const len = +seg.dataset.len;
        seg.style.opacity = "1";
        seg.setAttribute("stroke-dasharray", `${len} ${c - len}`);
      });
    }));
  }

  // legend
  const legend = $("#donutLegend");
  legend.innerHTML = types.map((t) => `
    <li>
      <span class="dot t-${t.tint}"></span>
      <span class="nm">${t.name}</span>
      <span class="pc">${Math.round(t.value * 100)}%</span>
    </li>`).join("");
}

/* ── model spend bars ─────────────────────────────────────────────────── */
function renderModelBars(models) {
  const max = Math.max(...models.map((m) => m.cost));
  const ul = $("#modelBars");
  ul.innerHTML = models.map((m) => `
    <li>
      <div class="row">
        <span class="nm">${m.name}</span>
        <span class="val">$${formatMoney(m.cost)} · ${formatTokens(m.tokens)} tok</span>
      </div>
      <div class="track"><div class="track__fill t-${m.tint}" data-w="${(m.cost / max) * 100}"></div></div>
    </li>`).join("");

  $$(".track__fill", ul).forEach((fill, i) => {
    const w = fill.dataset.w + "%";
    if (reduceMotion) { fill.style.width = w; return; }
    fill.style.transitionDelay = `${i * 120}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = w; }));
  });
}

/* ── orchestration ────────────────────────────────────────────────────── */
function paint(data) {
  $("#updated").textContent =
    "updated " + new Date(data.updatedAt).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  $("#demoBadge").hidden = !data.isDemo;

  renderKpis(data.kpis);
  renderBars(data.days);
  renderDonut(data.tokenTypes);
  renderModelBars(data.models);
}

async function loadAndShow() {
  const data = await window.TokenMeridian.getUsage();
  paint(data);
}

/* assign stagger delays to dash sections */
function tagReveal() {
  const items = [
    ".dash__head", ".kpis", ".grid", ".dash__foot",
  ].map((s) => $(s)).filter(Boolean);
  items.forEach((el, i) => {
    el.classList.add("reveal-up");
    el.style.setProperty("--d", `${0.06 * i}s`);
  });
}

(function init() {
  const btn = $("#revealBtn");
  const hero = $("#hero");
  const dash = $("#dash");
  const rerun = $("#rerun");

  btn.addEventListener("click", async () => {
    btn.classList.add("is-loading");
    $(".reveal-btn__label").textContent = "Computing";

    // run data fetch + a beat for the loading shimmer
    const dataPromise = window.TokenMeridian.getUsage();
    await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 850));
    const data = await dataPromise;

    hero.classList.add("is-leaving");
    setTimeout(() => {
      hero.hidden = true;
      dash.hidden = false;
      tagReveal();
      requestAnimationFrame(() => {
        dash.classList.add("is-in");
        paint(data);
      });
    }, reduceMotion ? 0 : 500);
  });

  rerun.addEventListener("click", async () => {
    rerun.disabled = true;
    rerun.textContent = "↻ recomputing";
    await loadAndShow();
    rerun.textContent = "↻ recompute";
    rerun.disabled = false;
  });
})();
