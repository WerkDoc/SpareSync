// =====================================================================
//  Wochenrückblick im Story-Stil (wie Instagram): montags auf der Übersicht,
//  wischen/tippen durch die Woche – Entnahmen, Top-Teil, Wareneingang, was knapp wird
// =====================================================================
import * as db from './db.js';
import { icon } from './icons.js';
import { esc, fmtQty, fmtEUR, countUp, layer } from './ui.js';
import { haptic } from './haptics.js';

const SEEN_KEY = 'ss-recap-seen';
const SLIDE_MS = 5200;
const DAY = 864e5;

/** Montag 0:00 der Woche, `offset` Wochen zurück */
function weekStart(offset = 0, now = new Date()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offset * 7);
  return d;
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((t - y) / DAY + 1) / 7), year: t.getUTCFullYear() };
}
const weekId = (d) => { const w = isoWeek(d); return `${w.year}-W${w.week}`; };

export function recapData(movs, mats, isLow) {
  const from = weekStart(1); const to = weekStart(0); const prevFrom = weekStart(2);
  const inRange = (x, a, b) => { const t = Date.parse(x.created_at); return t >= a && t < b; };
  const last = movs.filter((x) => inRange(x, from, to));
  const prev = movs.filter((x) => inRange(x, prevFrom, from));
  const byId = new Map(mats.map((m) => [m.id, m]));
  const sum = (arr, type) => arr.filter((x) => x.type === type).reduce((a, x) => a + Math.abs(+x.qty || 0), 0);
  const out = sum(last, 'out'); const outPrev = sum(prev, 'out'); const inn = sum(last, 'in');
  const perMat = new Map();
  last.filter((x) => x.type === 'out').forEach((x) => perMat.set(x.material_id, (perMat.get(x.material_id) || 0) + Math.abs(+x.qty || 0)));
  const ranking = [...perMat].sort((a, b) => b[1] - a[1]);
  const top = ranking[0] ? { m: byId.get(ranking[0][0]), qty: ranking[0][1] } : null;
  const outValue = last.filter((x) => x.type === 'out').reduce((a, x) => a + Math.abs(+x.qty || 0) * (+byId.get(x.material_id)?.purchase_price || 0), 0);
  const low = mats.filter(isLow).sort((a, b) => (a.total - a.min_stock) - (b.total - b.min_stock)).slice(0, 3);
  const end = new Date(to - DAY);
  return {
    id: weekId(from), week: isoWeek(from).week,
    range: `${from.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`,
    out, outPrev, inn, inCount: last.filter((x) => x.type === 'in').length, outCount: last.filter((x) => x.type === 'out').length,
    top, outValue, low, parts: ranking.length, empty: !last.length,
  };
}

const seen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
const markSeen = (id) => { try { localStorage.setItem(SEEN_KEY, id); } catch { /* egal */ } };

/** Karte auf der Übersicht (die ganze Woche über, bis sie angesehen oder weggeklickt wurde) */
export async function fillRecapCard(slot, mats, isLow, thumbUrl) {
  if (!slot) return;
  let movs = [];
  try { movs = await db.listMovementsSince(22); } catch { return; }
  const d = recapData(movs, mats, isLow);
  if (d.empty || seen() === d.id || !slot.isConnected) return;
  slot.innerHTML = `<div class="recap-card" role="button" tabindex="0" aria-label="Wochenrückblick ansehen">
      <span class="recap-avatar"><span>${icon('chart', 22, 2.2)}</span></span>
      <span class="recap-text"><b>Dein Wochenrückblick</b><small>KW ${d.week} · ${esc(d.range)} · ${fmtQty(d.out)} Teile entnommen</small></span>
      <button class="recap-x" aria-label="Ausblenden">${icon('x', 18)}</button>
    </div>`;
  const card = slot.firstElementChild;
  card.classList.add('recap-in');
  card.querySelector('.recap-x').onclick = (e) => { e.stopPropagation(); markSeen(d.id); card.classList.add('recap-out'); setTimeout(() => (slot.innerHTML = ''), 300); };
  card.onclick = () => { markSeen(d.id); openRecap(d, thumbUrl, () => { slot.innerHTML = ''; }); };
}

export async function showRecap(mats, isLow, thumbUrl) {
  const d = recapData(await db.listMovementsSince(22), mats, isLow);
  openRecap(d, thumbUrl);
}

