// ---------------------------------------------------------------------
//  SpareSync – App (Router + Ansichten)
// ---------------------------------------------------------------------
import './styles.css';
import * as db from './db.js';
import { icon } from './icons.js';
import {
  esc, fmtQty, fmtEUR, fmtDate, toast, errToast, prompt, confirmBox, actionSheet, sheet, pickFrom,
  scan, showLabel, compressImage, pickFiles, copyText, haptic, infoBox, enhanceSearch, progressPanel,
} from './ui.js';
import { exportCSV, importCSV } from './csv.js';
import { installHaptics } from './haptics.js';
import { setupPullToRefresh } from './ptr.js';

const app = document.getElementById('app');
const BRAND_S = `${import.meta.env.BASE_URL}brand-s.png`;     // farbiges „S“ (transparent)
const APP_ICON = `${import.meta.env.BASE_URL}app-icon.png`;   // App-Icon (abgerundetes Quadrat)
// Logo: das farbige „S“-Icon IST der erste Buchstabe, danach direkt „pare“ (Navy) + „Sync“ (Blau)
const brandLogo = (cls = '') => `<span class="brand ${cls}" role="img" aria-label="SpareSync"><img class="brand-s" src="${BRAND_S}" alt="" width="27" height="30"><span class="wordmark" aria-hidden="true"><span class="wm-spare">pare</span><span class="wm-sync">Sync</span></span></span>`;

// ============================== Cache ================================
const cache = { materials: null, groups: null, locations: null, cart: null, fields: null };
const getMats = async () => (cache.materials ??= await db.listMaterials());
const getGroups = async () => (cache.groups ??= await db.listGroups());
const getLocs = async () => (cache.locations ??= await db.listLocations());
const getCart = async () => (cache.cart ??= await db.listCart());
let fieldWarned = false;
/** Eigene-Felder-Vorlagen; fehlt die Tabelle in Supabase noch, läuft die App ohne sie weiter */
const getFields = async () => {
  if (cache.fields) return cache.fields;
  try { cache.fields = await db.listFieldDefs(); } catch (e) { if (!fieldWarned) { fieldWarned = true; errToast(e); } return []; }
  return cache.fields;
};
/** Einmal pro Sitzung alle Listen im Hintergrund laden → vollständige Offline-Kopie */
let warmed = false;
function warmOffline() {
  if (warmed || db.isDemo || !navigator.onLine) return;
  warmed = true;
  setTimeout(() => { Promise.all([getMats(), getCart(), getLocs(), getGroups(), getFields()]).catch(() => { warmed = false; }); }, 1500);
}
/** Alle Daten frisch aus Supabase laden (Pull-to-Refresh, „Neu laden“) */
async function refreshAll() {
  invalidate();
  await Promise.all([getMats(), getCart(), getLocs(), getGroups()]);
}
const fieldsFor = (defs, kind) => defs.filter((f) => f.applies_to === 'both' || f.applies_to === kind);
/** Anzeige eines Feldwerts je nach Typ */
function fieldDisplay(def, v) {
  if (def?.type === 'bool') return v === true || v === 'true' || v === 'Ja' ? 'Ja' : 'Nein';
  if (v === undefined || v === null || v === '') return '—';
  if (def?.type === 'date') { const d = new Date(v); return Number.isNaN(+d) ? String(v) : d.toLocaleDateString('de-DE'); }
  if (def?.type === 'number') return fmtQty(v);
  return String(v);
}
const invalidate = (...keys) => (keys.length ? keys : Object.keys(cache)).forEach((k) => (cache[k] = null));

const isLow = (m) => m.kind === 'part' && +m.min_stock > 0 && m.total <= +m.min_stock;

// ============================== Theme ================================
function applyTheme() {
  const t = localStorage.getItem('wl-theme') || '';
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  localStorage.setItem('wl-theme', dark ? 'light' : 'dark'); applyTheme(); route();
}
applyTheme();

// ============================== Router ===============================
// Eigener Verlauf: "Zurück" bleibt immer innerhalb der App
const navStack = [];
// Seitenübergang für den nächsten Routenwechsel: 'push' | 'pop' | 'fade' | 'none'
let nextTransition = null;
let pendingTransition = null;
const scrollMemo = {};        // Scroll-Position je Seite, damit „Zurück“ dort weitermacht, wo man war
let currentHash = null;
let pendingScroll = 0;
const go = (path, replace = false, transition) => {
  if ('#' + path !== location.hash) nextTransition = transition || (replace ? 'fade' : 'push');
  if (replace) { navStack.pop(); location.replace('#' + path); } else location.hash = path;
};
const back = (fallback = '/fav') => {
  nextTransition = 'pop';
  if (navStack.length > 1) { navStack.pop(); location.replace(navStack[navStack.length - 1]); }
  else { navStack.length = 0; location.replace('#' + fallback); }
};
const replaceHash = (h) => {
  try { history.replaceState(null, '', h); } catch {}
  if (navStack.length) navStack[navStack.length - 1] = h;
};
function parseHash() {
  const h = location.hash.slice(1) || '/fav';
  const [path, qs = ''] = h.split('?');
  return { path, q: Object.fromEntries(new URLSearchParams(qs)) };
}

let renderId = 0;
async function route() {
  const id = ++renderId;
  const h = location.hash || '#/fav';
  // Richtung bestimmen: explizit (go/back/Tab) oder aus dem Verlauf abgeleitet
  let kind = nextTransition;
  if (navStack[navStack.length - 1] !== h) {
    if (navStack[navStack.length - 2] === h) { navStack.pop(); kind = kind || 'pop'; }
    else { navStack.push(h); kind = kind || 'push'; }
  }
  nextTransition = null;
  pendingTransition = kind || 'none';
  if (currentHash && currentHash !== h) scrollMemo[currentHash] = window.scrollY;
  pendingScroll = kind === 'pop' ? (scrollMemo[h] || 0) : 0;
  if (kind === 'push') delete scrollMemo[h];
  currentHash = h;
  const { path, q } = parseHash();
  if (!db.isDemo && path !== '/login' && path !== '/register') {
    const user = await db.getUser();
    if (!user) return go('/login', true);
    // nach Klick auf den Bestätigungslink: ersten Lagerort aus der Registrierung anlegen
    if (await db.ensureStarterLocation()) invalidate('locations');
    warmOffline();
  }
  const routes = [
    [/^\/fav$/, () => viewFav()],
    [/^\/list$/, () => viewList(q)],
    [/^\/pick$/, () => viewPick(q)],
    [/^\/m\/([^/]+)$/, (m) => viewMaterial(m[1], q)],
    [/^\/m\/([^/]+)\/history$/, (m) => viewHistory(m[1])],
    [/^\/new$/, () => viewForm(null, q)],
    [/^\/edit\/([^/]+)$/, (m) => viewForm(m[1], q)],
    [/^\/groups$/, () => viewGroups()],
    [/^\/locations$/, () => viewLocations()],
    [/^\/inventory$/, () => viewInventory(q)],
    [/^\/settings$/, () => viewSettings()],
    [/^\/fields$/, () => viewFields()],
    [/^\/login$/, () => viewLogin()],
    [/^\/register$/, () => viewLogin(null, null, 'register')],
  ];
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(m, id); } catch (e) { errToast(e); }
      pendingTransition = null;
      return;
    }
  }
  go('/fav', true);
}
window.addEventListener('hashchange', route);

// ============================== Layout ===============================
const navbar = ({ left = '', title = '', right = '', cls = '' }) => `
  <header class="navbar ${cls}">
    <div class="nav-side left">${left}</div>
    <div class="nav-title">${title}</div>
    <div class="nav-side right">${right}</div>
  </header>`;
const btn = (name, action, label = '', extra = '') => `<button class="icon-btn" data-act="${action}" aria-label="${esc(label || name)}" ${extra}>${icon(name, 26)}</button>`;
const backBtn = (style = 'chev') => `<button class="icon-btn" data-act="back" aria-label="Zurück">${icon(style === 'arrow' ? 'arrowLeft' : 'back', 28)}</button>`;

function tabbar(active) {
  return `
  <nav class="tabbar">
    <a href="#/fav" data-tablink class="tab ${active === 'fav' ? 'on' : ''}">${icon('home', 26)}<span>Übersicht</span></a>
    <a href="#/list" data-tablink class="tab ${active === 'list' ? 'on' : ''}">${icon('list', 26)}<span>Teile</span></a>
  </nav>`;
}
// ======================= iOS-Seitenübergänge ========================
// push: neue Seite gleitet von rechts herein, alte weicht leicht nach links (Parallaxe)
// pop:  aktuelle Seite gleitet nach rechts hinaus, vorherige kommt von links zurück
// fade: schnelles Überblenden (Tab-Leiste, Anmeldung)
const IOS_EASE = 'cubic-bezier(.32, .72, 0, 1)';   // iOS-typisches, weiches ease-out
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let finishRunning = null;

function freeze(el, scrollY, z) {
  el.classList.add('screen-anim');
  el.style.zIndex = z;
  el.style.setProperty('--fy', scrollY + 'px');   // Scroll-Position beibehalten (Inhalt verschoben, Kopf/Leisten bleiben fest)
}
function unfreeze(el) {
  el.classList.remove('screen-anim');
  el.style.zIndex = ''; el.style.transform = ''; el.style.opacity = ''; el.style.removeProperty('--fy');
}
function swapScreen(next, kind) {
  finishRunning?.();                       // laufende Animation sofort abschließen
  const prev = app.querySelector('.screen');
  const animate = prev && kind && kind !== 'none' && !reduceMotion.matches && next.animate;
  const target = kind ? pendingScroll : null; pendingScroll = 0;
  if (!animate) {
    app.replaceChildren(next);
    if (kind) requestAnimationFrame(() => window.scrollTo(0, target || 0));
    return;
  }
  const y = window.scrollY;
  if (kind === 'pop') app.insertBefore(next, prev); else app.appendChild(next);
  freeze(prev, y, kind === 'pop' ? 2 : 1);
  freeze(next, target || 0, kind === 'pop' ? 1 : 2);
  window.scrollTo(0, 0);

  const dur = kind === 'fade' ? 200 : 360;
  const opts = { duration: dur, easing: kind === 'fade' ? 'ease-out' : IOS_EASE, fill: 'both' };
  let anims;
  if (kind === 'push') {
    next.classList.add('screen-edge');
    anims = [
      next.animate([{ transform: 'translate3d(100%,0,0)' }, { transform: 'translate3d(0,0,0)' }], opts),
      prev.animate([{ transform: 'translate3d(0,0,0)', opacity: 1 }, { transform: 'translate3d(-28%,0,0)', opacity: 0.72 }], opts),
    ];
  } else if (kind === 'pop') {
    prev.classList.add('screen-edge');
    anims = [
      prev.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(100%,0,0)' }], opts),
      next.animate([{ transform: 'translate3d(-28%,0,0)', opacity: 0.72 }, { transform: 'translate3d(0,0,0)', opacity: 1 }], opts),
    ];
  } else {
    anims = [
      next.animate([{ opacity: 0 }, { opacity: 1 }], opts),
      prev.animate([{ opacity: 1 }, { opacity: 0 }], { ...opts, duration: dur * 0.8 }),
    ];
  }
  let done = false;
  finishRunning = () => {
    if (done) return; done = true; finishRunning = null;
    anims.forEach((a) => { try { a.cancel(); } catch {} });
    prev.remove();
    next.classList.remove('screen-edge');
    unfreeze(next);
    if (target) window.scrollTo(0, target);
  };
  Promise.all(anims.map((a) => a.finished)).then(() => finishRunning?.()).catch(() => {});
}

// ================= Segmented Control mit gleitendem Hintergrund =================
const segMemory = {};          // letzte Position je Schalter → gleitet auch nach Neuaufbau der Seite
const segKey = (el) => el.dataset.seg || (el.querySelector('[data-tab]') ? 'list' : el.querySelector('[data-t]') ? 'mtab' : el.querySelector('[data-scope]') ? 'scope' : 'seg');
function updateSegments(root) {
  root.querySelectorAll('.segment').forEach((seg) => {
    const btns = [...seg.querySelectorAll(':scope > button')];
    if (!btns.length) return;
    let ind = seg.querySelector(':scope > .seg-ind');
    const idx = Math.max(0, btns.findIndex((b) => b.classList.contains('on')));
    const key = segKey(seg);
    if (!ind) {
      ind = document.createElement('span'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true');
      seg.prepend(ind); seg.classList.add('has-ind');
      seg.style.setProperty('--n', btns.length);
      const from = segMemory[key] ?? idx;
      ind.style.transition = 'none';
      ind.style.transform = `translateX(${from * 100}%)`;
      if (from !== idx) requestAnimationFrame(() => requestAnimationFrame(() => { ind.style.transition = ''; ind.style.transform = `translateX(${idx * 100}%)`; }));
      else requestAnimationFrame(() => { ind.style.transition = ''; });
    } else {
      ind.style.transform = `translateX(${idx * 100}%)`;
    }
    segMemory[key] = idx;
  });
}

// ========================= Offline-Badge =========================
const isOfflineNow = () => !db.isDemo && (!navigator.onLine || db.offlineState.active);
function applyOfflineBadge(root = app.querySelector('.screen')) {
  if (!root) return;
  const host = root.querySelector('.list-head') || root.querySelector('header');
  const existing = root.querySelector('.offline-badge');
  if (!isOfflineNow() || !host) { existing?.remove(); return; }
  if (existing) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'offline-badge';
  b.innerHTML = `<i></i>Offline-Modus`;
  b.onclick = () => {
    const t = db.offlineSavedAt();
    infoBox({
      title: 'Offline-Modus',
      html: `<p class="stat-note" style="margin-top:4px">Keine Internetverbindung. Du siehst die zuletzt gespeicherte Kopie${t ? ` vom <b>${new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</b>` : ''}.</p>
        <p class="stat-note warn">Buchungen und Änderungen sind erst wieder mit Internet möglich.</p>`,
    });
  };
  host.appendChild(b);
}
window.addEventListener('ss-offline', () => applyOfflineBadge());
window.addEventListener('offline', () => { applyOfflineBadge(); toast('Keine Internetverbindung – Offline-Modus', 'err'); });
window.addEventListener('online', async () => {
  try { await refreshAll(); } catch {}
  applyOfflineBadge();
  if (!isOfflineNow()) { toast('Wieder online – Daten aktualisiert'); route(); }
});

function screen({ header, body, tab = null, cls = '', footer = '' }) {
  const tmp = document.createElement('div');
  tmp.innerHTML = `<div class="screen ${cls} ${tab ? 'has-tabbar' : ''} ${footer ? 'has-footer' : ''}">${header}<main class="content">${body}</main>${footer}${tab ? tabbar(tab) : ''}</div>`;
  const root = tmp.firstElementChild;
  const kind = pendingTransition; pendingTransition = null;   // nur bei echtem Seitenwechsel gesetzt
  swapScreen(root, kind);
  updateSegments(root);
  applyOfflineBadge(root);
  enhanceSearch(root);
  root.querySelectorAll('[data-tablink]').forEach((a) => a.addEventListener('click', () => { if (a.getAttribute('href') !== location.hash) nextTransition = 'fade'; }));
  root.querySelectorAll('[data-act=back]').forEach((b) => (b.onclick = () => back()));
  return root;
}
const on = (root, act, fn) => root.querySelectorAll(`[data-act="${act}"]`).forEach((el) => (el.onclick = (e) => { e.preventDefault(); fn(el, e); }));

const thumb = (m, size = 'md') => {
  const img = m.images?.[0]?.url;
  return `<div class="thumb ${size}">${img ? `<img src="${esc(img)}" loading="lazy" alt="">` : icon(m.kind === 'tool' ? 'wrench' : 'box', size === 'sm' ? 22 : 30, 1.6)}</div>`;
};
const locLabel = (m) => {
  const withStock = m.locations.filter((l) => l.qty > 0);
  const ls = withStock.length ? withStock : m.locations;
  if (!ls.length) return '<span class="muted">Kein Lagerort</span>';
  return esc(ls[0].name) + (ls.length > 1 ? ` <span class="muted">+${ls.length - 1}</span>` : '');
};
const stockLabel = (m) => `${+m.min_stock > 0 ? `<span>Meb: ${fmtQty(m.min_stock)}</span> ` : ''}<span class="${isLow(m) ? 'red' : ''}">[${fmtQty(m.total)}]</span>`;
function materialRow(m, href = `#/m/${m.id}`) {
  return `<a class="mrow" href="${href}" data-id="${m.id}">
      ${thumb(m)}
      <div class="mrow-main">
        <div class="mrow-title"><span class="nr">${m.number}:</span> ${esc(m.name)}</div>
        <div class="mrow-meta"><b>${locLabel(m)}</b><b class="stock">${stockLabel(m)}</b></div>
      </div>
    </a>`;
}
const empty = (ic, text, extra = '') => `<div class="empty">${icon(ic, 46, 1.4)}<p>${text}</p>${extra}</div>`;

function filterMats(mats, { q = '', group = '', low = false, loc = '' } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return mats.filter((m) => {
    if (group && m.group_id !== group) return false;
    if (low && !isLow(m)) return false;
    if (loc && !m.locations.some((l) => l.location_id === loc)) return false;
    if (!words.length) return true;
    const hay = `${m.number} ${m.name} ${m.barcode || ''} ${m.group_name} ${Object.values(m.custom_fields || {}).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// =====================================================================
//  FAVORITEN (Startseite)
// =====================================================================
// Schnellaktionen (2-Spalten, Control-Center-Stil) und Verwaltung (iOS-Liste)
const QUICK = [
  { id: 'in', label: 'Dazu buchen', sub: 'Wareneingang per Scan', icon: 'bookIn', tone: 'primary', href: '/pick?mode=in&scan=1' },
  { id: 'out', label: 'Entnehmen', sub: 'Teil für Reparatur', icon: 'bookOut', tone: 'red', href: '/pick?mode=out&scan=1' },
  { id: 'new', label: 'Teil anlegen', sub: 'Neues Ersatzteil', icon: 'plus', tone: 'primary', href: '/new?kind=part' },
  { id: 'inv', label: 'Inventur', sub: 'Bestand zählen', icon: 'tally', tone: 'primary', href: '/inventory' },
];
const MANAGE = [
  { label: 'Teil per Scan finden', icon: 'scan', tone: 'blue', href: '/pick?mode=info&scan=1' },
  { label: 'Werkzeug hinzufügen', icon: 'wrench', tone: 'indigo', href: '/new?kind=tool' },
  { label: 'Lagerorte', icon: 'shelf', tone: 'teal', href: '/locations', count: 'locs' },
  { label: 'Material-Gruppen', icon: 'boxes', tone: 'orange', href: '/groups', count: 'groups' },
];
const isDark = () => document.documentElement.dataset.theme === 'dark'
  || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

async function viewFav() {
  let mats = []; let cart = []; let locs = []; let groups = [];
  try { [mats, cart, locs, groups] = await Promise.all([getMats(), getCart(), getLocs(), getGroups()]); } catch (e) { errToast(e); }
  const parts = mats.filter((m) => m.kind === 'part');
  const units = parts.reduce((a, m) => a + (m.total > 0 ? m.total : 0), 0);
  const low = parts.filter(isLow);
  const cartN = cart.filter((c) => c.list === 'cart').length;
  const recent = [...mats].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 3);
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const counts = { locs: locs.length, groups: groups.length };

  const root = screen({
    header: `<header class="dash-nav">
        ${brandLogo()}
        <span class="dash-nav-right">
          <button class="glass-btn" data-act="theme" aria-label="Hell/Dunkel">${icon(isDark() ? 'sun' : 'moon', 21)}</button>
          <button class="glass-btn" data-act="scan" aria-label="Scannen">${icon('scan', 21)}</button>
          <button class="glass-btn" data-act="menu" aria-label="Menü">${icon('menu', 22)}</button>
        </span>
      </header>`,
    cls: 'dash-screen',
    body: `
      <div class="dash-head">
        <p class="dash-date">${esc(today)}</p>
        <h1 class="dash-title">Übersicht</h1>
      </div>
      ${db.isDemo ? `<a class="demo-banner" href="#/settings">${icon('database', 16)}<span>Demo-Modus – Daten nur auf diesem Gerät</span>${icon('chevR', 16)}</a>` : ''}

      <section class="widgets" aria-label="Status">
        <a class="widget" href="#/list?tab=part">
          <span class="w-ic tone-primary">${icon('box', 18, 2.2)}</span>
          <span class="w-val">${fmtQty(parts.length)}</span>
          <span class="w-label">Teile im Lager</span>
          <span class="w-sub">${fmtQty(units)} Stück</span>
        </a>
        <a class="widget ${low.length ? 'is-alert' : ''}" href="#/list?tab=part&low=1">
          <span class="w-ic tone-red">${icon('alert', 18, 2.2)}</span>
          <span class="w-val">${fmtQty(low.length)}</span>
          <span class="w-label">Unter Meldebestand</span>
          <span class="w-sub">${low.length ? 'nachbestellen' : 'alles im grünen Bereich'}</span>
        </a>
        <a class="widget" href="#/list?tab=cart">
          <span class="w-ic tone-green">${icon('cart', 18, 2.2)}</span>
          <span class="w-val">${fmtQty(cartN)}</span>
          <span class="w-label">Im Warenkorb</span>
          <span class="w-sub">zum Bestellen</span>
        </a>
      </section>

      <h2 class="dash-sec">Schnellaktionen</h2>
      <section class="quick-grid">
        ${QUICK.map((q) => `<a class="quick" href="#${q.href}">
            <span class="q-ic tone-${q.tone}">${icon(q.icon, 22, 2.2)}</span>
            <span class="q-text"><b>${q.label}</b><small>${q.sub}</small></span>
          </a>`).join('')}
      </section>

      <h2 class="dash-sec">Verwalten</h2>
      <section class="ios-list">
        ${MANAGE.map((m) => `<a class="ios-row" href="#${m.href}">
            <span class="r-ic tone-${m.tone}">${icon(m.icon, 18, 2.1)}</span>
            <span class="r-label">${m.label}</span>
            ${m.count ? `<span class="r-meta">${counts[m.count]}</span>` : ''}${icon('chevR', 18)}
          </a>`).join('')}
      </section>

      ${recent.length ? `<h2 class="dash-sec">Zuletzt bewegt</h2>
      <section class="ios-list">
        ${recent.map((m) => `<a class="ios-row recent" href="#/m/${m.id}">
            ${thumb(m, 'sm')}
            <span class="r-label"><span class="r-title"><span class="nr">${m.number}</span> ${esc(m.name)}</span><small>${locLabel(m)}</small></span>
            <span class="r-qty ${isLow(m) ? 'red' : ''}">${fmtQty(m.total)}</span>
          </a>`).join('')}
      </section>` : ''}`,
    tab: 'fav',
  });
  on(root, 'menu', () => go('/settings'));
  on(root, 'theme', toggleTheme);
  setupPullToRefresh(root, refreshAll, () => viewFav());
  on(root, 'scan', async () => {
    const code = await scan(); if (!code) return;
    const m = await db.findByCode(code);
    if (m) go(`/m/${m.id}`);
    else if (await confirmBox({ title: 'Nicht gefunden', message: `Kein Material mit Code „${code}“. Jetzt anlegen?`, okText: 'Anlegen' })) go(`/new?kind=part&barcode=${encodeURIComponent(code)}`);
  });
}

// =====================================================================
//  LISTEN (Material / Werkzeug / Warenkorb)
// =====================================================================
const listState = JSON.parse(sessionStorage.getItem('wl-list') || '{"tab":"part","q":"","group":"","low":false,"loc":"","sort":"number"}');
const saveListState = () => sessionStorage.setItem('wl-list', JSON.stringify(listState));

async function viewList(q) {
  if (q.tab) listState.tab = q.tab;
  if ('low' in q) listState.low = q.low === '1';
  if ('group' in q) listState.group = q.group;
  if ('loc' in q) listState.loc = q.loc;
  saveListState();
  if (Object.keys(q).length) replaceHash('#/list');

  const [mats, cart] = await Promise.all([getMats(), getCart()]);
  const parts = mats.filter((m) => m.kind === 'part'); const tools = mats.filter((m) => m.kind === 'tool');
  const activeFilters = (listState.group ? 1 : 0) + (listState.low ? 1 : 0) + (listState.loc ? 1 : 0);
  const tab = listState.tab;

  const root = screen({
    header: `<div class="list-head"><header class="navbar list-nav">
        <button class="glass-btn" data-act="menu" aria-label="Menü">${icon('menu', 21)}</button>
        <button class="glass-btn" data-act="filter" aria-label="Filter">${icon('filter', 21)}${activeFilters ? `<em class="dot">${activeFilters}</em>` : ''}</button>
        <label class="search-field grow">${icon('search', 18)}<input type="search" id="q" placeholder="Suche…" value="${esc(listState.q)}" autocomplete="off" enterkeyhint="search"></label>
        <button class="glass-btn" data-act="scan" aria-label="Scannen">${icon('scan', 21)}</button>
        <button class="glass-btn" data-act="add" aria-label="Neu">${icon('plus', 22, 2.3)}</button>
      </header>
      <div class="segment seg-icons">
        <button data-tab="part" class="${tab === 'part' ? 'on' : ''}">${icon('dolly', 22)} (${parts.length})</button>
        <button data-tab="tool" class="${tab === 'tool' ? 'on' : ''}">${icon('tools', 22)} (${tools.length})</button>
        <button data-tab="cart" class="${tab === 'cart' ? 'on' : ''}">${icon('cart', 22)} (${cart.length})</button>
      </div>
      ${activeFilters ? `<div class="chips">
        ${listState.group ? `<button class="chip" data-clear="group">${esc((await getGroups()).find((g) => g.id === listState.group)?.name || 'Gruppe')} ${icon('x', 14)}</button>` : ''}
        ${listState.loc ? `<button class="chip" data-clear="loc">${esc((await getLocs()).find((l) => l.id === listState.loc)?.name || 'Lagerort')} ${icon('x', 14)}</button>` : ''}
        ${listState.low ? `<button class="chip red" data-clear="low">Unter Meldebestand ${icon('x', 14)}</button>` : ''}
      </div>` : ''}</div>`,
    body: `<div id="rows"></div>`,
    tab: 'list',
    cls: 'list-screen',
  });

  const rows = root.querySelector('#rows');
  // Mehrfachauswahl (Auswählen → Häkchen → Löschen)
  const sel = { on: false, ids: new Set() };
  let visible = [];
  const selBar = document.createElement('div');
  selBar.className = 'select-bar'; selBar.hidden = true;
  selBar.innerHTML = `<span class="sb-count"></span><button class="sb-delete" data-act="bulk-delete">${icon('trash', 19)} Löschen</button>`;
  root.appendChild(selBar);
  const updateSel = () => {
    const n = sel.ids.size;
    selBar.hidden = !sel.on;
    root.classList.toggle('selecting', sel.on);
    selBar.querySelector('.sb-count').textContent = n ? `${n} ausgewählt` : 'Teile antippen zum Auswählen';
    selBar.querySelector('.sb-delete').disabled = !n;
    const all = rows.querySelector('[data-act=sel-all]');
    if (all) all.textContent = visible.length && visible.every((m) => sel.ids.has(m.id)) ? 'Keine auswählen' : 'Alle auswählen';
    rows.querySelectorAll('.mrow').forEach((r) => r.classList.toggle('is-selected', sel.ids.has(r.dataset.id)));
  };
  const renderRows = () => {
    if (listState.tab === 'cart') { sel.on = false; updateSel(); return renderCart(rows, mats, cart); }
    let f = filterMats(listState.tab === 'tool' ? tools : parts, listState);
    const s = listState.sort;
    if (s === 'name') f.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    else if (s === 'stock') f.sort((a, b) => a.total - b.total);
    else if (s === 'updated') f.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    else f.sort((a, b) => a.number - b.number);
    visible = f;
    rows.innerHTML = f.length ? `
      <div class="list-tools">
        ${sel.on ? `<button class="text-btn" data-act="sel-all">Alle auswählen</button>` : `<span class="muted small">${f.length} Einträge</span>`}
        <button class="text-btn strong" data-act="sel-toggle">${sel.on ? 'Fertig' : 'Auswählen'}</button>
      </div>
      <div class="mlist">${f.map((m) => materialRow(m)).join('')}</div>`
      : empty('search', listState.q ? `Nichts gefunden für „${esc(listState.q)}“` : 'Noch keine Einträge',
        `<a class="btn-tinted" href="#/new?kind=${listState.tab}">${icon('plus', 18)} Anlegen</a>`);
    rows.querySelectorAll('.mrow').forEach((r) => {
      r.insertAdjacentHTML('afterbegin', `<span class="sel-check" aria-hidden="true">${icon('check', 15, 3)}</span>`);
      r.addEventListener('click', (e) => {
        if (!sel.on) return;
        e.preventDefault();
        sel.ids.has(r.dataset.id) ? sel.ids.delete(r.dataset.id) : sel.ids.add(r.dataset.id);
        haptic(); updateSel();
      });
    });
    const tgl = rows.querySelector('[data-act=sel-toggle]');
    if (tgl) tgl.onclick = () => { sel.on = !sel.on; sel.ids.clear(); renderRows(); };
    const all = rows.querySelector('[data-act=sel-all]');
    if (all) all.onclick = () => {
      const everything = visible.every((m) => sel.ids.has(m.id));
      visible.forEach((m) => (everything ? sel.ids.delete(m.id) : sel.ids.add(m.id)));
      updateSel();
    };
    updateSel();
  };
  renderRows();
  selBar.querySelector('[data-act=bulk-delete]').onclick = async () => {
    const ids = [...sel.ids]; const n = ids.length; if (!n) return;
    const what = listState.tab === 'tool' ? (n === 1 ? 'Werkzeug' : 'Werkzeuge') : (n === 1 ? 'Teil' : 'Teile');
    const allOfThem = n === (listState.tab === 'tool' ? tools : parts).length && n > 5;
    if (!await confirmBox({ title: `${n} ${what} löschen?`, message: 'Bestand, Historie und Bilder werden ebenfalls gelöscht. Das kann nicht rückgängig gemacht werden.', okText: 'Löschen', danger: true })) return;
    if (allOfThem) {
      const typed = await prompt({ title: 'Wirklich alle löschen?', message: 'Zur Sicherheit bitte LÖSCHEN eintippen.', placeholder: 'LÖSCHEN', okText: 'Endgültig löschen' });
      if ((typed || '').trim().toUpperCase() !== 'LÖSCHEN') { toast('Abgebrochen – nichts gelöscht'); return; }
    }
    const b = selBar.querySelector('.sb-delete'); b.disabled = true;
    try {
      await db.deleteMaterials(ids, (d, t) => { if (t > 100) selBar.querySelector('.sb-count').textContent = `Lösche … ${d}/${t}`; });
      invalidate(); toast(`${n} ${what} gelöscht`);
      sel.on = false; sel.ids.clear(); viewList({});
    } catch (e) { errToast(e); b.disabled = false; }
  };

  const qi = root.querySelector('#q');
  qi.oninput = () => { listState.q = qi.value; saveListState(); if (listState.tab === 'cart') { listState.tab = 'part'; viewList({}); } else renderRows(); };
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    if (listState.tab === b.dataset.tab) return;
    listState.tab = b.dataset.tab; saveListState();
    root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    updateSegments(root);
    sel.on = false; sel.ids.clear();
    renderRows(); window.scrollTo(0, 0);
  }));
  root.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => { listState[b.dataset.clear] = b.dataset.clear === 'low' ? false : ''; saveListState(); viewList({}); }));
  setupPullToRefresh(root, refreshAll, () => viewList({}));
  on(root, 'menu', () => go('/settings'));
  on(root, 'add', async () => {
    const v = await actionSheet('Neu anlegen', [
      { label: 'Ersatzteil anlegen', value: 'part', icon: 'box' },
      { label: 'Werkzeug anlegen', value: 'tool', icon: 'wrench' },
      { label: 'Material Gruppe', value: 'grp', icon: 'boxes' },
      { label: 'Lagerort', value: 'loc', icon: 'shelf' },
    ]);
    if (v === 'part' || v === 'tool') go(`/new?kind=${v}`);
    if (v === 'grp') go('/groups'); if (v === 'loc') go('/locations');
  });
  on(root, 'scan', async () => {
    const code = await scan(); if (!code) return;
    const m = await db.findByCode(code);
    if (m) go(`/m/${m.id}`);
    else if (await confirmBox({ title: 'Nicht gefunden', message: `Kein Material mit Code „${code}“. Jetzt anlegen?`, okText: 'Anlegen' })) go(`/new?kind=part&barcode=${encodeURIComponent(code)}`);
  });
  on(root, 'filter', () => openFilter());
}

async function openFilter() {
  const [groups, locs] = await Promise.all([getGroups(), getLocs()]);
  sheet(`
    <div class="form-group">
      <label class="frow"><span>Gruppe</span>
        <select data-f="group"><option value="">Alle Gruppen</option>${groups.map((g) => `<option value="${g.id}" ${g.id === listState.group ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="frow"><span>Lagerort</span>
        <select data-f="loc"><option value="">Alle Lagerorte</option>${locs.map((l) => `<option value="${l.id}" ${l.id === listState.loc ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label class="frow"><span>Sortierung</span>
        <select data-f="sort">${[['number', 'Artikelnummer'], ['name', 'Name A–Z'], ['stock', 'Bestand (niedrig zuerst)'], ['updated', 'Zuletzt geändert']]
          .map(([v, l]) => `<option value="${v}" ${v === listState.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="frow switch-row"><span>Nur unter Meldebestand</span><input type="checkbox" class="switch" data-f="low" ${listState.low ? 'checked' : ''}></label>
    </div>
    <div class="btn-row mt"><button class="btn-gray" data-a="reset">Zurücksetzen</button><button class="btn-filled" data-a="apply">Anwenden</button></div>`,
  {
    title: 'Filter',
    onMount: (root, close) => {
      const val = (k) => root.querySelector(`[data-f=${k}]`);
      root.querySelector('[data-a=apply]').onclick = () => {
        Object.assign(listState, { group: val('group').value, loc: val('loc').value, sort: val('sort').value, low: val('low').checked });
        if (listState.tab === 'cart') listState.tab = 'part';
        saveListState(); close(); viewList({});
      };
      root.querySelector('[data-a=reset]').onclick = () => {
        Object.assign(listState, { group: '', loc: '', sort: 'number', low: false }); saveListState(); close(); viewList({});
      };
    },
  });
}

// ---------- Warenkorb & Kommissionen ----------
function renderCart(rows, mats, cart) {
  const byId = Object.fromEntries(mats.map((m) => [m.id, m]));
  const items = cart.filter((c) => byId[c.material_id]);
  const order = items.filter((c) => c.list === 'cart');
  const comms = {};
  items.filter((c) => c.list === 'commission').forEach((c) => (comms[c.commission || 'Ohne Bezeichnung'] ??= []).push(c));
  const lowMissing = mats.filter((m) => isLow(m) && !order.some((c) => c.material_id === m.id));

  const itemRow = (c) => {
    const m = byId[c.material_id];
    return `<div class="crow" data-cid="${c.id}">
      <a href="#/m/${m.id}" class="crow-link">${thumb(m, 'sm')}<div class="crow-main"><div class="mrow-title"><span class="nr">${m.number}:</span> ${esc(m.name)}</div>
        <div class="small muted">Bestand ${fmtQty(m.total)}${+m.min_stock ? ` · Meb ${fmtQty(m.min_stock)}` : ''}</div></div></a>
      <div class="stepper sm"><button data-cq="-1">${icon('minus', 16, 2.4)}</button><span>${fmtQty(c.qty)}</span><button data-cq="1">${icon('plus', 16, 2.4)}</button></div>
      <button class="icon-btn more" data-cmore>${icon('chevD', 20)}</button>
    </div>`;
  };
  rows.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Warenkorb · Nachbestellen</h2>${order.length ? `<button class="text-btn" data-act="share">${icon('upload', 18)} Teilen</button>` : ''}</div>
      ${lowMissing.length ? `<button class="btn-tinted full" data-act="addlow">${icon('alert', 18)} ${lowMissing.length} Teil(e) unter Meldebestand hinzufügen</button>` : ''}
      <div class="card-list">${order.map(itemRow).join('') || '<p class="muted center pad">Warenkorb ist leer</p>'}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Kommissionen</h2></div>
      ${Object.keys(comms).length ? Object.entries(comms).map(([name, list]) => `
        <div class="comm" data-comm="${esc(name)}">
          <div class="comm-head"><b>${icon('cartPlus', 18)} ${esc(name)}</b><button class="text-btn" data-commact>Aktionen ${icon('chevD', 16)}</button></div>
          <div class="card-list">${list.map(itemRow).join('')}</div>
        </div>`).join('') : '<p class="muted center pad">Keine Kommissionen. In der Material-Ansicht „Zu Kommission hinzufügen“ tippen.</p>'}
    </section>`;

  const reload = async () => { invalidate('cart', 'materials'); await viewList({}); };
  rows.querySelectorAll('.crow').forEach((r) => {
    const c = items.find((x) => x.id === r.dataset.cid);
    r.querySelectorAll('[data-cq]').forEach((b) => (b.onclick = async () => {
      const nq = +c.qty + +b.dataset.cq;
      try { if (nq <= 0) await db.deleteCart(c.id); else await db.updateCart(c.id, nq); haptic(); await reload(); } catch (e) { errToast(e); }
    }));
    r.querySelector('[data-cmore]').onclick = async () => {
      const m = byId[c.material_id];
      const v = await actionSheet(m.name, [
        ...(c.list === 'cart' ? [{ label: 'Ware eingetroffen – dazu buchen', value: 'in', icon: 'bookIn' }] : [{ label: 'Jetzt entnehmen', value: 'out', icon: 'bookOut' }]),
        { label: 'Menge ändern', value: 'qty', icon: 'edit' },
        { label: 'Entfernen', value: 'del', icon: 'trash', danger: true },
      ]);
      try {
        if (v === 'del') { await db.deleteCart(c.id); await reload(); }
        if (v === 'qty') { const n = await prompt({ title: 'Menge', value: c.qty, type: 'number' }); if (n && +n > 0) { await db.updateCart(c.id, +n); await reload(); } }
        if (v === 'in' || v === 'out') openBooking(m, v, async () => { await db.deleteCart(c.id); await reload(); }, { qty: c.qty });
      } catch (e) { errToast(e); }
    };
  });
  const addLow = rows.querySelector('[data-act=addlow]');
  if (addLow) addLow.onclick = async () => {
    try {
      for (const m of lowMissing) await db.addToCart('cart', m.id, Math.max(1, (+m.max_stock || +m.min_stock + 1) - m.total));
      toast(`${lowMissing.length} Teil(e) hinzugefügt`); await reload();
    } catch (e) { errToast(e); }
  };
  const share = rows.querySelector('[data-act=share]');
  if (share) share.onclick = async () => {
    const text = 'Bestellliste\n\n' + order.map((c) => { const m = byId[c.material_id]; return `${fmtQty(c.qty)} × ${m.name}${m.barcode && m.barcode !== m.name ? ` (${m.barcode})` : ''}${m.supplier ? ` – ${m.supplier}` : ''}`; }).join('\n');
    if (navigator.share) navigator.share({ title: 'Bestellliste', text }).catch(() => {}); else copyText(text);
  };
  rows.querySelectorAll('[data-comm]').forEach((box) => {
    const name = box.dataset.comm; const list = comms[name];
    box.querySelector('[data-commact]').onclick = async () => {
      const v = await actionSheet(`Kommission „${name}“`, [
        { label: 'Alles entnehmen (Bestand abbuchen)', value: 'book', icon: 'bookOut' },
        { label: 'Kommission löschen', value: 'del', icon: 'trash', danger: true },
      ]);
      if (v === 'del' && await confirmBox({ title: 'Kommission löschen?', okText: 'Löschen', danger: true })) {
        for (const c of list) await db.deleteCart(c.id); await reload();
      }
      if (v === 'book') {
        const errors = [];
        for (const c of list) {
          const m = byId[c.material_id];
          const loc = m.locations.find((l) => l.qty >= c.qty) || m.locations.find((l) => l.qty > 0);
          try {
            if (!loc || loc.qty < c.qty) throw new Error('zu wenig Bestand');
            await db.book({ material_id: m.id, type: 'out', qty: c.qty, location_id: loc.location_id, note: `Kommission ${name}` });
            await db.deleteCart(c.id);
          } catch (e) { errors.push(`${m.name}: ${e.message}`); }
        }
        if (errors.length) toast(`Nicht alles gebucht – ${errors[0]}`, 'err'); else toast('Kommission entnommen');
        await reload();
      }
    };
  });
}

// =====================================================================
//  MATERIAL WÄHLEN (Dazu buchen / Entnehmen / Details per Scan)
// =====================================================================
async function viewPick(q) {
  const mode = q.mode || 'info';
  const titles = { in: 'Material dazu buchen', out: 'Material entnehmen', info: 'Material Details' };
  const mats = (await getMats()).filter((m) => mode === 'info' || m.kind === 'part' || mode === 'in' || m.total > 0);
  const root = screen({
    header: navbar({ left: backBtn(), title: titles[mode] }),
    body: `
      <button class="scan-hero" data-act="scan">${icon('scan', 34)}<span>Barcode scannen</span></button>
      <label class="search-field mt">${icon('search', 20)}<input type="search" id="pq" placeholder="…oder Material suchen" autocomplete="off"></label>
      <div id="prows" class="mlist mt"></div>`,
  });
  const rows = root.querySelector('#prows');
  const render = (term = '') => {
    const f = filterMats(mats, { q: term }).slice(0, 80);
    rows.innerHTML = f.map((m) => materialRow(m, '#')).join('') || '<p class="muted center pad">Nichts gefunden</p>';
    rows.querySelectorAll('.mrow').forEach((a) => (a.onclick = (e) => { e.preventDefault(); picked(mats.find((m) => m.id === a.dataset.id)); }));
  };
  const picked = (m) => {
    if (mode === 'info') return go(`/m/${m.id}`);
    openBooking(m, mode, async () => { invalidate('materials'); });
  };
  const doScan = async () => {
    const code = await scan({ title: titles[mode] }); if (!code) return;
    const m = await db.findByCode(code);
    if (m) picked(m);
    else if (await confirmBox({ title: 'Nicht gefunden', message: `Kein Material mit Code „${code}“. Jetzt anlegen?`, okText: 'Anlegen' })) go(`/new?kind=part&barcode=${encodeURIComponent(code)}`);
  };
  render();
  root.querySelector('#pq').oninput = (e) => render(e.target.value);
  on(root, 'scan', doScan);
  if (q.scan === '1') { replaceHash(`#/pick?mode=${mode}`); doScan(); }
}

// =====================================================================
//  BUCHUNG (Bottom-Sheet) – Entnehmen / Dazu buchen / Umbuchen
// =====================================================================
async function openBooking(m, type, onDone, preset = {}) {
  if (isOfflineNow()) { toast('Offline – Buchungen sind erst wieder mit Internet möglich.', 'err'); return; }
  const conf = {
    in: { title: 'Dazu buchen', cls: 'green', icon: 'plus' },
    out: { title: 'Entnehmen', cls: 'red', icon: 'minus' },
    transfer: { title: 'Umbuchen', cls: 'blue', icon: 'swap' },
  }[type];
  let locs = await getLocs();
  if (!locs.length) {
    const name = await prompt({ title: 'Erst einen Lagerort anlegen', placeholder: 'z.B. Kleinteilemagazin', okText: 'Anlegen' });
    if (!name) return;
    await db.createLocation(name); invalidate('locations'); locs = await getLocs();
  }
  const qtyAt = (id) => m.locations.find((l) => l.location_id === id)?.qty ?? 0;
  const withStock = m.locations.filter((l) => l.qty > 0);
  const fromDefault = preset.location_id
    || (type === 'in' ? (m.default_location_id || m.locations[0]?.location_id || locs[0].id)
      : (withStock.find((l) => l.location_id === m.default_location_id) || withStock[0] || m.locations[0])?.location_id || locs[0].id);
  const opts = (sel, excl) => locs.filter((l) => l.id !== excl).map((l) => `<option value="${l.id}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)} (${fmtQty(qtyAt(l.id))})</option>`).join('')
    + '<option value="__new">+ Neuer Lagerort…</option>';

  sheet(`
    <div class="book-head ${conf.cls}">
      <div class="book-ic">${icon(conf.icon, 26, 2.6)}</div>
      <div><div class="book-type">${conf.title}</div><div class="book-name">${m.number}: ${esc(m.name)}</div></div>
    </div>
    <div class="form-group">
      <label class="frow"><span>${type === 'transfer' ? 'Von Lagerort' : 'Lagerort'}</span><select data-f="from">${opts(fromDefault)}</select></label>
      ${type === 'transfer' ? `<label class="frow"><span>Nach Lagerort</span><select data-f="to">${opts(locs.find((l) => l.id !== fromDefault)?.id, null)}</select></label>` : ''}
      <div class="frow"><span>Bestand hier</span><b data-f="here">${fmtQty(qtyAt(fromDefault))}</b></div>
    </div>
    <div class="stepper big">
      <button data-s="-1" aria-label="Weniger">${icon('minus', 28, 2.6)}</button>
      <input type="number" inputmode="decimal" min="0" step="any" value="${preset.qty || 1}" data-f="qty">
      <button data-s="1" aria-label="Mehr">${icon('plus', 28, 2.6)}</button>
    </div>
    <div class="form-group"><label class="frow col"><span>Notiz (optional)</span><input data-f="note" placeholder="z.B. Auftrag 2410-17, Kunde Müller" value="${esc(preset.note || '')}"></label></div>
    <button class="btn-action ${conf.cls} full" data-a="ok">${icon(conf.icon, 22, 2.6)} ${conf.title}</button>`,
  {
    title: conf.title,
    onMount: (root, close) => {
      const f = (k) => root.querySelector(`[data-f=${k}]`);
      const qty = f('qty');
      const handleNew = async (sel, prev) => {
        if (sel.value !== '__new') return;
        const name = await prompt({ title: 'Neuer Lagerort', okText: 'Anlegen' });
        if (!name) { sel.value = prev; return; }
        try {
          const l = await db.createLocation(name); invalidate('locations'); locs = await getLocs();
          sel.insertAdjacentHTML('afterbegin', `<option value="${l.id}">${esc(l.name)} (0)</option>`); sel.value = l.id;
        } catch (e) { errToast(e); sel.value = prev; }
      };
      let prevFrom = f('from').value; let prevTo = f('to')?.value;
      f('from').onchange = async () => { await handleNew(f('from'), prevFrom); prevFrom = f('from').value; f('here').textContent = fmtQty(qtyAt(prevFrom)); };
      if (f('to')) f('to').onchange = async () => { await handleNew(f('to'), prevTo); prevTo = f('to').value; };
      root.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { qty.value = Math.max(0, (+qty.value || 0) + +b.dataset.s); haptic(); }));
      root.querySelector('[data-a=ok]').onclick = async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const total = await db.book({ material_id: m.id, type, qty: +qty.value, location_id: f('from').value, to_location_id: f('to')?.value || null, note: f('note').value.trim() });
          haptic(30); close(); invalidate('materials', 'locations');
          toast(`${conf.title}: ${fmtQty(qty.value)} · Gesamtbestand ${fmtQty(total)}`);
          if (+m.min_stock > 0 && total <= +m.min_stock && type === 'out') setTimeout(() => toast(`Meldebestand erreicht (${fmtQty(total)} / ${fmtQty(m.min_stock)})`, 'err'), 2300);
          await onDone?.(total);
        } catch (err) { errToast(err); b.disabled = false; }
      };
    },
  });
}

// =====================================================================
//  MATERIAL-DETAIL  (Tabs: Infos · Buchung · Details)
// =====================================================================
async function viewMaterial(id, q) {
  const tab = q.tab || sessionStorage.getItem('wl-mtab') || 'infos';
  sessionStorage.setItem('wl-mtab', tab);
  const m = await db.getMaterial(id);
  if (!m) { toast('Material nicht gefunden', 'err'); return go('/list', true); }
  const reload = () => { invalidate('materials', 'locations', 'groups'); viewMaterial(id, { tab }); };
  const setTab = (t) => { replaceHash(`#/m/${id}?tab=${t}`); viewMaterial(id, { tab: t }); };

  let body = '';
  if (tab === 'infos') body = await infosTab(m);
  if (tab === 'buchung') body = await bookingTab(m);
  const defs = tab === 'details' ? fieldsFor(await getFields(), m.kind) : [];
  if (tab === 'details') body = detailsTab(m, defs);

  const root = screen({
    header: navbar({ left: backBtn('arrow'), title: `<div class="two-line">${m.number}: ${esc(m.name)}</div>`, cls: 'detail-nav' }),
    body: `<div class="segment"><button data-t="infos" class="${tab === 'infos' ? 'on' : ''}">Infos</button><button data-t="buchung" class="${tab === 'buchung' ? 'on' : ''}">Buchung</button><button data-t="details" class="${tab === 'details' ? 'on' : ''}">Details</button></div>${body}`,
    tab: 'none',
  });
  root.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => setTab(b.dataset.t)));

  // ----- gemeinsame Aktionen -----
  on(root, 'book-out', () => openBooking(m, 'out', reload));
  on(root, 'book-in', () => openBooking(m, 'in', reload));
  on(root, 'book-transfer', () => {
    if (!m.locations.some((l) => l.qty > 0)) return toast('Kein Bestand zum Umbuchen', 'err');
    openBooking(m, 'transfer', reload);
  });
  on(root, 'history', () => go(`/m/${id}/history`));
  on(root, 'add-image', async () => {
    const src = await actionSheet('Bild hinzufügen', [{ label: 'Foto aufnehmen', value: 'cam', icon: 'camera' }, { label: 'Aus Mediathek', value: 'lib', icon: 'upload' }]);
    if (!src) return;
    const files = await pickFiles({ capture: src === 'cam' });
    if (!files.length) return;
    try { toast('Bild wird hochgeladen…'); for (const f of files) await db.addFile(id, await compressImage(f), f.name, 'image'); toast('Bild gespeichert'); reload(); } catch (e) { errToast(e); }
  });
  on(root, 'label', () => {
    // 2. Zeile: Chargennummer/Platz (eigenes Feld), sonst Artikelnummer
    const cf = m.custom_fields || {};
    const platzKey = Object.keys(cf).find((k) => /charge|platz|fach/i.test(k) && String(cf[k]).trim());
    const where = (m.locations.find((l) => l.location_id === m.default_location_id) || m.locations[0])?.name || '';
    showLabel({
      title: m.name,
      sub: platzKey ? `${/platz|fach/i.test(platzKey) ? 'Platz' : 'Charge'} ${cf[platzKey]}` : `Nr. ${m.number}`,
      extra: [platzKey ? `Nr. ${m.number}` : '', where].filter(Boolean).join(' · '),
      code: m.barcode || String(m.number),
    });
  });
  root.querySelectorAll('[data-img]').forEach((el) => (el.onclick = () => openImage(m, m.images[+el.dataset.img], reload)));

  if (tab === 'infos') {
    on(root, 'add-loc', async () => {
      const locs = await getLocs();
      const v = await pickFrom({ title: 'Lagerort hinzufügen', items: locs.filter((l) => !m.locations.some((x) => x.location_id === l.id)).map((l) => ({ value: l.id, label: l.name })),
        createLabel: 'Neuer Lagerort', onCreate: async () => { const n = await prompt({ title: 'Neuer Lagerort', okText: 'Anlegen' }); if (!n) return null; const l = await db.createLocation(n); invalidate('locations'); return l.id; } });
      if (v) { try { await db.addStockLocation(id, v); reload(); } catch (e) { errToast(e); } }
    });
    root.querySelectorAll('[data-loc]').forEach((r) => (r.onclick = async () => {
      const l = m.locations.find((x) => x.location_id === r.dataset.loc);
      const v = await actionSheet(`${l.name} · Bestand ${fmtQty(l.qty)}`, [
        { label: 'Entnehmen', value: 'out', icon: 'minus' }, { label: 'Dazu buchen', value: 'in', icon: 'plus' },
        ...(l.qty > 0 ? [{ label: 'Umbuchen', value: 'transfer', icon: 'swap' }] : []),
        { label: 'Bestand korrigieren (Inventur)', value: 'inv', icon: 'tally' },
        { label: 'Als Standard-Lagerort', value: 'def', icon: 'check' },
        { label: 'Lagerort entfernen', value: 'del', icon: 'trash', danger: true },
      ]);
      try {
        if (['out', 'in', 'transfer'].includes(v)) openBooking(m, v, reload, { location_id: l.location_id });
        if (v === 'inv') {
          const n = await prompt({ title: 'Gezählter Bestand', message: l.name, value: l.qty, type: 'number', okText: 'Buchen' });
          if (n !== null && n !== '') { await db.book({ material_id: id, type: 'inventory', qty: +n, location_id: l.location_id, note: 'Korrektur' }); toast('Bestand korrigiert'); reload(); }
        }
        if (v === 'def') { await db.saveMaterial(id, { default_location_id: l.location_id }); toast('Standard-Lagerort gesetzt'); reload(); }
        if (v === 'del') { await db.removeStockLocation(id, l.location_id); reload(); }
      } catch (e) { errToast(e); }
    }));
    on(root, 'commission', async () => {
      const cart = await getCart();
      const names = [...new Set(cart.filter((c) => c.list === 'commission').map((c) => c.commission).filter(Boolean))];
      let name = names.length ? await pickFrom({ title: 'Kommission wählen', items: names.map((n) => ({ value: n, label: n })), createLabel: 'Neue Kommission',
        onCreate: () => prompt({ title: 'Neue Kommission', placeholder: 'z.B. Auftrag 2410-17 / Kunde', okText: 'Weiter' }) })
        : await prompt({ title: 'Neue Kommission', placeholder: 'z.B. Auftrag 2410-17 / Kunde', okText: 'Weiter' });
      if (!name) return;
      const n = await prompt({ title: 'Menge', value: 1, type: 'number', okText: 'Hinzufügen' });
      if (!n || !(+n > 0)) return;
      try { await db.addToCart('commission', id, +n, name); invalidate('cart'); toast(`Zu Kommission „${name}“ hinzugefügt`); } catch (e) { errToast(e); }
    });
    on(root, 'cart', async () => {
      const sug = Math.max(1, (+m.max_stock || 0) - m.total) || 1;
      const n = await prompt({ title: 'In den Warenkorb', message: m.name, value: sug, type: 'number', okText: 'Hinzufügen' });
      if (!n || !(+n > 0)) return;
      try { await db.addToCart('cart', id, +n); invalidate('cart'); toast('Im Warenkorb'); } catch (e) { errToast(e); }
    });
    // Aufgaben
    const tasksOpen = localStorage.getItem('wl-tasks-open') !== '0';
    on(root, 'tasks-toggle', () => { localStorage.setItem('wl-tasks-open', tasksOpen ? '0' : '1'); reload(); });
    on(root, 'task-add', async () => {
      const t = await prompt({ title: 'Neue Aufgabe', placeholder: 'z.B. Nachbestellen bei Lieferant X', okText: 'Hinzufügen' });
      if (t) { try { await db.addTask(id, t); localStorage.setItem('wl-tasks-open', '1'); reload(); } catch (e) { errToast(e); } }
    });
    root.querySelectorAll('[data-task]').forEach((el) => {
      el.querySelector('input').onchange = async (e) => { try { await db.setTaskDone(el.dataset.task, e.target.checked); } catch (er) { errToast(er); } };
      el.querySelector('[data-del]').onclick = async () => { try { await db.deleteTask(el.dataset.task); reload(); } catch (er) { errToast(er); } };
    });
  }

  if (tab === 'details') {
    on(root, 'copy-name', () => copyText(m.name));
    on(root, 'copy-bc', () => copyText(m.barcode || ''));
    on(root, 'edit', () => go(`/edit/${id}`));
    on(root, 'delete', async () => {
      if (!await confirmBox({ title: 'Material löschen?', message: `${m.name} inkl. Bestand, Historie und Bildern wird gelöscht.`, okText: 'Löschen', danger: true })) return;
      try { await db.deleteMaterial(id); invalidate(); toast('Gelöscht'); go('/list', true); } catch (e) { errToast(e); }
    });
    root.querySelectorAll('[data-quick]').forEach((r) => (r.onclick = async () => {
      const k = r.dataset.quick;
      try {
        if (k === 'barcode') {
          const v = await actionSheet('Barcode', [{ label: 'Scannen', value: 'scan', icon: 'scan' }, { label: 'Eintippen', value: 'type', icon: 'edit' }]);
          const code = v === 'scan' ? await scan() : v === 'type' ? await prompt({ title: 'Barcode', value: m.barcode || '' }) : null;
          if (code !== null && code !== undefined) { await db.saveMaterial(id, { barcode: code }); reload(); }
          return;
        }
        if (k === 'group') {
          const groups = await getGroups();
          const v = await pickFrom({ title: 'Ersatzteil Gruppe', items: groups.map((g) => ({ value: g.id, label: g.name })), selected: m.group_id, allowNone: true,
            createLabel: 'Neue Gruppe', onCreate: async () => { const n = await prompt({ title: 'Neue Ersatzteil Gruppe' }); if (!n) return null; const g = await db.createGroup(n); invalidate('groups'); return g.id; } });
          if (v !== undefined) { await db.saveMaterial(id, { group_id: v }); reload(); }
          return;
        }
        if (k === 'booking_type') {
          const v = await actionSheet('Buchungsart', ['Einheit', 'Packung', 'Meter', 'Gramm', 'Milliliter'].map((x) => ({ label: x, value: x })));
          if (v) { await db.saveMaterial(id, { booking_type: v }); reload(); }
          return;
        }
        if (k.startsWith('cf:')) {
          const key = k.slice(3);
          const def = defs.find((d) => d.name === key);
          const cur = m.custom_fields?.[key];
          const put = async (val) => {
            const next = { ...m.custom_fields };
            if (val === '' || val === null || val === false) delete next[key]; else next[key] = val;
            await db.saveMaterial(id, { custom_fields: next }); reload();
          };
          if (def?.type === 'bool') return put(!(cur === true || cur === 'true' || cur === 'Ja'));
          if (def?.type === 'select') {
            const v = await actionSheet(key, [...def.options.map((o) => ({ label: o, value: o, icon: o === cur ? 'check' : undefined })), { label: 'Leeren', value: '__clear', danger: true }]);
            if (v) await put(v === '__clear' ? '' : v);
            return;
          }
          const type = def?.type === 'number' ? 'number' : def?.type === 'date' ? 'date' : 'text';
          let v = await prompt({ title: key, value: cur ?? '', type });
          if (v === null) return;
          if (type === 'number' && v !== '') v = v.replace(',', '.');
          await put(v);
          return;
        }
        const labels = { unit: 'Einheit', sale_price: 'Verkaufspreis (€)', purchase_price: 'Einkaufspreis (€)', min_stock: 'Meldebestand', max_stock: 'Maximalbestand', supplier: 'Lieferant', notes: 'Notizen' };
        const numeric = ['sale_price', 'purchase_price', 'min_stock', 'max_stock'].includes(k);
        let v = await prompt({ title: labels[k], value: m[k] ?? '', type: numeric ? 'number' : 'text' });
        if (v === null) return;
        if (numeric) v = v.replace(',', '.');
        await db.saveMaterial(id, { [k]: v }); reload();
      } catch (e) { errToast(e); }
    }));
    on(root, 'cf-add', async () => {
      const key = await prompt({ title: 'Eigenes Feld', placeholder: 'Feldname, z.B. Chargennummer Platz', okText: 'Weiter' }); if (!key) return;
      const v = await prompt({ title: key, placeholder: 'Wert' }); if (v === null) return;
      try { await db.saveMaterial(id, { custom_fields: { ...m.custom_fields, [key]: v } }); reload(); } catch (e) { errToast(e); }
    });
    on(root, 'add-file', async () => {
      const files = await pickFiles({ accept: '*/*', multiple: true }); if (!files.length) return;
      try {
        toast('Wird hochgeladen…');
        for (const f of files) { const isImg = f.type.startsWith('image/'); await db.addFile(id, isImg ? await compressImage(f) : f, f.name, isImg ? 'image' : 'file'); }
        toast('Gespeichert'); reload();
      } catch (e) { errToast(e); }
    });
    root.querySelectorAll('[data-file]').forEach((r) => (r.onclick = async () => {
      const f = m.files.find((x) => x.id === r.dataset.file);
      const v = await actionSheet(f.name || 'Datei', [{ label: 'Öffnen', value: 'open', icon: 'external' }, { label: 'Löschen', value: 'del', icon: 'trash', danger: true }]);
      if (v === 'open') window.open(f.url, '_blank');
      if (v === 'del' && await confirmBox({ title: 'Datei löschen?', okText: 'Löschen', danger: true })) { try { await db.deleteFile(f); reload(); } catch (e) { errToast(e); } }
    }));
  }
}

function gallery(m) {
  const imgs = m.images;
  return `<div class="gallery">
      <div class="gal-imgs">
        ${imgs.length ? `<button class="gal-main" data-img="0"><img src="${esc(imgs[0].url)}" alt=""></button>
          ${imgs.length > 1 ? `<div class="gal-thumbs">${imgs.slice(1, 5).map((im, i) => `<button data-img="${i + 1}"><img src="${esc(im.url)}" alt=""></button>`).join('')}</div>` : ''}`
        : `<button class="gal-empty" data-act="add-image">${icon(m.kind === 'tool' ? 'wrench' : 'box', 54, 1.2)}<span>Noch kein Bild</span></button>`}
      </div>
      <div class="gal-side">
        <button class="outline-btn" data-act="add-image" aria-label="Bild hinzufügen">${icon('camera', 22)}</button>
        <button class="outline-btn" data-act="label" aria-label="Etikett">${icon('tag', 22)}</button>
      </div>
    </div>`;
}
function openImage(m, img, reload) {
  sheet(`<img class="viewer-img" src="${esc(img.url)}" alt="">
    <button class="btn-gray full mt danger-text" data-a="del">${icon('trash', 18)} Bild löschen</button>`,
  { title: m.name, onMount: (root, close) => {
    root.querySelector('[data-a=del]').onclick = async () => {
      if (!await confirmBox({ title: 'Bild löschen?', okText: 'Löschen', danger: true })) return;
      try { await db.deleteFile(img); close(); reload(); } catch (e) { errToast(e); }
    };
  } });
}

async function infosTab(m) {
  const tasks = await db.listTasks(m.id);
  const open = localStorage.getItem('wl-tasks-open') !== '0';
  const low = isLow(m);
  return `
    ${gallery(m)}
    <div class="sec-title"><span>LAGERORTE</span><button class="icon-btn" data-act="add-loc" aria-label="Lagerort hinzufügen">${icon('plus', 26)}</button></div>
    <div class="group-card">
    <div class="loc-list">
      ${m.locations.map((l) => `<button class="loc-row" data-loc="${l.location_id}"><b>${esc(l.name)}${l.location_id === m.default_location_id ? ' <small class="muted">· Standard</small>' : ''}</b><span class="${low || l.qty === 0 ? 'red' : ''}">${fmtQty(l.qty)}</span></button>`).join('')
        || '<p class="muted small">Noch kein Lagerort – oben auf + tippen.</p>'}
    </div>
    <div class="total-row"><b>GESAMTBESTAND</b><span class="${low ? 'red' : ''}">${fmtQty(m.total)}</span></div>
    </div>
    ${+m.min_stock || m.max_stock ? `<p class="muted small">Meldebestand ${fmtQty(m.min_stock)}${m.max_stock ? ` · Maximalbestand ${fmtQty(m.max_stock)}` : ''}${low ? ' · <b class="red">nachbestellen!</b>' : ''}</p>` : ''}
    <button class="card-btn" data-act="label"><i>${icon('print', 24)}</i><span>Etikett drucken</span></button>
    <button class="card-btn" data-act="commission"><i>${icon('cartPlus', 26)}</i><span>Zu Kommission hinzufügen</span></button>
    <button class="card-btn red" data-act="cart"><i>${icon('cart', 26)}</i><span>In den Warenkorb legen</span></button>
    <div class="tasks">
      <div class="tasks-head"><b>Aufgaben (${tasks.filter((t) => !t.done).length})</b>
        <span><button class="icon-btn" data-act="task-add" aria-label="Aufgabe hinzufügen">${icon('plus', 24)}</button>
        <button class="icon-btn" data-act="tasks-toggle" aria-label="Auf/Zu">${icon(open ? 'chevU' : 'chevD', 24)}</button></span></div>
      ${open ? tasks.map((t) => `<div class="task" data-task="${t.id}"><label><input type="checkbox" ${t.done ? 'checked' : ''}><span>${esc(t.title)}</span></label><button class="icon-btn" data-del aria-label="Löschen">${icon('trash', 18)}</button></div>`).join('') : ''}
    </div>
    <button class="link-row" data-act="history">Bestandsänderungen ${icon('chevR', 18)}</button>`;
}

const typeInfo = {
  in: { label: 'Dazu gebucht', cls: 'green', ic: 'plus' }, out: { label: 'Entnommen', cls: 'red', ic: 'minus' },
  transfer: { label: 'Umgebucht', cls: 'blue', ic: 'swap' }, inventory: { label: 'Inventur', cls: 'gray', ic: 'tally' },
};
const movementRow = (x, showAfter = false) => {
  const t = typeInfo[x.type];
  const where = x.type === 'transfer' ? `${esc(x.from_name)} → ${esc(x.to_name)}` : esc(x.from_name);
  const sign = x.type === 'transfer' ? '' : x.qty > 0 ? '+' : '';
  return `<div class="mov">
    <div class="mov-ic ${t.cls}">${icon(t.ic, 18, 2.6)}</div>
    <div class="mov-main"><b>${t.label}</b><div class="small muted">${where}${x.note ? ` · ${esc(x.note)}` : ''}</div>
      ${showAfter && x.stock_after != null ? `<div class="small muted">Gesamtbestand danach: ${fmtQty(x.stock_after)}</div>` : ''}</div>
    <div class="mov-right"><b class="${t.cls}-text">${sign}${fmtQty(x.qty)}</b><div class="small muted">${fmtDate(x.created_at)}</div></div>
  </div>`;
};

async function bookingTab(m) {
  const mov = await db.listMovements(m.id, 5);
  return `
    <p class="caps center">Aktion auswählen:</p>
    <button class="book-card red" data-act="book-out"><i>${icon('minus', 34, 2.6)}</i><span>Entnehmen</span></button>
    <button class="book-card green" data-act="book-in"><i>${icon('plus', 34, 2.6)}</i><span>Dazu buchen</span></button>
    <button class="book-card blue" data-act="book-transfer"><i>${icon('swap', 34, 2.4)}</i><span>Umbuchen</span></button>
    <button class="link-row muted" data-act="history">Bestandsänderungen ${icon('chevR', 18)}</button>
    ${mov.length ? `<div class="mov-list">${mov.map(movementRow).join('')}</div>` : ''}`;
}

function detailsTab(m, defs = []) {
  const row = (label, value, quick, extra = '') => `
    <button class="drow" ${quick ? `data-quick="${quick}"` : 'disabled'}>
      <div><small>${label}</small><div>${value}</div></div>${extra}${quick ? icon('chevR', 22) : ''}
    </button>`;
  return `
    <div class="d-title"><h2>${esc(m.name)}</h2><button class="icon-btn" data-act="copy-name" aria-label="Kopieren">${icon('copy', 24)}</button></div>
    <div class="dlist">
      ${row('Artikelnummer', m.number, null)}
      ${row('Barcode', esc(m.barcode || '—'), 'barcode', m.barcode ? `<span class="icon-btn" data-act="copy-bc">${icon('copy', 22)}</span>` : '')}
      ${row('Einheit', esc(m.unit || '—'), 'unit')}
      ${row('Verkaufspreis', fmtEUR(m.sale_price), 'sale_price')}
      ${row('Einkaufspreis', m.purchase_price != null ? fmtEUR(m.purchase_price) : '—', 'purchase_price')}
      ${row('Buchungsart', esc(m.booking_type || 'Einheit'), 'booking_type')}
      ${row(m.kind === 'tool' ? 'Gruppe' : 'Ersatzteil Gruppe', esc(m.group_name || '—'), 'group')}
      ${row('Meldebestand', fmtQty(m.min_stock), 'min_stock')}
      ${row('Maximalbestand', fmtQty(m.max_stock), 'max_stock')}
      ${row('Lieferant', esc(m.supplier || '—'), 'supplier')}
      ${row('Notizen', esc(m.notes || '—'), 'notes')}
    </div>
    <div class="sec-title gray"><span>DATEIEN</span><button class="icon-btn" data-act="add-file" aria-label="Datei hinzufügen">${icon('plus', 24)}</button></div>
    <div class="dlist">
      ${m.files.map((f) => `<button class="file-row" data-file="${f.id}">
          <div class="file-th">${f.kind === 'image' ? `<img src="${esc(f.url)}" alt="">` : icon('file', 26)}</div>
          <div><div>${esc(f.name || 'datei')}</div><small class="muted">${f.kind === 'image' ? 'Vorschaubild' : 'Datei'}</small></div>${icon('external', 24)}</button>`).join('')
        || '<p class="muted small pad-s">Keine Dateien</p>'}
    </div>
    <div class="sec-title gray"><span>EIGENE FELDER</span><button class="icon-btn" data-act="cf-add" aria-label="Feld hinzufügen">${icon('plus', 24)}</button></div>
    <div class="dlist">
      ${(() => {
        const cf = m.custom_fields || {};
        const names = new Set(defs.map((d) => d.name));
        const rows = [
          ...defs.map((d) => row(esc(d.name), esc(fieldDisplay(d, cf[d.name])), `cf:${esc(d.name)}`)),
          ...Object.entries(cf).filter(([k]) => !names.has(k)).map(([k, v]) => row(esc(k), esc(v === '' || v == null ? '—' : String(v)), `cf:${esc(k)}`)),
        ];
        return rows.join('') || '<p class="muted small pad-s">Keine eigenen Felder – unter Menü → Eigene Felder anlegen</p>';
      })()}
    </div>
    <button class="btn-outline full mt" data-act="edit">Material bearbeiten</button>
    <button class="btn-plain danger-text full" data-act="delete">${icon('trash', 18)} Material löschen</button>`;
}

async function viewHistory(id) {
  const [m, mov] = await Promise.all([db.getMaterial(id), db.listMovements(id)]);
  screen({
    header: navbar({ left: backBtn('arrow'), title: `<div class="two-line">Bestandsänderungen<br><small>${m ? esc(m.name) : ''}</small></div>` }),
    body: mov.length ? `<div class="mov-list">${mov.map((x) => movementRow(x, true)).join('')}</div>`
      : empty('history', 'Noch keine Bestandsänderungen'),
  });
}

// =====================================================================
//  FORMULAR: Ersatzteil / Werkzeug anlegen & bearbeiten
// =====================================================================
async function viewForm(id, q) {
  const m = id ? await db.getMaterial(id) : null;
  const kind = m?.kind || q.kind || 'part';
  const [locs, groups, allDefs] = await Promise.all([getLocs(), getGroups(), getFields()]);
  const showAll = localStorage.getItem('wl-form-all') === '1';
  const st = {
    location_id: m ? m.default_location_id : (localStorage.getItem('wl-last-loc') || locs[0]?.id || null),
    group_id: m ? m.group_id : (q.group || (kind === 'tool' ? groups.find((g) => g.name === 'Werkzeug')?.id : null) || null),
    images: [],
    defs: fieldsFor(allDefs, kind),
    defVals: {},
    custom: [],
  };
  if (st.location_id && !locs.some((l) => l.id === st.location_id)) st.location_id = null;
  {
    const cf = m?.custom_fields || {};
    const names = new Set(st.defs.map((d) => d.name));
    st.defs.forEach((d) => { st.defVals[d.name] = d.type === 'bool' ? (cf[d.name] === true || cf[d.name] === 'true' || cf[d.name] === 'Ja') : (cf[d.name] ?? ''); });
    st.custom = Object.entries(cf).filter(([k]) => !names.has(k)).map(([k, v]) => [k, v == null ? '' : String(v)]);
  }
  const title = id ? (kind === 'tool' ? 'Werkzeug bearbeiten' : 'Ersatzteil bearbeiten') : (kind === 'tool' ? 'Werkzeug anlegen' : 'Ersatzteil anlegen');
  const v = (k, d = '') => esc(m?.[k] ?? d);

  const root = screen({
    header: navbar({ left: backBtn(), title, right: btn('save', 'save', 'Speichern') }),
    cls: 'form-screen',
    body: `
    <form id="mf" autocomplete="off">
      <div class="form-card">
      <label class="field"><small>Name</small><input name="name" placeholder="Name" value="${v('name', q.name || '')}" required></label>
      <div class="field with-btns"><label><small>Barcode</small><input name="barcode" placeholder="Barcode" value="${v('barcode', q.barcode || '')}"></label>
        <button type="button" class="dark-btn" data-act="scan-bc" aria-label="Barcode scannen">${icon('scan', 30, 1.8)}</button></div>
      <div class="field with-btns"><label><small>Lagerort</small><input readonly data-f="loc" placeholder="Lagerort" value="${esc(locs.find((l) => l.id === st.location_id)?.name || '')}"></label>
        <button type="button" class="dark-btn sm" data-act="pick-loc" aria-label="Lagerort wählen">${icon('list', 26)}</button>
        <button type="button" class="dark-btn" data-act="scan-loc" aria-label="Lagerort scannen">${icon('scan', 30, 1.8)}</button></div>
      ${id ? '' : `<label class="field"><small>Aktueller Bestand</small><input name="qty" type="number" inputmode="decimal" min="0" step="any" placeholder="Aktueller Bestand"></label>`}
      <label class="field no-line"><small>Meldebestand</small><input name="min_stock" type="number" inputmode="decimal" min="0" step="any" placeholder="Meldebestand" value="${m && +m.min_stock ? v('min_stock') : ''}"></label>
      <label class="field"><small>Maximalbestand</small><input name="max_stock" type="number" inputmode="decimal" min="0" step="any" placeholder="Maximalbestand" value="${v('max_stock')}"></label>
      <div id="deff"></div>
      <label class="field switch-field"><span>Alle Felder anzeigen</span><input type="checkbox" class="switch" data-f="all" ${showAll ? 'checked' : ''}></label>
      </div>

      <div class="more-fields ${showAll ? '' : 'hidden'}">
        <div class="form-card">
        <label class="field"><small>Artikelnummer</small><input name="number" type="number" inputmode="numeric" placeholder="automatisch" value="${v('number')}"></label>
        <div class="field with-btns"><label><small>${kind === 'tool' ? 'Gruppe' : 'Ersatzteil Gruppe'}</small><input readonly data-f="grp" placeholder="Keine Gruppe" value="${esc(groups.find((g) => g.id === st.group_id)?.name || '')}"></label>
          <button type="button" class="dark-btn sm" data-act="pick-grp" aria-label="Gruppe wählen">${icon('list', 26)}</button></div>
        <label class="field"><small>Einheit</small><input name="unit" placeholder="Stück" value="${v('unit', 'Stück')}"></label>
        <label class="field"><small>Buchungsart</small><select name="booking_type">${['Einheit', 'Packung', 'Meter', 'Gramm', 'Milliliter'].map((b) => `<option ${b === (m?.booking_type || 'Einheit') ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label class="field"><small>Verkaufspreis (€)</small><input name="sale_price" type="number" inputmode="decimal" step="0.01" placeholder="0,00" value="${m && +m.sale_price ? v('sale_price') : ''}"></label>
        <label class="field"><small>Einkaufspreis (€)</small><input name="purchase_price" type="number" inputmode="decimal" step="0.01" placeholder="0,00" value="${v('purchase_price')}"></label>
        <label class="field"><small>Lieferant</small><input name="supplier" placeholder="z.B. Partsdepot" value="${v('supplier')}"></label>
        <label class="field"><small>Notizen</small><textarea name="notes" rows="2" placeholder="Notizen">${v('notes')}</textarea></label>
        </div>
        <div class="sec-title gray"><span>WEITERE FELDER</span><button type="button" class="icon-btn" data-act="cf-add" aria-label="Feld nur für diesen Artikel">${icon('plus', 24)}</button></div>
        <div id="cf" class="form-card"></div>
      </div>

      <div class="pad-x">
        <div id="previews" class="previews"></div>
        <button type="button" class="btn-dark full" data-act="img">${icon('camera', 26)} Bild hinzufügen</button>
        ${m?.images.length ? `<p class="muted small center mt">${m.images.length} Bild(er) vorhanden – Verwaltung unter Details.</p>` : ''}
        <button type="submit" class="btn-filled full mt">${icon('save', 20)} Speichern</button>
      </div>
    </form>`,
  });

  const form = root.querySelector('#mf');
  // Felder aus Menü → Eigene Felder, passend zum Typ
  const renderDefs = () => {
    root.querySelector('#deff').innerHTML = st.defs.map((d, i) => {
      const v = st.defVals[d.name];
      if (d.type === 'bool') return `<label class="field switch-field"><span>${esc(d.name)}</span><input type="checkbox" class="switch" data-def="${i}" ${v ? 'checked' : ''}></label>`;
      let inp;
      if (d.type === 'select') inp = `<select data-def="${i}"><option value="">Bitte wählen</option>${d.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      else if (d.type === 'number') inp = `<input data-def="${i}" type="number" inputmode="decimal" step="any" placeholder="${esc(d.name)}" value="${esc(v)}">`;
      else if (d.type === 'date') inp = `<input data-def="${i}" type="date" value="${esc(v)}">`;
      else inp = `<input data-def="${i}" placeholder="${esc(d.name)}" value="${esc(v)}">`;
      return `<label class="field"><small>${esc(d.name)}</small>${inp}</label>`;
    }).join('');
    root.querySelectorAll('[data-def]').forEach((el) => {
      const d = st.defs[+el.dataset.def];
      const upd = () => { st.defVals[d.name] = d.type === 'bool' ? el.checked : el.value; };
      el.oninput = upd; el.onchange = upd;
    });
  };
  renderDefs();
  const renderCF = () => {
    root.querySelector('#cf').innerHTML = st.custom.map(([k, val], i) => `
      <div class="field cf-row"><label><small>${esc(k)}</small><input data-cf="${i}" value="${esc(val)}" placeholder="${esc(k)}"></label>
      <button type="button" class="icon-btn danger-text" data-cfdel="${i}">${icon('trash', 20)}</button></div>`).join('');
    root.querySelectorAll('[data-cf]').forEach((inp) => (inp.oninput = () => (st.custom[+inp.dataset.cf][1] = inp.value)));
    root.querySelectorAll('[data-cfdel]').forEach((b) => (b.onclick = () => { st.custom.splice(+b.dataset.cfdel, 1); renderCF(); }));
  };
  renderCF();
  const renderPreviews = () => {
    const box = root.querySelector('#previews');
    box.innerHTML = st.images.map((b, i) => `<div class="pv"><img src="${URL.createObjectURL(b)}" alt=""><button type="button" data-pv="${i}">${icon('x', 14, 3)}</button></div>`).join('');
    box.querySelectorAll('[data-pv]').forEach((b) => (b.onclick = () => { st.images.splice(+b.dataset.pv, 1); renderPreviews(); }));
  };

  const setLoc = (lid) => { st.location_id = lid; root.querySelector('[data-f=loc]').value = locs.find((l) => l.id === lid)?.name || ''; };
  const createLoc = async (barcode = '') => {
    const n = await prompt({ title: 'Neuer Lagerort', okText: 'Anlegen' }); if (!n) return null;
    const l = await db.createLocation(n, barcode); invalidate('locations'); locs.push(l); return l.id;
  };
  root.querySelector('[data-f=all]').onchange = (e) => { localStorage.setItem('wl-form-all', e.target.checked ? '1' : '0'); root.querySelector('.more-fields').classList.toggle('hidden', !e.target.checked); };
  on(root, 'scan-bc', async () => {
    const code = await scan(); if (!code) return;
    form.barcode.value = code;
    const ex = await db.findByCode(code);
    if (ex && ex.id !== id) toast(`Achtung: Barcode gehört schon zu „${ex.name}“`, 'err');
  });
  on(root, 'pick-loc', async () => {
    const r = await pickFrom({ title: 'Lagerort', items: locs.map((l) => ({ value: l.id, label: l.name })), selected: st.location_id, allowNone: !!id, createLabel: 'Neuer Lagerort', onCreate: () => createLoc() });
    if (r !== undefined) setLoc(r);
  });
  root.querySelector('[data-f=loc]').onclick = () => root.querySelector('[data-act=pick-loc]').click();
  on(root, 'scan-loc', async () => {
    const code = await scan({ title: 'Lagerort scannen' }); if (!code) return;
    const l = locs.find((x) => x.barcode === code || x.name.toLowerCase() === code.toLowerCase());
    if (l) setLoc(l.id);
    else if (await confirmBox({ title: 'Lagerort unbekannt', message: `„${code}“ ist keinem Lagerort zugeordnet. Neuen Lagerort mit diesem Code anlegen?`, okText: 'Anlegen' })) {
      const nid = await createLoc(code).catch(errToast); if (nid) setLoc(nid);
    }
  });
  on(root, 'pick-grp', async () => {
    const r = await pickFrom({ title: 'Gruppe', items: groups.map((g) => ({ value: g.id, label: g.name, hint: `${g.count}` })), selected: st.group_id, allowNone: true,
      createLabel: 'Neue Gruppe', onCreate: async () => { const n = await prompt({ title: 'Neue Ersatzteil Gruppe' }); if (!n) return null; const g = await db.createGroup(n); invalidate('groups'); groups.push(g); return g.id; } });
    if (r !== undefined) { st.group_id = r; root.querySelector('[data-f=grp]').value = groups.find((g) => g.id === r)?.name || ''; }
  });
  root.querySelector('[data-f=grp]').onclick = () => root.querySelector('[data-act=pick-grp]').click();
  on(root, 'cf-add', async () => { const k = await prompt({ title: 'Eigenes Feld', placeholder: 'Feldname', okText: 'Hinzufügen' }); if (k) { st.custom.push([k, '']); renderCF(); } });
  on(root, 'img', async () => {
    const src = await actionSheet('Bild hinzufügen', [{ label: 'Foto aufnehmen', value: 'cam', icon: 'camera' }, { label: 'Aus Mediathek', value: 'lib', icon: 'upload' }]);
    if (!src) return;
    const files = await pickFiles({ capture: src === 'cam' });
    for (const f of files) st.images.push(await compressImage(f));
    renderPreviews();
  });

  let saving = false;
  const save = async () => {
    if (saving) return;
    const fd = Object.fromEntries(new FormData(form));
    if (!fd.name?.trim()) { toast('Bitte einen Namen eingeben', 'err'); form.name.focus(); return; }
    if (!id && +fd.qty > 0 && !st.location_id) { toast('Für einen Anfangsbestand bitte Lagerort wählen', 'err'); return; }
    const num = (s) => (s ?? '').toString().replace(',', '.');
    const data = {
      kind, name: fd.name, barcode: fd.barcode.trim(), default_location_id: st.location_id, group_id: st.group_id,
      min_stock: num(fd.min_stock), max_stock: num(fd.max_stock),
      unit: fd.unit || 'Stück', booking_type: fd.booking_type || 'Einheit',
      sale_price: num(fd.sale_price), purchase_price: num(fd.purchase_price), supplier: fd.supplier ?? '', notes: fd.notes ?? '',
      custom_fields: (() => {
        const out = {};
        st.defs.forEach((d) => {
          let v = st.defVals[d.name];
          if (d.type === 'bool') { if (v) out[d.name] = true; return; }
          v = (v ?? '').toString().trim();
          if (d.type === 'number') v = v.replace(',', '.');
          if (v !== '') out[d.name] = v;
        });
        st.custom.filter(([k]) => k.trim()).forEach(([k, val]) => { out[k.trim()] = val; });
        return out;
      })(),
    };
    if (fd.number) data.number = fd.number;
    saving = true; root.querySelectorAll('[data-act=save], [type=submit]').forEach((b) => (b.disabled = true));
    try {
      const nid = await db.saveMaterial(id, data, { images: st.images, initial: id ? null : { location_id: st.location_id, qty: num(fd.qty) } });
      if (st.location_id) localStorage.setItem('wl-last-loc', st.location_id);
      invalidate(); toast(id ? 'Gespeichert' : `${kind === 'tool' ? 'Werkzeug' : 'Ersatzteil'} angelegt`);
      sessionStorage.setItem('wl-mtab', 'infos');
      go(`/m/${nid}`, true);
    } catch (e) { errToast(e); saving = false; root.querySelectorAll('[data-act=save], [type=submit]').forEach((b) => (b.disabled = false)); }
  };
  form.onsubmit = (e) => { e.preventDefault(); save(); };
  on(root, 'save', save);
}

// =====================================================================
//  MATERIAL GRUPPEN & LAGERORTE
// =====================================================================
async function viewFields() {
  let defs = [];
  let missing = null;
  try { defs = await db.listFieldDefs(); cache.fields = defs; } catch (e) { missing = e.message; }
  const scopeTone = { both: 'primary', part: 'blue', tool: 'indigo' };
  const root = screen({
    header: navbar({ left: backBtn() }),
    cls: 'large-title-screen',
    body: `<h1 class="large-title">Eigene Felder</h1>
      <p class="hint">Diese Felder erscheinen automatisch beim Anlegen und in den Details deiner Ersatzteile und Werkzeuge.</p>
      ${missing ? `<div class="setup-note">${icon('alert', 18)}<span>${esc(missing)}</span></div>` : `
      <div class="plain-list">${defs.map((f) => `<button class="plain-row field-row" data-f="${f.id}">
          <span class="fr-main"><b>${esc(f.name)}</b><small>${db.FIELD_TYPES[f.type]}${f.type === 'select' ? ` · ${esc(f.options.join(', '))}` : ''}</small></span>
          <span class="chip-s tone-${scopeTone[f.applies_to]}">${db.FIELD_SCOPES[f.applies_to]}</span>
        </button>`).join('')
        || empty('tag', 'Noch keine eigenen Felder', '<button class="btn-tinted" data-act="add">' + icon('plus', 18) + ' Erstes Feld anlegen</button>')}</div>`}`,
    footer: missing ? '' : `<footer class="bottom-bar"><button class="icon-btn blue" data-act="add" aria-label="Neues Feld">${icon('plusCircle', 34, 1.8)}</button></footer>`,
  });
  const reload = () => { invalidate('fields'); viewFields(); };
  on(root, 'add', () => openFieldEditor(null, reload));
  root.querySelectorAll('[data-f]').forEach((r) => (r.onclick = async () => {
    const f = defs.find((x) => x.id === r.dataset.f);
    const i = defs.indexOf(f);
    const v = await actionSheet(f.name, [
      { label: 'Bearbeiten', value: 'edit', icon: 'edit' },
      ...(i > 0 ? [{ label: 'Nach oben', value: 'up', icon: 'chevU' }] : []),
      ...(i < defs.length - 1 ? [{ label: 'Nach unten', value: 'down', icon: 'chevD' }] : []),
      { label: 'Löschen', value: 'del', icon: 'trash', danger: true },
    ]);
    try {
      if (v === 'edit') openFieldEditor(f, reload);
      if (v === 'up' || v === 'down') { await db.moveFieldDef(f.id, v === 'up' ? -1 : 1); reload(); }
      if (v === 'del' && await confirmBox({ title: `„${f.name}“ löschen?`, message: 'Das Feld erscheint nicht mehr beim Anlegen. Bereits eingetragene Werte bleiben bei den Artikeln erhalten.', okText: 'Löschen', danger: true })) {
        await db.deleteFieldDef(f.id); toast('Feld gelöscht'); reload();
      }
    } catch (e) { errToast(e); }
  }));
}

function openFieldEditor(def, onSaved) {
  const d = def || { name: '', type: 'text', options: [], applies_to: 'both' };
  sheet(`
    <div class="form-group">
      <label class="frow col"><span>Feldname</span><input id="fd-name" placeholder="z. B. Chargennummer Platz" value="${esc(d.name)}" autocomplete="off"></label>
      <label class="frow"><span>Typ</span><select id="fd-type">${Object.entries(db.FIELD_TYPES).map(([k, l]) => `<option value="${k}" ${k === d.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="frow col" id="fd-opt-row" ${d.type === 'select' ? '' : 'hidden'}><span>Auswahl-Optionen (mit Komma trennen)</span>
        <input id="fd-opts" placeholder="z. B. Neu, Gebraucht, Defekt" value="${esc(d.options.join(', '))}"></label>
    </div>
    <p class="fd-label">Gilt für</p>
    <div class="segment fd-scope" role="radiogroup">
      ${Object.entries(db.FIELD_SCOPES).map(([k, l]) => `<button type="button" role="radio" data-scope="${k}" class="${k === d.applies_to ? 'on' : ''}" aria-checked="${k === d.applies_to}">${k === 'both' ? 'Beide' : l}</button>`).join('')}
    </div>
    <button class="btn-filled full mt" data-a="save">${icon('save', 20)} ${def ? 'Speichern' : 'Feld anlegen'}</button>
    ${def ? '<p class="muted small center mt">Beim Umbenennen werden vorhandene Werte automatisch übernommen.</p>' : ''}`,
  {
    title: def ? 'Feld bearbeiten' : 'Neues Feld',
    onMount: (root, close) => {
      let scope = d.applies_to;
      const type = root.querySelector('#fd-type');
      type.onchange = () => { root.querySelector('#fd-opt-row').hidden = type.value !== 'select'; };
      updateSegments(root);
      root.querySelectorAll('[data-scope]').forEach((b) => (b.onclick = () => {
        scope = b.dataset.scope;
        root.querySelectorAll('[data-scope]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
        updateSegments(root);
      }));
      setTimeout(() => { if (!def) root.querySelector('#fd-name').focus(); }, 300);
      root.querySelector('[data-a=save]').onclick = async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        try {
          await db.saveFieldDef(def?.id || null, {
            name: root.querySelector('#fd-name').value, type: type.value, applies_to: scope,
            options: root.querySelector('#fd-opts').value.split(','),
          });
          invalidate('fields', 'materials');
          close(); toast(def ? 'Feld gespeichert' : 'Feld angelegt'); onSaved?.();
        } catch (er) { errToast(er); btn.disabled = false; }
      };
    },
  });
}

async function viewGroups() {
  const groups = await getGroups();
  const root = screen({
    header: navbar({ left: backBtn(), right: btn('refresh', 'refresh', 'Aktualisieren') }),
    cls: 'large-title-screen',
    body: `<h1 class="large-title">Material Gruppen</h1>
      <div class="plain-list">${groups.map((g) => `<button class="plain-row" data-g="${g.id}"><span>${esc(g.name)}</span><small class="muted">${g.count}</small></button>`).join('')
        || empty('boxes', 'Noch keine Gruppen')}</div>`,
    footer: `<footer class="bottom-bar"><button class="icon-btn blue" data-act="add" aria-label="Neue Gruppe">${icon('plusCircle', 34, 1.8)}</button></footer>`,
  });
  on(root, 'refresh', () => { invalidate('groups'); viewGroups(); });
  on(root, 'add', async () => {
    const n = await prompt({ title: 'Neue Ersatzteil Gruppe' }); if (!n) return;
    try { await db.createGroup(n); invalidate('groups'); toast('Gruppe angelegt'); viewGroups(); } catch (e) { errToast(e); }
  });
  root.querySelectorAll('[data-g]').forEach((r) => (r.onclick = async () => {
    const g = groups.find((x) => x.id === r.dataset.g);
    const v = await actionSheet(g.name, [
      { label: `Materialien anzeigen (${g.count})`, value: 'show', icon: 'list' },
      { label: 'Neues Ersatzteil in dieser Gruppe', value: 'new', icon: 'plus' },
      { label: 'Umbenennen', value: 'ren', icon: 'edit' },
      { label: 'Löschen', value: 'del', icon: 'trash', danger: true },
    ]);
    try {
      if (v === 'show') go(`/list?tab=part&group=${g.id}`);
      if (v === 'new') go(`/new?kind=part&group=${g.id}`);
      if (v === 'ren') { const n = await prompt({ title: 'Gruppe umbenennen', value: g.name }); if (n) { await db.renameGroup(g.id, n); invalidate('groups', 'materials'); viewGroups(); } }
      if (v === 'del' && await confirmBox({ title: `„${g.name}“ löschen?`, message: g.count ? `${g.count} Material(ien) verlieren ihre Gruppe.` : '', okText: 'Löschen', danger: true })) {
        await db.deleteGroup(g.id); invalidate('groups', 'materials'); viewGroups();
      }
    } catch (e) { errToast(e); }
  }));
}

async function viewLocations() {
  const locs = await getLocs();
  const root = screen({
    header: navbar({ left: backBtn(), right: btn('refresh', 'refresh', 'Aktualisieren') }),
    cls: 'large-title-screen',
    body: `<h1 class="large-title">Lagerorte</h1>
      <div class="plain-list">${locs.map((l) => `<button class="plain-row" data-l="${l.id}"><span>${icon('shelf', 22)} ${esc(l.name)}${l.barcode ? ` <small class="muted">· ${esc(l.barcode)}</small>` : ''}</span><small class="muted">${l.count} Teile</small></button>`).join('')
        || empty('shelf', 'Noch keine Lagerorte')}</div>`,
    footer: `<footer class="bottom-bar"><button class="icon-btn blue" data-act="add" aria-label="Neuer Lagerort">${icon('plusCircle', 34, 1.8)}</button></footer>`,
  });
  on(root, 'refresh', () => { invalidate('locations'); viewLocations(); });
  on(root, 'add', async () => {
    const n = await prompt({ title: 'Neuer Lagerort', placeholder: 'z.B. Kleinteilemagazin, Regal A3' }); if (!n) return;
    try { await db.createLocation(n); invalidate('locations'); toast('Lagerort angelegt'); viewLocations(); } catch (e) { errToast(e); }
  });
  root.querySelectorAll('[data-l]').forEach((r) => (r.onclick = async () => {
    const l = locs.find((x) => x.id === r.dataset.l);
    const v = await actionSheet(l.name, [
      { label: 'Materialien anzeigen', value: 'show', icon: 'list' },
      { label: 'Inventur starten', value: 'inv', icon: 'tally' },
      { label: 'Umbenennen', value: 'ren', icon: 'edit' },
      { label: 'Barcode zuweisen (scannen)', value: 'bc', icon: 'scan' },
      { label: 'Etikett drucken', value: 'label', icon: 'tag' },
      { label: 'Löschen', value: 'del', icon: 'trash', danger: true },
    ]);
    try {
      if (v === 'show') go(`/list?tab=part&loc=${l.id}`);
      if (v === 'inv') go(`/inventory?loc=${l.id}`);
      if (v === 'ren') { const n = await prompt({ title: 'Umbenennen', value: l.name }); if (n) { await db.updateLocation(l.id, { name: n }); invalidate(); viewLocations(); } }
      if (v === 'bc') { const c = await scan({ title: 'Lagerort-Barcode' }); if (c) { await db.updateLocation(l.id, { barcode: c }); invalidate('locations'); viewLocations(); } }
      if (v === 'label') showLabel({ title: l.name, sub: 'Lagerort', code: l.barcode || l.name });
      if (v === 'del' && await confirmBox({ title: `„${l.name}“ löschen?`, okText: 'Löschen', danger: true })) { await db.deleteLocation(l.id); invalidate(); viewLocations(); }
    } catch (e) { errToast(e); }
  }));
}

// =====================================================================
//  INVENTUR
// =====================================================================
async function viewInventory(q) {
  const locs = await getLocs();
  if (!q.loc) {
    const root = screen({
      header: navbar({ left: backBtn(), title: 'Material Inventur' }),
      body: `<p class="hint">Lagerort wählen, dann den tatsächlichen Bestand zählen und eintragen. Nur geänderte Mengen werden gebucht.</p>
        <div class="plain-list">${locs.map((l) => `<a class="plain-row" href="#/inventory?loc=${l.id}"><span>${icon('shelf', 22)} ${esc(l.name)}</span><small class="muted">${l.count} Teile ${icon('chevR', 16)}</small></a>`).join('')
          || empty('shelf', 'Noch keine Lagerorte', '<a class="btn-tinted" href="#/locations">Lagerort anlegen</a>')}</div>`,
    });
    return root;
  }
  const loc = locs.find((l) => l.id === q.loc);
  if (!loc) return go('/inventory', true);
  const mats = await getMats();
  const rows = mats.filter((m) => m.locations.some((l) => l.location_id === loc.id));
  const soll = (m) => m.locations.find((l) => l.location_id === loc.id)?.qty ?? 0;
  const counts = new Map(JSON.parse(sessionStorage.getItem(`wl-inv-${loc.id}`) || '[]'));
  const persist = () => sessionStorage.setItem(`wl-inv-${loc.id}`, JSON.stringify([...counts]));

  const root = screen({
    header: navbar({ left: backBtn(), title: `<div class="two-line">Inventur<br><small>${esc(loc.name)}</small></div>`, right: btn('scan', 'scan', 'Scannen') }),
    body: `<label class="search-field">${icon('search', 20)}<input type="search" id="iq" placeholder="Material suchen"></label>
      <div id="irows" class="inv-list mt"></div>
      <button class="btn-tinted full mt" data-act="add-mat">${icon('plus', 18)} Material zu diesem Lagerort hinzufügen</button>`,
    footer: `<footer class="bottom-bar wide"><button class="btn-filled full" data-act="commit">Inventur buchen</button></footer>`,
  });
  const box = root.querySelector('#irows');
  const updateCommit = () => {
    const n = [...counts].filter(([mid, v]) => v !== '' && +v !== soll(rows.find((m) => m.id === mid) || { locations: [] })).length;
    const b = root.querySelector('[data-act=commit]'); b.textContent = n ? `Inventur buchen (${n} Änderung${n > 1 ? 'en' : ''})` : 'Keine Änderungen'; b.disabled = !n;
  };
  const render = (term = '') => {
    const f = filterMats(rows, { q: term });
    box.innerHTML = f.map((m) => {
      const c = counts.get(m.id) ?? ''; const diff = c === '' ? null : +c - soll(m);
      return `<div class="inv-row" data-m="${m.id}">${thumb(m, 'sm')}
        <div class="inv-main"><div class="mrow-title"><span class="nr">${m.number}:</span> ${esc(m.name)}</div><small class="muted">Soll: ${fmtQty(soll(m))}${diff ? ` · <b class="${diff > 0 ? 'green' : 'red'}-text">${diff > 0 ? '+' : ''}${fmtQty(diff)}</b>` : diff === 0 ? ' · <b class="green-text">✓</b>' : ''}</small></div>
        <input type="number" inputmode="decimal" min="0" step="any" placeholder="Ist" value="${esc(c)}"></div>`;
    }).join('') || '<p class="muted center pad">Keine Materialien an diesem Lagerort.</p>';
    box.querySelectorAll('.inv-row').forEach((r) => {
      const inp = r.querySelector('input');
      inp.onchange = () => { counts.set(r.dataset.m, inp.value); persist(); render(root.querySelector('#iq').value); };
    });
    updateCommit();
  };
  render();
  root.querySelector('#iq').oninput = (e) => render(e.target.value);
  const focusRow = (mid) => {
    root.querySelector('#iq').value = ''; render();
    const r = box.querySelector(`[data-m="${mid}"]`); r?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    r?.classList.add('flash'); setTimeout(() => r?.querySelector('input').focus(), 350);
  };
  on(root, 'scan', async () => {
    const code = await scan({ title: 'Inventur scannen' }); if (!code) return;
    const m = await db.findByCode(code);
    if (!m) return toast(`Kein Material mit Code „${code}“`, 'err');
    if (!rows.some((x) => x.id === m.id)) { const full = mats.find((x) => x.id === m.id); full.locations.push({ location_id: loc.id, name: loc.name, qty: 0 }); rows.push(full); }
    focusRow(m.id);
  });
  on(root, 'add-mat', async () => {
    const v = await pickFrom({ title: 'Material hinzufügen', items: mats.filter((m) => !rows.includes(m)).map((m) => ({ value: m.id, label: `${m.number}: ${m.name}` })) });
    if (!v) return;
    const full = mats.find((x) => x.id === v); full.locations.push({ location_id: loc.id, name: loc.name, qty: 0 }); rows.push(full); focusRow(v);
  });
  on(root, 'commit', async (b) => {
    const changes = [...counts].filter(([mid, v]) => v !== '' && rows.some((m) => m.id === mid) && +v !== soll(rows.find((m) => m.id === mid)));
    if (!changes.length) return;
    if (!await confirmBox({ title: 'Inventur buchen?', message: `${changes.length} Bestand/Bestände an „${loc.name}“ werden auf die gezählte Menge gesetzt.`, okText: 'Buchen' })) return;
    b.disabled = true;
    try {
      for (const [mid, v] of changes) await db.book({ material_id: mid, type: 'inventory', qty: +v, location_id: loc.id, note: 'Inventur' });
      sessionStorage.removeItem(`wl-inv-${loc.id}`); invalidate(); toast('Inventur gebucht'); go('/inventory', true);
    } catch (e) { errToast(e); b.disabled = false; }
  });
}

// =====================================================================
//  MENÜ / EINSTELLUNGEN
// =====================================================================
function backupAgeText() {
  let iso = null; try { iso = localStorage.getItem('wl-last-backup'); } catch {}
  if (!iso) return 'Noch kein Backup auf diesem Gerät';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return days <= 0 ? 'Letztes Backup: heute' : days === 1 ? 'Letztes Backup: gestern' : `Letztes Backup: vor ${days} Tagen`;
}
/** Datei speichern – am iPhone über das Teilen-Menü („In Dateien sichern“), sonst als Download */
function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function viewSettings() {
  const user = await db.getUser();
  const theme = localStorage.getItem('wl-theme') || '';
  const TONE = { info: 'blue', list: 'blue', wrench: 'indigo', cart: 'green', alert: 'red', shelf: 'teal', boxes: 'orange', tag: 'indigo', tally: 'primary', download: 'gray', upload: 'gray', refresh: 'red', logout: 'red' };
  const item = (ic, label, act, extra = '', cls = '', tone = '') => `<button class="set-row ${cls}" data-act="${act}"><i class="tone-${tone || TONE[ic] || 'primary'}">${icon(ic, 19)}</i><span>${label}</span>${extra || icon('chevR', 18)}</button>`;
  const root = screen({
    header: navbar({ left: backBtn(), title: 'Menü' }),
    cls: 'settings-screen',
    body: `
      <div class="set-group">
        <div class="set-row static"><i class="tone-${db.isDemo ? 'orange' : 'green'}">${icon('database', 19)}</i><span>${db.isDemo ? 'Demo-Modus (lokal)' : 'Supabase verbunden'}<small>${esc(user?.email || '')}</small></span></div>
      </div>
      <div class="set-group">
        ${item('refresh', 'Neu laden', 'reload', '', '', 'blue')}
        ${item('info', 'Lager Informationen', 'stock-info')}
      </div>
      <div class="set-group">
        ${item('list', 'Alle Ersatzteile', 'go:/list?tab=part')}
        ${item('wrench', 'Werkzeuge', 'go:/list?tab=tool')}
        ${item('cart', 'Warenkorb & Kommissionen', 'go:/list?tab=cart')}
        ${item('alert', 'Unter Meldebestand', 'go:/list?tab=part&low=1')}
      </div>
      <div class="set-group">
        ${item('shelf', 'Lagerorte', 'go:/locations')}
        ${item('boxes', 'Material Gruppen', 'go:/groups')}
        ${item('tag', 'Eigene Felder', 'go:/fields')}
        ${item('tally', 'Inventur', 'go:/inventory')}
      </div>
      <div class="set-group">
        ${item('save', 'Backup erstellen', 'backup', '', '', 'green').replace('<span>Backup erstellen</span>', `<span>Backup erstellen<small>${backupAgeText()}</small></span>`)}
        ${item('camera', 'Backup inkl. Bilder', 'backup-files', '', '', 'green')}
        ${item('history', 'Backup wiederherstellen', 'restore', '', '', 'orange')}
      </div>
      <div class="set-group">
        ${item('download', 'Bestand als CSV exportieren', 'export')}
        ${item('upload', 'Materialien aus CSV importieren', 'import')}
      </div>
      <div class="set-group">
        <label class="set-row"><i class="tone-indigo">${icon('moon', 19)}</i><span>Erscheinungsbild</span>
          <select data-act-theme><option value="" ${!theme ? 'selected' : ''}>System</option><option value="light" ${theme === 'light' ? 'selected' : ''}>Hell</option><option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dunkel</option></select></label>
      </div>
      <div class="set-group">
        ${db.isDemo ? item('refresh', 'Demo-Daten zurücksetzen', 'reset', ' ', 'danger-text') : item('logout', 'Abmelden', 'logout', ' ', 'danger-text')}
      </div>
      ${db.isDemo ? `<p class="hint">Im Demo-Modus liegen alle Daten nur in diesem Browser. Für Cloud-Speicher & mehrere Geräte Supabase-Zugangsdaten in der <code>.env</code> eintragen (siehe README).</p>` : ''}
      <div class="menu-footer">${brandLogo('sm')}<span>Version 1.2</span></div>`,
  });
  root.querySelectorAll('[data-act^="go:"]').forEach((b) => (b.onclick = () => go(b.dataset.act.slice(3))));
  root.querySelector('[data-act-theme]').onchange = (e) => { localStorage.setItem('wl-theme', e.target.value); applyTheme(); };
  on(root, 'reload', async (b) => {
    b.disabled = true; b.querySelector('i')?.classList.add('spin-once');
    try { await refreshAll(); toast('Daten aktualisiert'); } catch (e) { errToast(e); }
    b.disabled = false; b.querySelector('i')?.classList.remove('spin-once');
  });
  on(root, 'stock-info', async () => {
    try {
      invalidate('materials');
      const mats = await getMats();
      const parts = mats.filter((m) => m.kind === 'part');
      const stockOf = (m) => Math.max(0, +m.total || 0);
      const buy = parts.reduce((a, m) => a + stockOf(m) * (+m.purchase_price || 0), 0);
      const sell = parts.reduce((a, m) => a + stockOf(m) * (+m.sale_price || 0), 0);
      const units = parts.reduce((a, m) => a + stockOf(m), 0);
      const noBuy = parts.filter((m) => stockOf(m) > 0 && !(+m.purchase_price > 0)).length;
      const noSell = parts.filter((m) => stockOf(m) > 0 && !(+m.sale_price > 0)).length;
      const tools = mats.filter((m) => m.kind === 'tool');
      infoBox({
        title: 'Lager Informationen',
        html: `
          <div class="stat-rows">
            <div class="stat-row"><span>Ersatzteile Wert Einkauf</span><b>${fmtEUR(buy)}</b></div>
            <div class="stat-row"><span>Ersatzteile Wert Verkauf</span><b>${fmtEUR(sell)}</b></div>
            ${buy > 0 && sell > 0 ? `<div class="stat-row muted-row"><span>Möglicher Rohertrag</span><b>${fmtEUR(sell - buy)}</b></div>` : ''}
          </div>
          <p class="stat-note">${fmtQty(parts.length)} Ersatzteile · ${fmtQty(units)} Stück auf Lager${tools.length ? ` · ${fmtQty(tools.length)} Werkzeuge` : ''}</p>
          ${noBuy || noSell ? `<p class="stat-note warn">${[noBuy ? `${noBuy} Teile ohne Einkaufspreis` : '', noSell ? `${noSell} ohne Verkaufspreis` : ''].filter(Boolean).join(' · ')} – diese zählen mit 0 €.</p>` : ''}`,
      });
    } catch (e) { errToast(e); }
  });
  const runBackup = async (b, withFiles) => {
    b.disabled = true;
    const pp = progressPanel({ title: withFiles ? 'Backup inkl. Bilder' : 'Backup wird erstellt', icon: 'save' });
    try {
      const data = await db.createBackup({ withFiles, onProgress: (t, f) => pp.set(f, t) });
      const sum = db.backupSummary(data);
      const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const name = `SpareSync-Backup_${stamp}${withFiles ? '_mit-Bildern' : ''}.json`;
      try { localStorage.setItem('wl-last-backup', new Date().toISOString()); } catch {}
      const sub = root.querySelector('[data-act=backup] small'); if (sub) sub.textContent = backupAgeText();
      const mb = blob.size / 1048576;
      // Teilen erst nach erneutem Antippen – Safari erlaubt das Teilen-Menü nur direkt nach einer Berührung
      pp.done({
        title: 'Backup ist fertig',
        message: `${sum.parts} Teile · ${sum.tools} Werkzeuge${withFiles ? ` · ${sum.files} Bilder` : ''} · ${mb < 1 ? `${Math.max(1, Math.round(blob.size / 1024))} KB` : `${mb.toFixed(1).replace('.', ',')} MB`}`,
        actions: [
          { label: 'Backup speichern', primary: true, onClick: () => saveFile(blob, name) },
          { label: 'Schließen' },
        ],
      });
    } catch (e) { pp.fail(e?.message || String(e)); }
    b.disabled = false;
  };
  on(root, 'backup', (b) => runBackup(b, false));
  on(root, 'backup-files', async (b) => {
    if (await confirmBox({ title: 'Backup inkl. Bilder', message: 'Alle Bilder werden mitgesichert. Die Datei wird dadurch deutlich größer und das Erstellen dauert etwas länger.', okText: 'Erstellen' })) runBackup(b, true);
  });
  on(root, 'restore', async () => {
    const [file] = await pickFiles({ accept: '.json,application/json', multiple: false }); if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { return errToast(new Error('Die Datei konnte nicht gelesen werden.')); }
    if (data?.app !== 'SpareSync') return errToast(new Error('Das ist keine SpareSync-Sicherung.'));
    const sum = db.backupSummary(data);
    const when = sum.created ? new Date(sum.created).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'unbekannt';
    const ok = await confirmBox({
      title: 'Backup wiederherstellen?',
      message: `Sicherung vom ${when}${sum.account ? ` (${sum.account})` : ''}: ${sum.parts} Teile, ${sum.tools} Werkzeuge, ${sum.locations} Lagerorte, ${sum.movements} Buchungen${sum.withFiles ? `, ${sum.files} Bilder` : ''}.\n\nEinträge aus der Sicherung ersetzen die aktuellen Einträge mit gleicher Kennung. Danach neu angelegte Teile bleiben erhalten.`,
      okText: 'Wiederherstellen',
    });
    if (!ok) return;
    const pp = progressPanel({ title: 'Backup wird wiederhergestellt', icon: 'history' });
    try {
      const rep = await db.restoreBackup(data, { onProgress: (t, f) => pp.set(f, t) });
      invalidate();
      if (rep.errors.length) console.warn(rep.errors);
      pp.done({
        title: rep.errors.length ? 'Teilweise wiederhergestellt' : 'Wiederherstellung fertig',
        message: rep.errors.length ? `${rep.ok} Einträge übernommen, ${rep.errors.length} Problem(e): ${rep.errors[0]}` : `${rep.ok} Einträge übernommen.`,
        actions: [{ label: 'OK', primary: true }],
      });
    } catch (e) { pp.fail(e?.message || String(e)); }
  });
  on(root, 'export', async () => { try { exportCSV(await db.listMaterials()); } catch (e) { errToast(e); } });
  on(root, 'import', async () => {
    const [file] = await pickFiles({ accept: '.csv,text/csv,text/plain', multiple: false }); if (!file) return;
    try {
      const res = await importCSV(await file.text(), (i, n) => toast(`Import ${i}/${n}…`));
      invalidate();
      const imgInfo = res.images || res.imageErrors ? ` · ${res.images || 0} Bilder${res.imageErrors ? ` (${res.imageErrors} blockiert – dafür das PC-Import-Skript nutzen)` : ''}` : '';
      toast(`${res.created} angelegt, ${res.updated} aktualisiert${res.errors.length ? `, ${res.errors.length} Fehler` : ''}${imgInfo}`, res.errors.length || res.imageErrors ? 'err' : 'ok');
      if (res.errors.length) console.warn(res.errors);
    } catch (e) { errToast(e); }
  });
  on(root, 'reset', async () => {
    if (await confirmBox({ title: 'Demo-Daten zurücksetzen?', message: 'Alle lokalen Änderungen gehen verloren.', okText: 'Zurücksetzen', danger: true })) { db.resetDemo(); invalidate(); go('/fav'); }
  });
  on(root, 'logout', async () => { await db.signOut(); invalidate(); go('/login', true); });
}

// =====================================================================
//  LOGIN (nur mit Supabase)
// =====================================================================
function viewLogin(_m, _id, startPanel = 'login') {
  if (db.isDemo) return go('/fav', true);
  const eye = (id) => `<button type="button" class="auth-eye" data-eye="${id}" aria-controls="${id}" aria-pressed="false">Anzeigen</button>`;
  const root = screen({
    header: '',
    cls: 'auth-screen',
    body: `
      <img class="auth-logo" src="${APP_ICON}" alt="SpareSync" width="80" height="80">
      <div class="auth-stage" data-panel="${startPanel}">

        <!-- Anmelden -->
        <section class="auth-panel" data-p="login" aria-labelledby="auth-login-title">
          <h1 id="auth-login-title" class="auth-brand">${brandLogo('lg')}</h1>
          <p class="auth-tagline">Ersatzteile. Bestände. Im Griff.</p>
          <form id="lf" class="auth-card" novalidate>
            <label class="auth-field"><span>E-Mail</span>
              <input id="login-email" type="email" name="email" placeholder="name@firma.de" autocomplete="username" inputmode="email" required></label>
            <label class="auth-field"><span>Passwort</span>
              <div class="auth-pw"><input id="login-pw" type="password" name="password" placeholder="Passwort" autocomplete="current-password" required>${eye('login-pw')}</div></label>
            <button class="auth-submit" type="submit">Anmelden</button>
          </form>
          <button type="button" class="auth-switch" data-go="register">Neues Konto erstellen</button>
        </section>

        <!-- Registrieren -->
        <section class="auth-panel" data-p="register" aria-labelledby="auth-reg-title">
          <form id="rf" class="auth-card" novalidate>
            <h2 id="auth-reg-title" class="auth-card-title">Neues Lager registrieren</h2>
            <p class="auth-card-text">Lege deinen SpareSync-Zugang an.<br>Danach bekommst du eine E-Mail zur Bestätigung.</p>
            <label class="auth-field"><span>Lager-Name</span>
              <input id="reg-lager" name="lager" placeholder="z. B. Hauptlager" autocomplete="organization" required></label>
            <label class="auth-field"><span>Vor- und Nachname</span>
              <input id="reg-name" name="fullname" placeholder="Vor- und Nachname" autocomplete="name" required></label>
            <label class="auth-field"><span>E-Mail</span>
              <input id="reg-email" type="email" name="email" placeholder="name@firma.de" autocomplete="email" inputmode="email" required></label>
            <label class="auth-field"><span>Passwort</span>
              <div class="auth-pw"><input id="reg-pw" type="password" name="password" placeholder="mindestens 8 Zeichen" autocomplete="new-password" minlength="8" required>${eye('reg-pw')}</div></label>
            <p class="auth-error" id="reg-error" role="alert" hidden></p>
            <button class="auth-submit" type="submit">Registrierung absenden</button>
          </form>
          <button type="button" class="auth-switch" data-go="login">Ich habe schon einen Zugang – <b>anmelden</b></button>
        </section>

        <!-- Bestätigung -->
        <section class="auth-panel" data-p="sent" aria-labelledby="auth-sent-title">
          <div class="auth-card auth-sent">
            <div class="auth-sent-ic">${icon('check', 34, 2.6)}</div>
            <h2 id="auth-sent-title" class="auth-card-title">Fast geschafft</h2>
            <p class="auth-card-text">Wir haben dir eine E-Mail an <b id="sent-mail"></b> geschickt. Öffne den Link darin, danach kannst du dich anmelden.</p>
            <button type="button" class="auth-submit" data-go="login">Zur Anmeldung</button>
          </div>
        </section>
      </div>`,
  });

  const stage = root.querySelector('.auth-stage');
  const panels = ['login', 'register', 'sent'];
  const show = (name) => {
    const from = stage.dataset.panel;
    if (from === name) return;
    // Richtung: vorwärts (rein von rechts) oder zurück (rein von links)
    stage.dataset.dir = panels.indexOf(name) > panels.indexOf(from) ? 'fwd' : 'back';
    stage.dataset.panel = name;
    root.querySelector('.content').scrollTo?.({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      const first = stage.querySelector(`[data-p="${name}"] input, [data-p="${name}"] .auth-submit`);
      if (first && matchMedia('(hover: hover)').matches) first.focus({ preventScroll: true });
    }, 380);
  };
  root.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));

  // Passwort anzeigen / verbergen
  root.querySelectorAll('[data-eye]').forEach((b) => (b.onclick = () => {
    const inp = root.querySelector('#' + b.dataset.eye);
    const visible = inp.type === 'password';
    inp.type = visible ? 'text' : 'password';
    b.textContent = visible ? 'Verbergen' : 'Anzeigen';
    b.setAttribute('aria-pressed', String(visible));
  }));

  const busy = (form, on, label) => {
    const b = form.querySelector('.auth-submit');
    b.disabled = on; b.classList.toggle('loading', on);
    if (label) b.textContent = label;
  };

  // Anmelden
  const lf = root.querySelector('#lf');
  lf.onsubmit = async (e) => {
    e.preventDefault();
    if (!lf.reportValidity()) return;
    busy(lf, true, 'Anmelden …');
    try {
      await db.signIn(lf.email.value.trim(), lf.password.value);
      invalidate();
      if (await db.ensureStarterLocation()) invalidate('locations');
      go('/fav', true);
    } catch (er) {
      const m = er.message || '';
      errToast(new Error(/invalid/i.test(m) ? 'E-Mail oder Passwort falsch'
        : /confirm/i.test(m) ? 'Bitte zuerst den Link in der Bestätigungs-Mail öffnen.' : m));
      busy(lf, false, 'Anmelden');
    }
  };

  // Registrieren
  const rf = root.querySelector('#rf');
  const errBox = root.querySelector('#reg-error');
  const setErr = (msg) => { errBox.textContent = msg || ''; errBox.hidden = !msg; };
  rf.oninput = () => setErr('');
  rf.onsubmit = async (e) => {
    e.preventDefault();
    const v = {
      lager: rf.lager.value.trim(), name: rf.fullname.value.trim(),
      email: rf.email.value.trim(), pw: rf.password.value,
    };
    if (!v.lager) { setErr('Bitte einen Lager-Namen eingeben.'); rf.lager.focus(); return; }
    if (!v.name) { setErr('Bitte Vor- und Nachnamen eingeben.'); rf.fullname.focus(); return; }
    if (!rf.email.checkValidity() || !v.email) { setErr('Bitte eine gültige E-Mail-Adresse eingeben.'); rf.email.focus(); return; }
    if (v.pw.length < 8) { setErr('Das Passwort braucht mindestens 8 Zeichen.'); rf.password.focus(); return; }
    busy(rf, true, 'Wird gesendet …');
    try {
      const loggedIn = await db.signUp(v.email, v.pw, { lager_name: v.lager, full_name: v.name });
      if (loggedIn) {
        invalidate();
        if (await db.ensureStarterLocation()) invalidate('locations');
        toast('Willkommen bei SpareSync');
        go('/fav', true);
        return;
      }
      root.querySelector('#sent-mail').textContent = v.email;
      lf.email.value = v.email;
      rf.reset();
      root.querySelectorAll('[data-eye]').forEach((b) => {
        root.querySelector('#' + b.dataset.eye).type = 'password';
        b.textContent = 'Anzeigen'; b.setAttribute('aria-pressed', 'false');
      });
      show('sent');
    } catch (er) {
      setErr(er.message || String(er));
    }
    busy(rf, false, 'Registrierung absenden');
  };
}

// ============================== Start ================================
installHaptics();
// iOS: ohne touchstart-Listener zeigt Safari den :active-Zustand (Hineindrücken) nicht an
document.addEventListener('touchstart', () => {}, { passive: true });
if (!db.isDemo) db.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' || ev === 'SIGNED_IN') { invalidate(); } });

// Splashscreen-Video (steht in index.html): blendet aus, sobald das Video zu Ende ist UND die App geladen hat
route().finally(() => {
  window.__appReady = true;
  if (window.__splashVideoDone) window.hideSplash?.();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