function slides(d, thumbUrl) {
  const diff = d.outPrev ? Math.round(((d.out - d.outPrev) / d.outPrev) * 100) : null;
  const trend = diff == null ? '' : diff === 0 ? 'genauso viel wie die Woche davor'
    : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} % ${diff > 0 ? 'mehr' : 'weniger'} als die Woche davor`;
  const s = [];
  s.push(`<div class="rs rs-intro"><span class="rs-kicker">Wochenrückblick</span><h2>KW ${d.week}</h2><p>${esc(d.range)}</p><span class="rs-big-ic">${icon('chart', 54, 1.8)}</span></div>`);
  s.push(`<div class="rs"><span class="rs-kicker">Entnommen</span><div class="rs-num" data-to="${d.out}">0</div><p>Teile in ${fmtQty(d.outCount)} ${d.outCount === 1 ? 'Buchung' : 'Buchungen'}</p>
    ${trend ? `<span class="rs-chip">${trend}</span>` : ''}${d.outValue > 0 ? `<p class="rs-sub">≈ ${fmtEUR(d.outValue)} Einkaufswert</p>` : ''}</div>`);
  if (d.top?.m) {
    const img = thumbUrl(d.top.m);
    s.push(`<div class="rs"><span class="rs-kicker">Top-Teil der Woche</span>
      <div class="rs-top">${img ? `<img src="${esc(img)}" alt="">` : icon('box', 56, 1.8)}</div>
      <h3>${esc(d.top.m.name)}</h3><p><b>${fmtQty(d.top.qty)}×</b> entnommen</p></div>`);
  }
  s.push(`<div class="rs"><span class="rs-kicker">Wareneingang</span><div class="rs-num" data-to="${d.inn}" data-plus>0</div>
    <p>${d.inn ? `Stück eingelagert in ${fmtQty(d.inCount)} ${d.inCount === 1 ? 'Buchung' : 'Buchungen'}` : 'Diese Woche keine Lieferung'}</p></div>`);
  s.push(`<div class="rs"><span class="rs-kicker">Wird knapp</span>${d.low.length
    ? `<ul class="rs-list">${d.low.map((m) => `<li><span>${esc(m.name)}</span><b>${fmtQty(m.total)} / ${fmtQty(m.min_stock)}</b></li>`).join('')}</ul><p class="rs-sub">Bestand / Meldebestand</p>`
    : `<span class="rs-big-ic">${icon('check', 54, 2.2)}</span><p>Alles im grünen Bereich</p>`}</div>`);
  s.push(`<div class="rs rs-outro"><h2>Gute Woche! 💪</h2><p>${fmtQty(d.parts)} verschiedene Teile verbaut</p><a class="rs-btn" href="#/stats" data-a="stats">Zur Auswertung ${icon('chevR', 18)}</a></div>`);
  return s;
}

function openRecap(d, thumbUrl, onClose) {
  const html = slides(d, thumbUrl);
  const { el, close: closeLayer } = layer('recap-layer', `
    <div class="recap-stage">
      <div class="recap-bars">${html.map(() => '<i><b></b></i>').join('')}</div>
      <button class="recap-close" aria-label="Schließen">${icon('x', 24)}</button>
      <div class="recap-slides">${html.map((h, i) => `<section class="recap-slide" data-i="${i}">${h}</section>`).join('')}</div>
      <div class="recap-tap l" aria-hidden="true"></div><div class="recap-tap r" aria-hidden="true"></div>
    </div>`);
  const bars = [...el.querySelectorAll('.recap-bars b')];
  const secs = [...el.querySelectorAll('.recap-slide')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = -1; let anim = null; let closed = false;
  const close = () => { if (closed) return; closed = true; anim?.cancel(); document.removeEventListener('keydown', onKey); closeLayer(); onClose?.(); };
  const go = (n) => {
    if (n >= secs.length) { close(); return; }
    n = Math.max(0, n);
    bars.forEach((b, k) => { b.getAnimations().forEach((a) => a.cancel()); b.style.transform = `scaleX(${k < n ? 1 : 0})`; });
    secs.forEach((s, k) => s.classList.toggle('on', k === n));
    if (n !== i) {
      haptic('selection');
      secs[n].querySelectorAll('[data-to]').forEach((x) => countUp(x, +x.dataset.to, { dur: 1400 }));
    }
    i = n;
    anim = bars[n].animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: reduce ? SLIDE_MS * 1.5 : SLIDE_MS, easing: 'linear', fill: 'forwards' });
    anim.onfinish = () => go(i + 1);
  };
  // Tippen links/rechts blättert, Gedrückthalten pausiert, nach unten wischen schließt
  let downT = 0; let downY = 0; let held = false;
  const stage = el.querySelector('.recap-stage');
  stage.addEventListener('pointerdown', (e) => { if (e.target.closest('a, .recap-close')) return; downT = performance.now(); downY = e.clientY; held = false; setTimeout(() => { if (downT && !held) { held = true; anim?.pause(); stage.classList.add('paused'); } }, 260); });
  stage.addEventListener('pointerup', (e) => {
    if (!downT) return; const dt = performance.now() - downT; const dy = e.clientY - downY; downT = 0;
    stage.classList.remove('paused');
    if (dy > 90) { close(); return; }
    if (held || dt > 260) { anim?.play(); return; }
    const right = e.target.closest('.recap-tap.r') || (!e.target.closest('.recap-tap.l') && e.clientX > innerWidth / 3);
    go(right ? i + 1 : i - 1);
  });
  stage.addEventListener('pointercancel', () => { downT = 0; anim?.play(); stage.classList.remove('paused'); });
  el.querySelector('.recap-close').onclick = close;
  el.querySelector('[data-a=stats]')?.addEventListener('click', () => close());
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(i + 1); else if (e.key === 'ArrowLeft') go(i - 1); };
  document.addEventListener('keydown', onKey);
  go(0);
}
