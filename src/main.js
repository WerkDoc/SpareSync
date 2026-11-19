// ---------------------------------------------------------------------
//  SpareSync – App (Router + Ansichten)
// ---------------------------------------------------------------------
import './styles.css';
import * as db from './db.js';
import { icon } from './icons.js';
import {
  esc, fmtQty, fmtEUR, fmtDate, toast, errToast, prompt, confirmBox, actionSheet, sheet, pickFrom,
  labelBrand, LABEL_BRAND_DEFAULT, scan, scanHistory, clearScanHistory, setScanLabeler, showLabel, compressImage, pickFiles, copyText, haptic, infoBox, enhanceSearch, progressPanel,
  countUp, pop, popChanged, successHUD, skel, onLongPress, contextMenu, enableSwipeActions, confetti, photoViewer, flyTo, gearRain, floatDelta, speedDial, cameraFlash, photoDrop, genieInto, flipCard,
  layer,
} from './ui.js';
import { attachGyro, gyroEnabled, setGyroEnabled, requestGyro } from './motion.js';
import { fillRecapCard, showRecap } from './recap.js';
import * as sfx from './sounds.js';
import { CHANGELOG, APP_VERSION } from './changelog.js';
import { exportCSV, importCSV } from './csv.js';
import { installHaptics } from './haptics.js';
import { setupPullToRefresh, setupPullToSearch } from './ptr.js';

const app = document.getElementById('app');
const BRAND_S = `${import.meta.env.BASE_URL}brand-s.png`;     // farbiges „S“ (transparent)
const APP_ICON = `${import.meta.env.BASE_URL}app-icon.png`;   // App-Icon (abgerundetes Quadrat)
// Logo: das farbige „S“-Icon IST der erste Buchstabe, danach direkt „pare“ (Navy) + „Sync“ (Blau)
const brandLogo = (cls = '') => `<span class="brand ${cls}" role="img" aria-label="SpareSync"><img class="brand-s" src="${BRAND_S}" alt="" width="27" height="30"><span class="wordmark" aria-hidden="true"><span class="wm-spare">pare</span><span class="wm-sync">Sync</span></span></span>`;

// ============================== Cache ================================
const cache = { materials: null, groups: null, locations: null, cart: null, fields: null };
const getMats = async () => {
  if (!cache.materials) { cache.materials = await db.listMaterials(); updateBadge(cache.materials); }
  return cache.materials;
};

// ================= App-Symbol-Zähler (Badging API) =================
// Roter Punkt am Home-Bildschirm-Symbol = Anzahl Teile unter Meldebestand.
// iPhone: nur als Home-Bildschirm-App ab iOS 16.4 UND mit erlaubten Mitteilungen.
const BADGE_KEY = 'ss-badge';
const badgeEnabled = () => { try { return localStorage.getItem(BADGE_KEY) !== '0'; } catch { return true; } };
const badgeSupported = () => 'setAppBadge' in navigator;
function updateBadge(mats = cache.materials) {
  if (!badgeSupported() || !mats) return;
  const n = badgeEnabled() ? mats.filter(isLow).length : 0;
  try {
    const p = n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge();
    p?.catch?.(() => {});            // nicht erlaubt / nicht unterstützt → still ignorieren
  } catch { /* alter Browser */ }
}
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
  document.documentElement.dataset.style = designStyle();
  lastThemeColor = '';
  syncThemeColor();
}
// Design „plastisch“ (Neumorph: Tasten wirken aus der Fläche geformt) oder „klassisch“ (glattes iOS)
function designStyle() { try { return localStorage.getItem('ss-style') === 'classic' ? 'classic' : 'neu'; } catch { return 'neu'; } }
// ---------- Dynamische Statusleisten-Farbe (theme-color) ----------
// Folgt Hell/Dunkel, ganz oben vs. gescrollt (Milchglas-Leiste) und abgedunkelten Overlays.
const THEME_COLORS = {
  light: { base: '#f2f2f7', bar: '#f9f9fb', dim: '#919194', spot: '#e4e4ea' },
  dark: { base: '#000000', bar: '#161618', dim: '#000000', spot: '#0d0d0f' },
  neuLight: { base: '#e6eaf0', bar: '#e8ebf1', dim: '#8b8d91', spot: '#dbe0e7' },
  neuDark: { base: '#17191e', bar: '#1c1e23', dim: '#000000', spot: '#101115' },
};
let lastThemeColor = '';
function syncThemeColor() {
  const t = document.documentElement.dataset.theme;
  const dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  const neu = document.documentElement.dataset.style === 'neu';
  const c = THEME_COLORS[neu ? (dark ? 'neuDark' : 'neuLight') : (dark ? 'dark' : 'light')];
  const scr = document.querySelector('#app > .screen:last-child');
  let col = c.base;
  if (document.querySelector('.spotlight.show')) col = c.spot;
  else if (document.querySelector('.layer.bsheet-layer, .layer.alert-layer, .layer.ctx-layer, .layer.show') || scr?.classList.contains('search-focus')) col = c.dim;
  else if (scr && !scr.classList.contains('at-top') && !scr.classList.contains('auth-screen')) col = c.bar;
  if (col === lastThemeColor) return;
  lastThemeColor = col;
  let meta = document.querySelector('meta[name=theme-color]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.setAttribute('content', col);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);
// Overlays (Sheets, Dialoge, Kontextmenü) kommen und gehen → Farbe nachziehen
new MutationObserver(() => requestAnimationFrame(syncThemeColor)).observe(document.body, { childList: true });
async function toggleTheme(btn) {
  // Erst verwandelt sich das Symbol (Mond ⇄ Sonne), dann breitet sich das neue Design aus
  const sm = btn?.querySelector?.('.sunmoon');
  if (sm && !reduceMotion.matches) { sm.classList.toggle('is-sun'); sm.classList.add('morph'); haptic('light'); await new Promise((r) => setTimeout(r, 340)); }
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const apply = () => { localStorage.setItem('wl-theme', dark ? 'light' : 'dark'); applyTheme(); return route(); };
  // Kreis-Übergang: das neue Design breitet sich als Kreis vom Mond-/Sonnen-Knopf über den Bildschirm aus
  if (typeof document.startViewTransition !== 'function' || reduceMotion.matches || !btn?.getBoundingClientRect) { apply(); return; }
  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2; const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const html = document.documentElement;
  html.style.setProperty('--vt-x', `${x}px`); html.style.setProperty('--vt-y', `${y}px`); html.style.setProperty('--vt-r', `${radius}px`);
  html.classList.add('vt-theme');
  haptic('light');
  const vt = document.startViewTransition(apply);
  vt.finished.finally(() => html.classList.remove('vt-theme'));
}
applyTheme();

// ============================== Router ===============================
// Eigener Verlauf: "Zurück" bleibt immer innerhalb der App
const navStack = [];
// Seitenübergang für den nächsten Routenwechsel: 'push' | 'pop' | 'fade' | 'none'
let nextTransition = null;
let pendingTransition = null;
const scrollMemo = {};
let keepScrollOnce = null;        // Scroll-Position je Seite, damit „Zurück“ dort weitermacht, wo man war
let currentHash = null;
let pendingScroll = 0;
let pendingScrollWas = 0;
let lastNavBack = false;     // für die Listen-Kaskade: beim Zurückkehren an eine Scrollposition nicht animieren
// Menü (Einstellungen) fliegt je nach Ausgangsseite von rechts (Übersicht) oder links (Teile) ein
let menuSide = null;          // 'R' | 'L' | null
// Navigation ersetzt immer den aktuellen Browser-Eintrag (replaceState) statt neue anzulegen.
// So gibt es keinen Browser-Verlauf, durch den man am Bildschirmrand vor/zurück wischen kann –
// „Zurück“ läuft ausschließlich über den eigenen navStack.
const nav = (hash) => {
  try { history.replaceState(history.state, '', hash); } catch { location.replace(hash); return Promise.resolve(); }
  return route();
};
const go = (path, replace = false, transition) => {
  if ('#' + path === location.hash) return Promise.resolve();
  nextTransition = transition || (replace ? 'fade' : 'push');
  if (replace) navStack.pop();
  return nav('#' + path);
};

// ================= Hero-Animation (View Transitions API) =================
// Liste → Detail: das Vorschaubild fliegt und morpht ins große Bild. Zurück: umgekehrt.
let activeVT = null;
/** Wartet, bis gerade keine Seiten-/Bild-Animation läuft (Neuzeichnen mitten in der Animation ruckelt) */
async function whenIdle() {
  try { await activeVT?.finished; } catch { /* abgebrochen */ }
  for (let i = 0; i < 60 && finishRunning; i++) await new Promise((r) => requestAnimationFrame(r));
}
const canVT = () => typeof document.startViewTransition === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settleImg(img) { if (img && !img.complete) await Promise.race([img.decode().catch(() => {}), sleep(450)]); }
function runHero(dir, update) {
  finishRunning?.();
  document.documentElement.classList.add('vt-hero', dir === 'back' ? 'vt-back' : 'vt-fwd');
  let vt;
  try { vt = document.startViewTransition(update); } catch { document.documentElement.classList.remove('vt-hero', 'vt-back', 'vt-fwd'); return false; }
  activeVT = vt; vt.finished.finally(() => { if (activeVT === vt) activeVT = null; });
  const clean = () => {
    document.documentElement.classList.remove('vt-hero', 'vt-back', 'vt-fwd');
    document.querySelectorAll('[style*="view-transition-name"]').forEach((el) => (el.style.viewTransitionName = ''));
  };
  vt.finished.then(clean, clean);
  return true;
}
/** Klick auf einen Listeneintrag mit Bild → Hero-Flug ins Detail */
function heroOpen(a, path) {
  const th = a.querySelector('.thumb');
  if (!canVT() || !th?.querySelector('img') || (sessionStorage.getItem('wl-mtab') || 'infos') !== 'infos') return false;
  th.style.viewTransitionName = 'hero';
  return runHero('fwd', async () => {
    th.style.viewTransitionName = '';
    await go(path, false, 'none');
    const big = app.querySelector('.gal-main .cur img');
    if (big) { big.style.viewTransitionName = 'hero'; await settleImg(big); }
  });
}
/** Zurück aus dem Detail in Liste/Übersicht → Bild fliegt zurück in sein Vorschaubild */
function heroBack() {
  const m = location.hash.match(/^#\/m\/([^/?]+)/);
  const prev = navStack[navStack.length - 2] || '';
  const big = app.querySelector('.gal-main .cur img');
  if (!m || !big || !canVT() || !/^#\/(list|fav)/.test(prev)) return false;
  big.style.viewTransitionName = 'hero';
  return runHero('back', async () => {
    big.style.viewTransitionName = '';
    nextTransition = 'popvt'; navStack.pop();
    await nav(prev);
    const th = app.querySelector(`[data-id="${m[1]}"] .thumb`);
    if (th) th.style.viewTransitionName = 'hero';
  });
}

const back = (fallback = '/fav') => {
  if (heroBack()) return;
  nextTransition = 'pop';
  if (navStack.length > 1) { navStack.pop(); nav(navStack[navStack.length - 1]); }
  else { navStack.length = 0; nav('#' + fallback); }
};
const openMenu = (side) => { menuSide = side; go('/settings', false, side === 'L' ? 'menuL' : 'menuR'); };
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
  // Menü schließen: in die Richtung zurückgleiten, aus der es gekommen ist
  if (currentHash === '#/settings' && h !== '#/settings' && menuSide) {
    if (kind === 'pop') kind = menuSide === 'L' ? 'menuCloseL' : 'menuCloseR';
    if (kind !== 'push') menuSide = null;     // Unterseiten des Menüs (push) behalten die Richtung
  }
  pendingTransition = kind || 'none';
  if (currentHash && currentHash !== h) scrollMemo[currentHash] = window.scrollY;
  const isBack = kind === 'pop' || kind === 'popvt' || kind === 'menuCloseR' || kind === 'menuCloseL';
  lastNavBack = isBack;
  pendingScroll = isBack ? (scrollMemo[h] || 0) : 0;
  if (keepScrollOnce != null) { pendingScroll = keepScrollOnce; keepScrollOnce = null; }   // Live-Aktualisierung: an Ort und Stelle bleiben
  pendingScrollWas = pendingScroll;
  if (kind === 'push' || kind === 'menuR' || kind === 'menuL') delete scrollMemo[h];
  currentHash = h;
  const { path, q } = parseHash();
  if (!db.isDemo && path !== '/login' && path !== '/register') {
    const user = await db.getUser();
    currentUser = user;
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
    [/^\/stats$/, () => viewStats()],
    [/^\/dupes$/, () => viewDupes()],
    [/^\/prices$/, () => viewPrices()],
    [/^\/device$/, () => viewDevice(q)],
    [/^\/counter$/, () => viewCounter()],
    [/^\/scans$/, () => viewScans()],
    [/^\/map$/, () => viewMap(q)],
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
// Nur echte, manuelle Hash-Änderungen (z. B. Adresse eingetippt) – eigene Navigation ruft route() direkt auf
window.addEventListener('hashchange', () => { if ((location.hash || '#/fav') !== currentHash) route(); });
// Alle internen Links (<a href="#/…">) über den Router statt über den Browser-Verlauf
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const path = a.getAttribute('href').slice(1);
  if (/^\/m\/[^/]+$/.test(path) && a.matches('.mrow, .ios-row.recent') && heroOpen(a, path)) return;
  // Tab-Leiste: Crossfade mit leichtem Slide – zur „Teile“-Seite nach links, zurück zur Übersicht nach rechts
  if (a.hasAttribute('data-tablink')) {
    haptic('light');
    if (a.classList.contains('on')) {                 // schon auf diesem Tab → sanft nach oben
      hopTab(a);
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      return;
    }
    tabHopNext = true;
  }
  if (path) go(path, false, a.hasAttribute('data-tablink') ? (path.startsWith('/list') ? 'tabF' : 'tabB') : undefined);
});
// Teil rutscht unter den Meldebestand → seine Zeile (Liste, Übersicht) pulsiert beim nächsten Anzeigen einmal rot
let lowPulse = null;
function pulseLow(id) {
  lowPulse = { id, until: Date.now() + 8000 };
  const tick = () => {
    if (!lowPulse || Date.now() > lowPulse.until) { lowPulse = null; return; }
    const el = [...document.querySelectorAll(`.mrow[data-id="${lowPulse.id}"], .ios-row[data-id="${lowPulse.id}"]`)].find((x) => x.offsetParent && !x.closest('.sheet-layer, .layer'));
    if (el) {
      el.querySelector('.lp-glow')?.remove();
      const g = document.createElement('span'); g.className = 'lp-glow'; g.setAttribute('aria-hidden', 'true');
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.appendChild(g); el.classList.add('low-pulse'); haptic('warning');
      setTimeout(() => { g.remove(); el.classList.remove('low-pulse'); }, 2600);
      lowPulse = null; return;
    }
    setTimeout(tick, 250);
  };
  setTimeout(tick, 450);
}
// Tab-Symbol hüpft kurz beim Antippen
let tabHopNext = false;
function hopTab(el) { const ic = el?.querySelector('svg'); if (!ic) return; ic.classList.remove('tab-hop'); void ic.getBoundingClientRect(); ic.classList.add('tab-hop'); }
// Android-Zurück-Taste: ein „Wächter“-Eintrag fängt sie ab und führt das App-eigene Zurück aus.
// Auf iOS bewusst NICHT, damit die Wischgeste am Rand dort gar nichts auslöst.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (!isIOS) {
  try {
    history.replaceState({ ssBase: 1 }, '', location.href);
    history.pushState({ ssGuard: 1 }, '', location.href);
    window.addEventListener('popstate', (e) => {
      if (e.state?.ssGuard) return;
      const cur = currentHash || '#/fav';
      history.replaceState({ ssBase: 1 }, '', cur);
      history.pushState({ ssGuard: 1 }, '', cur);
      if (document.querySelector('.layer')) return;   // offenes Fenster: nichts tun
      if (navStack.length > 1) back();
    });
  } catch {}
}

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
  // Der Indikator sitzt IM aktiven Tab (mittig per CSS) → stimmt bei jeder Bildschirmgröße und Drehung automatisch
  const ind = '<span class="tab-ind" aria-hidden="true"></span>';
  return `
  <nav class="tabbar">
    <a href="#/fav" data-tablink class="tab ${active === 'fav' ? 'on' : ''}">${active === 'fav' ? ind : ''}${icon('home', 26)}<span>Übersicht</span></a>
    <a href="#/list" data-tablink class="tab ${active === 'list' ? 'on' : ''}">${active === 'list' ? ind : ''}${icon('list', 26)}<span>Teile</span></a>
  </nav>`;
}
// ---------- Liquid Tab Bar ----------
// Beim Wechsel steht die alte Seite (mit altem Indikator) noch im DOM: beide Positionen werden im selben
// Moment gemessen, der neue Indikator startet am alten Platz und gleitet – gedehnt wie ein Tropfen – an seinen.
function placeTabIndicator(root) {
  if (tabHopNext) { tabHopNext = false; hopTab(root.querySelector('.tabbar .tab.on')); }
  const ind = root.querySelector('.tab.on .tab-ind');
  // Eine aufbewahrte Seite (Teile-Liste) wurde beim Verlassen ausgeblendet → beim Zurückholen wieder sichtbar machen
  if (ind) { ind.style.transition = ''; ind.style.opacity = ''; }
  const old = [...document.querySelectorAll('.tab.on .tab-ind')].find((el) => !root.contains(el));
  if (old) { old.style.transition = 'opacity .28s ease'; old.style.opacity = '0'; }
  if (!ind || !old || reduceMotion.matches || !ind.animate) return;
  const a = old.getBoundingClientRect(); const b = ind.getBoundingClientRect();
  const dx = (a.left + a.width / 2) - (b.left + b.width / 2);
  if (Math.abs(dx) < 1) return;
  const dir = Math.sign(-dx);
  const T = (x, sx, sy) => `translate3d(calc(-50% + ${x}px), 0, 0) scale(${sx}, ${sy})`;
  ind.animate([
    { transform: T(dx, 1, 1), offset: 0 },
    // in Bewegungsrichtung lang gezogen, etwas flacher – der „flüssige“ Moment
    { transform: T(dx * 0.45, 1.65, 0.82), offset: 0.45, easing: 'cubic-bezier(.3, 0, .2, 1)' },
    // kurz über das Ziel hinaus gestaucht …
    { transform: T(dir * 4, 0.9, 1.06), offset: 0.78, easing: 'cubic-bezier(.2, .8, .3, 1)' },
    // … und weich einrasten
    { transform: T(0, 1, 1), offset: 1 },
  ], { duration: 560, easing: 'cubic-bezier(.5, 0, .3, 1)' });
}

// ======================= iOS-Seitenübergänge ========================
// push: neue Seite gleitet von rechts herein, alte weicht leicht nach links (Parallaxe)
// pop:  aktuelle Seite gleitet nach rechts hinaus, vorherige kommt von links zurück
// fade: schnelles Überblenden (Tab-Leiste, Anmeldung)
const IOS_EASE = 'cubic-bezier(.32, .72, 0, 1)';   // iOS-typisches, weiches ease-out
const MENU_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'; // Menü: startet sehr schnell, bremst sanft ab – ohne Nachfedern
const MENU_DUR = 350;
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
  const animate = prev && kind && kind !== 'none' && kind !== 'popvt' && !reduceMotion.matches && next.animate;
  const target = kind ? pendingScroll : null; pendingScroll = 0;
  if (!animate) {
    app.replaceChildren(next);
    if (kind) { window.scrollTo(0, target || 0); requestAnimationFrame(() => window.scrollTo(0, target || 0)); }
    return;
  }
  const y = window.scrollY;
  const closing = kind === 'pop' || kind === 'menuCloseR' || kind === 'menuCloseL';
  if (closing) app.insertBefore(next, prev); else app.appendChild(next);
  freeze(prev, y, closing ? 2 : 1);
  freeze(next, target || 0, closing ? 1 : 2);
  window.scrollTo(0, 0);

  const isMenu = kind.startsWith('menu');
  const isTab = kind === 'tabF' || kind === 'tabB';
  const dur = kind === 'fade' ? 200 : kind === 'swap' ? 220 : isTab ? 280 : isMenu ? MENU_DUR : 360;
  const opts = { duration: dur, easing: kind === 'fade' ? 'ease-out' : (isMenu || isTab || kind === 'swap') ? MENU_EASE : IOS_EASE, fill: 'both' };
  const T = (x) => ({ transform: `translate3d(${x},0,0)` });
  let anims;
  if (isTab) {
    // Neue Seite blendet über der alten ein (alte bleibt voll sichtbar darunter → kein „Durchscheinen“),
    // Kopf und Inhalt gleiten dabei minimal von der Seite herein. Die Tab-Leiste selbst bleibt ruhig stehen.
    const dx = kind === 'tabF' ? 18 : -18;
    const moving = [...next.children].filter((c) => !c.classList.contains('tabbar'));
    const oldMoving = [...prev.children].filter((c) => !c.classList.contains('tabbar'));
    anims = [
      next.animate([{ opacity: 0 }, { opacity: 1 }], opts),
      ...moving.map((c) => c.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], opts)),
      ...oldMoving.map((c) => c.animate([{ translate: '0 0' }, { translate: `${-dx * 0.5}px 0` }], opts)),
    ];
  } else if (kind === 'swap') {
    anims = [next.animate([{ opacity: 0 }, { opacity: 1 }], opts)];
  } else if (isMenu) {
    // R = Menü kommt von rechts (Übersicht), L = von links (Teile); Close läuft genau umgekehrt
    const fromRight = kind === 'menuR' || kind === 'menuCloseR';
    const off = fromRight ? '100%' : '-100%';      // wo das Menü außerhalb liegt
    const under = fromRight ? '-20%' : '20%';      // Seite darunter weicht leicht zur Gegenseite aus
    if (kind === 'menuR' || kind === 'menuL') {
      next.classList.add(fromRight ? 'screen-edge' : 'screen-edge-r');
      anims = [
        next.animate([T(off), T('0')], opts),
        prev.animate([{ ...T('0'), opacity: 1 }, { ...T(under), opacity: 0.72 }], opts),
      ];
    } else {
      prev.classList.add(fromRight ? 'screen-edge' : 'screen-edge-r');
      anims = [
        prev.animate([T('0'), T(off)], opts),
        next.animate([{ ...T(under), opacity: 0.72 }, { ...T('0'), opacity: 1 }], opts),
      ];
    }
  } else if (kind === 'push') {
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
    next.classList.remove('screen-edge', 'screen-edge-r');
    unfreeze(next);
    if (target) window.scrollTo(0, target);
    updateScrolled();
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
  b.innerHTML = `<span class="off-cloud" aria-hidden="true">${icon('cloudOff', 16, 2.2)}</span>Offline`;
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
  if (!isOfflineNow()) { toast('Wieder online', 'ok', { icon: 'refresh', sub: 'Daten aktualisiert', cls: 'di-sync' }); route(); }
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
  root.querySelectorAll('[data-act=back]').forEach((b) => (b.onclick = () => back()));
  requestAnimationFrame(updateScrolled);
  placeTabIndicator(root);
  return root;
}
const on = (root, act, fn) => root.querySelectorAll(`[data-act="${act}"]`).forEach((el) => (el.onclick = (e) => { e.preventDefault(); fn(el, e); }));

// Listen zeigen das kleine Vorschaubild (~240 px). Fehlt es noch (ältere Fotos), springt das Bild auf das
// volle Foto um und das Vorschaubild wird im Hintergrund nachgeholt.
const thumb = (m, size = 'md') => {
  const im = m.images?.[0];
  const src = im?.thumb || im?.url;
  const fallback = im?.thumb ? ` data-full="${esc(im.url)}" data-fid="${esc(im.id)}" onerror="window.__thumbMiss(this)"` : '';
  return `<div class="thumb ${size}">${im ? `<img src="${esc(src)}"${fallback} loading="lazy" decoding="async" alt="">` : icon(m.kind === 'tool' ? 'wrench' : 'box', size === 'sm' ? 22 : 30, 1.6)}</div>`;
};
const locLabel = (m) => {
  const withStock = m.locations.filter((l) => l.qty > 0);
  const ls = withStock.length ? withStock : m.locations;
  if (!ls.length) return '<span class="muted">Kein Lagerort</span>';
  return esc(ls[0].name) + (ls.length > 1 ? ` <span class="muted">+${ls.length - 1}</span>` : '');
};
const stockLabel = (m) => `${+m.min_stock > 0 ? `<span>Meb: ${fmtQty(m.min_stock)}</span> ` : ''}<span class="${isLow(m) ? 'red' : ''}" data-pop="list:${m.id}" data-v="${m.total}">[${fmtQty(m.total)}]</span>`;
function materialRow(m, href = `#/m/${m.id}`, idx = -1) {
  // idx < 14 → gestaffeltes Einblenden (weiter unten liegt ohnehin außerhalb des Bildschirms)
  const st = idx >= 0 && idx < 14 ? ` style="--i:${idx}"` : idx >= 14 ? ' data-nostag' : '';
  return `<a class="mrow" href="${href}" data-id="${m.id}"${st}>
      ${thumb(m)}
      <div class="mrow-main">
        <div class="mrow-title"><span class="nr">${m.number}:</span> ${esc(m.name)}${m.is_favorite ? `<span class="fav-mark" aria-label="Favorit">${icon('starFill', 14)}</span>` : ''}</div>
        <div class="mrow-meta"><b>${locLabel(m)}</b><b class="stock">${stockLabel(m)}</b></div>
      </div>
    </a>`;
}
const empty = (ic, text, extra = '') => `<div class="empty">${icon(ic, 46, 1.4)}<p>${text}</p>${extra}</div>`;

// Chargennummer / Platz / Fach steckt in einem eigenen Feld (z. B. „Chargennummer Platz“)
const CHARGE_RE = /charge|platz|fach/i;
const chargeKey = (m) => Object.keys(m.custom_fields || {}).find((k) => CHARGE_RE.test(k) && String(m.custom_fields[k] ?? '').trim());
const chargeOf = (m) => { const k = chargeKey(m); return k ? String(m.custom_fields[k]).trim() : ''; };
const natCmp = (a, b) => a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' });

// ---------- Tippfehler-tolerante Suche: „ipohne 12 dispaly“ findet „iPhone 12 Display“ ----------
/** Damerau-Levenshtein (mit Vertauschung zweier Buchstaben), bricht ab, sobald max überschritten ist */
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}
const fuzzyMax = (w) => (w.length <= 3 ? 0 : w.length <= 6 ? 1 : 2);
/** Wie gut passt ein Suchwort zu einem Wort des Teils? 0 = genau, höher = mehr Tippfehler, Infinity = gar nicht */
function wordScore(w, tokens) {
  let best = Infinity;
  for (const t of tokens) {
    if (t.includes(w)) return 0;
    // kurze Wörter („aku“) dürfen nur gegen kurze Wörter („akku“) einen Fehler haben – sonst passt alles
    const max = w.length === 3 ? (t.length <= 5 ? 1 : 0) : fuzzyMax(w);
    if (!max) continue;
    // auch angefangene Wörter: „dispa“ ~ „display“ → mit dem Wortanfang vergleichen
    const d = Math.min(editDist(w, t, max), t.length > w.length ? editDist(w, t.slice(0, w.length), max) : max + 1);
    if (d <= max && d < best) best = d;
  }
  return best;
}
function fuzzyFilter(mats, words) {
  const scored = [];
  for (const m of mats) {
    const tokens = `${m.number} ${m.name} ${m.barcode || ''} ${m.group_name} ${(m.fits || []).join(' ')}`.toLowerCase().split(/[^a-z0-9äöüß]+/).filter(Boolean);
    let sum = 0;
    for (const w of words) { const sc = wordScore(w, tokens); if (sc === Infinity) { sum = -1; break; } sum += sc; }
    if (sum >= 0) scored.push([m, sum]);
  }
  return scored.sort((a, b) => a[1] - b[1]).map(([m]) => m);
}

function filterMats(mats, { q = '', group = '', low = false, loc = '', charge = '', fav = false } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const exact = filterMatsExact(mats, { q, group, low, loc, charge, fav }, words);
  // Nichts gefunden? Dann großzügig nach Tippfehlern suchen (nur wenn auch wirklich gesucht wurde)
  if (exact.length || !words.length || q.trim().length < 4) return exact;
  const base = filterMatsExact(mats, { group, low, loc, charge, fav }, []);
  const res = fuzzyFilter(base, words.map((w) => w.replace(/[^a-z0-9äöüß]/g, '')).filter(Boolean));
  res.fuzzy = true;
  return res;
}
function filterMatsExact(mats, { q = '', group = '', low = false, loc = '', charge = '', fav = false } = {}, words = []) {
  const ch = String(charge || '').trim().toLowerCase();
  return mats.filter((m) => {
    if (group && m.group_id !== group) return false;
    if (low && !isLow(m)) return false;
    if (fav && !m.is_favorite) return false;
    if (loc && !m.locations.some((l) => l.location_id === loc)) return false;
    if (ch && chargeOf(m).toLowerCase() !== ch) return false;
    if (!words.length) return true;
    const hay = `${m.number} ${m.name} ${m.barcode || ''} ${m.group_name} ${(m.fits || []).join(' ')} ${Object.entries(m.custom_fields || {}).filter(([k]) => k !== SHOP_KEY).map(([, v]) => v).join(' ')}`.toLowerCase();
    if (words.every((w) => hay.includes(w))) return true;
    // „iphone13“ findet auch „iPhone 13“ (und umgekehrt): ohne Leerzeichen/Bindestriche vergleichen
    const compact = (x) => x.replace(/[\s\-_/]+/g, '');
    return hay.includes(compact(q.toLowerCase())) || compact(hay).includes(compact(q.toLowerCase()));
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
// Eigene Reihenfolge der Schnellaktionen (langes Drücken → wackeln → verschieben)
const QUICK_KEY = 'ss-quick-order';
const quickOrdered = () => {
  let ids = [];
  try { ids = JSON.parse(localStorage.getItem(QUICK_KEY) || '[]'); } catch { /* egal */ }
  const pos = (q) => { const i = ids.indexOf(q.id); return i < 0 ? 99 + QUICK.indexOf(q) : i; };
  return [...QUICK].sort((a, b) => pos(a) - pos(b));
};
const MANAGE = [
  { label: 'Teil per Scan finden', icon: 'scan', tone: 'blue', href: '/pick?mode=info&scan=1' },
  { label: 'Werkzeug hinzufügen', icon: 'wrench', tone: 'indigo', href: '/new?kind=tool' },
  { label: 'Auswertung', icon: 'chart', tone: 'green', href: '/stats' },
  { label: 'Lagerorte', icon: 'shelf', tone: 'teal', href: '/locations', count: 'locs' },
  { label: 'Material-Gruppen', icon: 'boxes', tone: 'orange', href: '/groups', count: 'groups' },
];
const isDark = () => document.documentElement.dataset.theme === 'dark'
  || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

// ---------- Skeleton-Loader (nur beim allerersten Laden, solange noch nichts im Cache ist) ----------
const dashHeader = () => `<header class="dash-nav">
        ${brandLogo()}
        <span class="dash-nav-title" aria-hidden="true">Übersicht</span>
        <span class="dash-nav-right">
          <button class="glass-btn" data-act="theme" aria-label="Hell/Dunkel"><span class="sunmoon ${isDark() ? 'is-sun' : ''}">${icon('moon', 21)}${icon('sun', 21)}</span></button>
          <button class="glass-btn" data-act="scan" aria-label="Scannen">${icon('scan', 21)}</button>
          <button class="glass-btn" data-act="menu" aria-label="Menü">${icon('menu', 22)}</button>
        </span>
      </header>`;
// ---------- Begrüßung je nach Tageszeit (Sonne geht auf, abends Mond mit Sternen) ----------
let currentUser = null;
function greeting(now = new Date()) {
  const h = now.getHours();
  const first = String(currentUser?.user_metadata?.full_name || '').trim().split(/\s+/)[0];
  const name = first ? `, ${first}` : '';
  if (h >= 5 && h < 11) return { text: `Guten Morgen${name}`, kind: 'sunrise' };
  if (h >= 11 && h < 17) return { text: `Guten Tag${name}`, kind: 'sun' };
  if (h >= 17 && h < 22) return { text: `Guten Abend${name}`, kind: 'moon' };
  return { text: `Noch fleißig${name}?`, kind: 'night' };
}
const greetIcon = (kind) => (kind === 'sunrise' || kind === 'sun')
  ? `<svg class="gi gi-${kind}" viewBox="0 0 28 28" aria-hidden="true">
       ${kind === 'sunrise' ? '<defs><clipPath id="gi-hz"><rect x="0" y="0" width="28" height="21"/></clipPath></defs>' : ''}
       <g ${kind === 'sunrise' ? 'clip-path="url(#gi-hz)"' : ''}><g class="gi-sun">
         <g class="gi-rays">${Array.from({ length: 8 }, (_, i) => `<line x1="14" y1="3" x2="14" y2="5.6" transform="rotate(${i * 45} 14 14)"/>`).join('')}</g>
         <circle cx="14" cy="14" r="5.2"/></g></g>
       ${kind === 'sunrise' ? '<line class="gi-horizon" x1="3" y1="21" x2="25" y2="21"/>' : ''}
     </svg>`
  : `<svg class="gi gi-${kind}" viewBox="0 0 28 28" aria-hidden="true">
       <path class="gi-moon" d="M19.5 17.5A8 8 0 0 1 10.5 6.6a8 8 0 1 0 9 10.9z"/>
       <path class="gi-star s1" d="M21 4l.7 1.6 1.6.7-1.6.7L21 8.6l-.7-1.6-1.6-.7 1.6-.7z"/>
       <path class="gi-star s2" d="M24.5 11l.45 1 1 .45-1 .45-.45 1-.45-1-1-.45 1-.45z"/>
     </svg>`;
const dashHead = () => {
  const g = greeting();
  const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  // Tageszeit-Himmel hinter der Begrüßung (Sterne nur abends/nachts, Positionen fest, damit nichts springt)
  const stars = g.kind === 'night' || g.kind === 'moon'
    ? Array.from({ length: g.kind === 'night' ? 18 : 8 }, (_, i) => `<i style="left:${(i * 37 + 11) % 97}%;top:${(i * 53 + 7) % 70}%;--d:${(i % 6) * 0.45}s;--s:${1 + (i % 3) * 0.6}px"></i>`).join('') : '';
  return `<div class="dash-head">
        <div class="sky sky-${g.kind}" aria-hidden="true"><span class="sky-glow"></span>${stars}</div>
        <p class="dash-greet">${greetIcon(g.kind)}<span>${esc(g.text)}</span></p>
        <p class="dash-date">${esc(date)}</p>
        <h1 class="dash-title lt-collapse">Übersicht</h1>
      </div>`;
};
const skelRows = (n) => Array.from({ length: n }, (_, i) => `<div class="mrow skel-row">
      ${skel('skel-thumb')}
      <div class="mrow-main">${skel('skel-line', `width:${[78, 64, 86, 58, 72][i % 5]}%`)}${skel('skel-line sm', `width:${[46, 38, 52, 30, 42][i % 5]}%`)}</div>
    </div>`).join('');
function dashSkeleton() {
  screen({
    header: dashHeader(), cls: 'dash-screen is-loading', tab: 'fav',
    body: `${dashHead()}
      <section class="widgets">${Array.from({ length: 3 }, () => `<div class="widget skel-card">${skel('skel-ic')}${skel('skel-num')}${skel('skel-line sm', 'width:80%')}${skel('skel-line xs', 'width:55%')}</div>`).join('')}</section>
      <h2 class="dash-sec">Schnellaktionen</h2>
      <section class="quick-grid">${Array.from({ length: 4 }, () => `<div class="quick skel-card">${skel('skel-qic')}<span class="q-text">${skel('skel-line', 'width:70%')}${skel('skel-line xs', 'width:85%')}</span></div>`).join('')}</section>
      <h2 class="dash-sec">Verwalten</h2>
      <section class="ios-list">${skelRows(3)}</section>`,
  });
}
function listSkeleton() {
  screen({
    header: `<div class="list-head"><header class="navbar list-nav">
        <span class="glass-btn">${icon('menu', 21)}</span><span class="glass-btn">${icon('filter', 21)}</span>
        <label class="search-field grow">${icon('search', 18)}<input type="search" placeholder="Suche…" disabled></label>
        <span class="glass-btn">${icon('scan', 21)}</span><span class="glass-btn">${icon('plus', 22, 2.3)}</span>
      </header>
      <div class="segment seg-icons"><button class="on">${icon('dolly', 22)}</button><button>${icon('tools', 22)}</button><button>${icon('cart', 22)}</button></div></div>`,
    body: `<div class="list-tools">${skel('skel-line sm', 'width:90px')}</div><div class="mlist">${skelRows(10)}</div>`,
    tab: 'list', cls: 'list-screen is-loading',
  });
}
/** Lädt Daten; ist noch nichts im Cache, erscheint sofort das Skeleton und danach blendet der echte Inhalt weich ein */
let loadedOnce = false;        // Skeleton nur beim allerersten Laden – nicht nach jeder Buchung (Cache wird da neu geholt)
async function withSkeleton(showSkeleton, load) {
  const rid = renderId;
  if (cache.materials || loadedOnce) { const data = await load(); loadedOnce = true; return { data, ok: true }; }
  showSkeleton();
  const data = await load();
  loadedOnce = true;
  if (rid !== renderId) return { data, ok: false };   // inzwischen woanders hin navigiert
  pendingTransition = 'swap';
  return { data, ok: true };
}

// ---------- Collapsing Header (großer Titel schrumpft beim Scrollen in die Leiste) ----------
let scrollRaf = 0;
function updateScrolled() {
  scrollRaf = 0;
  const scr = app.querySelector('.screen:last-child');
  if (!scr || scr.classList.contains('screen-anim')) return;
  scr.classList.toggle('at-top', window.scrollY < 4);   // ganz oben: Leiste durchsichtig, beim Scrollen Milchglas
  syncThemeColor();
  const lt = scr.querySelector('.lt-collapse');
  if (!lt) return;
  // umschalten, sobald der große Titel unter der Leiste verschwindet (mit kleiner Hysterese gegen Flackern)
  const bar = scr.querySelector('.dash-nav, .navbar');
  const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
  const r = lt.getBoundingClientRect();
  const on = scr.classList.contains('scrolled');
  const mid = r.top + r.height * 0.5;
  if (!on && mid < barBottom) scr.classList.add('scrolled');
  else if (on && mid > barBottom + 6) scr.classList.remove('scrolled');
}
window.addEventListener('scroll', () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(updateScrolled); }, { passive: true });

// ---------- Spotlight-Suche ----------
// Nur eine Oberfläche: nutzt die bestehende Suche (filterMats), die bestehenden Listenzeilen (materialRow)
// und den bestehenden Such-State der Teile-Liste (listState.q).
function openSpotlight() {
  if (document.querySelector('.spotlight')) return;
  const el = document.createElement('div');
  el.className = 'spotlight';
  el.innerHTML = `
    <div class="sp-backdrop"></div>
    <div class="sp-panel">
      <div class="sp-top">
        <label class="search-field sp-field">${icon('search', 20)}<input type="search" placeholder="Teile, Nummer, Barcode, Platz…" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false"></label>
        <button class="text-btn sp-cancel" type="button">Abbrechen</button>
      </div>
      <div class="sp-results"></div>
    </div>`;
  document.body.appendChild(el);
  const input = el.querySelector('input');
  input.value = listState.q || '';
  input.focus();                                   // muss synchron im Tipp/Wisch passieren (iOS)
  enhanceSearch(el);
  document.documentElement.classList.add('spot-open');
  requestAnimationFrame(() => { el.classList.add('show'); syncThemeColor(); });
  haptic('light');

  const results = el.querySelector('.sp-results');
  let hits = [];
  const showAll = () => {
    const q = input.value.trim();
    // Treffer an die echte Teile-Liste übergeben (gleicher State wie das Suchfeld dort)
    listState.q = q;
    if (hits.length && hits.every((m) => m.kind === 'tool')) listState.tab = 'tool';
    else if (listState.tab === 'cart' || !hits.some((m) => m.kind === listState.tab)) listState.tab = 'part';
    saveListState();
    close(); go('/list', false, 'tabF');
  };
  const render = async () => {
    const mats = await getMats();
    const q = input.value.trim();
    if (!q) {
      const recent = [...mats].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 5);
      hits = [];
      results.innerHTML = viewedStrip(mats) + (recent.length ? `<p class="sp-label">Zuletzt bewegt</p><div class="sp-card mlist">${recent.map((m) => materialRow(m)).join('')}</div>` : '');
      return;
    }
    hits = filterMats(mats, { q });
    const top = hits.slice(0, 12);
    results.innerHTML = hits.length
      ? `<p class="sp-label">${hits.length} ${hits.length === 1 ? 'Treffer' : 'Treffer'}</p>
         <div class="sp-card mlist">${top.map((m) => materialRow(m)).join('')}</div>
         ${hits.length > top.length ? `<button class="sp-all" type="button">Alle ${hits.length} Treffer in „Teile“ anzeigen ${icon('chevR', 16)}</button>` : ''}`
      : `<div class="sp-empty">${icon('search', 38, 1.5)}<p>Nichts gefunden für „${esc(q)}“</p></div>`;
    results.querySelector('.sp-all')?.addEventListener('click', showAll);
  };
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    input.blur();
    el.classList.remove('show'); el.classList.add('hide');
    document.documentElement.classList.remove('spot-open');
    setTimeout(() => { el.remove(); syncThemeColor(); }, 320);
    syncThemeColor();
    document.removeEventListener('keydown', onKey);
  }
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (hits.length === 1) { close(); go(`/m/${hits[0].id}`); } else if (input.value.trim()) showAll();
  });
  el.querySelector('.sp-cancel').onclick = close;
  el.querySelector('.sp-backdrop').onclick = close;
  results.addEventListener('click', (e) => { if (e.target.closest('a.mrow, a.viewed-card')) close(); });   // Navigation macht der Router
  // Nach oben wischen schließt
  let sy = 0;
  el.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => { if (sy - e.changedTouches[0].clientY > 70 && !results.scrollTop) close(); }, { passive: true });
  render();
}

// Oberster Eintrag in „Zuletzt bewegt“ beim letzten Anzeigen – ändert er sich (Buchung), wird er hervorgehoben
let lastRecentTop = null;
/** Klasse anhängen und nach Ende der Animation wieder entfernen (damit sie beim nächsten Mal erneut startet) */
function flashNew(el) {
  if (!el) return;
  el.classList.remove('highlight-new');
  void el.offsetWidth;                                   // Reflow → Animation startet sicher neu
  el.classList.add('highlight-new');
  el.addEventListener('animationend', (e) => { if (e.animationName === 'fade-highlight') el.classList.remove('highlight-new'); }, { once: true });
}

// ---------- Mini-Verlaufskurve „Verbrauch der letzten 14 Tage“ ----------
// Wird NACH dem Aufbau der Übersicht nachgeladen (blockiert die Seite nicht) und 60 s zwischengespeichert.
const SPARK_DAYS = 14;
let sparkCache = null;                 // { at, days: [Menge pro Tag] }
async function sparkData() {
  if (sparkCache && Date.now() - sparkCache.at < 60000 && cache.materials) return sparkCache.days;
  const movs = await db.listMovementsSince(SPARK_DAYS);
  const days = Array(SPARK_DAYS).fill(0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  movs.forEach((x) => {
    if (x.type !== 'out') return;
    const d = new Date(x.created_at); d.setHours(0, 0, 0, 0);
    const i = SPARK_DAYS - 1 - Math.round((today - d) / 864e5);
    if (i >= 0 && i < SPARK_DAYS) days[i] += Math.abs(+x.qty);
  });
  sparkCache = { at: Date.now(), days };
  return days;
}
async function fillSparkline(el) {
  if (!el) return;
  let days;
  try { days = await sparkData(); } catch { return; }
  if (!el.isConnected || !days.some((v) => v > 0)) return;          // ohne Entnahmen: Karte bleibt weg
  const W = 300; const H = 54; const P = 4;
  const max = Math.max(...days, 1);
  const pts = days.map((v, i) => [P + (i * (W - 2 * P)) / (days.length - 1), H - P - (v / max) * (H - 2 * P - 6)]);
  // weiche Kurve (Catmull-Rom → Bézier)
  const d = pts.map((p, i) => {
    if (!i) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const p0 = pts[i - 2] || pts[i - 1]; const p1 = pts[i - 1]; const p3 = pts[i + 1] || p;
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6];
    const c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
    return `C${c1[0].toFixed(1)},${Math.min(H - P, c1[1]).toFixed(1)} ${c2[0].toFixed(1)},${Math.min(H - P, c2[1]).toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  }).join(' ');
  const last = pts[pts.length - 1];
  const sum = days.reduce((a, b) => a + b, 0);
  const week = days.slice(-7).reduce((a, b) => a + b, 0); const prev = days.slice(0, 7).reduce((a, b) => a + b, 0);
  const trend = prev ? Math.round(((week - prev) / prev) * 100) : null;
  el.innerHTML = `
    <div class="spark-head">
      <span><b>${fmtQty(sum)}</b> Teile entnommen</span>
      <small>letzte ${SPARK_DAYS} Tage${trend != null ? ` · <i class="${trend > 0 ? 'up' : trend < 0 ? 'down' : ''}">${trend > 0 ? '+' : ''}${trend} %</i> zur Vorwoche` : ''}</small>
    </div>
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="spark-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".22"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>
      <path class="spark-area" d="${d} L${last[0].toFixed(1)},${H} L${P},${H} Z" fill="url(#spark-g)"/>
      <path class="spark-line" d="${d}" pathLength="1"/>
      <circle class="spark-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5"/>
    </svg>
    ${icon('chevR', 18)}`;
  el.hidden = false;
}

// ---------- Backup-Erinnerung auf der Übersicht ----------
// Erscheint, wenn das letzte Backup (auf diesem Gerät) älter als 14 Tage ist – oder es noch nie eins gab
// und die App schon ein paar Tage benutzt wird. „Später“ blendet sie für 3 Tage aus.
const BACKUP_DAYS = 14;
function backupHint(mats) {
  let last = null; let snooze = 0; let first = null;
  try {
    last = localStorage.getItem('wl-last-backup');
    snooze = +localStorage.getItem('ss-backup-snooze') || 0;
    first = localStorage.getItem('ss-first-seen');
    if (!first) { first = new Date().toISOString(); localStorage.setItem('ss-first-seen', first); }
  } catch { return ''; }
  if (!mats.length || Date.now() < snooze || db.isDemo) return '';
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null;
  const usedDays = Math.floor((Date.now() - Date.parse(first)) / 864e5);
  if (days != null ? days < BACKUP_DAYS : usedDays < 3) return '';
  return `<div class="backup-hint" role="status">
      <span class="bh-ic">${icon('save', 22, 2.1)}</span>
      <span class="bh-text"><b>Zeit für ein Backup</b><small>${days == null ? 'Auf diesem Gerät gab es noch keins' : `Letztes Backup vor ${days} Tagen`}</small></span>
      <button class="bh-go" data-act="backup-now">Sichern</button>
      <button class="bh-x" data-act="backup-later" aria-label="Später erinnern">${icon('x', 16, 2.4)}</button>
    </div>`;
}

// ---------- Lager-Gesundheit: wie viel Prozent der Ersatzteile sind gut bestückt? ----------
// „gut“ = Bestand über dem Meldebestand bzw. (ohne Meldebestand) überhaupt vorhanden
function lagerHealth(parts) {
  const empty = parts.filter((m) => (+m.total || 0) <= 0).length;
  const low = parts.filter((m) => isLow(m) && (+m.total || 0) > 0).length;
  const ok = parts.length - empty - low;
  const pct = parts.length ? Math.round((ok / parts.length) * 100) : 100;
  const state = pct >= 85 ? 'ok' : pct >= 60 ? 'warn' : 'bad';
  return { ok, low, empty, total: parts.length, pct, state };
}
const recapThumb = (m) => (m?.images?.[0] ? (m.images[0].thumb || m.images[0].url) : '');

// ---------- Lagerwert (Einkauf) ----------
function lagerValue(parts) {
  const stock = (m) => Math.max(0, +m.total || 0);
  const buy = parts.reduce((a, m) => a + stock(m) * (+m.purchase_price || 0), 0);
  const missing = parts.filter((m) => stock(m) > 0 && !(+m.purchase_price > 0)).length;
  const top = parts.map((m) => ({ m, v: stock(m) * (+m.purchase_price || 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)[0];
  return { buy, missing, top };
}
function valueCard(v, cu) {
  if (!(v.buy > 0)) return '';
  return `<a class="value-card" href="#/${v.missing ? 'prices' : 'stats'}" aria-label="${v.missing ? 'Fehlende Einkaufspreise nachtragen' : 'Lagerwert im Einkauf'}">
      <span class="v-ic">${icon('euro', 22, 2.2)}</span>
      <div class="v-main"><small>Lagerwert (Einkauf)</small><b class="ek">${cu('value')} €</b>
        <small>Bestand × Einkaufspreis${v.top ? ` · am meisten in „${esc(v.top.m.name)}“` : ''}</small>
        ${v.missing ? `<span class="v-todo">${icon('sparkle', 14, 2.2)} ${fmtQty(v.missing)} ${v.missing === 1 ? 'Preis' : 'Preise'} nachtragen</span>` : ''}</div>
      ${icon('chevR', 18)}
    </a>`;
}
const HEALTH_R = 40; const HEALTH_C = +(2 * Math.PI * HEALTH_R).toFixed(2);
function healthCard(h, cu) {
  if (!h.total) return '';
  const text = { ok: 'Lager gut bestückt', warn: 'Einiges wird knapp', bad: 'Viel nachzubestellen' }[h.state];
  return `<a class="health-card h-${h.state}" href="#/list?tab=part&low=1" aria-label="Lager-Gesundheit ${h.pct} Prozent">
      <div class="health-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="hg-${h.state}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="hg1"/><stop offset="1" class="hg2"/></linearGradient></defs>
          <circle class="hr-track" cx="50" cy="50" r="${HEALTH_R}"/>
          <circle class="hr-fill" cx="50" cy="50" r="${HEALTH_R}" stroke="url(#hg-${h.state})" style="stroke-dasharray:${HEALTH_C};stroke-dashoffset:${HEALTH_C}"/></svg>
        <span class="hr-val">${cu('health')}<small>%</small></span>
      </div>
      <div class="health-text"><b>${text}</b>
        <small>${fmtQty(h.ok)} von ${fmtQty(h.total)} Teilen genug da</small>
        <span class="health-chips">${h.low ? `<i class="hc-low">${fmtQty(h.low)} knapp</i>` : ''}${h.empty ? `<i class="hc-empty">${fmtQty(h.empty)} leer</i>` : ''}${!h.low && !h.empty ? '<i class="hc-ok">alles da</i>' : ''}</span>
      </div>
      ${icon('chevR', 18)}
    </a>`;
}
/** Ring füllt sich im gleichen Tempo wie die Zahl hochzählt */
function animateHealth(root, fromPct, toPct) {
  const arc = root.querySelector('.hr-fill'); if (!arc) return;
  const off = (p) => (HEALTH_C * (1 - p / 100)).toFixed(2);
  arc.style.strokeDashoffset = off(fromPct);
  if (reduceMotion.matches) { arc.style.strokeDashoffset = off(toPct); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.style.transition = 'stroke-dashoffset 4.5s cubic-bezier(.16, 1, .3, 1)';
    arc.style.strokeDashoffset = off(toPct);
  }));
}

// Zuletzt angezeigte Dashboard-Zahlen → beim nächsten Mal von dort aus weiterzählen
const dashShown = {};

async function viewFav() {
  let mats = []; let cart = []; let locs = []; let groups = [];
  const res = await withSkeleton(dashSkeleton, async () => {
    try { return await Promise.all([getMats(), getCart(), getLocs(), getGroups()]); } catch (e) { errToast(e); return [[], [], [], []]; }
  });
  if (!res.ok) return;
  [mats, cart, locs, groups] = res.data;
  const parts = mats.filter((m) => m.kind === 'part');
  const units = parts.reduce((a, m) => a + (m.total > 0 ? m.total : 0), 0);
  const low = parts.filter(isLow);
  const cartN = cart.filter((c) => c.list === 'cart').length;
  const recent = [...mats].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 3);
  const counts = { locs: locs.length, groups: groups.length };
  const FAV_MAX = 6;
  const favs = mats.filter((m) => m.is_favorite).sort((a, b) => a.number - b.number);
  const hl = lagerHealth(parts);
  const val = lagerValue(parts);
  const nums = { parts: parts.length, units, low: low.length, cart: cartN, health: hl.pct, value: Math.round(val.buy) };
  // Startwert der Zählanimation: beim ersten Mal 0, danach der zuletzt gezeigte Wert
  const cu = (k) => `<span data-count="${k}">${fmtQty(dashShown[k] ?? 0)}</span>`;

  const root = screen({
    header: dashHeader(),
    cls: 'dash-screen',
    body: `
      ${dashHead()}
      ${db.isGuest ? `<button type="button" class="demo-banner guest-banner" data-guest-end="register">${icon('sparkle', 16)}<span><em><b>Gastmodus</b> · Testdaten nur auf diesem Gerät</em><small>Gefällt's dir? Jetzt kostenlos registrieren</small></span>${icon('chevR', 16)}</button>`
        : db.isDemo ? `<a class="demo-banner" href="#/settings">${icon('database', 16)}<span>Demo-Modus – Daten nur auf diesem Gerät</span>${icon('chevR', 16)}</a>` : ''}

      <section class="widgets" aria-label="Status">
        <a class="widget" href="#/list?tab=part">
          <span class="w-ic tone-primary">${icon('box', 18, 2.2)}</span>
          <span class="w-val">${cu('parts')}</span>
          <span class="w-label">Teile im Lager</span>
          <span class="w-sub">${cu('units')} Stück</span>
        </a>
        <a class="widget ${low.length ? 'is-alert' : ''}" href="#/list?tab=part&low=1">
          <span class="w-ic tone-red">${icon('alert', 18, 2.2)}</span>
          <span class="w-val">${cu('low')}</span>
          <span class="w-label">Unter Meldebestand</span>
          <span class="w-sub">${low.length ? 'nachbestellen' : 'alles im grünen Bereich'}</span>
        </a>
        <a class="widget" href="#/list?tab=cart">
          <span class="w-ic tone-green">${icon('cart', 18, 2.2)}</span>
          <span class="w-val">${cu('cart')}</span>
          <span class="w-label">Im Warenkorb</span>
          <span class="w-sub">zum Bestellen</span>
        </a>
      </section>

      <div data-recap></div>
      ${backupHint(mats)}
      <a class="spark-card" href="#/stats" data-spark hidden aria-label="Verbrauch der letzten 14 Tage – zur Auswertung"></a>
      ${healthCard(hl, cu)}
      ${valueCard(val, cu)}
      <h2 class="dash-sec">Schnellaktionen <button class="sec-link quick-done" data-a="quick-done" hidden>Fertig</button></h2>
      <section class="quick-grid">
        ${quickOrdered().map((q) => `<a class="quick" href="#${q.href}" data-q="${q.id}" draggable="false">
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

      ${favs.length ? `<h2 class="dash-sec">Favoriten${favs.length > FAV_MAX ? ` <a class="sec-link" href="#/list?fav=1">Alle ${favs.length}</a>` : ''}</h2>
      <section class="ios-list" data-sec="favs">
        ${favs.slice(0, FAV_MAX).map((m) => `<a class="ios-row recent" href="#/m/${m.id}" data-id="${m.id}">
            ${thumb(m, 'sm')}
            <span class="r-label"><span class="r-title"><span class="nr">${m.number}</span> ${esc(m.name)}</span><small>${locLabel(m)}</small></span>
            <span class="r-qty ${isLow(m) ? 'red' : ''}" data-pop="fav:${m.id}" data-v="${m.total}">${fmtQty(m.total)}</span>
          </a>`).join('')}
      </section>` : ''}

      ${recent.length ? `<h2 class="dash-sec">Zuletzt bewegt</h2>
      <section class="ios-list" data-sec="recent">
        ${recent.map((m) => `<a class="ios-row recent" href="#/m/${m.id}" data-id="${m.id}">
            ${thumb(m, 'sm')}
            <span class="r-label"><span class="r-title"><span class="nr">${m.number}</span> ${esc(m.name)}</span><small>${locLabel(m)}</small></span>
            <span class="r-qty ${isLow(m) ? 'red' : ''}" data-pop="dash:${m.id}" data-v="${m.total}">${fmtQty(m.total)}</span>
          </a>`).join('')}
      </section>` : ''}`,
    tab: 'fav',
  });
  root.querySelectorAll('[data-count]').forEach((el) => {
    const k = el.dataset.count; const from = dashShown[k] ?? 0;
    countUp(el, nums[k], { from, dur: 4500 });
    if (dashShown[k] != null && dashShown[k] !== nums[k]) setTimeout(() => el.closest('.w-val, .w-sub')?.classList.add('num-pop'), 4480);
    dashShown[k] = nums[k];
  });
  animateHealth(root, dashShown.healthRing ?? 0, hl.pct); dashShown.healthRing = hl.pct;
  popChanged(root);
  updateScrolled();
  onLongPress(root.querySelector('.content'), '.ios-row.recent', (el) => materialContextMenu(el, () => viewFav()));
  attachGyro(root);
  fillSparkline(root.querySelector('[data-spark]'));
  setupQuickReorder(root);
  setupEasterEgg(root);
  fillRecapCard(root.querySelector('[data-recap]'), mats, isLow, recapThumb);
  on(root, 'backup-later', (el) => {
    try { localStorage.setItem('ss-backup-snooze', String(Date.now() + 3 * 864e5)); } catch { /* egal */ }
    const card = el.closest('.backup-hint'); card.style.height = `${card.offsetHeight}px`;
    requestAnimationFrame(() => card.classList.add('gone')); setTimeout(() => card.remove(), 420);
  });
  on(root, 'backup-now', () => { sessionStorage.setItem('ss-flash', 'backup'); openMenu('R'); });
  const top = recent[0] ? `${recent[0].id}|${recent[0].updated_at || ''}` : null;
  if (lastRecentTop && top && top !== lastRecentTop) flashNew(root.querySelector('[data-sec=recent] .ios-row.recent'));
  lastRecentTop = top;
  on(root, 'menu', () => openMenu('R'));
  on(root, 'theme', toggleTheme);
  // Herunterziehen öffnet die Spotlight-Suche (Aktualisieren: Menü → Neu laden, oder in „Teile“ herunterziehen)
  setupPullToSearch(root, openSpotlight);
  on(root, 'scan', (b) => scanMenu(b));
}

// ---------- Scanner-Knopf: Menü im Bogen wie beim + (Scannen, Scannen & entnehmen, Code eintippen, Verlauf) ----------
async function openByCode(code) {
  code = String(code || '').trim(); if (!code) return;
  const m = await db.findByCode(code);
  if (m) { foundToast(m); go(`/m/${m.id}`); }
  else if (await confirmBox({ title: 'Nicht gefunden', message: `Kein Material mit Code „${code}“. Jetzt anlegen?`, okText: 'Anlegen' })) go(`/new?kind=part&barcode=${encodeURIComponent(code)}`);
}
async function scanMenu(b) {
  const items = [
    { label: 'Scannen', value: 'scan', icon: 'scan', tone: 'primary' },
    { label: 'Scannen & entnehmen', value: 'out', icon: 'bookOut', tone: 'red' },
    { label: 'Code eintippen', value: 'type', icon: 'edit', tone: 'indigo' },
    { label: 'Scan-Verlauf', value: 'hist', icon: 'clock', tone: 'teal' },
  ];
  const v = b?.getBoundingClientRect && !reduceMotion.matches ? await speedDial(b, items)
    : await actionSheet('Scanner', items);
  if (v === 'scan') { const code = await scan(); if (code) openByCode(code); }
  if (v === 'out') go('/pick?mode=out&scan=1');
  if (v === 'hist') go('/scans');
  if (v === 'type') {
    const code = await prompt({ title: 'Code eintippen', message: 'Barcode, Artikelnummer oder Name', placeholder: 'z. B. 101 oder 4061234567890', okText: 'Suchen' });
    if (!code || !code.trim()) return;
    if (await db.findByCode(code)) return openByCode(code);
    // Kein genauer Treffer → wie die Suche (auch mit Tippfehlern): ein Treffer öffnet direkt, sonst die Liste
    const hits = filterMats((await getMats()), { q: code.trim() });
    if (hits.length === 1) { foundToast(hits[0]); go(`/m/${hits[0].id}`); }
    else if (hits.length) go(`/list?tab=part&q=${encodeURIComponent(code.trim())}`);
    else openByCode(code);
  }
}

/** Easter Egg: fünfmal schnell aufs Logo tippen → das S dreht sich wie ein Zahnrad, Zahnräder regnen */
let eggTaps = []; let eggBusy = false;
function setupEasterEgg(root) {
  const logo = root.querySelector('.dash-nav .brand'); if (!logo) return;
  logo.addEventListener('click', () => {
    const now = Date.now(); eggTaps = eggTaps.filter((t) => now - t < 1800).concat(now);
    const s = logo.querySelector('.brand-s');
    s.classList.remove('egg-tap'); void s.offsetWidth; s.classList.add('egg-tap');     // kleiner Hüpfer pro Tipp
    if (eggTaps.length < 5 || eggBusy) return;
    eggTaps = []; eggBusy = true;
    s.classList.add('egg-spin'); gearRain();
    setTimeout(() => { s.classList.remove('egg-spin'); eggBusy = false; }, 2200);
  });
}

/**
 * Schnellaktionen umsortieren wie auf dem iPhone-Homescreen:
 * lange drücken → Kacheln wackeln → (ohne loszulassen) an die neue Stelle ziehen.
 * „Fertig“ oder ein Tipp daneben beendet den Modus. Die Reihenfolge bleibt auf diesem Gerät gespeichert.
 */
function setupQuickReorder(root) {
  const grid = root.querySelector('.quick-grid'); if (!grid) return;
  const done = root.querySelector('[data-a=quick-done]');
  let editing = false; let timer = 0; let start = null; let drag = null;
  const tiles = () => [...grid.querySelectorAll('.quick')];

  const enter = (tile) => {
    editing = true; haptic('medium');
    grid.classList.add('jiggle'); done.hidden = false;
    // Kacheln wackeln leicht versetzt (wirkt natürlicher)
    tiles().forEach((t, i) => t.style.setProperty('--jd', `${(i % 3) * -0.09}s`));
    document.addEventListener('pointerdown', outside, true);
    if (tile && start) beginDrag(tile, start.x, start.y);
  };
  const exit = () => {
    if (!editing) return;
    editing = false; grid.classList.remove('jiggle'); done.hidden = true;
    document.removeEventListener('pointerdown', outside, true);
    haptic('light');
  };
  const outside = (e) => {
    if (!grid.isConnected) { document.removeEventListener('pointerdown', outside, true); return; }
    if (!grid.contains(e.target) && !done.contains(e.target)) exit();
  };
  done.onclick = exit;

  function beginDrag(tile, x, y) {
    drag = { el: tile, x, y, ox: tile.offsetLeft, oy: tile.offsetTop };
    tile.classList.add('dragging'); haptic('light');
  }
  const save = () => { try { localStorage.setItem(QUICK_KEY, JSON.stringify(tiles().map((t) => t.dataset.q))); } catch { /* egal */ } };

  grid.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const tile = e.target.closest('.quick'); if (!tile) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    if (editing) { e.preventDefault(); beginDrag(tile, e.clientX, e.clientY); try { grid.setPointerCapture(e.pointerId); } catch { /* egal */ } return; }
    clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; try { grid.setPointerCapture(e.pointerId); } catch { /* egal */ } enter(tile); }, 480);
  });
  grid.addEventListener('pointermove', (e) => {
    if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) { clearTimeout(timer); timer = 0; }
    if (!drag) return;
    const vx = drag.ox + (e.clientX - drag.x); const vy = drag.oy + (e.clientY - drag.y);   // gewünschte Position
    const el = drag.el;
    // Platz mit der nächstgelegenen Kachelmitte suchen
    const cx = vx + el.offsetWidth / 2; const cy = vy + el.offsetHeight / 2;
    let best = el; let bd = Infinity;
    tiles().forEach((t) => {
      const d = Math.hypot(t.offsetLeft + t.offsetWidth / 2 - cx, t.offsetTop + t.offsetHeight / 2 - cy);
      if (d < bd) { bd = d; best = t; }
    });
    if (best !== el && bd < el.offsetHeight * 0.6) {
      // FLIP: andere Kacheln gleiten weich an ihren neuen Platz
      const others = tiles().filter((t) => t !== el);
      const before = new Map(others.map((t) => [t, [t.offsetLeft, t.offsetTop]]));
      const list = tiles(); const from = list.indexOf(el); const to = list.indexOf(best);
      grid.insertBefore(el, from < to ? best.nextSibling : best);
      others.forEach((t) => {
        const [x0, y0] = before.get(t); const dx = x0 - t.offsetLeft; const dy = y0 - t.offsetTop;
        if ((dx || dy) && !reduceMotion.matches) t.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 320, easing: MENU_EASE });
      });
      haptic('selection');
    }
    el.style.translate = `${vx - el.offsetLeft}px ${vy - el.offsetTop}px`;
  });
  const end = () => {
    clearTimeout(timer); timer = 0; start = null;
    if (!drag) return;
    const el = drag.el; drag = null;
    const [x, y] = (el.style.translate || '0px 0px').split(' ');
    el.style.translate = '';
    el.classList.remove('dragging');
    if (!reduceMotion.matches) el.animate([{ translate: `${x} ${y || '0px'}` }, { translate: '0 0' }], { duration: 380, easing: 'cubic-bezier(.34,1.4,.64,1)' });
    save();
  };
  grid.addEventListener('pointerup', end);
  grid.addEventListener('pointercancel', end);
  // Während des Ziehens nicht scrollen; im Bearbeiten-Modus keine Aktion öffnen; kein Kontextmenü
  grid.addEventListener('touchmove', (e) => { if (drag || editing) e.preventDefault(); }, { passive: false });
  grid.addEventListener('click', (e) => { if (editing) { e.preventDefault(); e.stopPropagation(); } }, true);
  grid.addEventListener('contextmenu', (e) => e.preventDefault());
}

// =====================================================================
//  LISTEN (Material / Werkzeug / Warenkorb)
// =====================================================================
const SORT_OPTS = (charge = 'Chargennummer') => [['number', 'Artikelnummer (aufsteigend)'], ['number-desc', 'Artikelnummer (absteigend)'], ['name', 'Name A–Z'], ['name-desc', 'Name Z–A'],
  ['stock', 'Bestand (niedrig zuerst)'], ['updated', 'Zuletzt geändert'], ...(charge ? [['charge', `${charge} (aufsteigend)`], ['charge-desc', `${charge} (absteigend)`]] : [])];
const defaultSort = () => { try { return localStorage.getItem('ss-sort') || 'number'; } catch { return 'number'; } };
const listState = { charge: '', fav: false, ...JSON.parse(sessionStorage.getItem('wl-list') || `{"tab":"part","q":"","group":"","low":false,"loc":"","sort":"${defaultSort()}"}`) };
const saveListState = () => {
  sessionStorage.setItem('wl-list', JSON.stringify(listState));
  // Änderungen IN der sichtbaren Liste (Suche, Reiter …) gehören zu ihr; Änderungen von außen erzwingen Neuaufbau
  if (listKeep?.el.isConnected) listKeep.state = JSON.stringify(listState);
};

// ---------- Fehlende Vorschaubilder im Hintergrund nachholen ----------
const thumbQueue = new Set(); let thumbBusy = false; const thumbFailed = new Set();
window.__thumbMiss = (img) => {
  img.onerror = null;                                    // kein Endlos-Kreislauf
  img.removeAttribute('onerror');
  if (img.dataset.full) img.src = img.dataset.full;       // sofort das volle Foto zeigen
  const id = img.dataset.fid;
  if (id && !thumbFailed.has(id) && !db.isDemo && navigator.onLine !== false) { thumbQueue.add(id); runThumbQueue(); }
};
async function runThumbQueue() {
  if (thumbBusy) return;
  thumbBusy = true;
  try {
    while (thumbQueue.size) {
      const id = thumbQueue.values().next().value; thumbQueue.delete(id);
      const f = (cache.materials || []).flatMap((m) => m.images || []).find((x) => x.id === id);
      if (!f) continue;
      try { await db.ensureThumb(f); } catch { thumbFailed.add(id); }
      await new Promise((r) => setTimeout(r, 120));       // App bleibt dabei bedienbar
    }
  } finally { thumbBusy = false; }
}

// ---------- Teile-Liste beim Zurückkommen wiederverwenden ----------
// Die Liste (285 Zeilen mit Bildern) neu aufzubauen kostet am Handy spürbar Zeit – genau während der
// Zurück-Animation. Deshalb wird die fertige Liste aufgehoben und unverändert wieder eingesetzt,
// solange sich Daten und Filter nicht geändert haben (Scroll-Position, Bilder, alles bleibt).
let listKeep = null;      // { el, mats, cart, state }
function presentKept(el) {
  unfreeze(el); el.classList.remove('screen-edge', 'screen-edge-r');
  const kind = pendingTransition; pendingTransition = null;
  swapScreen(el, kind);
  requestAnimationFrame(updateScrolled);
  placeTabIndicator(el);
}
/** Aufgehobene Liste mit frischen Daten abgleichen: nur geänderte Zeilen tauschen, bei neuen/gelöschten Teilen neu aufbauen */
async function refreshKeptList(k) {
  const rid = renderId;
  let mats; let cart;
  try { [mats, cart] = await Promise.all([getMats(), getCart()]); } catch { return; }
  await whenIdle();
  if (rid !== renderId || listKeep !== k || !k.el.isConnected) return;
  const old = new Map(k.mats.map((m) => [m.id, matSig(m)]));
  const sameSet = mats.length === k.mats.length && mats.every((m) => old.has(m.id));
  if (!sameSet || (cart?.length ?? 0) !== (k.cart?.length ?? 0)) { viewList({}); return; }   // Anzahlen ändern sich → komplett
  const changed = mats.filter((m) => old.get(m.id) !== matSig(m));
  // Filter/Sortierung, die vom Bestand abhängen, könnten die Reihenfolge ändern → dann lieber komplett
  if (changed.length && (listState.low || listState.fav || ['stock', 'updated'].includes(listState.sort))) { viewList({}); return; }
  changed.forEach(patchListRow);
  popChanged(k.el);
  k.mats = mats; k.cart = cart;
  // Suche/Filter der Liste arbeiten mit ihrem eigenen Datenstand → kurz danach (unsichtbar) neu aufbauen,
  // damit z. B. eine Suche auch neue Angaben findet. Scroll-Position bleibt.
  if (changed.length) {
    setTimeout(async () => {
      await whenIdle();
      if (listKeep === k && k.el.isConnected && rid === renderId && !k.el.querySelector('#q:focus')) viewList({});
    }, 350);
  }
}
/** Eine einzelne Zeile der aufgehobenen Liste aktualisieren (z. B. nach frischem Stand auf der Detailseite) */
// ---------- Umbuchen: kleine Kiste fliegt im Bogen vom alten zum neuen Lagerort (Teile-Seite) ----------
async function flyTransfer(fromId, toId, qty) {
  if (reduceMotion.matches) return;
  const find = (id) => [...document.querySelectorAll(`.loc-row[data-loc="${id}"]`)].find((x) => x.offsetParent);
  let a = null; let b = null;
  for (let k = 0; k < 15 && !(a && b); k++) { await new Promise((r) => setTimeout(r, 80)); a = find(fromId); b = find(toId); }
  if (!a || !b) return;
  const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
  if (ra.bottom < 0 || rb.top > innerHeight) return;
  const box = document.createElement('div');
  box.className = 'fly-box'; box.innerHTML = `${icon('box', 20, 2.2)}<b>${fmtQty(qty)}</b>`;
  document.body.appendChild(box);
  const x0 = ra.right - 70; const y0 = ra.top + ra.height / 2 - 18; const x1 = rb.right - 70; const y1 = rb.top + rb.height / 2 - 18;
  const lift = Math.min(90, 30 + Math.abs(y1 - y0) * 0.4);
  const anim = box.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
    { transform: `translate(${x0 + 30}px, ${y0 - lift * 0.6}px) scale(1.05)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${(x0 + x1) / 2 + 46}px, ${Math.min(y0, y1) - lift}px) scale(1.1) rotate(8deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${x1}px, ${y1}px) scale(.95)`, opacity: 1, offset: 0.9 },
    { transform: `translate(${x1}px, ${y1}px) scale(.5)`, opacity: 0 },
  ], { duration: 900, easing: 'cubic-bezier(.4, 0, .3, 1)' });
  a.animate([{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }, { background: 'transparent' }], { duration: 600 });
  anim.onfinish = () => {
    box.remove(); haptic('light');
    b.animate([{ background: 'color-mix(in srgb, var(--green) 22%, transparent)' }, { background: 'transparent' }], { duration: 900, easing: 'ease-out' });
  };
}

// ---------- Warenkorb-Hüpfer: ist seit dem letzten Blick etwas dazugekommen, hüpft der Wagen ----------
let cartSeenN = null;
function cartHop(root, n) {
  const b = root.querySelector('.segment [data-tab="cart"]'); if (!b) return;
  const prev = cartSeenN; cartSeenN = n;
  if (prev == null || n <= prev || reduceMotion.matches) return;
  const ic = b.querySelector('svg'); const num = b.querySelector('.cart-n');
  setTimeout(() => {
    ic?.animate([{ transform: 'none' }, { transform: 'translateY(-7px) rotate(-12deg)' }, { transform: 'translateY(0) rotate(6deg) scale(1.05,.92)' }, { transform: 'none' }], { duration: 620, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    if (num) {
      let v = prev; const step = () => { v++; num.textContent = `(${v})`; num.animate([{ transform: 'translateY(-40%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'ease-out' }); if (v < n) setTimeout(step, 110); };
      num.textContent = `(${prev})`; setTimeout(step, 160);
    }
  }, 380);
}

// ---------- Zeilen gleiten beim Suchen/Sortieren an ihren neuen Platz (FLIP) ----------
function flipBefore(box) {
  const rows = box.querySelectorAll('.mrow[data-id]');
  if (!rows.length || rows.length > 400) return null;
  const vh = innerHeight; const pos = new Map();
  rows.forEach((r) => { const t = r.getBoundingClientRect().top; if (t > -200 && t < vh + 200) pos.set(r.dataset.id, t); });
  return pos;
}
function flipAfter(box, before) {
  if (!before?.size) return;
  const vh = innerHeight; let n = 0;
  box.querySelectorAll('.mrow[data-id]').forEach((r) => {
    const t = r.getBoundingClientRect().top;
    if (t > vh + 100 || t < -150 || n > 24) return;
    const was = before.get(r.dataset.id);
    n++;
    if (was == null) { r.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out', delay: 60 }); return; }
    const dy = was - t;
    if (Math.abs(dy) < 2) return;
    r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  });
}

function patchListRow(m) {
  const row = listKeep?.el.querySelector(`.mrow[data-id="${m.id}"]`);
  if (!row) return;
  const t = document.createElement('div'); t.innerHTML = materialRow(m);
  row.replaceWith(t.firstElementChild);
}

async function viewList(q) {
  if (!Object.keys(q).length && listKeep && !listKeep.el.isConnected && listKeep.state === JSON.stringify(listState)) {
    const k = listKeep;
    presentKept(k.el);
    // Daten inzwischen geändert (z. B. gebucht)? Liste steht schon da – frischen Stand im Hintergrund holen
    if (k.mats !== cache.materials || k.cart !== cache.cart) refreshKeptList(k);
    return;
  }
  if (q.tab) listState.tab = q.tab;
  if ('low' in q) listState.low = q.low === '1';
  if ('fav' in q) listState.fav = q.fav === '1';
  if ('q' in q) { listState.q = q.q; if (listState.tab === 'cart') listState.tab = 'part'; }   // z. B. Tipp auf „Passt für“-Chip
  if ('group' in q) listState.group = q.group;
  if ('loc' in q) listState.loc = q.loc;
  saveListState();
  if (Object.keys(q).length) replaceHash('#/list');

  const res = await withSkeleton(listSkeleton, () => Promise.all([getMats(), getCart()]));
  if (!res.ok) return;
  const [mats, cart] = res.data;
  const parts = mats.filter((m) => m.kind === 'part'); const tools = mats.filter((m) => m.kind === 'tool');
  const activeFilters = (listState.group ? 1 : 0) + (listState.low ? 1 : 0) + (listState.loc ? 1 : 0) + (listState.charge ? 1 : 0) + (listState.fav ? 1 : 0);
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
        <button data-tab="cart" class="${tab === 'cart' ? 'on' : ''}">${icon('cart', 22)} <span class="cart-n">(${cart.length})</span></button>
      </div>
      ${activeFilters ? `<div class="chips">
        ${listState.group ? `<button class="chip" data-clear="group">${esc((await getGroups()).find((g) => g.id === listState.group)?.name || 'Gruppe')} ${icon('x', 14)}</button>` : ''}
        ${listState.loc ? `<button class="chip" data-clear="loc">${esc((await getLocs()).find((l) => l.id === listState.loc)?.name || 'Lagerort')} ${icon('x', 14)}</button>` : ''}
        ${listState.charge ? `<button class="chip" data-clear="charge">Platz ${esc(listState.charge)} ${icon('x', 14)}</button>` : ''}
        ${listState.fav ? `<button class="chip" data-clear="fav">Favoriten ${icon('x', 14)}</button>` : ''}
        ${listState.low ? `<button class="chip red" data-clear="low">Unter Meldebestand ${icon('x', 14)}</button>` : ''}
      </div>` : ''}</div>`,
    body: `<div id="rows"></div>`,
    tab: 'list',
    cls: 'list-screen',
  });
  listKeep = { el: root, mats, cart: cache.cart, state: JSON.stringify(listState) };

  const rows = root.querySelector('#rows');
  cartHop(root, cart.length);
  // Mehrfachauswahl (Auswählen → Häkchen → Löschen)
  const sel = { on: false, ids: new Set() };
  let visible = [];
  const selBar = document.createElement('div');
  selBar.className = 'select-bar'; selBar.hidden = true;
  selBar.innerHTML = `<span class="sb-count"></span>
    <div class="sb-acts">
      <button class="sb-act" data-act="bulk-cart">${icon('cart', 22)}<span>Warenkorb</span></button>
      <button class="sb-act" data-act="bulk-move">${icon('swap', 22)}<span>Umlagern</span></button>
      <button class="sb-act" data-act="bulk-label">${icon('tag', 22)}<span>Etiketten</span></button>
      <button class="sb-act sb-delete" data-act="bulk-delete">${icon('trash', 22)}<span>Löschen</span></button>
    </div>`;
  root.appendChild(selBar);
  const updateSel = () => {
    const n = sel.ids.size;
    selBar.hidden = !sel.on;
    root.classList.toggle('selecting', sel.on);
    selBar.querySelector('.sb-count').textContent = n ? `${n} ausgewählt` : 'Teile antippen zum Auswählen';
    selBar.querySelectorAll('.sb-act').forEach((b) => (b.disabled = !n));
    selBar.querySelector('[data-act=bulk-cart]').hidden = listState.tab === 'tool';
    const all = rows.querySelector('[data-act=sel-all]');
    if (all) all.textContent = visible.length && visible.every((m) => sel.ids.has(m.id)) ? 'Keine auswählen' : 'Alle auswählen';
    rows.querySelectorAll('.mrow').forEach((r) => r.classList.toggle('is-selected', sel.ids.has(r.dataset.id)));
  };
  const renderRows = (stagger = false) => {
    if (listState.tab === 'cart') { sel.on = false; updateSel(); return renderCart(rows, mats, cart); }
    const flip = !stagger && !reduceMotion.matches ? flipBefore(rows) : null;
    let f = filterMats(listState.tab === 'tool' ? tools : parts, listState);
    const s = listState.sort;
    if (s === 'name') f.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    else if (s === 'stock') f.sort((a, b) => a.total - b.total);
    else if (s === 'updated') f.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    else if (s === 'charge') f.sort((a, b) => { const x = chargeOf(a); const y = chargeOf(b); return (!x) - (!y) || natCmp(x, y) || a.number - b.number; });
    else if (s === 'charge-desc') f.sort((a, b) => { const x = chargeOf(a); const y = chargeOf(b); return (!x) - (!y) || natCmp(y, x) || a.number - b.number; });
    else if (s === 'name-desc') f.sort((a, b) => b.name.localeCompare(a.name, 'de'));
    else if (s === 'number-desc') f.sort((a, b) => b.number - a.number);
    else f.sort((a, b) => a.number - b.number);
    visible = f;
    const dev = listState.q && listState.tab === 'part' && f.length >= 2 ? deviceGroups(f) : null;
    rows.innerHTML = f.length ? `
      ${dev && dev.groups.length >= 2 ? `<a class="device-chip" href="#/device?q=${encodeURIComponent(listState.q)}">
        <span class="dc-ic">${icon('device', 20, 2)}</span><span class="dc-text"><b>Geräte-Ansicht: ${esc(listState.q)}</b><small>${f.length} Teile in ${dev.groups.length} Bereichen${dev.missing.length ? ` · fehlt: ${dev.missing.join(', ')}` : ''}</small></span>${icon('chevR', 18)}</a>` : ''}
      <div class="list-tools">
        ${sel.on ? `<button class="text-btn" data-act="sel-all">Alle auswählen</button>` : `<span class="muted small">${f.fuzzy ? `<span class="fuzzy-hint">${icon('sparkle', 13, 2.2)} Ähnliche Treffer</span> · ` : ''}${f.length} Einträge</span>`}
        <button class="text-btn strong" data-act="sel-toggle">${sel.on ? 'Fertig' : 'Auswählen'}</button>
      </div>
      <div class="mlist ${stagger ? 'stagger' : ''}">${f.map((m, i) => materialRow(m, undefined, stagger ? i : -1)).join('')}</div>`
      : empty('search', listState.q ? `Nichts gefunden für „${esc(listState.q)}“` : 'Noch keine Einträge',
        `<a class="btn-tinted" href="#/new?kind=${listState.tab}">${icon('plus', 18)} Anlegen</a>`);
    if (flip) flipAfter(rows, flip);
    rows.querySelectorAll('.mrow').forEach((r) => {
      r.insertAdjacentHTML('afterbegin', `<span class="sel-check" aria-hidden="true">${icon('check', 15, 3)}</span>`);
      r.addEventListener('click', (e) => {
        if (!sel.on) return;
        e.preventDefault();
        sel.ids.has(r.dataset.id) ? sel.ids.delete(r.dataset.id) : sel.ids.add(r.dataset.id);
        haptic(); updateSel();
      });
    });
    popChanged(rows);
    const ml = rows.querySelector('.mlist.stagger');
    if (ml) setTimeout(() => ml.classList.remove('stagger'), 1200);   // nur beim Einblenden, nicht bei jeder Auswahl
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
  // Kaskade nur beim Öffnen der Seite (nicht beim Zurückkommen an die alte Scroll-Position oder beim Tippen in der Suche)
  renderRows(pendingScrollWas === 0 && !lastNavBack);
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

  const picked = async () => { const all = await getMats(); return [...sel.ids].map((id) => all.find((m) => m.id === id)).filter(Boolean); };
  const doneSel = () => { sel.on = false; sel.ids.clear(); };
  selBar.querySelector('[data-act=bulk-cart]').onclick = async () => {
    const list = await picked(); if (!list.length) return;
    const qty = (m) => Math.max(1, (+m.max_stock || 0) - m.total) || 1;
    if (!await confirmBox({ title: `${list.length} ${list.length === 1 ? 'Teil' : 'Teile'} in den Warenkorb?`,
      message: 'Menge je Teil: bis zum Maximalbestand, sonst 1 Stück. Im Warenkorb kannst du sie noch ändern.', okText: 'Hinzufügen' })) return;
    try {
      for (const m of list) await db.addToCart('cart', m.id, qty(m));
      invalidate('cart'); sfx.cash(); haptic('success');
      successHUD('Im Warenkorb', `${list.length} ${list.length === 1 ? 'Teil' : 'Teile'}`);
      doneSel(); viewList({});
    } catch (e) { errToast(e); }
  };
  selBar.querySelector('[data-act=bulk-label]').onclick = async () => {
    const list = await picked(); if (!list.length) return;
    showLabel(list.map(labelData));
  };
  selBar.querySelector('[data-act=bulk-move]').onclick = async () => {
    const list = await picked(); if (!list.length) return;
    const locs = await getLocs();
    const to = await pickFrom({ title: `${list.length} ${list.length === 1 ? 'Teil' : 'Teile'} umlagern nach …`, items: locs.map((l) => ({ value: l.id, label: l.name })),
      createLabel: 'Neuer Lagerort', onCreate: async () => { const n = await prompt({ title: 'Neuer Lagerort', okText: 'Anlegen' }); if (!n) return null; const l = await db.createLocation(n); invalidate('locations'); return l.id; } });
    if (!to) return;
    const target = (await getLocs()).find((l) => l.id === to);
    const moves = list.flatMap((m) => m.locations.filter((l) => l.qty > 0 && l.location_id !== to).map((l) => ({ m, l })));
    if (!await confirmBox({ title: `Nach „${target?.name || 'Lagerort'}“ umlagern?`,
      message: `${moves.length ? `${moves.length} ${moves.length === 1 ? 'Bestand wird' : 'Bestände werden'} umgebucht. ` : ''}„${target?.name}“ wird bei ${list.length === 1 ? 'dem Teil' : `allen ${list.length} Teilen`} zum Standard-Lagerort.`, okText: 'Umlagern' })) return;
    const count = selBar.querySelector('.sb-count');
    try {
      let i = 0;
      for (const m of list) {
        count.textContent = `Lagere um … ${++i}/${list.length}`;
        for (const l of m.locations.filter((x) => x.qty > 0 && x.location_id !== to)) {
          await db.book({ material_id: m.id, type: 'transfer', qty: l.qty, location_id: l.location_id, to_location_id: to, note: 'Sammel-Umlagerung' });
        }
        if (!m.locations.some((x) => x.location_id === to)) { try { await db.addStockLocation(m.id, to); } catch { /* existiert schon */ } }
        if (m.default_location_id !== to) await db.saveMaterial(m.id, { default_location_id: to });
      }
      invalidate('materials', 'locations'); haptic('success');
      successHUD('Umgelagert', `${list.length} ${list.length === 1 ? 'Teil' : 'Teile'} → ${target?.name || ''}`);
      doneSel(); viewList({});
    } catch (e) { errToast(e); invalidate('materials', 'locations'); viewList({}); }
  };

  onLongPress(rows, '.mrow', (el) => materialContextMenu(el, () => viewList({})), { enabled: () => !sel.on && listState.tab !== 'cart' });
  // Wisch-Aktionen: nach links Bearbeiten/Löschen, nach rechts Dazu buchen/Entnehmen
  enableSwipeActions(rows, '.mrow', {
    left: [
      { key: 'edit', label: 'Bearbeiten', icon: 'edit', tone: 'gray' },
      { key: 'delete', label: 'Löschen', icon: 'trash', tone: 'red' },
    ],
    right: [
      { key: 'in', label: 'Dazu buchen', icon: 'plus', tone: 'green', width: 100 },
      { key: 'out', label: 'Entnehmen', icon: 'minus', tone: 'orange', width: 92 },
    ],
    enabled: () => !sel.on && listState.tab !== 'cart',
    onAction: async (key, el) => {
      const m = (await getMats()).find((x) => x.id === el.dataset.id);
      if (!m) return;
      if (key === 'edit') return go(`/edit/${m.id}`);
      if (key === 'delete') return deleteMaterialFlow(m, () => viewList({}));
      if (key === 'in') return openBooking(m, 'in', () => viewList({}));
      if (key === 'out') {
        if (!m.locations.some((l) => l.qty > 0)) return toast('Kein Bestand zum Entnehmen', 'err');
        return openBooking(m, 'out', () => viewList({}));
      }
    },
  });

  const qi = root.querySelector('#q');
  // Fokus-Modus: Suche angetippt → Inhalt darunter abdunkeln, bis getippt wird
  const dim = document.createElement('div');
  dim.className = 'search-dim';
  root.appendChild(dim);
  const setDim = () => {
    const on = document.activeElement === qi && !qi.value;
    if (on) {
      dim.style.top = `${Math.round(root.querySelector('.list-head').getBoundingClientRect().bottom)}px`;
      const strip = viewedStrip(mats);
      dim.innerHTML = strip ? `<div class="dim-viewed">${strip}</div>` : '';
    }
    root.classList.toggle('search-focus', on);
    syncThemeColor();
  };
  qi.addEventListener('focus', setDim);
  qi.addEventListener('blur', () => { root.classList.remove('search-focus'); syncThemeColor(); });
  qi.addEventListener('input', setDim);
  // Tipp auf „Zuletzt angesehen“ öffnet das Teil, Wischen scrollt nur die Reihe, Tipp daneben schließt die Suche
  let tapCard = null; let tapX = 0;
  dim.addEventListener('pointerdown', (e) => {
    e.preventDefault();                                   // Suchfeld behält den Fokus
    tapCard = e.target.closest('.viewed-card'); tapX = e.clientX;
    if (!tapCard) qi.blur();
  });
  dim.addEventListener('pointerup', (e) => {
    const card = e.target.closest('.viewed-card');
    if (card && card === tapCard && Math.abs(e.clientX - tapX) < 10) { haptic('light'); qi.blur(); go(card.getAttribute('href').slice(1)); }
    tapCard = null;
  });
  dim.addEventListener('click', (e) => { if (e.target.closest('.viewed-card')) e.preventDefault(); });
  qi.oninput = () => { listState.q = qi.value; saveListState(); if (listState.tab === 'cart') { listState.tab = 'part'; viewList({}); } else renderRows(); };
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    if (listState.tab === b.dataset.tab) return;
    listState.tab = b.dataset.tab; saveListState();
    cartSel.on = false; cartSel.ids.clear(); root.querySelector('.cart-sel')?.remove();
    root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    updateSegments(root);
    sel.on = false; sel.ids.clear();
    // Inzwischen etwas geändert (z. B. über das Kontextmenü in den Warenkorb gelegt)? Dann mit frischen Daten neu aufbauen
    if (!cache.cart || !cache.materials) { listKeep = null; window.scrollTo(0, 0); viewList({}); return; }
    renderRows(true); window.scrollTo(0, 0);
  }));
  root.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => { listState[b.dataset.clear] = b.dataset.clear === 'low' ? false : ''; saveListState(); viewList({}); }));
  setupPullToRefresh(root, refreshAll, () => viewList({}));
  on(root, 'menu', () => openMenu('L'));
  on(root, 'add', async (b) => {
    const items = [
      { label: 'Ersatzteil', value: 'part', icon: 'box', tone: 'primary' },
      { label: 'Werkzeug', value: 'tool', icon: 'wrench', tone: 'indigo' },
      { label: 'Gruppe', value: 'grp', icon: 'boxes', tone: 'orange' },
      { label: 'Lagerort', value: 'loc', icon: 'shelf', tone: 'teal' },
    ];
    const v = b?.getBoundingClientRect && !reduceMotion.matches ? await speedDial(b, items)
      : await actionSheet('Neu anlegen', items.map((x) => ({ ...x, label: x.value === 'part' || x.value === 'tool' ? `${x.label} anlegen` : x.label })));
    if (v === 'part' || v === 'tool') go(`/new?kind=${v}`);
    if (v === 'grp') go('/groups'); if (v === 'loc') go('/locations');
  });
  on(root, 'scan', (b) => scanMenu(b));
  on(root, 'filter', () => openFilter());
}

async function openFilter() {
  const [groups, locs, mats] = await Promise.all([getGroups(), getLocs(), getMats()]);
  // alle vorhandenen Chargennummern/Plätze mit Anzahl, natürlich sortiert (2 vor 10)
  const pool = mats.filter((m) => m.kind === (listState.tab === 'tool' ? 'tool' : 'part'));
  const counts = new Map();
  pool.forEach((m) => { const c = chargeOf(m); if (c) counts.set(c, (counts.get(c) || 0) + 1); });
  const charges = [...counts.keys()].sort(natCmp);
  const fieldName = pool.map(chargeKey).find(Boolean) || 'Chargennummer';
  sheet(`
    <div class="form-group">
      <label class="frow"><span>Gruppe</span>
        <select data-f="group"><option value="">Alle Gruppen</option>${groups.map((g) => `<option value="${g.id}" ${g.id === listState.group ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="frow"><span>Lagerort</span>
        <select data-f="loc"><option value="">Alle Lagerorte</option>${locs.map((l) => `<option value="${l.id}" ${l.id === listState.loc ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      ${charges.length ? `<label class="frow"><span>${esc(fieldName)}</span>
        <select data-f="charge"><option value="">Alle</option>${charges.map((c) => `<option value="${esc(c)}" ${c.toLowerCase() === String(listState.charge).toLowerCase() ? 'selected' : ''}>${esc(c)} (${counts.get(c)})</option>`).join('')}</select></label>` : ''}
      <label class="frow"><span>Sortierung</span>
        <select data-f="sort">${SORT_OPTS(charges.length ? fieldName : '')
          .map(([v, l]) => `<option value="${v}" ${v === listState.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="frow switch-row"><span>Nur Favoriten</span><input type="checkbox" class="switch" data-f="fav" ${listState.fav ? 'checked' : ''}></label>
      <label class="frow switch-row"><span>Nur unter Meldebestand</span><input type="checkbox" class="switch" data-f="low" ${listState.low ? 'checked' : ''}></label>
    </div>
    <div class="btn-row mt"><button class="btn-gray" data-a="reset">Zurücksetzen</button><button class="btn-filled" data-a="apply">Anwenden</button></div>`,
  {
    title: 'Filter',
    onMount: (root, close) => {
      const val = (k) => root.querySelector(`[data-f=${k}]`);
      root.querySelector('[data-a=apply]').onclick = () => {
        Object.assign(listState, { group: val('group').value, loc: val('loc').value, sort: val('sort').value, low: val('low').checked, fav: val('fav').checked, charge: val('charge')?.value || '' });
        if (listState.tab === 'cart') listState.tab = 'part';
        saveListState(); close(); viewList({});
      };
      root.querySelector('[data-a=reset]').onclick = () => {
        Object.assign(listState, { group: '', loc: '', sort: defaultSort(), low: false, fav: false, charge: '' }); saveListState(); close(); viewList({});
      };
    },
  });
}

// ---------- Warenkorb & Kommissionen ----------
// Auswahl im Warenkorb (mehrere Posten auf einmal entfernen)
const cartSel = { on: false, ids: new Set() };
window.addEventListener('hashchange', () => { cartSel.on = false; cartSel.ids.clear(); });
function renderCart(rows, mats, cart) {
  const byId = Object.fromEntries(mats.map((m) => [m.id, m]));
  const items = cart.filter((c) => byId[c.material_id]);
  const order = items.filter((c) => c.list === 'cart');
  const comms = {};
  items.filter((c) => c.list === 'commission').forEach((c) => (comms[c.commission || 'Ohne Bezeichnung'] ??= []).push(c));
  const lowMissing = mats.filter((m) => isLow(m) && !order.some((c) => c.material_id === m.id));

  const itemRow = (c) => {
    const m = byId[c.material_id];
    return `<div class="crow ${cartSel.ids.has(c.id) ? 'is-selected' : ''}" data-cid="${c.id}">
      <span class="sel-check" aria-hidden="true">${icon('check', 15, 3)}</span>
      <a href="#/m/${m.id}" class="crow-link">${thumb(m, 'sm')}<div class="crow-main"><div class="mrow-title"><span class="nr">${m.number}:</span> ${esc(m.name)}</div>
        <div class="small muted">Bestand ${fmtQty(m.total)}${+m.min_stock ? ` · Meb ${fmtQty(m.min_stock)}` : ''}</div></div></a>
      <div class="stepper sm"><button data-cq="-1">${icon('minus', 16, 2.4)}</button><span>${fmtQty(c.qty)}</span><button data-cq="1">${icon('plus', 16, 2.4)}</button></div>
      ${shopUrl(m) ? `<a class="icon-btn shop-ic" href="${esc(shopUrl(m))}" target="_blank" rel="noopener" aria-label="Im Shop öffnen" title="${esc(shopHost(shopUrl(m)))}">${icon('external', 19)}</a>` : ''}
      <button class="icon-btn more" data-cmore>${icon('chevD', 20)}</button>
    </div>`;
  };
  rows.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Warenkorb · Nachbestellen</h2>${order.length ? `<button class="text-btn" data-act="share">${icon('upload', 18)} Teilen</button>` : ''}</div>
      ${lowMissing.length ? `<button class="btn-tinted full" data-act="addlow">${icon('alert', 18)} ${lowMissing.length} Teil(e) unter Meldebestand hinzufügen</button>` : ''}
      ${items.length > 1 ? `<div class="list-tools cart-tools">
        ${cartSel.on ? '<button class="text-btn" data-act="csel-all">Alle auswählen</button>' : `<span class="muted small">${items.length} Posten</span>`}
        <button class="text-btn strong" data-act="csel">${cartSel.on ? 'Fertig' : 'Auswählen'}</button></div>` : ''}
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

  // ---- Auswahl-Modus ----
  const scr = rows.closest('.screen') || document.body;
  scr.querySelector('.cart-sel')?.remove();
  cartSel.ids.forEach((id) => { if (!items.some((c) => c.id === id)) cartSel.ids.delete(id); });
  if (items.length < 2) cartSel.on = false;
  const bar = document.createElement('div');
  bar.className = 'select-bar cart-sel'; bar.hidden = !cartSel.on;
  bar.innerHTML = `<span class="sb-count"></span><div class="sb-acts"><button class="sb-act sb-delete" data-act="cdel">${icon('trash', 22)}<span>Aus Warenkorb entfernen</span></button></div>`;
  scr.appendChild(bar);
  const syncSel = () => {
    const n = cartSel.ids.size;
    scr.classList.toggle('selecting', cartSel.on);
    bar.hidden = !cartSel.on;
    bar.querySelector('.sb-count').textContent = n ? `${n} ${n === 1 ? 'Posten' : 'Posten'} ausgewählt` : 'Posten antippen zum Auswählen';
    bar.querySelector('[data-act=cdel]').disabled = !n;
    rows.querySelectorAll('.crow').forEach((r) => r.classList.toggle('is-selected', cartSel.ids.has(r.dataset.cid)));
    const all = rows.querySelector('[data-act=csel-all]');
    if (all) all.textContent = items.every((c) => cartSel.ids.has(c.id)) ? 'Keine auswählen' : 'Alle auswählen';
  };
  const tg = rows.querySelector('[data-act=csel]');
  if (tg) tg.onclick = () => { cartSel.on = !cartSel.on; cartSel.ids.clear(); haptic('light'); renderCart(rows, mats, cart); };
  const selAll = rows.querySelector('[data-act=csel-all]');
  if (selAll) selAll.onclick = () => {
    const every = items.every((c) => cartSel.ids.has(c.id));
    items.forEach((c) => (every ? cartSel.ids.delete(c.id) : cartSel.ids.add(c.id)));
    haptic('selection'); syncSel();
  };
  rows.querySelectorAll('.crow').forEach((r) => r.addEventListener('click', (e) => {
    if (!cartSel.on) return;
    e.preventDefault(); e.stopPropagation();
    cartSel.ids.has(r.dataset.cid) ? cartSel.ids.delete(r.dataset.cid) : cartSel.ids.add(r.dataset.cid);
    haptic('selection'); syncSel();
  }, true));
  bar.querySelector('[data-act=cdel]').onclick = async () => {
    const del = items.filter((c) => cartSel.ids.has(c.id)); if (!del.length) return;
    if (!await confirmBox({ title: `${del.length} ${del.length === 1 ? 'Posten' : 'Posten'} entfernen?`, message: 'Die Teile werden aus Warenkorb bzw. Kommission genommen. Der Bestand bleibt unverändert.', okText: 'Entfernen', danger: true })) return;
    const btn = bar.querySelector('[data-act=cdel]'); btn.disabled = true;
    // Zeilen klappen weg, dann löschen
    rows.querySelectorAll('.crow.is-selected').forEach((r, i) => { r.style.setProperty('--d', `${i * 40}ms`); r.classList.add('crow-out'); });
    haptic('success');
    try {
      await Promise.all([Promise.all(del.map((c) => db.deleteCart(c.id))), new Promise((r) => setTimeout(r, reduceMotion.matches ? 0 : 380))]);
      cartSel.on = false; cartSel.ids.clear(); scr.classList.remove('selecting'); bar.remove();
      await reload();
      toast('Entfernt', 'ok', { sub: `${del.length} Posten`, action: { label: 'Rückgängig', onClick: async () => {
        try { for (const c of del) await db.addToCart(c.list, c.material_id, c.qty, c.commission); await reload(); } catch (e) { errToast(e); }
      } } });
    } catch (e) { errToast(e); await reload(); }
  };
  syncSel();

  rows.querySelectorAll('.crow').forEach((r) => {
    const c = items.find((x) => x.id === r.dataset.cid);
    r.querySelectorAll('[data-cq]').forEach((b) => (b.onclick = async () => {
      const nq = +c.qty + +b.dataset.cq;
      try { if (nq <= 0) await removeCartItem(c, byId[c.material_id], r, reload); else { await db.updateCart(c.id, nq); haptic(); await reload(); } } catch (e) { errToast(e); }
    }));
    r.querySelector('[data-cmore]').onclick = async () => {
      const m = byId[c.material_id];
      const v = await actionSheet(m.name, [
        ...(c.list === 'cart' ? [{ label: 'Ware eingetroffen – dazu buchen', value: 'in', icon: 'bookIn' }] : [{ label: 'Jetzt entnehmen', value: 'out', icon: 'bookOut' }]),
        { label: 'Menge ändern', value: 'qty', icon: 'edit' },
        { label: 'Entfernen', value: 'del', icon: 'trash', danger: true },
      ]);
      try {
        if (v === 'del') await removeCartItem(c, m, r, reload);
        if (v === 'qty') { const n = await prompt({ title: 'Menge', value: c.qty, type: 'number' }); if (n && +n > 0) { await db.updateCart(c.id, +n); await reload(); } }
        if (v === 'in' || v === 'out') {
          const lastInCart = c.list === 'cart' && order.length === 1;      // letzter offener Posten der Bestellliste
          openBooking(m, v, async () => {
            await db.deleteCart(c.id); await reload();
            if (lastInCart && v === 'in') { confetti(); toast('Bestellung komplett eingebucht', 'ok', { sub: 'Der Warenkorb ist leer' }); }
          }, { qty: c.qty });
        }
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
    const text = 'Bestellliste\n\n' + order.map((c) => { const m = byId[c.material_id]; return `${fmtQty(c.qty)} × ${m.name}${m.barcode && m.barcode !== m.name ? ` (${m.barcode})` : ''}${m.supplier ? ` – ${m.supplier}` : ''}${shopUrl(m) ? `\n   ${shopUrl(m)}` : ''}`; }).join('\n');
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
        if (!errors.length) confetti();
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
    if (m) { foundToast(m); picked(m); }
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
const quickOutOn = () => { try { return localStorage.getItem('ss-quick-out') === '1'; } catch { return false; } };
/** Schnellbuchen: 1 Stück vom Standard-Lagerort (bzw. dem mit Bestand) entnehmen, ohne Mengen-Fenster */
async function quickOut(m, onDone) {
  const withStock = m.locations.filter((l) => l.qty > 0);
  const loc = withStock.find((l) => l.location_id === m.default_location_id) || withStock.sort((a, b) => b.qty - a.qty)[0];
  if (!loc) return false;
  try {
    const total = await db.book({ material_id: m.id, type: 'out', qty: 1, location_id: loc.location_id, note: '' });
    invalidate('materials', 'locations'); haptic('success'); sfx.ping();
    const booked = { material_id: m.id, type: 'out', qty: 1, location_id: loc.location_id };
    const hashAtBooking = location.hash;
    toast('1 Stück entnommen', 'ok', {
      sub: `${m.name} · ${loc.name} · Bestand ${fmtQty(total)}`,
      action: { label: 'Rückgängig', onClick: () => undoBooking(booked, 'Entnehmen', hashAtBooking === location.hash ? onDone : null) },
      onTimeout: () => { if (+m.min_stock > 0 && total <= +m.min_stock) toast('Meldebestand erreicht', 'err', { sub: `Bestand ${fmtQty(total)} / Meldebestand ${fmtQty(m.min_stock)}` }); },
    });
    await onDone?.(total);
    if (m.kind === 'part') setTimeout(() => offerPairs(m), 700);
    if (+m.min_stock > 0 && +m.total > +m.min_stock && total <= +m.min_stock) pulseLow(m.id);
    const anchor = ['.stock-ring-card .sr-val', '.total-row [data-pop]'].map((q) => document.querySelector(q)).find((el) => el && el.getBoundingClientRect().top > 0 && el.getBoundingClientRect().bottom < innerHeight);
    requestAnimationFrame(() => floatDelta({ text: '−1', kind: 'out', anchor }));
    return true;
  } catch (e) { errToast(e); return true; }
}
async function openBooking(m, type, onDone, preset = {}) {
  if (isOfflineNow()) { toast('Offline – Buchungen sind erst wieder mit Internet möglich.', 'err'); return; }
  if (type === 'out' && quickOutOn() && !preset.qty && !preset.location_id && !preset.full && await quickOut(m, onDone)) return;
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
    <div class="stepper big has-dial">
      <button data-s="-1" aria-label="Weniger">${icon('minus', 28, 2.6)}</button>
      <div class="dial" data-dial data-no-sheet-drag>
        <div class="dial-ring">${Array.from({ length: 24 }, (_, i) => `<i style="--a:${i * 15}deg"></i>`).join('')}</div>
        <div class="dial-knob"><b class="dial-dot"></b></div>
        <span class="odo"><input type="number" inputmode="decimal" min="0" step="any" value="${preset.qty || 1}" data-f="qty" aria-label="Menge"></span>
      </div>
      <button data-s="1" aria-label="Mehr">${icon('plus', 28, 2.6)}</button>
    </div>
    <p class="dial-hint">Drehen zum Einstellen · Tippen zum Eintippen</p>
    <div class="form-group"><label class="frow col"><span>${type === 'out' ? 'Wofür? (Notiz, optional)' : 'Notiz (optional)'}</span><input data-f="note" placeholder="${type === 'out' ? 'z.B. Kunde Müller, Auftrag 2410-17' : 'z.B. Lieferung, Lieferant'}" value="${esc(preset.note || '')}" autocomplete="off" enterkeyhint="done"></label></div>
    ${recentNotes(type).length ? `<div class="note-chips" aria-label="Zuletzt verwendete Notizen">${recentNotes(type).map((n) => `<button type="button" class="chip" data-note="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
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
      const step = (d) => {
        const old = qty.value; const next = Math.max(0, (+qty.value || 0) + d);
        if (String(next) === old) return false;
        qty.value = next; haptic('selection'); sfx.tick();
        odometer(qty, old, d > 0 ? 1 : -1);
        return true;
      };
      root.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { if (step(+b.dataset.s)) dial?.nudge(+b.dataset.s); }));
      const dial = setupDial(root.querySelector('[data-dial]'), qty, step);
      root.querySelectorAll('[data-note]').forEach((b) => (b.onclick = () => { f('note').value = b.dataset.note; haptic(); }));
      root.querySelector('[data-a=ok]').onclick = async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const total = await db.book({ material_id: m.id, type, qty: +qty.value, location_id: f('from').value, to_location_id: f('to')?.value || null, note: f('note').value.trim() });
          rememberNote(type, f('note').value);
          close(); invalidate('materials', 'locations');
          haptic('success'); sfx.ping();
          const booked = { material_id: m.id, type, qty: +qty.value, location_id: f('from').value, to_location_id: f('to')?.value || null };
          const hashAtBooking = location.hash;
          const lowWarn = () => { if (+m.min_stock > 0 && total <= +m.min_stock && type === 'out') toast('Meldebestand erreicht', 'err', { sub: `Bestand ${fmtQty(total)} / Meldebestand ${fmtQty(m.min_stock)}` }); };
          toast('Erfolgreich gebucht', 'ok', {
            sub: `${conf.title}: ${fmtQty(qty.value)} · Gesamtbestand ${fmtQty(total)}`,
            // 5 Sekunden „Rückgängig“: bucht genau die Gegenbewegung (steht dann auch so in der Historie)
            action: { label: 'Rückgängig', onClick: () => undoBooking(booked, conf.title, hashAtBooking === location.hash ? onDone : null) },
            onTimeout: lowWarn,                      // Meldebestand-Hinweis erst, wenn nicht rückgängig gemacht
          });
          await onDone?.(total);
          if (type === 'transfer' && booked.to_location_id) flyTransfer(booked.location_id, booked.to_location_id, booked.qty);
          if (type === 'out' && m.kind === 'part') setTimeout(() => offerPairs(m), 700);
          if (type === 'out' && +m.min_stock > 0 && +m.total > +m.min_stock && total <= +m.min_stock) pulseLow(m.id);
          if (type === 'out' || type === 'in') {
            const vis = (el) => { if (!el) return false; const q = el.getBoundingClientRect(); return q.width > 0 && q.top > 0 && q.bottom < innerHeight; };
            const anchor = ['.stock-ring-card .sr-val', '.total-row [data-pop]', '.mov-list .mov:first-child .mov-right b'].map((q) => document.querySelector(q)).find(vis);
            requestAnimationFrame(() => floatDelta({ text: `${type === 'out' ? '−' : '+'}${fmtQty(booked.qty)}`, kind: type, anchor }));
          }
        } catch (err) { errToast(err); b.disabled = false; }
      };
    },
  });
}

/**
 * Drehregler für die Menge (wie ein Lautstärke-Knopf): im Uhrzeigersinn mehr, dagegen weniger.
 * Alle 30° ein Schritt mit leichtem Klick (Haptik). Tippen ohne Drehen öffnet die Tastatur.
 */
const DIAL_STEP = 30;
function setupDial(el, input, step) {
  if (!el) return null;
  const knob = el.querySelector('.dial-knob');
  let rot = 0; let acc = 0; let last = null; let moved = 0; let id = null;
  const show = (anim) => { knob.style.transition = anim ? 'transform .35s cubic-bezier(.34,1.5,.64,1)' : 'none'; knob.style.transform = `rotate(${rot}deg)`; };
  const angle = (e) => { const r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    id = e.pointerId; last = angle(e); moved = 0; acc = 0;
    el.classList.add('turning');
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id || last == null) return;
    const a = angle(e); let d = a - last; last = a;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    moved += Math.abs(d);
    if (moved < 8) return;                                   // kleines Zittern beim Tippen ignorieren
    if (moved - Math.abs(d) < 8) { try { el.setPointerCapture(id); } catch { /* egal */ } input.blur(); }
    acc += d;
    while (acc >= DIAL_STEP) { acc -= DIAL_STEP; if (step(1)) rot += DIAL_STEP; }
    while (acc <= -DIAL_STEP) { acc += DIAL_STEP; if (step(-1)) rot -= DIAL_STEP; else acc = 0; }   // bei 0 bleibt der Knopf stehen
    knob.style.transition = 'none';
    knob.style.transform = `rotate(${rot + acc * 0.35}deg)`;     // leicht „zwischen den Rasten“ mitgehen
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null; last = null; el.classList.remove('turning');
    show(true);                                              // in die nächste Raste federn
    if (moved >= 8) e.preventDefault();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('click', (e) => { if (moved >= 8) { e.preventDefault(); return; } input.focus(); input.select?.(); });
  // Während des Drehens nicht scrollen und das Sheet nicht ziehen
  el.addEventListener('touchmove', (e) => { if (id != null && moved >= 8) e.preventDefault(); }, { passive: false });
  show(false);
  return { nudge: (d) => { rot += d * DIAL_STEP; show(true); } };
}

// =====================================================================
//  MATERIAL-DETAIL  (Tabs: Infos · Buchung · Details)
// =====================================================================
// Zuletzt geladene Aufgaben / Buchungen je Teil → Detailseite kann sofort zeichnen und lädt im Hintergrund nach
const detailMemo = { tasks: new Map(), movs: new Map() };
// Felder, an denen man erkennt, ob sich ein Teil seit dem Listen-Stand geändert hat
const matSig = (m) => JSON.stringify([m.updated_at, m.total, m.locations, m.name, m.number, m.min_stock, m.max_stock,
  m.is_favorite, m.default_location_id, (m.files || []).map((f) => f.id), m.custom_fields, m.barcode, m.group_id]);

async function viewMaterial(id, q) {
  const tab = q.tab || sessionStorage.getItem('wl-mtab') || 'infos';
  sessionStorage.setItem('wl-mtab', tab);
  const rid = renderId;
  // Sofort zeichnen: Die Liste hat das Teil schon komplett im Speicher (gleiche Abfrage inkl. Bestand & Bilder).
  // Nur wenn es dort fehlt (z. B. direkt per Link geöffnet), wird gewartet.
  const cached = cache.materials?.find((x) => x.id === id);
  const m = cached || await db.getMaterial(id);
  if (!m) { toast('Material nicht gefunden', 'err'); return go('/list', true); }
  rememberViewed(id);
  const reload = () => { detailMemo.tasks.delete(id); detailMemo.movs.delete(id); invalidate('materials', 'locations', 'groups'); return viewMaterial(id, { tab }); };
  const setTab = (t) => { replaceHash(`#/m/${id}?tab=${t}`); viewMaterial(id, { tab: t }); };

  const tasks = detailMemo.tasks.get(id);            // undefined = noch nicht geladen → Platzhalter
  const movs = detailMemo.movs.get(id);
  let body = '';
  if (tab === 'infos') body = infosTab(m, tasks);
  if (tab === 'buchung') body = bookingTab(m, movs);
  const defs = tab === 'details' ? fieldsFor(cache.fields || await getFields(), m.kind) : [];
  if (tab === 'details') body = detailsTab(m, defs);

  const root = screen({
    header: navbar({
      left: backBtn('arrow'), title: `<div class="two-line">${m.number}: ${esc(m.name)}</div>`, cls: 'detail-nav',
      right: `<button class="icon-btn fav-btn ${m.is_favorite ? 'on' : ''}" data-act="fav" aria-label="${m.is_favorite ? 'Favorit entfernen' : 'Als Favorit anheften'}" aria-pressed="${!!m.is_favorite}">${icon(m.is_favorite ? 'starFill' : 'star', 25)}</button>`,
    }),
    body: `<div class="segment"><button data-t="infos" class="${tab === 'infos' ? 'on' : ''}">Infos</button><button data-t="buchung" class="${tab === 'buchung' ? 'on' : ''}">Buchung</button><button data-t="details" class="${tab === 'details' ? 'on' : ''}">Details</button></div>${body}`,
    tab: 'none',
  });
  root.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => setTab(b.dataset.t)));
  popChanged(root);
  setupHeroScroll(root);
  if (tab === 'infos') { fillReach(root, m); fillPairs(root, m); }

  // Im Hintergrund frischen Stand holen; nur wenn sich etwas geändert hat, wird die Seite (ohne Animation) neu gezeichnet
  if (!q.fresh) {
    Promise.all([
      cached ? db.getMaterial(id) : m,
      tab === 'infos' ? db.listTasks(id) : null,
      tab === 'buchung' ? db.listMovements(id, 5) : null,
    ]).then(([fresh, t, mv]) => {
      let changed = false;
      if (fresh && cached && matSig(fresh) !== matSig(cached)) {
        changed = true;
        const i = cache.materials?.findIndex((x) => x.id === id) ?? -1;
        if (i >= 0) cache.materials[i] = fresh;            // Liste bleibt im Gleichstand
        patchListRow(fresh);                               // … auch die aufgehobene Liste
      }
      if (t && JSON.stringify(t) !== JSON.stringify(tasks)) { detailMemo.tasks.set(id, t); changed = true; }
      if (mv && JSON.stringify(mv) !== JSON.stringify(movs)) { detailMemo.movs.set(id, mv); changed = true; }
      if (!fresh && cached) { toast('Material nicht gefunden', 'err'); return; }
      // erst neu zeichnen, wenn der Bild-Flug bzw. Seitenwechsel fertig ist – sonst ruckelt es
      if (changed) whenIdle().then(() => { if (rid === renderId && root.isConnected) viewMaterial(id, { tab, fresh: true }); });
    }).catch(() => { /* offline o. ä.: der Stand aus dem Speicher bleibt stehen */ });
  }
  on(root, 'fav', () => toggleFavorite(m, () => viewMaterial(id, { tab })));

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
    if (src === 'cam') cameraFlash();
    try {
      toast('Bild wird hochgeladen…');
      let last = null;
      for (const f of files) { last = await compressImage(f); await db.addFile(id, last, f.name, 'image'); }
      toast('Bild gespeichert');
      await reload(); await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
      // das neue Foto fällt sichtbar in die Galerie
      const target = document.querySelector('.gal-main') || document.querySelector('.gallery');
      if (last && target) photoDrop(last, target);
    } catch (e) { errToast(e); }
  });
  on(root, 'label', () => openLabel(m));
  // Lange auf das Teilebild drücken → Karte dreht sich um, hinten der QR-Code groß zum Scannen
  setupFlip(root, m);
  setupGallery(root, m, reload);

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
          if (n !== null && n !== '') { await db.book({ material_id: id, type: 'inventory', qty: +n, location_id: l.location_id, note: 'Korrektur' }); successHUD('Bestand korrigiert', `${l.name}: ${fmtQty(n)}`); reload(); }
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
    on(root, 'cart', () => addToCartFlow(m));
    on(root, 'on-map', () => go(`/map?find=${m.id}`));
    // Aufgaben
    const tasksOpen = localStorage.getItem('wl-tasks-open') !== '0';
    on(root, 'tasks-toggle', () => { localStorage.setItem('wl-tasks-open', tasksOpen ? '0' : '1'); viewMaterial(id, { tab, fresh: !!tasks }); });
    on(root, 'task-add', async () => {
      const t = await prompt({ title: 'Neue Aufgabe', placeholder: 'z.B. Nachbestellen bei Lieferant X', okText: 'Hinzufügen' });
      if (t) { try { await db.addTask(id, t); localStorage.setItem('wl-tasks-open', '1'); reload(); } catch (e) { errToast(e); } }
    });
    root.querySelectorAll('[data-task]').forEach((el) => {
      el.querySelector('input').onchange = async (e) => {
        el.classList.toggle('tk-anim', e.target.checked); haptic(e.target.checked ? 'success' : 'light');
        if (e.target.checked) sfx.tick?.();
        try {
          await db.setTaskDone(el.dataset.task, e.target.checked);
          const t = tasks?.find((x) => x.id === el.dataset.task); if (t) t.done = e.target.checked;   // Zwischenspeicher mitziehen
        } catch (er) { errToast(er); }
      };
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
          let v = await prompt({ title: key, value: cur ?? '', type, ...(key === SHOP_KEY ? { placeholder: 'https://shop.de/artikel …' } : {}) });
          if (v === null) return;
          if (key === SHOP_KEY && v.trim()) { const u = normUrl(v); if (!u) { toast('Das ist kein gültiger Link', 'err'); return; } v = u; }
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
        ${imgs.length ? `<div class="gal-main${imgs.length > 1 ? ' multi' : ''}">
            <div class="gal-track">${imgs.map((im, i) => `<button class="gal-slide${i ? '' : ' cur'}" data-img="${i}"><img src="${esc(im.url)}" ${i ? 'loading="lazy" ' : ''}decoding="async" alt="" draggable="false"></button>`).join('')}</div>
            ${imgs.length > 1 ? `<div class="gal-dots">${imgs.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div><span class="gal-count">1/${imgs.length}</span>` : ''}
          </div>`
        : `<button class="gal-empty" data-act="add-image">${icon(m.kind === 'tool' ? 'wrench' : 'box', 54, 1.2)}<span>Noch kein Bild</span></button>`}
      </div>
      <div class="gal-side">
        <button class="outline-btn" data-act="add-image" aria-label="Bild hinzufügen">${icon('camera', 22)}</button>
        <button class="outline-btn" data-act="label" aria-label="Etikett">${icon('tag', 22)}</button>
      </div>
    </div>`;
}
/**
 * Großes Teilebild auf der Detailseite:
 * beim Hochscrollen schrumpft es weich und blendet aus (bewegt sich langsamer als der Inhalt = Tiefe),
 * zieht man ganz oben nach unten, wird es leicht größer und federt beim Loslassen zurück.
 */
function setupHeroScroll(root) {
  const g = root.querySelector('.gal-main, .gal-empty');
  if (!g || reduceMotion.matches) return;
  g.classList.add('hero-scroll');
  let raf = 0; let pull = 0;
  const apply = () => {
    raf = 0;
    if (!g.isConnected) { window.removeEventListener('scroll', onScroll); return; }
    if (root.classList.contains('screen-anim')) return;
    const h = g.offsetHeight || 1;
    const y = Math.max(0, window.scrollY);
    const p = Math.min(1, y / (h * 1.1));
    const scale = pull ? 1 + Math.min(0.14, pull / 900) : 1 - 0.28 * p;
    g.style.transform = `translate3d(0, ${(y * 0.35).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
    g.style.opacity = (1 - 0.85 * p).toFixed(3);
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
  window.addEventListener('scroll', onScroll, { passive: true });
  // Ganz oben nach unten ziehen → Bild wird größer (iOS „Stretchy Header“)
  let startY = null;
  root.addEventListener('touchstart', (e) => { startY = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; g.classList.remove('springback'); }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    pull = dy > 0 && window.scrollY <= 0 ? dy : 0;
    onScroll();
  }, { passive: true });
  const release = () => { if (!pull) return; pull = 0; startY = null; g.classList.add('springback'); onScroll(); };
  root.addEventListener('touchend', release, { passive: true });
  root.addEventListener('touchcancel', release, { passive: true });
}
/** Bilder auf der Detailseite: seitlich wischen (Punkte zeigen die Position), Tipp öffnet die Vollbild-Ansicht */
function setupGallery(root, m, reload) {
  const main = root.querySelector('.gal-main'); if (!main) return;
  const track = main.querySelector('.gal-track');
  const slides = [...track.children];
  const dots = [...main.querySelectorAll('.gal-dots i')];
  const cnt = main.querySelector('.gal-count');
  let cur = 0;
  const show = (i, scroll) => {
    if (scroll) track.scrollLeft = i * track.clientWidth;
    if (i === cur) return;
    slides[cur].classList.remove('cur'); slides[i].classList.add('cur');
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    if (cnt) cnt.textContent = `${i + 1}/${slides.length}`;
    cur = i; haptic('selection');
  };
  track.addEventListener('scroll', () => show(Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth))), false), { passive: true });
  slides.forEach((b, i) => (b.onclick = () => photoViewer({
    images: m.images, start: i, title: m.name,
    onChange: (k) => show(k, true),                     // Detailseite folgt dem Blättern im Vollbild
    onDelete: async (img, close) => {
      if (!await confirmBox({ title: 'Bild löschen?', okText: 'Löschen', danger: true })) return;
      try { await db.deleteFile(img); close(); reload(); } catch (e) { errToast(e); }
    },
  })));
}

// ---------- Gemeinsame Material-Aktionen (Detailseite + Kontextmenü) ----------
function setupFlip(root, m) {
  const g = root.querySelector('.gallery'); if (!g) return;
  let t = 0; let sx = 0; let sy = 0; let fired = false;
  g.addEventListener('pointerdown', (e) => {
    fired = false; sx = e.clientX; sy = e.clientY;
    clearTimeout(t);
    t = setTimeout(() => {
      fired = true; haptic('medium');
      const im = m.images?.[0];
      const code = m.barcode && m.barcode.length <= 20 ? m.barcode : String(m.number);   // wie beim Etikett
      flipCard({ title: m.name, number: m.number, code, sub: code !== String(m.number) ? `Nr. ${m.number}` : '', img: im ? (im.thumb || im.url) : '' });
    }, 520);
  });
  g.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(t); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => g.addEventListener(ev, () => clearTimeout(t)));
  g.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
  g.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------- Zuletzt angesehen (pro Gerät) ----------
const VIEWED_KEY = 'ss-viewed';
function viewedIds() { try { return JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]'); } catch { return []; } }
function rememberViewed(id) {
  try { localStorage.setItem(VIEWED_KEY, JSON.stringify([id, ...viewedIds().filter((x) => x !== id)].slice(0, 12))); } catch { /* egal */ }
}
function viewedStrip(mats, n = 5) {
  const byId = new Map(mats.map((m) => [m.id, m]));
  const list = viewedIds().map((id) => byId.get(id)).filter(Boolean).slice(0, n);
  if (!list.length) return '';
  return `<p class="sp-label">Zuletzt angesehen</p>
    <div class="viewed-strip">${list.map((m, i) => `<a class="viewed-card" href="#/m/${m.id}" style="--i:${i}">${thumb(m, 'md')}<b>${esc(m.name)}</b><small class="${isLow(m) ? 'red' : ''}">Bestand ${fmtQty(m.total)}</small></a>`).join('')}</div>`;
}

function openLabel(m) { showLabel(labelData(m)); }
function labelData(m) {
  // 2. Zeile: Chargennummer/Platz (eigenes Feld), sonst Artikelnummer
  const cf = m.custom_fields || {};
  const platzKey = Object.keys(cf).find((k) => /charge|platz|fach/i.test(k) && String(cf[k]).trim());
  const where = (m.locations.find((l) => l.location_id === m.default_location_id) || m.locations[0])?.name || '';
  return ({
    title: m.name,
    sub: platzKey ? `${/platz|fach/i.test(platzKey) ? 'Platz' : 'Charge'} ${cf[platzKey]}` : `Nr. ${m.number}`,
    extra: [platzKey ? `Nr. ${m.number}` : '', where].filter(Boolean).join(' · '),
    // Kurzer Code = großer, gut scanbarer QR. Lange Barcodes (z. B. Name aus Lager im Griff) → Artikelnummer
    code: m.barcode && m.barcode.length <= 20 ? m.barcode : String(m.number),
  });
}
async function addToCartFlow(m) {
  const sug = Math.max(1, (+m.max_stock || 0) - m.total) || 1;
  const n = await prompt({ title: 'In den Warenkorb', message: m.name, value: sug, type: 'number', okText: 'Hinzufügen' });
  if (!n || !(+n > 0)) return;
  try {
    await db.addToCart('cart', m.id, +n); invalidate('cart');
    sfx.cash();
    // In der Teile-Liste: Zähler im Warenkorb-Umschalter gleich aktualisieren (Wagen hüpft), Scroll-Position bleibt
    const refreshList = () => {
      if (parseHash().path !== '/list' || document.querySelector('.layer')) return;
      keepScrollOnce = window.scrollY; nextTransition = 'none'; listKeep = null; viewList({});
    };
    const flew = flyToCart(m, () => { toast('Im Warenkorb', 'ok', { sub: `${fmtQty(n)} × ${m.name}` }); refreshList(); });
    if (!flew) { successHUD('Im Warenkorb', `${fmtQty(n)} × ${m.name}`); setTimeout(refreshList, 300); }
  } catch (e) { errToast(e); }
}
/** Teilebild fliegt zum nächsten sichtbaren Warenkorb (Segment in der Liste, Widget auf der Übersicht, sonst Tab „Teile“) */
function flyToCart(m, onLand) {
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
  const to = ['.segment [data-tab="cart"]', '.widget[href="#/list?tab=cart"] .w-ic', '.tabbar .tab[href="#/list"] svg']
    .map((q) => document.querySelector(q)).find(visible);
  const from = [document.querySelector('.gal-main .cur img'), document.querySelector('[data-act="cart"] i'), document.querySelector(`[data-m="${m.id}"] .thumb`)].find(visible)
    || { left: innerWidth / 2 - 30, top: innerHeight / 2 - 30, width: 60, height: 60 };
  const img = m.images?.[0] ? (m.images[0].thumb || m.images[0].url) : '';
  return flyTo({ from, to, img, onLand });
}

/** Haptic Touch: langes Drücken auf einen Eintrag → Kontextmenü mit den wichtigsten Aktionen */
async function materialContextMenu(el, refresh) {
  const m = (await getMats()).find((x) => x.id === el.dataset.id);
  if (!m) return;
  const hasStock = m.locations.some((l) => l.qty > 0);
  const v = await contextMenu(el, {
    title: `${m.number}: ${m.name}`,
    sub: `Bestand <b class="${isLow(m) ? 'red' : ''}">${fmtQty(m.total)}</b>${+m.min_stock ? ` · Meb ${fmtQty(m.min_stock)}` : ''}`,
    items: [
      ...(hasStock ? [{ label: 'Entnehmen', value: 'out', icon: 'minus' }] : []),
      { label: 'Dazu buchen', value: 'in', icon: 'plus' },
      ...(hasStock && m.locations.length > 1 ? [{ label: 'Umbuchen', value: 'transfer', icon: 'swap' }] : []),
      '-',
      { label: 'Etikett drucken', value: 'label', icon: 'print' },
      { label: 'In den Warenkorb', value: 'cart', icon: 'cart' },
      { label: 'Bestandsänderungen', value: 'history', icon: 'history' },
      { label: m.is_favorite ? 'Favorit entfernen' : 'Als Favorit anheften', value: 'fav', icon: m.is_favorite ? 'starFill' : 'star' },
      { label: 'Nummer kopieren', value: 'copy', icon: 'copy' },
      '-',
      { label: 'Bearbeiten', value: 'edit', icon: 'edit' },
      { label: 'Löschen', value: 'delete', icon: 'trash', danger: true },
    ],
  });
  if (!v) return;
  if (['out', 'in', 'transfer'].includes(v)) return openBooking(m, v, refresh);
  if (v === 'label') return openLabel(m);
  if (v === 'cart') return addToCartFlow(m);
  if (v === 'history') return go(`/m/${m.id}/history`);
  if (v === 'copy') return copyText(String(m.number));
  if (v === 'edit') return go(`/edit/${m.id}`);
  if (v === 'fav') return toggleFavorite(m, refresh);
  if (v === 'delete') return deleteMaterialFlow(m, refresh);
}
/** Favoriten-Stern umschalten (Detailseite + Kontextmenü) */
async function toggleFavorite(m, refresh) {
  const on = !m.is_favorite;
  try {
    await db.setFavorite(m.id, on);
    m.is_favorite = on;
    invalidate('materials');
    haptic('light');
    toast(on ? 'Als Favorit angeheftet' : 'Favorit entfernt', 'ok', { icon: on ? 'starFill' : 'star' });
    refresh?.();
  } catch (e) { errToast(e); }
}
/** Löschen mit Sicherheitsabfrage (Kontextmenü + Wisch-Aktion) */
/** Zeile jetzt abfotografieren; der zurückgegebene Aufruf lässt sie (nach Neuaufbau + Hinweis) in den Papierkorb fließen */
function captureForGenie(el) {
  if (!el || !el.getBoundingClientRect().height) return () => {};
  const ghost = el.cloneNode(true); const rect = el.getBoundingClientRect();
  return () => requestAnimationFrame(() => {
    const ic = document.querySelector('.di-ic, .toast .ic'); if (!ic) return;
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none`;
    holder.appendChild(ghost); document.body.appendChild(holder);
    genieInto(holder, ic); holder.remove();
  });
}
/** Aus Warenkorb/Kommission entfernen – mit Papierkorb-Effekt und „Rückgängig“ */
async function removeCartItem(c, m, rowEl, reload) {
  const fly = captureForGenie(rowEl);
  await db.deleteCart(c.id);
  await reload();
  haptic('medium');
  toast(c.list === 'cart' ? 'Aus dem Warenkorb entfernt' : 'Aus der Kommission entfernt', 'ok', {
    sub: `${fmtQty(c.qty)} × ${m?.name || 'Teil'}`, icon: 'trash',
    action: { label: 'Rückgängig', onClick: async () => { try { await db.addToCart(c.list, c.material_id, c.qty, c.commission); await reload(); } catch (e) { errToast(e); } } },
  });
  fly();
}

async function deleteMaterialFlow(m, refresh) {
  if (!await confirmBox({ title: `${m.kind === 'tool' ? 'Werkzeug' : 'Teil'} löschen?`, message: `${m.name} inkl. Bestand, Historie und Bildern wird gelöscht.`, okText: 'Löschen', danger: true })) return;
  // Erst nur ausblenden – endgültig gelöscht wird nach 5 Sekunden, solange niemand „Rückgängig“ tippt
  const hash = location.hash;
  // Zeile merken, bevor die Liste neu aufgebaut wird → danach fließt sie in den Papierkorb im Hinweis
  const row = [...document.querySelectorAll(`.mrow[data-id="${m.id}"], [data-m="${m.id}"]`)].find((el) => el.getBoundingClientRect().height > 0);
  const ghostSrc = row?.closest('.swipe-wrap') || row;
  const ghost = ghostSrc?.cloneNode(true); const rect = ghostSrc?.getBoundingClientRect();
  if (cache.materials) cache.materials = cache.materials.filter((x) => x.id !== m.id);
  refresh();
  haptic('medium');
  if (ghost && rect) {
    requestAnimationFrame(() => {
      const ic = document.querySelector('.di-ic, .toast .ic');
      if (!ic) return;
      const holder = document.createElement('div'); holder.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none`;
      holder.appendChild(ghost); document.body.appendChild(holder);
      genieInto(holder, ic); holder.remove();
    });
  }
  toast(`${m.kind === 'tool' ? 'Werkzeug' : 'Teil'} gelöscht`, 'ok', {
    sub: `${m.number}: ${m.name}`, icon: 'trash',
    action: {
      label: 'Rückgängig',
      onClick: () => { invalidate('materials'); if (location.hash === hash) refresh(); toast('Wiederhergestellt', 'ok', { sub: m.name }); },
    },
    onTimeout: async () => {
      try { await db.deleteMaterial(m.id); invalidate(); updateBadge(); } catch (e) { invalidate('materials'); errToast(e); if (location.hash === hash) refresh(); }
    },
  });
}
/** Kurze Bestätigung nach einem erfolgreichen Scan */
function foundToast(m) {
  toast('Gefunden', 'ok', { icon: 'scan', sub: `${m.number}: ${m.name} · Bestand ${fmtQty(m.total)}`, duration: 1800 });
}
/** Gegenbuchung zu einer gerade gemachten Buchung */
async function undoBooking(b, title, onDone) {
  const back = b.type === 'in' ? { type: 'out', location_id: b.location_id }
    : b.type === 'out' ? { type: 'in', location_id: b.location_id }
      : { type: 'transfer', location_id: b.to_location_id, to_location_id: b.location_id };
  try {
    const total = await db.book({ material_id: b.material_id, qty: b.qty, to_location_id: null, ...back, note: `Rückgängig (${title})` });
    invalidate('materials', 'locations');
    toast('Rückgängig gemacht', 'info', { icon: 'history', sub: `Gesamtbestand wieder ${fmtQty(total)}` });
    await onDone?.(total);
  } catch (e) { errToast(e); }
}

// ---------- Reichweite: „Reicht noch ca. X Wochen“ aus dem bisherigen Verbrauch ----------
const REACH_DAYS = 90;
const reachMemo = new Map();          // Teil-ID → { perWeek, days, n }
function reachStats(movs) {
  const now = Date.now(); const since = now - REACH_DAYS * 864e5;
  const outs = movs.filter((x) => x.type === 'out' && Date.parse(x.created_at) >= since);
  // Zeitraum: 90 Tage – oder kürzer, wenn das Teil noch nicht so lange gebucht wird (mind. 14 Tage, sonst wird die Schätzung wild)
  const first = movs.length ? Math.min(...movs.map((x) => Date.parse(x.created_at))) : now;
  const days = Math.max(14, Math.min(REACH_DAYS, (now - first) / 864e5));
  const used = outs.reduce((a, x) => a + Math.abs(+x.qty || 0), 0);
  // Für den Alters-Hinweis: wann wurde zuletzt Ware eingelagert?
  const ins = movs.filter((x) => x.type === 'in' && +x.qty > 0).map((x) => Date.parse(x.created_at));
  return { perWeek: used / (days / 7), days: Math.round(days), n: outs.length, lastIn: ins.length ? Math.max(...ins) : null };
}

// ---------- Alters-Hinweis: Akkus, Kleber & Co. altern im Regal ----------
const AGING_RX = /akku|batter|kleber|klebe|adhes|tape|oca|paste|wärmeleit|waermeleit|flux|lötpaste|loetpaste|kleb/i;
function agingHtml(m, r) {
  const total = Math.max(0, +m.total || 0); if (total <= 0) return '';
  const since = r?.lastIn ?? (m.created_at ? Date.parse(m.created_at) : null); if (!since) return '';
  const months = (Date.now() - since) / (30.44 * 864e5);
  const sensitive = AGING_RX.test(m.name || '');
  if (months < (sensitive ? 6 : 12)) return '';
  const age = months < 24 ? `${Math.floor(months)} Monaten` : `${Math.floor(months / 12)} Jahren`;
  return `<div class="aging-card ${sensitive ? 'a-sens' : ''}">${icon(sensitive ? 'alert' : 'history', 22, 2.2)}<div>
      <b>Zuletzt eingelagert vor ${age}</b>
      <small>${sensitive ? 'Akkus und Kleber altern mit der Zeit – vor dem Einbau kurz prüfen.' : 'Liegt schon lange – wird das Teil noch gebraucht?'}</small>
    </div></div>`;
}
const weeksText = (w) => (w < 1 ? 'wenige Tage' : w < 26 ? `ca. ${Math.round(w)} ${Math.round(w) === 1 ? 'Woche' : 'Wochen'}` : w < 104 ? `ca. ${Math.round(w / 4.35)} Monate` : 'über 2 Jahre');
function reachHtml(m, r) {
  if (!r) return '';
  const total = Math.max(0, +m.total || 0); const min = +m.min_stock || 0;
  const rate = `Ø ${fmtQty(+r.perWeek.toFixed(1))} Stück pro Woche · letzte ${r.days} Tage${r.n < 3 ? ' · grobe Schätzung' : ''}`;
  if (r.perWeek <= 0) {
    if (r.days < 30) return '';                 // zu wenig Verlauf für eine Aussage
    return `<div class="reach-card r-idle">${icon('history', 22, 2.2)}<div><b>In den letzten ${r.days} Tagen nicht entnommen</b><small>Keine Reichweite berechenbar</small></div></div>`;
  }
  const weeks = total / r.perWeek;
  const state = total <= 0 || weeks < 2 ? 'bad' : weeks < 4 ? 'warn' : 'ok';
  const head = total <= 0 ? 'Leer – wird aber regelmäßig gebraucht' : `Reicht noch ${weeksText(weeks)}`;
  const toMin = min > 0 && total > min ? (total - min) / r.perWeek : null;
  // Balken: 8 Wochen = voll
  const frac = Math.max(0.03, Math.min(1, weeks / 8));
  return `<div class="reach-card r-${state}">${icon('clock', 22, 2.2)}<div>
      <b>${head}</b>
      <small>${rate}</small>
      ${toMin != null ? `<small>Meldebestand in ${weeksText(toMin)} erreicht</small>` : ''}
      <span class="reach-bar"><i style="--w:${(frac * 100).toFixed(1)}%"></i></span>
    </div></div>`;
}
async function fillReach(root, m) {
  const slot = root.querySelector('[data-reach]'); if (!slot) return;
  try {
    const r = reachStats(await db.listMovements(m.id, 500));
    reachMemo.set(m.id, r);
    if (!slot.isConnected) return;
    const html = reachHtml(m, r) + agingHtml(m, r);
    if (slot.innerHTML.trim() !== html.trim()) { slot.innerHTML = html; slot.firstElementChild?.classList.add('reach-in'); }
  } catch { /* offline: einfach weglassen */ }
}

/** Bestands-Ring: wie voll ist das Fach im Verhältnis zu Melde- und Maximalbestand? (nur wenn einer davon gesetzt ist) */
function stockRing(m) {
  const min = +m.min_stock || 0; const max = +m.max_stock || 0; const total = Math.max(0, +m.total || 0);
  if (!min && !max) return '';
  const full = max || Math.max(min * 2, total, 1);              // ohne Maximalbestand: doppelter Meldebestand = „voll“
  const frac = Math.max(0, Math.min(1, total / full));
  const state = isLow(m) ? 'low' : (min && total <= min * 1.5) ? 'warn' : 'ok';
  const text = { low: 'Nachbestellen!', warn: 'Bald nachbestellen', ok: 'Genug auf Lager' }[state];
  const R = 26; const C = +(2 * Math.PI * R).toFixed(2);
  const minAngle = min && full ? Math.min(1, min / full) * 360 : null;   // Markierung für den Meldebestand
  return `<div class="stock-ring-card ${state}">
      <svg class="stock-ring" viewBox="0 0 64 64" aria-hidden="true" style="--c:${C};--off:${(C * (1 - frac)).toFixed(2)}">
        <circle class="sr-track" cx="32" cy="32" r="${R}"/>
        <circle class="sr-fill" cx="32" cy="32" r="${R}"/>
        ${minAngle != null && minAngle < 360 ? `<line class="sr-mark" x1="32" y1="3" x2="32" y2="9" transform="rotate(${minAngle.toFixed(1)} 32 32)"/>` : ''}
      </svg>
      <span class="sr-tank" style="--lvl:${(frac * 100).toFixed(1)}%"><span class="sr-liquid"><i class="w1"></i><i class="w2"></i></span></span>
      <span class="sr-val">${fmtQty(total)}</span>
      <div class="sr-text"><b>${text}</b>
        <small>Meldebestand ${fmtQty(min)}${max ? ` · Maximalbestand ${fmtQty(max)}` : ''}</small>
        ${max && total < max ? `<small>Bis voll: ${fmtQty(max - total)}</small>` : ''}</div>
    </div>`;
}

// Flüssigkeit im Bestands-Tank schwappt mit der Handy-Neigung (Feder-Glättung, nur wenn ein Tank da ist)
let sloshTarget = 0; let sloshCur = 0; let sloshVel = 0; let sloshRaf = 0;
function sloshTick() {
  sloshRaf = 0;
  const tanks = document.querySelectorAll('.sr-liquid'); if (!tanks.length) return;
  sloshVel += (sloshTarget - sloshCur) * 0.08; sloshVel *= 0.86; sloshCur += sloshVel;
  tanks.forEach((t) => t.style.setProperty('--slosh', `${sloshCur.toFixed(2)}deg`));
  if (Math.abs(sloshVel) > 0.02 || Math.abs(sloshTarget - sloshCur) > 0.05) sloshRaf = requestAnimationFrame(sloshTick);
}
addEventListener('deviceorientation', (e) => {
  if (e.gamma == null || reduceMotion.matches || !document.querySelector('.sr-liquid')) return;
  const angle = (screen.orientation?.angle ?? 0) % 360;
  const g = angle === 90 ? e.beta : angle === 270 || angle === -90 ? -e.beta : e.gamma;
  sloshTarget = Math.max(-28, Math.min(28, -g));               // Wasser bleibt waagerecht → kippt gegen das Handy
  if (!sloshRaf) sloshRaf = requestAnimationFrame(sloshTick);
}, { passive: true });

function infosTab(m, tasks) {
  const loading = !tasks;                  // Aufgaben werden gerade nachgeladen
  tasks = tasks || [];
  const open = localStorage.getItem('wl-tasks-open') !== '0';
  const low = isLow(m);
  return `
    ${gallery(m)}
    <div class="sec-title"><span>LAGERORTE</span><button class="icon-btn" data-act="add-loc" aria-label="Lagerort hinzufügen">${icon('plus', 26)}</button></div>
    <div class="group-card">
    <div class="loc-list">
      ${m.locations.map((l) => `<button class="loc-row" data-loc="${l.location_id}"><b>${esc(l.name)}${l.location_id === m.default_location_id ? ' <small class="muted">· Standard</small>' : ''}</b><span class="${low || l.qty === 0 ? 'red' : ''}" data-pop="loc:${m.id}:${l.location_id}" data-v="${l.qty}">${fmtQty(l.qty)}</span></button>`).join('')
        || '<p class="muted small">Noch kein Lagerort – oben auf + tippen.</p>'}
    </div>
    <div class="total-row"><b>GESAMTBESTAND</b><span class="${low ? 'red' : ''}" data-pop="tot:${m.id}" data-v="${m.total}">${fmtQty(m.total)}</span></div>
    </div>
    ${stockRing(m)}
    ${m.kind === 'part' ? `<div class="reach-slot" data-reach>${reachMemo.has(m.id) ? reachHtml(m, reachMemo.get(m.id)) + agingHtml(m, reachMemo.get(m.id)) : ''}</div>` : ''}
    ${(m.fits || []).length ? `<div class="fits-view"><span class="fits-label">${icon('phone', 16, 2.2)} Passt für</span>${m.fits.map((f) => `<a class="chip fit" href="#/list?q=${encodeURIComponent(f)}">${esc(f)}</a>`).join('')}</div>` : ''}
    ${m.kind === 'part' ? `<div class="pairs-slot" data-pairs>${pairsHtml(m)}</div>` : ''}
    ${shopUrl(m) ? `<a class="card-btn shop-btn" href="${esc(shopUrl(m))}" target="_blank" rel="noopener"><i>${icon('external', 24)}</i><span>Im Shop öffnen<small>${esc(shopHost(shopUrl(m)))}</small></span></a>` : ''}
    ${m.locations.length ? `<button class="card-btn" data-act="on-map"><i>${icon('map', 24)}</i><span>Im Grundriss zeigen</span></button>` : ''}
    <button class="card-btn" data-act="label"><i>${icon('print', 24)}</i><span>Etikett drucken</span></button>
    <button class="card-btn" data-act="commission"><i>${icon('cartPlus', 26)}</i><span>Zu Kommission hinzufügen</span></button>
    <button class="card-btn red" data-act="cart"><i>${icon('cart', 26)}</i><span>In den Warenkorb legen</span></button>
    <div class="tasks">
      <div class="tasks-head"><b>Aufgaben ${loading ? '<span class="tasks-loading" aria-label="lädt"></span>' : `(${tasks.filter((t) => !t.done).length})`}</b>
        <span><button class="icon-btn" data-act="task-add" aria-label="Aufgabe hinzufügen">${icon('plus', 24)}</button>
        <button class="icon-btn" data-act="tasks-toggle" aria-label="Auf/Zu">${icon(open ? 'chevU' : 'chevD', 24)}</button></span></div>
      ${open ? tasks.map((t) => `<div class="task" data-task="${t.id}"><label><input type="checkbox" ${t.done ? 'checked' : ''}><i class="tk-box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4L18.5 8"/></svg></i><span>${esc(t.title)}</span></label><button class="icon-btn" data-del aria-label="Löschen">${icon('trash', 18)}</button></div>`).join('') : ''}
    </div>
    <button class="link-row" data-act="history">Bestandsänderungen ${icon('chevR', 18)}</button>`;
}

/** Zahl rollt wie ein Kilometerzähler: alte Zahl gleitet raus, neue kommt von unten (+) bzw. oben (−) */
function odometer(input, oldValue, dir) {
  if (reduceMotion.matches || !input.animate) return;
  const box = input.parentElement;
  box.querySelector('.odo-ghost')?.remove();
  const ghost = document.createElement('span');
  ghost.className = 'odo-ghost'; ghost.textContent = oldValue; ghost.setAttribute('aria-hidden', 'true');
  box.appendChild(ghost);
  const opts = { duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)' };
  ghost.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-dir * 70}%)`, opacity: 0 }], opts).onfinish = () => ghost.remove();
  input.animate([{ transform: `translateY(${dir * 70}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], opts);
}

// =====================================================================
//  PASST DAZU: Teile, die oft kurz hintereinander entnommen werden (z. B. Display + Kleber)
// =====================================================================
const PAIR_GAP = 30 * 60e3;             // Entnahmen mit höchstens 30 Min. Abstand gehören zu einer Reparatur
const PAIR_MIN = 2;                     // erst ab 2 gemeinsamen Reparaturen vorschlagen
let pairMemo = null;                    // { at, map: Map(id → Map(partnerId → Anzahl)) }
async function loadPairs(force = false) {
  if (!force && pairMemo && Date.now() - pairMemo.at < 5 * 60e3) return pairMemo.map;
  const all = (await db.listMovementsSince(365)).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  // Rückgängig gemachte Entnahmen nicht mitzählen
  const undone = new Set();
  all.forEach((u, i) => {
    if (u.type !== 'in' || !/^Rückgängig/.test(u.note || '')) return;
    for (let j = i - 1; j >= 0; j--) {
      const x = all[j];
      if (Date.parse(u.created_at) - Date.parse(x.created_at) > 15 * 60e3) break;
      if (x.type === 'out' && x.material_id === u.material_id && !undone.has(x.id)) { undone.add(x.id); break; }
    }
  });
  const outs = all.filter((x) => x.type === 'out' && !undone.has(x.id));
  const map = new Map();
  let sess = []; let last = 0;
  const flush = () => {
    const ids = [...new Set(sess)];
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      let mm = map.get(a); if (!mm) map.set(a, (mm = new Map()));
      mm.set(b, (mm.get(b) || 0) + 1);
    }
    sess = [];
  };
  for (const x of outs) { const t = Date.parse(x.created_at); if (t - last > PAIR_GAP) flush(); sess.push(x.material_id); last = t; }
  flush();
  pairMemo = { at: Date.now(), map };
  return map;
}
function pairsFor(id, n = 3) {
  const mm = pairMemo?.map.get(id); if (!mm) return [];
  const byId = new Map((cache.materials || []).map((m) => [m.id, m]));
  return [...mm].filter(([k, c]) => c >= PAIR_MIN && byId.has(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => ({ m: byId.get(k), c }));
}
function pairsHtml(m) {
  const list = pairsFor(m.id);
  if (!list.length) return '';
  return `<div class="pairs-card"><div class="pairs-head">${icon('layers', 18, 2.2)}<b>Wird oft zusammen gebraucht</b></div>
    <div class="pairs-row">${list.map(({ m: p, c }) => `<a class="pair-chip" href="#/m/${p.id}">${thumb(p, 'sm')}<span><b>${esc(p.name)}</b><small>${c}× zusammen · Bestand ${fmtQty(p.total)}</small></span></a>`).join('')}</div></div>`;
}
async function fillPairs(root, m) {
  const slot = root.querySelector('[data-pairs]'); if (!slot) return;
  try {
    await Promise.all([loadPairs(), getMats()]);
    if (!slot.isConnected) return;
    const html = pairsHtml(m);
    if (slot.innerHTML.trim() !== html.trim()) { slot.innerHTML = html; slot.firstElementChild?.classList.add('reach-in'); }
  } catch { /* offline: weglassen */ }
}
/** Nach dem Entnehmen: „Dazu auch?“ – ein Tipp bucht 1 Stück der passenden Teile aus */
async function offerPairs(m) {
  let list;
  try { await loadPairs(true); await getMats(); list = pairsFor(m.id).filter(({ m: p }) => +p.total > 0); } catch { return; }
  if (!list.length) return;
  document.querySelector('.pair-offer')?.remove();
  const el = document.createElement('div');
  el.className = 'pair-offer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Dazu auch entnehmen?');
  el.innerHTML = `<div class="po-head"><span class="po-ic">${icon('sparkle', 17, 2.2)}</span><span class="po-t"><b>Dazu auch?</b><small>Wird oft mit „${esc(m.name)}“ gebraucht</small></span>
      <button class="po-x" aria-label="Schließen">${icon('x', 18, 2.4)}</button></div>
    <div class="po-list">${list.map(({ m: p }) => `<button class="po-item" data-pid="${p.id}">${thumb(p, 'sm')}<span class="po-name"><b>${esc(p.name)}</b><small>Bestand ${fmtQty(p.total)}</small></span><i class="po-btn">−1</i></button>`).join('')}</div>
    <span class="po-timer"></span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  let timer; let touched = false;
  const close = () => { clearTimeout(timer); el.classList.remove('show'); el.classList.add('hide'); setTimeout(() => el.remove(), 400); };
  const arm = (ms) => { clearTimeout(timer); timer = setTimeout(close, ms); };
  arm(9000);
  el.querySelector('.po-x').onclick = close;
  el.addEventListener('pointerdown', () => { if (!touched) { touched = true; el.classList.add('touched'); } arm(12000); });
  window.addEventListener('hashchange', close, { once: true });
  el.querySelectorAll('[data-pid]').forEach((b) => (b.onclick = async () => {
    if (b.classList.contains('done') || b.classList.contains('busy')) return;
    const p = list.find((x) => x.m.id === b.dataset.pid).m;
    const loc = p.locations.find((l) => l.location_id === p.default_location_id && l.qty > 0) || p.locations.filter((l) => l.qty > 0).sort((a, c) => c.qty - a.qty)[0];
    if (!loc) { toast('Kein Bestand', 'err'); return; }
    b.classList.add('busy');
    try {
      const total = await db.book({ material_id: p.id, type: 'out', qty: 1, location_id: loc.location_id, note: `Zusammen mit ${m.name}`.slice(0, 120) });
      b.classList.remove('busy');
      invalidate('materials', 'locations'); haptic('success'); sfx.tick();
      b.classList.add('done'); b.querySelector('.po-btn').innerHTML = icon('check', 16, 3);
      b.querySelector('small').textContent = `Entnommen · Bestand ${fmtQty(total)}`;
      const booked = { material_id: p.id, type: 'out', qty: 1, location_id: loc.location_id };
      toast('1 Stück entnommen', 'ok', { sub: `${p.name} · Bestand ${fmtQty(total)}`, action: { label: 'Rückgängig', onClick: () => { undoBooking(booked, 'Entnehmen'); b.classList.remove('done'); b.querySelector('.po-btn').textContent = '−1'; b.querySelector('small').textContent = `Bestand ${fmtQty(total + 1)}`; } } });
      if (+p.min_stock > 0 && total <= +p.min_stock) b.querySelector('small').textContent += ' · Meldebestand!';
      if ([...el.querySelectorAll('[data-pid]')].every((x) => x.classList.contains('done'))) arm(1800);
    } catch (e) { errToast(e); b.classList.remove('busy'); }
  }));
}

// Zuletzt verwendete Buchungs-Notizen (pro Gerät gemerkt) → als Vorschläge zum Antippen
const NOTES_KEY = 'ss-notes';
const NOTES_MAX = 6;
function recentNotes(type) {
  try { return (JSON.parse(localStorage.getItem(NOTES_KEY) || '{}')[type === 'out' ? 'out' : 'in'] || []).slice(0, NOTES_MAX); } catch { return []; }
}
function rememberNote(type, note) {
  note = String(note || '').trim();
  if (!note || type === 'transfer') return;
  try {
    const all = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
    const k = type === 'out' ? 'out' : 'in';
    all[k] = [note, ...(all[k] || []).filter((n) => n.toLowerCase() !== note.toLowerCase())].slice(0, NOTES_MAX);
    localStorage.setItem(NOTES_KEY, JSON.stringify(all));
  } catch { /* Speicher nicht verfügbar */ }
}

const typeInfo = {
  in: { label: 'Dazu gebucht', cls: 'green', ic: 'plus' }, out: { label: 'Entnommen', cls: 'red', ic: 'minus' },
  transfer: { label: 'Umgebucht', cls: 'blue', ic: 'swap' }, inventory: { label: 'Inventur', cls: 'gray', ic: 'tally' },
};
const movementRow = (x, showAfter = false, price = 0) => {
  const t = typeInfo[x.type];
  const where = x.type === 'transfer' ? `${esc(x.from_name)} → ${esc(x.to_name)}` : esc(x.from_name);
  const sign = x.type === 'transfer' ? '' : x.qty > 0 ? '+' : '';
  return `<div class="mov">
    <div class="mov-ic ${t.cls}">${icon(t.ic, 18, 2.6)}</div>
    <div class="mov-main"><b>${t.label}</b><div class="small muted">${where}</div>
      ${x.note ? `<div class="mov-note">${icon('tag', 13, 2.2)}<span>${esc(x.note)}</span></div>` : ''}
      ${showAfter && x.stock_after != null ? `<div class="small muted">Gesamtbestand danach: ${fmtQty(x.stock_after)}</div>` : ''}</div>
    <div class="mov-right"><b class="${t.cls}-text">${sign}${fmtQty(x.qty)}</b><div class="small muted">${fmtDate(x.created_at)}</div>
      ${x.type === 'out' && +price > 0 ? `<div class="mov-cost ek">≈ ${fmtEUR(Math.abs(+x.qty) * +price)}</div>` : ''}</div>
  </div>`;
};

function bookingTab(m, mov) {
  const loading = !mov;
  mov = mov || [];
  return `
    <p class="caps center">Aktion auswählen:</p>
    <button class="book-card red" data-act="book-out"><i>${icon('minus', 34, 2.6)}</i><span>Entnehmen</span></button>
    <button class="book-card green" data-act="book-in"><i>${icon('plus', 34, 2.6)}</i><span>Dazu buchen</span></button>
    <button class="book-card blue" data-act="book-transfer"><i>${icon('swap', 34, 2.4)}</i><span>Umbuchen</span></button>
    <button class="link-row muted" data-act="history">Bestandsänderungen ${icon('chevR', 18)}</button>
    ${loading ? `<div class="mov-list mov-loading">${skelRows(2)}</div>` : mov.length ? `<div class="mov-list fade-in">${mov.map((x, i) => movementRow(x, i, m.purchase_price)).join('')}</div>` : ''}`;
}

// ---------- Verkaufspreis-Rechner: Aufschlag auf den Einkaufspreis + Rundung ----------
const MARKUP_KEY = 'ss-markup';
const MARKUP_ROUND = { '0': 'nicht runden', '0.5': 'auf 0,50 €', '1': 'auf ganze Euro', '0.9': 'auf ,90 €' };
// ---------- Einkaufspreise ausblenden (Einstellungen): Werte mit class="ek" werden unscharf, Tipp zeigt sie 5 Sek. ----------
const hideEk = () => { try { return localStorage.getItem('ss-hide-ek') === '1'; } catch { return false; } };
try { if (hideEk()) document.documentElement.classList.add('hide-ek'); } catch { /* egal */ }
document.addEventListener('click', (e) => {
  const t = e.target.closest?.('.ek, [data-ek-peek]');
  const root = document.documentElement;
  if (!t || !root.classList.contains('hide-ek') || root.classList.contains('ek-peek')) return;
  e.preventDefault(); e.stopPropagation();
  root.classList.add('ek-peek'); haptic('light');
  clearTimeout(root._ekT); root._ekT = setTimeout(() => root.classList.remove('ek-peek'), 5000);
}, true);

// ---------- Vorgaben für neue Teile (Einstellungen) ----------
const newDefaults = () => { const g = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }; return { loc: g('ss-new-loc'), min: g('ss-new-min'), group: g('ss-new-group') }; };

// ---------- Shop-Link: Bestellseite beim Lieferanten (liegt bei den eigenen Feldern → keine Datenbank-Änderung) ----------
const SHOP_KEY = 'Shop-Link';
function normUrl(v) {
  v = String(v || '').trim(); if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : ''; } catch { return ''; }
}
const shopUrl = (m) => normUrl(m?.custom_fields?.[SHOP_KEY]);
const shopHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function markupCfg() { try { return { pct: 40, round: '1', ...JSON.parse(localStorage.getItem(MARKUP_KEY) || '{}') }; } catch { return { pct: 40, round: '1' }; } }
function setMarkup(patch) { try { localStorage.setItem(MARKUP_KEY, JSON.stringify({ ...markupCfg(), ...patch })); } catch { /* egal */ } }
function suggestSale(ek) {
  ek = +ek; if (!(ek > 0)) return null;
  const { pct, round } = markupCfg();
  let v = ek * (1 + (+pct || 0) / 100);
  if (round === '1') v = Math.ceil(v - 1e-9);
  else if (round === '0.5') v = Math.ceil(v * 2 - 1e-9) / 2;
  else if (round === '0.9') { const f = Math.floor(v); v = v <= f + 0.9 + 1e-9 ? f + 0.9 : f + 1.9; }
  return Math.round(v * 100) / 100;
}
function marginInfo(m) {
  const sale = +m.sale_price; const buy = +m.purchase_price;
  if (!(sale > 0 && buy > 0)) return null;
  const d = sale - buy;
  return { d, pct: Math.round((d / sale) * 100), neg: d < 0 };
}
/** Im Formular: Vorschlag für den Verkaufspreis direkt unter dem Einkaufspreis */
function setupSaleSuggest(root) {
  const ek = root.querySelector('input[name="purchase_price"]'); const vk = root.querySelector('input[name="sale_price"]');
  if (!ek || !vk) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'sale-suggest'; btn.hidden = true;
  ek.closest('.field').after(btn);
  const upd = () => {
    const v = suggestSale(ek.value);
    btn.hidden = v == null || +vk.value === v;
    if (v != null) btn.innerHTML = `${icon('sparkle', 16, 2.2)} VK-Vorschlag <b>${fmtEUR(v)}</b> <small>(+${markupCfg().pct} %)</small> übernehmen`;
  };
  ek.addEventListener('input', upd); vk.addEventListener('input', upd);
  btn.onclick = () => { const v = suggestSale(ek.value); if (v == null) return; vk.value = v.toFixed(2); vk.dispatchEvent(new Event('input', { bubbles: true })); haptic('light'); pop(vk); upd(); };
  upd();
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
      ${row('Verkaufspreis', fmtEUR(m.sale_price) + (() => { const g = marginInfo(m); return g ? ` <span class="margin-chip ek ${g.neg ? 'neg' : ''}">Marge ${fmtEUR(g.d)} · ${g.pct} %</span>` : ''; })(), 'sale_price')}
      ${row('Einkaufspreis', m.purchase_price != null ? `<span class="ek">${fmtEUR(m.purchase_price)}</span>${hideEk() ? ` <span class="ek-eye" data-ek-peek role="button" aria-label="Kurz anzeigen">${icon('eye', 18)}</span>` : ''}` : '—', 'purchase_price')}
      ${row('Buchungsart', esc(m.booking_type || 'Einheit'), 'booking_type')}
      ${row(m.kind === 'tool' ? 'Gruppe' : 'Ersatzteil Gruppe', esc(m.group_name || '—'), 'group')}
      ${row('Meldebestand', fmtQty(m.min_stock), 'min_stock')}
      ${row('Maximalbestand', fmtQty(m.max_stock), 'max_stock')}
      ${row('Lieferant', esc(m.supplier || '—'), 'supplier')}
      ${row('Shop-Link', shopUrl(m) ? esc(shopHost(shopUrl(m))) : '—', `cf:${SHOP_KEY}`)}
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
          ...Object.entries(cf).filter(([k]) => !names.has(k) && k !== SHOP_KEY).map(([k, v]) => row(esc(k), esc(v === '' || v == null ? '—' : String(v)), `cf:${esc(k)}`)),
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
    body: mov.length ? `<div class="mov-list">${mov.map((x) => movementRow(x, true, m?.purchase_price)).join('')}</div>`
      : empty('history', 'Noch keine Bestandsänderungen'),
  });
}

// =====================================================================
//  AUSWERTUNG: Verbrauch, Ladenhüter, Meldebestand-Vorschläge
// =====================================================================
const STATS_RANGES = [[30, '30 Tage'], [90, '90 Tage'], [365, '1 Jahr']];
const REACH_WEEKS = 2;            // Meldebestand-Vorschlag = Verbrauch von so vielen Wochen
/** Reine Rechnung (ohne Anzeige) – so lässt sie sich leicht prüfen */
function computeStats(mats, movs, days, firstEver = null, nowMs = Date.now()) {
  const byId = new Map(mats.map((m) => [m.id, m]));
  const sinceMs = nowMs - days * 864e5;
  const isStart = (x) => /^anfangsbestand/i.test(x.note || '') || /csv-import/i.test(x.note || '');
  const outs = movs.filter((x) => x.type === 'out' && byId.has(x.material_id));
  const ins = movs.filter((x) => x.type === 'in' && !isStart(x) && byId.has(x.material_id));
  // Gibt es überhaupt erst seit kurzem Buchungen (App neu im Einsatz), zählt für den Wochenschnitt nur diese Zeitspanne
  const firstMs = firstEver ? Date.parse(firstEver) : sinceMs;
  const spanDays = Math.max(7, Math.min(days, (nowMs - Math.max(sinceMs, firstMs)) / 864e5));
  const weeks = spanDays / 7;

  const used = new Map();           // material_id → { qty, count }
  outs.forEach((x) => { const u = used.get(x.material_id) || { qty: 0, count: 0 }; u.qty += Math.abs(+x.qty); u.count += 1; used.set(x.material_id, u); });
  const top = [...used.entries()].map(([id, u]) => ({ m: byId.get(id), ...u, perWeek: u.qty / weeks }))
    .sort((a, b) => b.qty - a.qty || a.m.number - b.m.number);

  const outQty = outs.reduce((s, x) => s + Math.abs(+x.qty), 0);
  const inQty = ins.reduce((s, x) => s + Math.abs(+x.qty), 0);
  const outValue = outs.reduce((s, x) => s + Math.abs(+x.qty) * (+byId.get(x.material_id).purchase_price || 0), 0);

  // Ladenhüter: Bestand vorhanden, im Zeitraum nichts entnommen, und das Teil ist älter als der Zeitraum
  const slow = mats.filter((m) => m.kind === 'part' && m.total > 0 && !used.has(m.id) && Date.parse(m.created_at || 0) < sinceMs)
    .map((m) => ({ m, value: m.total * (+m.purchase_price || 0) }))
    .sort((a, b) => b.value - a.value || b.m.total - a.m.total);

  // Meldebestand-Vorschlag: Verbrauch von REACH_WEEKS Wochen, nur bei mindestens 2 Entnahmen
  const suggest = top.filter((t) => t.m.kind === 'part' && t.count >= 2)
    .map((t) => ({ ...t, cur: +t.m.min_stock || 0, sug: Math.max(1, Math.ceil(t.perWeek * REACH_WEEKS)) }))
    .filter((t) => t.sug > t.cur)
    .sort((a, b) => (b.sug - b.cur) - (a.sug - a.cur));

  // Verbrauch nach Notiz (z. B. Kunde / Auftrag)
  const notes = new Map();
  outs.forEach((x) => { const n = (x.note || '').trim(); if (!n) return; const e = notes.get(n) || { note: n, qty: 0, count: 0, last: '' }; e.qty += Math.abs(+x.qty); e.count += 1; if (x.created_at > e.last) e.last = x.created_at; notes.set(n, e); });
  const byNote = [...notes.values()].sort((a, b) => b.last.localeCompare(a.last));

  return { outQty, inQty, outValue, outCount: outs.length, top, slow, suggest, byNote, weeks, spanDays, firstMs, short: spanDays < days - 1 };
}

// ---------- Verbrauchs-Kalender (wie bei GitHub): ein Kästchen pro Tag, je dunkler desto mehr entnommen ----------
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function heatmap(movs, days) {
  const perDay = new Map();
  movs.forEach((x) => { if (x.type !== 'out') return; const k = dayKey(new Date(x.created_at)); perDay.set(k, (perDay.get(k) || 0) + Math.abs(+x.qty)); });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - (days - 1));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));        // auf Montag zurück
  const vals = [...perDay.values()].sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] || 1;
  const steps = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => (!v ? 0 : v <= steps[0] ? 1 : v <= steps[1] ? 2 : v <= steps[2] ? 3 : 4);
  const weeks = []; const months = [];
  for (let d = new Date(start), w = 0; d <= today; w++) {
    const col = [];
    for (let i = 0; i < 7; i++, d.setDate(d.getDate() + 1)) {
      if (d > today) { col.push('<span class="hm-cell out"></span>'); continue; }
      if (d.getDate() === 1 || (w === 0 && i === 0)) months.push({ w, label: d.toLocaleDateString('de-DE', { month: 'short' }) });
      const k = dayKey(d); const v = perDay.get(k) || 0;
      col.push(`<span class="hm-cell l${level(v)}" data-day="${k}" data-v="${v}" style="--w:${w}" title="${d.toLocaleDateString('de-DE')}: ${fmtQty(v)}"></span>`);
    }
    weeks.push(`<div class="hm-col">${col.join('')}</div>`);
  }
  const lbl = months.filter((m, i) => i === 0 || m.w - months[i - 1].w >= 3);
  return `<div class="hm-card">
      <div class="hm-scroll"><div class="hm-inner" style="--weeks:${weeks.length}">
        <div class="hm-months">${lbl.map((m) => `<span style="--w:${m.w}">${esc(m.label)}</span>`).join('')}</div>
        <div class="hm-grid"><div class="hm-days"><span>Mo</span><span></span><span>Mi</span><span></span><span>Fr</span><span></span><span></span></div>${weeks.join('')}</div>
      </div></div>
      <div class="hm-foot"><span class="hm-info" data-hm-info>Tippe auf einen Tag</span>
        <span class="hm-scale">weniger <i class="hm-cell l0"></i><i class="hm-cell l1"></i><i class="hm-cell l2"></i><i class="hm-cell l3"></i><i class="hm-cell l4"></i> mehr</span></div>
    </div>`;
}
function setupHeatmap(root, movs, mats) {
  const box = root.querySelector('.hm-card'); if (!box) return;
  const byId = new Map(mats.map((m) => [m.id, m]));
  const info = box.querySelector('[data-hm-info]');
  const sc = box.querySelector('.hm-scroll'); const inner = box.querySelector('.hm-inner');
  // Kurze Zeiträume füllen die Breite (größere Kästchen), lange scrollen seitlich
  const fit = () => {
    const weeks = +inner.style.getPropertyValue('--weeks') || 1;
    const c = Math.max(13, Math.min(30, Math.floor((sc.clientWidth - 22) / weeks) - 3));
    inner.style.setProperty('--c', `${c}px`); sc.scrollLeft = sc.scrollWidth;            // neueste Woche sichtbar
  };
  fit(); new ResizeObserver(fit).observe(sc);
  box.querySelectorAll('[data-day]').forEach((c) => (c.onclick = () => {
    box.querySelector('.hm-cell.sel')?.classList.remove('sel'); c.classList.add('sel'); haptic('light');
    const k = c.dataset.day; const v = +c.dataset.v;
    const d = new Date(`${k}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
    if (!v) { info.innerHTML = `<b>${d}</b> · nichts entnommen`; return; }
    const per = new Map();
    movs.forEach((x) => { if (x.type === 'out' && dayKey(new Date(x.created_at)) === k) per.set(x.material_id, (per.get(x.material_id) || 0) + Math.abs(+x.qty)); });
    const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, q]) => `${esc(byId.get(id)?.name || 'gelöschtes Teil')} (${fmtQty(q)})`);
    info.innerHTML = `<b>${d}</b> · ${fmtQty(v)} entnommen: ${top.join(', ')}${per.size > 3 ? ` +${per.size - 3}` : ''}`;
    info.classList.remove('pop'); void info.offsetWidth; info.classList.add('pop');
  }));
}

// =====================================================================
//  GERÄTE-ANSICHT: alle Teile zu einem Gerät, sortiert nach Bauteil (Display, Akku, Kamera …)
// =====================================================================
const DEVICE_CATS = [
  { id: 'display', label: 'Display & Glas', icon: 'phone', rx: /display|lcd|oled|touch|digitizer|glas|glass|oca|screen|bildschirm/i, main: true },
  { id: 'akku', label: 'Akku', icon: 'battery', rx: /akku|batter|accu/i, main: true },
  { id: 'kamera', label: 'Kamera', icon: 'camera', rx: /kamera|camera|linse|lens|objektiv/i, main: true },
  { id: 'port', label: 'Ladebuchse & Flex', icon: 'plug', rx: /lade|charg|buchse|port|dock|connector|stecker|flex|kabel|cable/i, main: true },
  { id: 'gehaeuse', label: 'Gehäuse & Rückseite', icon: 'device', rx: /back|rück|gehäuse|gehaeuse|housing|rahmen|frame|cover|deckel/i },
  { id: 'ton', label: 'Ton & Vibration', icon: 'speaker', rx: /lautsprecher|speaker|hörmuschel|earpiece|mikro|mic|taptic|vibra|buzzer/i },
  { id: 'klein', label: 'Kleber & Kleinteile', icon: 'screw', rx: /kleb|adhes|sticker|tape|schraube|screw|dichtung|gasket|aufkleber|pad/i },
];
// Erkennung von genau nach grob: „LCD Flex Kabel“ ist ein Flex, „LCD Kleber“ ein Kleinteil, erst dann „LCD“ = Display
const DETECT_ORDER = ['klein', 'port', 'akku', 'kamera', 'ton', 'gehaeuse', 'display'];
function deviceCat(m) {
  const txt = `${m.name} ${m.group_name || ''}`;
  for (const id of DETECT_ORDER) { const c = DEVICE_CATS.find((x) => x.id === id); if (c.rx.test(txt)) return c; }
  return { id: 'sonst', label: 'Sonstiges', icon: 'box' };
}
function deviceGroups(mats) {
  const map = new Map();
  for (const m of mats) { const c = deviceCat(m); if (!map.has(c.id)) map.set(c.id, { cat: c, items: [] }); map.get(c.id).items.push(m); }
  const order = [...DEVICE_CATS.map((c) => c.id), 'sonst'];
  const groups = [...map.values()].sort((a, b) => order.indexOf(a.cat.id) - order.indexOf(b.cat.id));
  const missing = DEVICE_CATS.filter((c) => c.main && !map.has(c.id)).map((c) => c.label.split(' ')[0]);
  return { groups, missing };
}
async function viewDevice(q) {
  const term = String(q?.q || '').trim();
  const mats = (await getMats()).filter((m) => m.kind === 'part');
  const f = filterMats(mats, { q: term });
  const { groups, missing } = deviceGroups(f);
  const stockOf = (arr) => arr.reduce((a, m) => a + Math.max(0, +m.total || 0), 0);
  const root = screen({
    header: navbar({ left: backBtn(), title: esc(term || 'Gerät') }),
    body: `<div class="dev-hero">
        <span class="dev-ic">${icon('device', 34, 1.8)}</span>
        <div><h2>${esc(term)}</h2><p>${fmtQty(f.length)} ${f.length === 1 ? 'Teil' : 'Teile'} · ${fmtQty(stockOf(f))} Stück auf Lager${f.fuzzy ? ' · ähnliche Treffer' : ''}</p></div>
      </div>
      <div class="dev-chips">${groups.map((g) => `<a class="dev-chip ${stockOf(g.items) ? '' : 'empty'}" href="#dev-${g.cat.id}" data-jump="${g.cat.id}">${icon(g.cat.icon, 16, 2)} ${esc(g.cat.label.split(' ')[0])} <b>${fmtQty(stockOf(g.items))}</b></a>`).join('')}
        ${missing.map((x) => `<span class="dev-chip missing">${icon('x', 14, 2.4)} ${esc(x)}</span>`).join('')}</div>
      ${groups.map((g, gi) => `<section class="dev-sec" id="dev-${g.cat.id}" style="--gi:${gi}">
          <h2 class="dash-sec">${icon(g.cat.icon, 20, 2)} ${esc(g.cat.label)} <small>${fmtQty(g.items.length)}</small></h2>
          <div class="mlist">${g.items.sort((a, b) => a.number - b.number).map((m) => materialRow(m)).join('')}</div>
        </section>`).join('') || empty('search', `Nichts gefunden für „${esc(term)}“`)}
      ${missing.length ? `<p class="muted small center pad">Nicht im Lager für dieses Gerät: ${missing.map(esc).join(', ')}</p>` : ''}`,
  });
  root.querySelectorAll('[data-jump]').forEach((a) => (a.onclick = (e) => {
    e.preventDefault(); haptic('light');
    const t = root.querySelector(`#dev-${a.dataset.jump}`); if (t) window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 110, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }));
  return root;
}

// =====================================================================
//  PREISE NACHTRAGEN: ein Teil nach dem anderen, Einkaufspreis eintippen → weiter
// =====================================================================
const PRICE_SKIP = 'ss-price-skip';
async function viewPrices() {
  invalidate('materials');
  const mats = await getMats();
  let skipped = new Set(); try { skipped = new Set(JSON.parse(sessionStorage.getItem(PRICE_SKIP) || '[]')); } catch { /* egal */ }
  // Teile mit Bestand zuerst (die zählen für den Lagerwert), dann nach Artikelnummer
  const todo = mats.filter((m) => m.kind === 'part' && !(+m.purchase_price > 0))
    .sort((a, b) => ((+b.total > 0) - (+a.total > 0)) || ((a.number ?? 1e9) - (b.number ?? 1e9)));
  const queue = todo.filter((m) => !skipped.has(m.id)).concat(todo.filter((m) => skipped.has(m.id)));
  const start = queue.length; let done = 0; let idx = 0;
  const root = screen({
    header: navbar({ left: backBtn(), title: 'Preise nachtragen' }),
    body: `<div class="pr-head"><b data-pr="left"></b><span class="pr-bar"><i data-pr="bar"></i></span></div>
      <div class="pr-stage" data-pr="stage"></div>`,
  });
  const stage = root.querySelector('[data-pr=stage]');
  const head = () => {
    const left = queue.length - idx;
    root.querySelector('[data-pr=left]').textContent = left ? `Noch ${fmtQty(left)} ${left === 1 ? 'Teil' : 'Teile'} ohne Einkaufspreis` : 'Fertig';
    root.querySelector('[data-pr=bar]').style.width = `${start ? Math.round(((idx) / start) * 100) : 100}%`;
  };
  const card = (m) => {
    const hasVk = +m.sale_price > 0;
    return `<div class="pr-card">
        <div class="pr-img">${thumb(m, 'md')}</div>
        <div class="pr-name"><span class="nr">${m.number ?? ''}</span> ${esc(m.name)}</div>
        <div class="pr-meta">Bestand ${fmtQty(Math.max(0, +m.total || 0))}${hasVk ? ` · VK ${fmtEUR(m.sale_price)}` : ''}${m.supplier ? ` · ${esc(m.supplier)}` : ''}</div>
        <label class="pr-input"><span>Einkaufspreis</span><input type="number" inputmode="decimal" step="0.01" min="0" placeholder="0,00" data-pr="ek" enterkeyhint="next"><em>€</em></label>
        <label class="pr-vk ${hasVk ? 'keep' : ''}" data-pr="vkrow" hidden>
          <span data-pr="vktext"></span>${hasVk ? '' : '<input type="checkbox" class="switch" data-pr="vk" checked>'}
        </label>
        <div class="pr-btns"><button class="btn-gray" data-pr="skip">Überspringen</button><button class="btn-filled" data-pr="save" disabled>Speichern ${icon('chevR', 18)}</button></div>
      </div>`;
  };
  const show = (dir = 1) => {
    head();
    const m = queue[idx];
    if (!m) {
      const open = queue.length - done;                  // übersprungen und noch ohne Preis
      stage.innerHTML = `<div class="pr-done">${icon('check', 46, 2.4)}<h2>${open ? 'Runde geschafft' : 'Alle Preise eingetragen'}</h2>
        <p>${done ? `${fmtQty(done)} ${done === 1 ? 'Preis' : 'Preise'} eingetragen` : 'Kein Preis eingetragen'}${open ? ` · ${fmtQty(open)} übersprungen` : ''}</p>
        ${open ? '<button class="btn-gray" data-pr="again">Übersprungene nochmal</button>' : ''}<a class="btn-filled" href="#/fav">Zur Übersicht</a></div>`;
      if (done) { confetti(); haptic('success'); }
      try { sessionStorage.removeItem(PRICE_SKIP); } catch { /* egal */ }
      stage.querySelector('[data-pr=again]')?.addEventListener('click', () => viewPrices());
      return;
    }
    const old = stage.firstElementChild;
    const wrap = document.createElement('div'); wrap.className = 'pr-slide'; wrap.innerHTML = card(m);
    stage.appendChild(wrap);
    if (old && !reduceMotion.matches) {
      old.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-40 * dir}%) scale(.94)`, opacity: 0 }], { duration: 320, easing: MENU_EASE }).onfinish = () => old.remove();
      wrap.animate([{ transform: `translateX(${50 * dir}%) scale(.96)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: MENU_EASE });
    } else old?.remove();
    const ek = wrap.querySelector('[data-pr=ek]'); const save = wrap.querySelector('[data-pr=save]');
    const vkRow = wrap.querySelector('[data-pr=vkrow]'); const vkText = wrap.querySelector('[data-pr=vktext]'); const vkOn = wrap.querySelector('[data-pr=vk]');
    const upd = () => {
      const v = +ek.value; save.disabled = !(v > 0);
      vkRow.hidden = !(v > 0);
      if (!(v > 0)) return;
      if (+m.sale_price > 0) { const d = +m.sale_price - v; vkText.innerHTML = `VK bleibt ${fmtEUR(m.sale_price)} · <b class="${d < 0 ? 'red' : 'green'}-text">Marge ${fmtEUR(d)}</b>`; }
      else vkText.innerHTML = `Verkaufspreis ${fmtEUR(suggestSale(v))} setzen <small>(+${markupCfg().pct} %)</small>`;
    };
    ek.addEventListener('input', upd);
    ek.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !save.disabled) { e.preventDefault(); save.click(); } });
    wrap.querySelector('[data-pr=skip]').onclick = () => {
      skipped.add(m.id); try { sessionStorage.setItem(PRICE_SKIP, JSON.stringify([...skipped])); } catch { /* egal */ }
      idx++; haptic('light'); show(1);
    };
    save.onclick = async () => {
      const v = Math.round(+ek.value * 100) / 100; if (!(v > 0)) return;
      const data = { purchase_price: v };
      if (!(+m.sale_price > 0) && vkOn?.checked) data.sale_price = suggestSale(v);
      save.disabled = true;
      try {
        await db.saveMaterial(m.id, data); invalidate('materials');
        done++; idx++; haptic('success'); show(1);
      } catch (e) { save.disabled = false; errToast(e); }
    };
    setTimeout(() => { try { ek.focus({ preventScroll: true }); } catch { /* egal */ } }, reduceMotion.matches ? 0 : 200);
  };
  show();
  return root;
}

async function viewStats() {
  let days = +sessionStorage.getItem('ss-stats-days') || 30;
  if (!STATS_RANGES.some(([d]) => d === days)) days = 30;
  let mats = []; let movs = []; let first = null;
  try { [mats, movs, first] = await Promise.all([getMats(), db.listMovementsSince(days), db.firstMovementDate()]); } catch (e) { errToast(e); }
  const st = computeStats(mats, movs, days, first);
  const maxTop = st.top[0]?.qty || 1;
  const perWeek = (v) => (v >= 10 ? fmtQty(Math.round(v)) : fmtQty(Math.round(v * 10) / 10));
  const more = (list, n) => (list.length > n ? `<p class="muted small center stats-more">… und ${list.length - n} weitere</p>` : '');
  const matLine = (m) => `${thumb(m, 'sm')}<span class="r-label"><span class="r-title"><span class="nr">${m.number}</span> ${esc(m.name)}</span>`;

  const root = screen({
    header: navbar({ left: backBtn(), title: 'Auswertung' }),
    cls: 'stats-screen',
    body: `
      <div class="segment">${STATS_RANGES.map(([d, l]) => `<button data-days="${d}" class="${d === days ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${st.short ? `<p class="stats-hint">${icon('info', 16)} Buchungen gibt es erst seit dem ${new Date(st.firstMs).toLocaleDateString('de-DE')}. Der Wochenschnitt rechnet nur mit dieser Zeit.</p>` : ''}

      <section class="stats-kpis">
        <div class="stats-kpi"><span class="k-val red-text">${fmtQty(st.outQty)}</span><span class="k-label">Entnommen</span><span class="k-sub">${st.outCount} Buchungen</span></div>
        <div class="stats-kpi"><span class="k-val green-text">${fmtQty(st.inQty)}</span><span class="k-label">Dazu gebucht</span><span class="k-sub">ohne Anfangsbestand</span></div>
        <div class="stats-kpi"><span class="k-val ek">${st.outValue ? fmtEUR(st.outValue) : '–'}</span><span class="k-label">Wert</span><span class="k-sub">der Entnahmen (Einkaufspreis)</span></div>
      </section>

      <h2 class="dash-sec">Verbrauchs-Kalender</h2>
      ${heatmap(movs, days, mats)}

      <button class="btn-tinted full mt recap-open" data-a="recap">${icon('chart', 18)} Wochenrückblick ansehen</button>

      <h2 class="dash-sec">Meistverbraucht</h2>
      ${st.top.length ? `<section class="ios-list">
        ${st.top.slice(0, 10).map((t, i) => `<a class="ios-row recent stats-row" href="#/m/${t.m.id}" data-id="${t.m.id}">
            <span class="stats-rank">${i + 1}</span>${matLine(t.m)}
              <span class="stats-bar"><i style="width:${Math.max(4, Math.round((t.qty / maxTop) * 100))}%"></i></span>
              <small>Ø ${perWeek(t.perWeek)} pro Woche · Bestand ${fmtQty(t.m.total)}</small></span>
            <span class="r-qty">${fmtQty(t.qty)}</span>
          </a>`).join('')}
      </section>${more(st.top, 10)}` : `<p class="stats-empty">Im gewählten Zeitraum wurde nichts entnommen.</p>`}

      ${st.suggest.length ? `<h2 class="dash-sec">Meldebestand-Vorschläge</h2>
      <p class="stats-note">Vorschlag = Verbrauch von ${REACH_WEEKS} Wochen. So bleibt Zeit zum Nachbestellen.</p>
      <section class="ios-list">
        ${st.suggest.slice(0, 8).map((t) => `<div class="ios-row recent stats-row">
            ${matLine(t.m)}<small>Ø ${perWeek(t.perWeek)} pro Woche · Meldebestand ${fmtQty(t.cur)} → <b>${fmtQty(t.sug)}</b></small></span>
            <button class="chip" data-apply="${t.m.id}" data-sug="${t.sug}">Übernehmen</button>
          </div>`).join('')}
      </section>${more(st.suggest, 8)}` : ''}

      <h2 class="dash-sec">Ladenhüter</h2>
      ${st.slow.length ? `<p class="stats-note">Auf Lager, aber in diesem Zeitraum nie entnommen (${st.slow.length} Teile${st.slow.some((x) => x.value) ? `, gebundener Wert ${fmtEUR(st.slow.reduce((s, x) => s + x.value, 0))}` : ''}).</p>
      <section class="ios-list">
        ${st.slow.slice(0, 12).map((x) => `<a class="ios-row recent stats-row" href="#/m/${x.m.id}" data-id="${x.m.id}">
            ${matLine(x.m)}<small>${locLabel(x.m)}${x.value ? ` · Wert <span class="ek">${fmtEUR(x.value)}</span>` : ''}</small></span>
            <span class="r-qty">${fmtQty(x.m.total)}</span>
          </a>`).join('')}
      </section>${more(st.slow, 12)}` : `<p class="stats-empty">${st.short ? 'Dafür reichen die Daten noch nicht: Ladenhüter zeigen sich erst, wenn Teile länger als der gewählte Zeitraum im Lager sind.' : 'Keine Ladenhüter in diesem Zeitraum.'}</p>`}

      ${st.byNote.length ? `<h2 class="dash-sec">Entnahmen nach Notiz</h2>
      <section class="ios-list">
        ${st.byNote.slice(0, 10).map((n) => `<div class="ios-row stats-row">
            <span class="r-ic tone-gray">${icon('tag', 18, 2.1)}</span>
            <span class="r-label"><span class="r-title">${esc(n.note)}</span><small>${n.count} ${n.count === 1 ? 'Entnahme' : 'Entnahmen'} · zuletzt ${fmtDate(n.last)}</small></span>
            <span class="r-qty">${fmtQty(n.qty)}</span>
          </div>`).join('')}
      </section>${more(st.byNote, 10)}` : ''}`,
  });
  root.querySelectorAll('[data-days]').forEach((b) => (b.onclick = () => { sessionStorage.setItem('ss-stats-days', b.dataset.days); viewStats(); }));
  root.querySelector('[data-a=recap]')?.addEventListener('click', () => showRecap(mats, isLow, recapThumb).catch(errToast));
  setupHeatmap(root, movs, mats);
  root.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      await db.saveMaterial(b.dataset.apply, { min_stock: +b.dataset.sug });
      invalidate('materials');
      successHUD('Meldebestand gesetzt', `auf ${fmtQty(b.dataset.sug)}`);
      viewStats();
    } catch (e) { b.disabled = false; errToast(e); }
  }));
}

// =====================================================================
//  DOPPELTE TEILE FINDEN & ZUSAMMENFÜHREN
// =====================================================================
const DUPES_IGNORE = 'ss-dupes-ignore';
const STOP = new Set(['für', 'fuer', 'und', 'mit', 'the', 'for', 'and', 'der', 'die', 'das', 'neu', 'new', 'original', 'ersatz', 'ersatzteil']);
function nameTokens(name) {
  const t = String(name || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/(\d)\s*(mm|gb|tb|mah|zoll|")/g, '$1$2')          // „40 mm“ = „40mm“
    .split(/[^a-z0-9+]+/).filter((w) => w && !STOP.has(w));
  return [...new Set(t)];
}
/** Paare ähnlicher Teile: gleicher Barcode oder fast gleiche Wörter – Zahlen (Modell, Größe) müssen exakt passen */
function findDupes(mats) {
  const ign = new Set((() => { try { return JSON.parse(localStorage.getItem(DUPES_IGNORE) || '[]'); } catch { return []; } })());
  const info = mats.map((m) => { const tok = nameTokens(m.name); return { m, tok: new Set(tok), nums: tok.filter((w) => /\d/.test(w)).sort().join(' ') }; });
  const pairs = [];
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const a = info[i]; const b = info[j];
      if (a.m.kind !== b.m.kind) continue;
      const key = [a.m.id, b.m.id].sort().join('|');
      if (ign.has(key)) continue;
      let score = 0; let why = '';
      if (a.m.barcode && b.m.barcode && a.m.barcode.trim().toLowerCase() === b.m.barcode.trim().toLowerCase()) { score = 1; why = 'Gleicher Barcode'; }
      else if (a.nums === b.nums && a.tok.size && b.tok.size) {
        let inter = 0; a.tok.forEach((w) => { if (b.tok.has(w)) inter += 1; });
        const jac = inter / (a.tok.size + b.tok.size - inter);
        if (jac >= 0.75) { score = jac; why = jac === 1 ? 'Gleiche Wörter' : 'Sehr ähnlicher Name'; }
      }
      if (score) pairs.push({ a: a.m, b: b.m, score, why, key });
    }
  }
  return pairs.sort((x, y) => y.score - x.score || x.a.number - y.a.number);
}

async function viewDupes() {
  const mats = await getMats();
  const pairs = findDupes(mats);
  const side = (m, p, keep) => `<label class="dupe-side ${keep ? 'keep' : ''}">
      <input type="radio" name="k-${p.key}" value="${m.id}" ${keep ? 'checked' : ''}>
      ${thumb(m, 'sm')}
      <span class="r-label"><span class="r-title"><span class="nr">${m.number}</span> ${esc(m.name)}</span>
        <small>Bestand ${fmtQty(m.total)} · ${esc(locLabel(m) || 'kein Lagerort')}${m.barcode ? ` · ${esc(m.barcode)}` : ''}</small></span>
      <span class="dupe-badge">behalten</span>
    </label>`;
  const root = screen({
    header: navbar({ left: backBtn(), title: 'Doppelte Teile' }),
    cls: 'dupes-screen',
    body: pairs.length ? `
      <p class="stats-note">${pairs.length} mögliche ${pairs.length === 1 ? 'Doppelung' : 'Doppelungen'}. Wähle das Teil, das bleiben soll – Bestand, Historie, Bilder und Aufgaben des anderen wandern dazu.</p>
      ${pairs.map((p) => {
        const keepA = p.a.total >= p.b.total;            // Vorschlag: das mit mehr Bestand behalten
        return `<section class="dupe-card" data-key="${p.key}">
          <div class="dupe-why">${icon('copy', 15, 2.2)} ${p.why}${p.score < 1 ? ` · ${Math.round(p.score * 100)} % gleich` : ''}</div>
          ${side(p.a, p, keepA)}${side(p.b, p, !keepA)}
          <div class="dupe-actions">
            <button class="btn-gray" data-ignore="${p.key}">Kein Duplikat</button>
            <button class="btn-filled" data-merge="${p.key}">${icon('swap', 18)} Zusammenführen</button>
          </div>
        </section>`;
      }).join('')}` : `<div class="dupes-empty">${icon('check', 46, 2.2)}<b>Keine Doppelungen gefunden</b><span>Alle ${mats.length} Teile haben eindeutige Namen.</span></div>`,
  });
  const removeCard = (card) => {
    card.style.height = `${card.offsetHeight}px`;
    requestAnimationFrame(() => card.classList.add('gone'));
    setTimeout(() => { card.remove(); if (!root.querySelector('.dupe-card')) viewDupes(); }, 420);
  };
  root.querySelectorAll('.dupe-side input').forEach((r) => (r.onchange = () => {
    r.closest('.dupe-card').querySelectorAll('.dupe-side').forEach((l) => l.classList.toggle('keep', l.querySelector('input').checked));
    haptic('light');
  }));
  root.querySelectorAll('[data-ignore]').forEach((b) => (b.onclick = () => {
    try { const a = JSON.parse(localStorage.getItem(DUPES_IGNORE) || '[]'); a.push(b.dataset.ignore); localStorage.setItem(DUPES_IGNORE, JSON.stringify(a)); } catch { /* egal */ }
    removeCard(b.closest('.dupe-card'));
  }));
  root.querySelectorAll('[data-merge]').forEach((b) => (b.onclick = async () => {
    const card = b.closest('.dupe-card');
    const p = pairs.find((x) => x.key === b.dataset.merge);
    const keepId = card.querySelector('input:checked').value;
    const keep = keepId === p.a.id ? p.a : p.b; const drop = keepId === p.a.id ? p.b : p.a;
    const ok = await confirmBox({
      title: 'Zusammenführen?',
      message: `„${drop.number}: ${drop.name}“ geht in „${keep.number}: ${keep.name}“ auf. Bestand wird addiert (${fmtQty(keep.total)} + ${fmtQty(drop.total)} = ${fmtQty(keep.total + drop.total)}), Historie, Bilder und Aufgaben wandern mit. Danach wird Nr. ${drop.number} gelöscht.`,
      okText: 'Zusammenführen',
    });
    if (!ok) return;
    b.disabled = true;
    try {
      const total = await db.mergeMaterials(keep.id, drop.id);
      invalidate();
      successHUD('Zusammengeführt', `Nr. ${keep.number} · Bestand ${fmtQty(total)}`);
      removeCard(card);
    } catch (e) { b.disabled = false; errToast(e); }
  }));
}

// =====================================================================
//  FORMULAR: Ersatzteil / Werkzeug anlegen & bearbeiten
// =====================================================================
/** Eingabe „Passt für“: Geräte als Chips, Vorschläge aus allen bisher verwendeten Geräten */
function setupFitsInput(root, st) {
  const box = root.querySelector('[data-fits]'); const sugBox = root.querySelector('[data-fit-sugs]');
  if (!box) return;
  const known = () => {
    const all = new Map();
    (cache.materials || []).forEach((m) => (m.fits || []).forEach((f) => all.set(f.toLowerCase(), f)));
    return [...all.values()].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  };
  const has = (f) => st.fits.some((x) => x.toLowerCase() === f.toLowerCase());
  const add = (f) => { f = f.trim().replace(/\s+/g, ' '); if (f && !has(f)) { st.fits.push(f); haptic('light'); } render(true); };
  const render = (focus = false) => {
    box.innerHTML = `${st.fits.map((f, i) => `<span class="chip fit">${esc(f)}<button type="button" data-rm="${i}" aria-label="${esc(f)} entfernen">${icon('x', 13, 2.6)}</button></span>`).join('')}
      <input data-fit-in placeholder="${st.fits.length ? 'weiteres Gerät' : 'z. B. iPhone 13'}" enterkeyhint="done" autocomplete="off" autocapitalize="words">`;
    const inp = box.querySelector('input');
    box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { st.fits.splice(+b.dataset.rm, 1); render(true); }));
    const sugs = () => {
      const t = inp.value.trim().toLowerCase();
      const list = known().filter((f) => !has(f) && (!t || f.toLowerCase().includes(t))).slice(0, t ? 6 : 8);
      sugBox.innerHTML = list.map((f) => `<button type="button" class="chip" data-sug="${esc(f)}">${icon('plus', 12, 2.6)} ${esc(f)}</button>`).join('');
      sugBox.querySelectorAll('[data-sug]').forEach((b) => (b.onclick = () => add(b.dataset.sug)));
    };
    inp.addEventListener('input', () => { if (/[,;]/.test(inp.value)) { inp.value.split(/[,;]/).forEach((x, i, arr) => { if (i < arr.length - 1) add(x); }); } else sugs(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (inp.value.trim()) add(inp.value); }
      else if (e.key === 'Backspace' && !inp.value && st.fits.length) { st.fits.pop(); render(true); }
    });
    inp.addEventListener('blur', () => { if (inp.value.trim()) setTimeout(() => { if (document.activeElement?.closest?.('[data-fit-sugs]')) return; if (inp.isConnected && inp.value.trim()) add(inp.value); }, 150); });
    sugs();
    if (focus) inp.focus();
  };
  box.addEventListener('click', (e) => { if (e.target === box) box.querySelector('input')?.focus(); });
  render();
}

async function viewForm(id, q) {
  const m = id ? await db.getMaterial(id) : null;
  const kind = m?.kind || q.kind || 'part';
  const [locs, groups, allDefs] = await Promise.all([getLocs(), getGroups(), getFields()]);
  const showAll = localStorage.getItem('wl-form-all') === '1';
  const nd = newDefaults();
  const st = {
    location_id: m ? m.default_location_id : ((nd.loc && locs.some((l) => l.id === nd.loc) ? nd.loc : '') || localStorage.getItem('wl-last-loc') || locs[0]?.id || null),
    group_id: m ? m.group_id : (q.group || (kind === 'tool' ? groups.find((g) => g.name === 'Werkzeug')?.id : null) || (kind === 'part' && nd.group && groups.some((g) => g.id === nd.group) ? nd.group : null) || null),
    images: [],
    defs: fieldsFor(allDefs, kind),
    defVals: {},
    custom: [],
    fits: [...(m?.fits || []), ...(q.fit ? [q.fit] : [])],
  };
  if (st.location_id && !locs.some((l) => l.id === st.location_id)) st.location_id = null;
  {
    const cf = m?.custom_fields || {};
    const names = new Set(st.defs.map((d) => d.name));
    st.defs.forEach((d) => { st.defVals[d.name] = d.type === 'bool' ? (cf[d.name] === true || cf[d.name] === 'true' || cf[d.name] === 'Ja') : (cf[d.name] ?? ''); });
    st.custom = Object.entries(cf).filter(([k]) => !names.has(k) && k !== SHOP_KEY).map(([k, v]) => [k, v == null ? '' : String(v)]);
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
      <label class="field no-line"><small>Meldebestand</small><input name="min_stock" type="number" inputmode="decimal" min="0" step="any" placeholder="Meldebestand" value="${m && +m.min_stock ? v('min_stock') : (!m && kind === 'part' && +nd.min > 0 ? esc(nd.min) : '')}"></label>
      <label class="field"><small>Maximalbestand</small><input name="max_stock" type="number" inputmode="decimal" min="0" step="any" placeholder="Maximalbestand" value="${v('max_stock')}"></label>
      <div class="field fits-field"><small>Passt für</small>
        <div class="fits-box" data-fits></div>
        <div class="fit-sugs" data-fit-sugs></div>
      </div>
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
        <label class="field"><small>Shop-Link</small><input name="shop_url" type="text" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Link zum Artikel beim Lieferanten" value="${esc(m?.custom_fields?.[SHOP_KEY] || '')}"></label>
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
  setupFitsInput(root, st);
  setupSaleSuggest(root);
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
      fits: [...st.fits, ...(root.querySelector('[data-fits] input')?.value.trim() ? [root.querySelector('[data-fits] input').value.trim()] : [])],
      custom_fields: (() => {
        const out = {};
        st.defs.forEach((d) => {
          let v = st.defVals[d.name];
          if (d.type === 'bool') { if (v) out[d.name] = true; return; }
          v = (v ?? '').toString().trim();
          if (d.type === 'number') v = v.replace(',', '.');
          if (v !== '') out[d.name] = v;
        });
        st.custom.filter(([k]) => k.trim() && k.trim() !== SHOP_KEY).forEach(([k, val]) => { out[k.trim()] = val; });
        const shop = normUrl(fd.shop_url);
        if (shop) out[SHOP_KEY] = shop;
        return out;
      })(),
    };
    if (fd.number) data.number = fd.number;
    saving = true; root.querySelectorAll('[data-act=save], [type=submit]').forEach((b) => (b.disabled = true));
    const sb = root.querySelector('button[type=submit]');
    const sbVisible = sb && (() => { const r = sb.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })();
    if (sbVisible && !reduceMotion.matches) sb.classList.add('save-busy');
    try {
      const nid = await db.saveMaterial(id, data, { images: st.images, initial: id ? null : { location_id: st.location_id, qty: num(fd.qty) }, onWarning: (w) => setTimeout(() => toast(w, 'err', { duration: 6000 }), 1700) });
      if (st.location_id) localStorage.setItem('wl-last-loc', st.location_id);
      invalidate();
      if (sbVisible && !reduceMotion.matches) {
        // Knopf zieht sich zum Kreis zusammen, ein grüner Haken wird gemalt – dann geht's weiter
        sb.innerHTML = `<svg class="save-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4 4L18.5 8"/></svg><span class="sr-only">${id ? 'Gespeichert' : 'Angelegt'}</span>`;
        sb.classList.remove('save-busy'); sb.classList.add('save-done'); haptic('success'); sfx.ping?.();
        await new Promise((r) => setTimeout(r, 720));
        if (!id) toast(`${kind === 'tool' ? 'Werkzeug' : 'Ersatzteil'} angelegt`, 'ok');
      } else successHUD(id ? 'Gespeichert' : `${kind === 'tool' ? 'Werkzeug' : 'Ersatzteil'} angelegt`);
      sessionStorage.setItem('wl-mtab', 'infos');
      go(`/m/${nid}`, true);
    } catch (e) { errToast(e); saving = false; sb?.classList.remove('save-busy'); root.querySelectorAll('[data-act=save], [type=submit]').forEach((b) => (b.disabled = false)); }
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

// Regal-Ansicht: jeder Lagerort als Fach mit Füllstand und einem Kästchen pro Teil (grün/orange/rot/leer)
const SHELF_MAX_BOXES = 48;
function shelfStats(loc, mats) {
  const items = [];
  mats.forEach((m) => {
    const l = m.locations.find((x) => x.location_id === loc.id);
    if (!l) return;
    const min = +m.min_stock || 0;
    const state = l.qty <= 0 ? 'empty' : isLow(m) ? 'low' : (min && m.total <= min * 1.5) ? 'warn' : 'ok';
    items.push({ m, qty: l.qty, state });
  });
  const order = { low: 0, warn: 1, ok: 2, empty: 3 };
  items.sort((a, b) => order[a.state] - order[b.state] || a.m.number - b.m.number);
  const n = (st) => items.filter((x) => x.state === st).length;
  const units = items.reduce((a, x) => a + Math.max(0, x.qty), 0);
  const value = items.reduce((a, x) => a + Math.max(0, x.qty) * (+x.m.purchase_price || 0), 0);
  return { items, units, value, ok: n('ok'), warn: n('warn'), low: n('low'), empty: n('empty') };
}
function shelfCard(l, st, i) {
  const total = st.items.length || 1;
  const pct = (k) => ((st[k] / total) * 100).toFixed(1);
  const boxes = st.items.slice(0, SHELF_MAX_BOXES);
  return `<button class="shelf-card" data-l="${l.id}" style="--i:${i}">
      <div class="shelf-head">
        <span class="shelf-ic">${icon('shelf', 22, 2)}</span>
        <span class="shelf-title"><b>${esc(l.name)}</b><small>${st.items.length} Teile · ${fmtQty(st.units)} Stück${st.value ? ` · ${fmtEUR(st.value)}` : ''}${l.barcode ? ` · ${esc(l.barcode)}` : ''}</small></span>
        ${st.low ? `<span class="shelf-alert">${st.low}</span>` : ''}
        ${icon('chevR', 18)}
      </div>
      ${st.items.length ? `
      <div class="shelf-bar" aria-label="${st.ok} genug, ${st.warn} bald, ${st.low} nachbestellen, ${st.empty} leer">
        <i class="s-ok" style="--w:${pct('ok')}%"></i><i class="s-warn" style="--w:${pct('warn')}%"></i><i class="s-low" style="--w:${pct('low')}%"></i><i class="s-empty" style="--w:${pct('empty')}%"></i>
      </div>
      <div class="shelf-boxes">${boxes.map((x, k) => `<span class="sb s-${x.state}" style="--k:${k}" title="${esc(`${x.m.number}: ${x.m.name} (${fmtQty(x.qty)})`)}"></span>`).join('')}${st.items.length > boxes.length ? `<span class="sb-more">+${st.items.length - boxes.length}</span>` : ''}</div>`
        : '<div class="shelf-empty">Leeres Fach</div>'}
    </button>`;
}

/**
 * 3D-Regal: die Fächer liegen wie auf einer Walze – beim Scrollen kippen sie oben nach hinten und unten nach vorn,
 * das Fach in der Bildschirmmitte steht gerade. Ändert nur eine CSS-Variable pro Karte (läuft auf der GPU).
 */
function setupShelf3D(root) {
  const list = root.querySelector('.shelf-list'); if (!list || reduceMotion.matches) return;
  list.classList.add('shelf-3d');
  const cards = [...list.querySelectorAll('.shelf-card')];
  let raf = 0;
  const tick = () => {
    raf = 0;
    if (!list.isConnected) { removeEventListener('scroll', onScroll); return; }
    const mid = innerHeight * 0.52;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (r.bottom < -100 || r.top > innerHeight + 100) continue;
      const d = Math.max(-1, Math.min(1, (r.top + r.height / 2 - mid) / (innerHeight * 0.75)));
      c.style.setProperty('--rx', `${(-d * 16).toFixed(2)}deg`);
      c.style.setProperty('--tz', `${(-Math.abs(d) * 40).toFixed(1)}px`);
    }
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  tick();
}

async function viewLocations() {
  const [locs, mats] = await Promise.all([getLocs(), getMats()]);
  const stats = new Map(locs.map((l) => [l.id, shelfStats(l, mats)]));
  const root = screen({
    header: navbar({ left: backBtn(), right: btn('map', 'map', 'Grundriss') + btn('refresh', 'refresh', 'Aktualisieren') }),
    cls: 'large-title-screen shelf-screen',
    body: `<h1 class="large-title">Lagerorte</h1>
      ${locs.length ? `<div class="shelf-legend"><span class="s-ok">genug</span><span class="s-warn">bald nachbestellen</span><span class="s-low">nachbestellen</span><span class="s-empty">leer</span></div>
      <div class="shelf-list">${locs.map((l, i) => shelfCard(l, stats.get(l.id), i)).join('')}</div>`
        : empty('shelf', 'Noch keine Lagerorte')}`,
    footer: `<footer class="bottom-bar"><button class="icon-btn blue" data-act="add" aria-label="Neuer Lagerort">${icon('plusCircle', 34, 1.8)}</button></footer>`,
  });
  setupShelf3D(root);
  on(root, 'map', () => go('/map'));
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
// Zählstand dauerhaft auf dem Gerät (localStorage) – übersteht das Schließen der App.
// Wird beim Buchen/Abschließen/Verwerfen gelöscht, alte Zählungen verfallen nach 30 Tagen.
const INV_KEY = (id) => `ss-inv-${id}`;
const INV_MAX_AGE = 30 * 864e5;
function invLoad(id) {
  try {
    const raw = localStorage.getItem(INV_KEY(id));
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.counts) && Date.now() - (d.at || 0) < INV_MAX_AGE) return d;
      localStorage.removeItem(INV_KEY(id));
    }
    const old = sessionStorage.getItem(`wl-inv-${id}`);          // Stand aus der alten Version übernehmen
    if (old) return { at: Date.now(), counts: JSON.parse(old) };
  } catch { /* egal */ }
  return null;
}
function invSave(id, counts) {
  try {
    const list = [...counts].filter(([, v]) => v !== '');
    if (list.length) localStorage.setItem(INV_KEY(id), JSON.stringify({ at: Date.now(), counts: list }));
    else localStorage.removeItem(INV_KEY(id));
    sessionStorage.removeItem(`wl-inv-${id}`);
  } catch { /* egal */ }
}
function invClear(id) { try { localStorage.removeItem(INV_KEY(id)); sessionStorage.removeItem(`wl-inv-${id}`); } catch { /* egal */ } }
// Letzter Abschluss pro Lagerort (wann, wie viel gezählt, wie viel korrigiert) – bleibt 30 Tage sichtbar
const INV_DONE = (id) => `ss-inv-done-${id}`;
function invDoneLoad(id) {
  try { const d = JSON.parse(localStorage.getItem(INV_DONE(id)) || 'null'); return d && Date.now() - d.at < INV_MAX_AGE ? d : null; } catch { return null; }
}
function invDoneSave(id, info) { try { localStorage.setItem(INV_DONE(id), JSON.stringify({ at: Date.now(), ...info })); } catch { /* egal */ } }
const invWhen = (at) => { const d = new Date(at); return new Date().toDateString() === d.toDateString() ? `heute ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : `am ${d.toLocaleDateString('de-DE')}`; };

async function viewInventory(q) {
  const locs = await getLocs();
  if (!q.loc) {
    const root = screen({
      header: navbar({ left: backBtn(), title: 'Material Inventur' }),
      body: `<p class="hint">Lagerort wählen, dann den tatsächlichen Bestand zählen und eintragen. Nur geänderte Mengen werden gebucht.</p>
        <div class="plain-list">${locs.map((l) => { const st = invLoad(l.id); const dn = !st && invDoneLoad(l.id); return `<a class="plain-row" href="#/inventory?loc=${l.id}"><span>${icon('shelf', 22)} ${esc(l.name)}</span><small class="muted">${st ? `<span class="inv-badge">begonnen · ${st.counts.length} gezählt</span> ` : dn ? `<span class="inv-badge done">${icon('check', 12, 3)} gezählt ${invWhen(dn.at).replace(/ \d\d:\d\d$/, '')}</span> ` : ''}${l.count} Teile ${icon('chevR', 16)}</small></a>`; }).join('')
          || empty('shelf', 'Noch keine Lagerorte', '<a class="btn-tinted" href="#/locations">Lagerort anlegen</a>')}</div>`,
    });
    return root;
  }
  const loc = locs.find((l) => l.id === q.loc);
  if (!loc) return go('/inventory', true);
  const mats = await getMats();
  const rows = mats.filter((m) => m.locations.some((l) => l.location_id === loc.id));
  const soll = (m) => m.locations.find((l) => l.location_id === loc.id)?.qty ?? 0;
  const saved = invLoad(loc.id);
  let doneInfo = saved?.counts.length ? null : invDoneLoad(loc.id);   // „abgeschlossen“-Ansicht, bis neu gezählt wird
  const counts = new Map(saved?.counts || []);
  const persist = () => invSave(loc.id, counts);
  if (saved?.counts.length) {
    const when = new Date(saved.at); const today = new Date().toDateString() === when.toDateString();
    setTimeout(() => toast('Zählung fortgesetzt', 'ok', { sub: `${saved.counts.length} schon gezählt · ${today ? `heute ${when.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : when.toLocaleDateString('de-DE')}` }), 400);
  }

  const root = screen({
    header: navbar({ left: backBtn(), title: `<div class="two-line">Inventur<br><small>${esc(loc.name)}</small></div>`, right: btn('scan', 'scan', 'Scannen') }),
    body: `<div class="inv-progress inv-ring-card" aria-live="polite">
        <div class="inv-ring">
          <svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="ig" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="ig1"/><stop offset="1" class="ig2"/></linearGradient></defs>
            <circle class="ir-track" cx="50" cy="50" r="42"/>
            <circle class="ir-fill" data-ip="bar" cx="50" cy="50" r="42" stroke="url(#ig)" style="stroke-dasharray:263.89;stroke-dashoffset:263.89"/></svg>
          <span class="ir-val" data-ip="pct">0 %</span>
        </div>
        <div class="ir-text"><b data-ip="text">0 von 0 gezählt</b><small data-ip="sub">Ist-Menge eintragen oder scannen</small></div>
      </div>
      <label class="search-field">${icon('search', 20)}<input type="search" id="iq" placeholder="Material suchen"></label>
      <div id="irows" class="inv-list mt"></div>
      <button class="btn-tinted full mt" data-act="add-mat">${icon('plus', 18)} Material zu diesem Lagerort hinzufügen</button>
      <button class="btn-plain danger-text full" data-act="discard" hidden>${icon('trash', 18)} Zählung verwerfen</button>`,
    footer: `<footer class="bottom-bar wide"><button class="btn-filled full" data-act="commit">Inventur buchen</button></footer>`,
  });
  const box = root.querySelector('#irows');
  let justCounted = null;                  // diese Zeile bekommt beim nächsten Aufbau das kurze Häkchen
  let wasComplete = false; let progressReady = false;   // Konfetti nur beim Übergang auf 100 %, nicht beim Öffnen
  const updateProgress = () => {
    const card0 = root.querySelector('.inv-progress');
    card0.classList.toggle('finished', !!doneInfo);
    if (doneInfo) {                                    // zuletzt abgeschlossene Inventur anzeigen
      const ip = (k) => root.querySelector(`[data-ip=${k}]`);
      ip('text').textContent = 'Inventur abgeschlossen';
      ip('pct').innerHTML = icon('check', 34, 3);
      ip('bar').style.strokeDashoffset = '0';
      ip('sub').textContent = `${invWhen(doneInfo.at)} · ${fmtQty(doneInfo.counted)} gezählt · ${doneInfo.changes ? `${fmtQty(doneInfo.changes)} ${doneInfo.changes === 1 ? 'Bestand' : 'Bestände'} korrigiert` : 'alles stimmte'}`;
      card0.classList.add('complete'); card0.hidden = !rows.length; wasComplete = true; progressReady = true;
      return;
    }
    const done = rows.filter((m) => (counts.get(m.id) ?? '') !== '').length;
    const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
    const ip = (k) => root.querySelector(`[data-ip=${k}]`);
    ip('text').textContent = `${done} von ${rows.length} gezählt`;
    ip('pct').textContent = `${pct} %`;
    ip('bar').style.strokeDashoffset = (263.89 * (1 - pct / 100)).toFixed(2);
    const complete = !!rows.length && done === rows.length;
    ip('sub').textContent = complete ? 'Alles gezählt – jetzt unten buchen' : `Noch ${rows.length - done} ${rows.length - done === 1 ? 'Teil' : 'Teile'} offen`;
    const card = root.querySelector('.inv-progress');
    if (complete && !wasComplete && progressReady) { confetti(); haptic('success'); card.classList.remove('done-pop'); void card.offsetWidth; card.classList.add('done-pop'); }
    wasComplete = complete; progressReady = true;
    card.classList.toggle('complete', complete);
    card.hidden = !rows.length;
  };
  const updateCommit = () => {
    const n = [...counts].filter(([mid, v]) => v !== '' && +v !== soll(rows.find((m) => m.id === mid) || { locations: [] })).length;
    const counted = [...counts].filter(([, v]) => v !== '').length;
    const b = root.querySelector('[data-act=commit]');
    // Alles gezählt und alles stimmt → Zählung trotzdem abschließen können
    const all = rows.length && rows.every((m) => (counts.get(m.id) ?? '') !== '');
    b.textContent = n ? `Inventur buchen (${n} Änderung${n > 1 ? 'en' : ''})` : counted ? (all ? 'Zählung abschließen – alles stimmt' : 'Zählung abschließen (nichts zu buchen)') : doneInfo ? 'Abgeschlossen – zum Neuzählen Ist eintragen' : 'Keine Änderungen';
    b.disabled = !n && !counted;
    root.querySelector('[data-act=discard]').hidden = !counted;
  };
  const render = (term = '') => {
    const f = filterMats(rows, { q: term });
    box.innerHTML = f.map((m) => {
      const c = counts.get(m.id) ?? ''; const diff = c === '' ? null : +c - soll(m);
      return `<div class="inv-row ${c !== '' ? 'counted' : ''} ${justCounted === m.id ? 'just' : ''}" data-m="${m.id}"><span class="inv-thumb">${thumb(m, 'sm')}<span class="inv-ok">${icon('check', 12, 3.4)}</span></span>
        <div class="inv-main"><div class="mrow-title"><span class="nr">${m.number}:</span> ${esc(m.name)}</div><small class="muted">Soll: ${fmtQty(soll(m))}${diff ? ` · <b class="${diff > 0 ? 'green' : 'red'}-text">${diff > 0 ? '+' : ''}${fmtQty(diff)}</b>` : diff === 0 ? ' · <b class="green-text">✓</b>' : ''}</small></div>
        <input type="number" inputmode="decimal" min="0" step="any" placeholder="Ist" value="${esc(c)}"></div>`;
    }).join('') || '<p class="muted center pad">Keine Materialien an diesem Lagerort.</p>';
    box.querySelectorAll('.inv-row').forEach((r) => {
      const inp = r.querySelector('input');
      inp.onchange = () => {
        const was = counts.get(r.dataset.m) ?? '';
        if (doneInfo && inp.value !== '') { doneInfo = null; wasComplete = false; }   // neue Zählung beginnt
        counts.set(r.dataset.m, inp.value); persist();
        justCounted = was === '' && inp.value !== '' ? r.dataset.m : null;
        if (justCounted) haptic('light');
        render(root.querySelector('#iq').value);
        justCounted = null;
      };
    });
    updateCommit();
    updateProgress();
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
  on(root, 'discard', async () => {
    if (!await confirmBox({ title: 'Zählung verwerfen?', message: 'Alle eingetragenen Ist-Mengen dieses Lagerorts werden gelöscht. Gebucht wird nichts.', okText: 'Verwerfen', danger: true })) return;
    counts.clear(); invClear(loc.id); haptic('light'); render(root.querySelector('#iq').value);
  });
  on(root, 'add-mat', async () => {
    const v = await pickFrom({ title: 'Material hinzufügen', items: mats.filter((m) => !rows.includes(m)).map((m) => ({ value: m.id, label: `${m.number}: ${m.name}` })) });
    if (!v) return;
    const full = mats.find((x) => x.id === v); full.locations.push({ location_id: loc.id, name: loc.name, qty: 0 }); rows.push(full); focusRow(v);
  });
  on(root, 'commit', async (b) => {
    const changes = [...counts].filter(([mid, v]) => v !== '' && rows.some((m) => m.id === mid) && +v !== soll(rows.find((m) => m.id === mid)));
    if (!changes.length) {
      if (![...counts].some(([, v]) => v !== '')) return;
      invDoneSave(loc.id, { counted: [...counts].filter(([, v]) => v !== '').length, changes: 0 });
      invClear(loc.id); successHUD('Bestand stimmt', loc.name);
      if (rows.length && rows.every((m) => (counts.get(m.id) ?? '') !== '')) confetti();
      go('/inventory', true); return;
    }
    if (!await confirmBox({ title: 'Inventur buchen?', message: `${changes.length} Bestand/Bestände an „${loc.name}“ werden auf die gezählte Menge gesetzt.`, okText: 'Buchen' })) return;
    b.disabled = true;
    try {
      for (const [mid, v] of changes) await db.book({ material_id: mid, type: 'inventory', qty: +v, location_id: loc.id, note: 'Inventur' });
      invDoneSave(loc.id, { counted: [...counts].filter(([, v]) => v !== '').length, changes: changes.length });
      invClear(loc.id); invalidate(); successHUD('Inventur gebucht');
      if (rows.length && rows.every((m) => (counts.get(m.id) ?? '') !== '')) confetti();   // ganzer Lagerort gezählt
      go('/inventory', true);
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

const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };
async function viewSettings() {
  const flash = sessionStorage.getItem('ss-flash'); sessionStorage.removeItem('ss-flash');
  const user = await db.getUser();
  const [setLocs, setGroups, setMats] = await Promise.all([getLocs().catch(() => []), getGroups().catch(() => []), getMats().catch(() => [])]);
  const setChargeName = setMats.map(chargeKey).find(Boolean) || 'Chargennummer';
  const theme = localStorage.getItem('wl-theme') || '';
  const TONE = { info: 'blue', list: 'blue', wrench: 'indigo', cart: 'green', alert: 'red', shelf: 'teal', boxes: 'orange', tag: 'indigo', tally: 'primary', download: 'gray', upload: 'gray', refresh: 'red', logout: 'red' };
  const item = (ic, label, act, extra = '', cls = '', tone = '') => `<button class="set-row ${cls}" data-act="${act}"><i class="tone-${tone || TONE[ic] || 'primary'}">${icon(ic, 19)}</i><span>${label}</span>${extra || icon('chevR', 18)}</button>`;
  const root = screen({
    header: navbar({ left: backBtn(), title: 'Menü', cls: 'lt-nav' }),
    cls: 'settings-screen',
    body: `
      <h1 class="lt-collapse page-lt">Menü</h1>
      <div class="set-group">
        <div class="set-row static"><i class="tone-${db.isDemo ? 'orange' : 'green'}">${icon('database', 19)}</i><span>${db.isGuest ? 'Gastmodus (nur dieses Gerät)' : db.isDemo ? 'Demo-Modus (lokal)' : 'Supabase verbunden'}<small>${esc(user?.email || '')}</small></span></div>
      </div>
      <div class="set-group">
        ${item('refresh', 'Neu laden', 'reload', '', '', 'blue')}
        ${item('info', 'Lager Informationen', 'stock-info')}
        ${item('euro', 'Preise nachtragen', 'go:/prices', '', '', 'green')}
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
        ${item('copy', 'Doppelte Teile finden', 'go:/dupes')}
        ${item('clock', 'Scan-Verlauf', 'go:/scans', '', '', 'blue')}
        ${item('map', 'Werkstatt-Grundriss', 'go:/map', '', '', 'teal')}
        ${item('store', 'Thekenmodus<small>Teile & Preise für Kunden zeigen</small>', 'go:/counter', '', '', 'indigo')}
        ${db.isDemo ? '' : item('camera', 'Vorschaubilder erzeugen', 'thumbs', '', '', 'teal').replace('<span>Vorschaubilder erzeugen</span>', '<span>Vorschaubilder erzeugen<small>Kleine Bilder für schnellere Listen</small></span>')}
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
        <label class="set-row"><i class="tone-primary">${icon('layers', 19)}</i><span>Design<small>Plastisch: Tasten wirken eingedrückt</small></span>
          <select data-act-style><option value="neu" ${designStyle() === 'neu' ? 'selected' : ''}>Plastisch</option><option value="classic" ${designStyle() === 'classic' ? 'selected' : ''}>Klassisch</option></select></label>
        <label class="set-row"><i class="tone-green">${icon('euro', 19)}</i><span>Aufschlag Verkaufspreis<small>Vorschlag aus dem Einkaufspreis</small></span>
          <select data-act-markup>${[20, 25, 30, 40, 50, 60, 75, 100, 150].concat([markupCfg().pct]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((v) => `<option value="${v}" ${+markupCfg().pct === v ? 'selected' : ''}>+${v} %</option>`).join('')}</select></label>
        <label class="set-row"><i class="tone-green">${icon('tag', 19)}</i><span>Verkaufspreis runden</span>
          <select data-act-round>${Object.entries(MARKUP_ROUND).map(([k, t]) => `<option value="${k}" ${markupCfg().round === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="set-row"><i class="tone-indigo">${icon('bell', 19)}</i><span>Töne<small>Klick, Ping und Kasse beim Buchen</small></span>
          <input type="checkbox" class="switch" data-act-sounds ${sfx.soundsOn() ? 'checked' : ''}></label>
        <label class="set-row"><i class="tone-teal">${icon('corners', 19)}</i><span>3D-Kacheln<small>Kacheln neigen sich mit dem Handy</small></span>
          <input type="checkbox" class="switch" data-act-gyro ${gyroEnabled() ? 'checked' : ''}></label>
        ${badgeSupported() ? `<label class="set-row"><i class="tone-red">${icon('alert', 19)}</i><span>Zähler am App-Symbol<small>Teile unter Meldebestand als roter Punkt</small></span>
          <input type="checkbox" class="switch" data-act-badge ${badgeEnabled() ? 'checked' : ''}></label>` : ''}
      </div>
      <p class="set-head">Bedienung</p>
      <div class="set-group">
        <label class="set-row"><i class="tone-blue">${icon('home', 19)}</i><span>Startseite<small>Womit die App öffnet</small></span>
          <select data-set="ss-start">${[['fav', 'Übersicht'], ['list', 'Teile'], ['scan', 'Scanner']].map(([v, t]) => `<option value="${v}" ${pref('ss-start', 'fav') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="set-row"><i class="tone-red">${icon('minus', 19)}</i><span>Schnellbuchen<small>„Entnehmen“ nimmt sofort 1 Stück – andere Menge: auf den Lagerort tippen</small></span>
          <input type="checkbox" class="switch" data-set-bool="ss-quick-out" ${pref('ss-quick-out', '0') === '1' ? 'checked' : ''}></label>
        <label class="set-row"><i class="tone-indigo">${icon('list', 19)}</i><span>Listen-Dichte<small>Kompakt: mehr Teile auf einen Blick</small></span>
          <select data-set="ss-density">${[['normal', 'Normal'], ['compact', 'Kompakt']].map(([v, t]) => `<option value="${v}" ${pref('ss-density', 'normal') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="set-row"><i class="tone-teal">${icon('phone', 19)}</i><span>Haptik<small>Leichtes Vibrieren beim Tippen und Buchen</small></span>
          <input type="checkbox" class="switch" data-set-bool="ss-haptics" ${pref('ss-haptics', '1') !== '0' ? 'checked' : ''}></label>
        <label class="set-row"><i class="tone-orange">${icon('sparkle', 19)}</i><span>Animationen<small>Reduziert: ohne Konfetti & fliegende Bilder</small></span>
          <select data-set="ss-motion">${[['full', 'Voll'], ['reduced', 'Reduziert'], ['off', 'Aus']].map(([v, t]) => `<option value="${v}" ${pref('ss-motion', 'full') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <p class="set-head">Neue Teile & Liste</p>
      <div class="set-group">
        <label class="set-row"><i class="tone-teal">${icon('shelf', 19)}</i><span>Lagerort<small>Vorgabe für neue Teile</small></span>
          <select data-set="ss-new-loc"><option value="">Zuletzt benutzt</option>${setLocs.map((l) => `<option value="${l.id}" ${pref('ss-new-loc', '') === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        <label class="set-row"><i class="tone-indigo">${icon('layers', 19)}</i><span>Gruppe<small>Vorgabe für neue Teile</small></span>
          <select data-set="ss-new-group"><option value="">Keine</option>${setGroups.map((g) => `<option value="${g.id}" ${pref('ss-new-group', '') === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
        <button class="set-row" data-act="new-min"><i class="tone-red">${icon('alert', 19)}</i><span>Meldebestand<small>Vorgabe für neue Teile</small></span><em class="set-val">${+pref('ss-new-min', '') > 0 ? esc(pref('ss-new-min', '')) : 'Keiner'}</em>${icon('chevR', 18)}</button>
        <label class="set-row"><i class="tone-blue">${icon('sort', 19)}</i><span>Sortierung<small>Teile-Liste, bleibt gespeichert</small></span>
          <select data-set="ss-sort">${SORT_OPTS(setChargeName).map(([v, t]) => `<option value="${v}" ${defaultSort() === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="set-row"><i class="tone-orange">${icon('eye', 19)}</i><span>Einkaufspreise ausblenden<small>Unscharf in Listen & Übersicht – antippen zeigt sie kurz</small></span>
          <input type="checkbox" class="switch" data-set-bool="ss-hide-ek" ${hideEk() ? 'checked' : ''}></label>
      </div>
      <p class="set-head">Etiketten</p>
      <div class="set-group">
        <label class="set-row"><i class="tone-indigo">${icon('tag', 19)}</i><span>Firmenname auf Etiketten<small>Klein über dem Teilenamen</small></span>
          <input type="checkbox" class="switch" data-set-bool="ss-label-brand-on" ${pref('ss-label-brand-on', '1') !== '0' ? 'checked' : ''}></label>
        <button class="set-row" data-act="label-brand"><i class="tone-indigo">${icon('edit', 19)}</i><span>Name auf dem Etikett</span><em class="set-val">${esc(pref('ss-label-brand', LABEL_BRAND_DEFAULT) || '—')}</em>${icon('chevR', 18)}</button>
        <button class="set-row" data-act="label-preview"><i class="tone-indigo">${icon('print', 19)}</i><span>Probe-Etikett ansehen</span>${icon('chevR', 18)}</button>
      </div>
      <div class="set-group">
        ${db.isGuest ? item('user', 'Konto erstellen', 'guest-register', '', '', 'green') + item('refresh', 'Testdaten zurücksetzen', 'reset', ' ', 'danger-text') + item('logout', 'Gastmodus beenden', 'guest-exit', ' ', 'danger-text')
          : db.isDemo ? item('refresh', 'Demo-Daten zurücksetzen', 'reset', ' ', 'danger-text') : item('logout', 'Abmelden', 'logout', ' ', 'danger-text')}
      </div>
      ${db.isGuest ? `<p class="hint">Im Gastmodus probierst du SpareSync mit Beispieldaten aus. Alles bleibt nur auf diesem Gerät. Mit einem Konto liegen deine Daten sicher in der Cloud und du kannst mehrere Geräte nutzen.</p>`
        : db.isDemo ? `<p class="hint">Im Demo-Modus liegen alle Daten nur in diesem Browser. Für Cloud-Speicher & mehrere Geräte Supabase-Zugangsdaten in der <code>.env</code> eintragen (siehe README).</p>` : ''}
      <div class="set-group">
        ${item('sparkle', 'Was ist neu', 'whats-new', `<em class="set-val">Version ${APP_VERSION}</em>${icon('chevR', 18)}`, '', 'orange')}
        ${item('help', 'Tour starten<small>Die wichtigsten Stellen der App in 1 Minute</small>', 'tour', '', '', 'blue')}
      </div>
      <div class="menu-footer">${brandLogo('sm')}<span>Version ${APP_VERSION}</span></div>`,
  });
  root.querySelectorAll('[data-act^="go:"]').forEach((b) => (b.onclick = () => go(b.dataset.act.slice(3))));
  // ---- Bedienung & Etiketten (alles nur auf diesem Gerät) ----
  root.querySelectorAll('select[data-set]').forEach((sel) => (sel.onchange = () => {
    const key = sel.dataset.set; const prev = pref(key, ''); setPref(key, sel.value); haptic('light');
    if (key === 'ss-density') { document.documentElement.classList.toggle('dense', sel.value === 'compact'); toast(sel.value === 'compact' ? 'Listen kompakt' : 'Listen normal'); }
    if (key === 'ss-start') toast('Startseite gespeichert', 'ok', { sub: 'Gilt ab dem nächsten Öffnen der App' });
    if (key === 'ss-sort') { listState.sort = sel.value; saveListState(); listKeep = null; toast('Sortierung gespeichert'); }
    if (key === 'ss-new-loc' || key === 'ss-new-group') toast('Vorgabe gespeichert', 'ok', { sub: 'Gilt für neu angelegte Teile' });
    if (key === 'ss-motion') {
      const cl = document.documentElement.classList;
      cl.toggle('motion-reduced', sel.value === 'reduced'); cl.toggle('motion-off', sel.value === 'off');
      // „Aus“ greift auch in alle Effekte im Code → einmal neu laden
      if (sel.value === 'off' || prev === 'off') { location.reload(); return; }
      toast(sel.value === 'reduced' ? 'Animationen reduziert' : 'Animationen voll');
    }
  }));
  root.querySelectorAll('input[data-set-bool]').forEach((cb) => (cb.onchange = () => {
    const key = cb.dataset.setBool; setPref(key, cb.checked ? '1' : '0');
    if (key === 'ss-haptics' && cb.checked) haptic('success'); else haptic('light');
    if (key === 'ss-hide-ek') { document.documentElement.classList.toggle('hide-ek', cb.checked); listKeep = null; }
    if (key === 'ss-quick-out' && cb.checked) toast('Schnellbuchen an', 'ok', { sub: 'Entnehmen = 1 Stück, mit Rückgängig' });
  }));
  on(root, 'label-brand', async () => {
    const v = await prompt({ title: 'Name auf dem Etikett', message: 'Erscheint klein oben auf jedem Etikett.', value: pref('ss-label-brand', LABEL_BRAND_DEFAULT), placeholder: 'z. B. RepairMobile', okText: 'Speichern' });
    if (v === null) return;
    setPref('ss-label-brand', v.trim().slice(0, 40)); keepScrollOnce = window.scrollY; nextTransition = 'none'; viewSettings();
  });
  on(root, 'whats-new', () => whatsNew({ all: true }));
  on(root, 'new-min', async () => {
    const v = await prompt({ title: 'Standard-Meldebestand', message: 'Wird bei neuen Ersatzteilen schon eingetragen. Leer lassen = keiner.', value: pref('ss-new-min', ''), type: 'number', okText: 'Speichern' });
    if (v === null) return;
    const n = String(v).replace(',', '.').trim();
    setPref('ss-new-min', +n > 0 ? n : ''); keepScrollOnce = window.scrollY; nextTransition = 'none'; viewSettings();
  });
  on(root, 'tour', () => { go('/fav'); setTimeout(() => startTour(), 450); });
  on(root, 'label-preview', () => showLabel({ title: 'iPhone 13 Display OLED', sub: 'Nr. 101', extra: 'Kleinteilemagazin', code: '101' }));
  root.querySelector('[data-act-theme]').onchange = (e) => { localStorage.setItem('wl-theme', e.target.value); applyTheme(); };
  root.querySelector('[data-act-sounds]').onchange = (e) => { sfx.setSoundsOn(e.target.checked); if (e.target.checked) sfx.ping(); haptic('light'); };
  root.querySelector('[data-act-markup]').onchange = (e) => { setMarkup({ pct: +e.target.value }); haptic('light'); };
  root.querySelector('[data-act-round]').onchange = (e) => { setMarkup({ round: e.target.value }); haptic('light'); };
  root.querySelector('[data-act-style]').onchange = (e) => {
    try { localStorage.setItem('ss-style', e.target.value); } catch { /* egal */ }
    // weich überblenden statt hart umspringen
    const swap = () => applyTheme();
    if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(swap); else swap();
    haptic('light');
  };
  root.querySelector('[data-act-badge]')?.addEventListener('change', async (e) => {
    const on = e.target.checked;
    try { localStorage.setItem(BADGE_KEY, on ? '1' : '0'); } catch {}
    // iPhone: der Zähler erscheint nur mit erlaubten Mitteilungen
    if (on && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch {}
    }
    if (on && 'Notification' in window && Notification.permission === 'denied') toast('Mitteilungen sind für SpareSync aus – in den iPhone-Einstellungen erlauben', 'err');
    updateBadge(await getMats());
  });
  root.querySelector('[data-act-gyro]').onchange = async (e) => {
    const on = e.target.checked;
    setGyroEnabled(on);
    if (on && !(await requestGyro())) toast('Bewegungssensor nicht verfügbar oder nicht erlaubt', 'err');
  };
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
            <div class="stat-row"><span>Ersatzteile Wert Einkauf</span><b class="ek">${fmtEUR(buy)}</b></div>
            <div class="stat-row"><span>Ersatzteile Wert Verkauf</span><b>${fmtEUR(sell)}</b></div>
            ${buy > 0 && sell > 0 ? `<div class="stat-row muted-row"><span>Möglicher Rohertrag</span><b class="ek">${fmtEUR(sell - buy)}</b></div>` : ''}
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
  // Von der Backup-Erinnerung gekommen: Zeile nach der Einflug-Animation in Sicht holen und kurz aufleuchten lassen
  if (flash === 'backup') {
    const row = root.querySelector('[data-act=backup]');
    setTimeout(() => { row?.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' }); row?.classList.add('flash-row'); }, 420);
  }
  on(root, 'thumbs', async () => {
    if (!navigator.onLine) return toast('Dafür wird Internet gebraucht', 'err');
    const pp = progressPanel({ title: 'Vorschaubilder erzeugen', icon: 'camera' });
    try {
      const mats = await getMats();
      const r = await db.generateMissingThumbs(mats, (d, t, made) => pp.set(t ? d / t : 1, `${d} von ${t} Bildern geprüft · ${made} neu`));
      pp.done({
        title: r.made ? `${r.made} Vorschaubilder erzeugt` : 'Alles schon vorhanden',
        message: `${r.total} Bilder geprüft.${r.errors.length ? ` ${r.errors.length} ließen sich nicht verarbeiten.` : ''} Die Listen laden jetzt die kleinen Bilder.`,
        actions: [{ label: 'Fertig', onClick: () => { invalidate('materials'); listKeep = null; } }],
      });
    } catch (e) { pp.fail(e.message || String(e)); }
  });
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
  on(root, 'guest-register', () => leaveGuest('register'));
  on(root, 'guest-exit', () => leaveGuest('login'));
}

// =====================================================================
//  WAS IST NEU – nach jedem Update einmal die Neuerungen zeigen
// =====================================================================
const SEEN_KEY = 'ss-seen-version';
function whatsNew({ all = false } = {}) {
  const seen = pref(SEEN_KEY, '');
  const list = all ? CHANGELOG : CHANGELOG.filter((v) => !seen || verCmp(v.version, seen) > 0).slice(0, 2);
  if (!list.length) return;
  setPref(SEEN_KEY, APP_VERSION);
  const hasTour = !all && list[0].items.some((x) => x.tour);
  const fmtD = (d) => new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  sheet(`<div class="wn">
      ${list.map((v, vi) => `<section class="wn-ver">
        <div class="wn-head">${vi === 0 && !all ? `<span class="wn-badge">${icon('sparkle', 15, 2.4)} Neu</span>` : ''}<b>Version ${esc(v.version)}${v.title ? ` · ${esc(v.title)}` : ''}</b><small>${fmtD(v.date)}</small></div>
        <div class="wn-list">${v.items.map((x, i) => `<div class="wn-item" style="--i:${vi * 3 + i}"><span class="wn-ic">${icon(x.icon, 20, 2.1)}</span><span class="wn-t"><b>${esc(x.title)}</b><small>${esc(x.text)}</small></span></div>`).join('')}</div>
      </section>`).join('')}
      <div class="wn-acts">
        ${hasTour ? `<button class="btn-tinted" data-wn="tour">${icon('help', 18)} Zeig's mir</button>` : ''}
        <button class="btn-filled" data-wn="ok">Alles klar</button>
      </div>
    </div>`, {
    title: all ? 'Was ist neu' : 'Neu in SpareSync',
    onMount: (root, close) => {
      root.querySelector('[data-wn=ok]').onclick = () => close();
      const t = root.querySelector('[data-wn=tour]');
      if (t) t.onclick = () => { close(); setTimeout(() => startTour({ only: 'new' }), 380); };
    },
  });
}
const verCmp = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

// =====================================================================
//  TOUR – ein Lichtkegel zeigt Schritt für Schritt die wichtigsten Stellen
//  Neue Funktion? Einfach eine Station ergänzen (since = Version, ab der es sie gibt → „Neu“-Abzeichen)
// =====================================================================
const TOUR_KEY = 'ss-tour-done';
const TOUR_STEPS = [
  { route: '/fav', sel: '.dash-nav [data-act=scan]', title: 'Scannen', text: 'Antippen öffnet das Scanner-Menü: scannen, direkt entnehmen, Code eintippen oder den Scan-Verlauf ansehen.', since: '1.6' },
  { route: '/fav', sel: '.widgets', title: 'Dein Lager auf einen Blick', text: 'Knappe Teile, Warenkorb und Lagerwert. Antippen öffnet die passende Liste.' },
  { route: '/fav', sel: '.quick-grid', title: 'Schnellaktionen', text: 'Dazu buchen, Entnehmen oder ein Teil per Scan finden – jeweils mit einem Tipp.' },
  { route: '/fav', sel: '.dash-nav', title: 'Suche', text: 'Auf der Übersicht einfach nach unten ziehen – die Suche öffnet sich mit deinen zuletzt angesehenen Teilen.', since: '1.4' },
  { route: '/list?tab=part', sel: '.list-nav .search-field', title: 'Alle Teile', text: 'Suchen, filtern, sortieren. Tippfehler sind kein Problem – „aku“ findet auch „Akku“.' },
  { route: '/list?tab=part', sel: '.mlist .mrow', title: 'Wischen zum Buchen', text: 'Nach rechts wischen: Dazu buchen oder Entnehmen. Nach links: Bearbeiten oder Löschen. Gedrückt halten öffnet ein Menü.' },
  { route: '/list?tab=part', sel: '[data-act=sel-toggle]', title: 'Mehrere auf einmal', text: 'Auswählen – und gleich mehrere Teile in den Warenkorb legen, umlagern oder Etiketten drucken.', since: '1.4' },
  { route: '/list?tab=part', sel: '.segment [data-tab=cart]', title: 'Warenkorb', text: 'Hier sammelst du, was nachbestellt werden muss. „Teilen“ schickt die Bestellliste per WhatsApp oder Mail.' },
  { route: '/fav', sel: '.dash-nav [data-act=menu]', title: 'Menü', text: 'Lagerorte, Inventur, Scan-Verlauf, Grundriss, Thekenmodus, Backup und Einstellungen. Hier startest du die Tour auch neu.', since: '1.4' },
];
let tourOn = false;
async function startTour({ only = 'all' } = {}) {
  if (tourOn) return;
  let steps = only === 'new' ? TOUR_STEPS.filter((s) => s.since === APP_VERSION) : TOUR_STEPS.slice();
  if (!steps.length) return;
  const end = { title: db.isGuest ? 'Viel Spaß beim Ausprobieren!' : 'Fertig!', final: true,
    text: db.isGuest ? 'Alles hier sind Beispieldaten und bleiben nur auf diesem Gerät. Wenn dir SpareSync gefällt: auf der Übersicht „Jetzt registrieren“.'
      : only === 'new' ? 'Das waren die Neuerungen. Die ganze Tour findest du jederzeit im Menü.' : 'Die Tour kannst du jederzeit im Menü unter „Tour starten“ wiederholen.' };
  steps = [...steps, end];
  tourOn = true;
  const el = document.createElement('div');
  el.className = 'tour';
  el.innerHTML = '<div class="tour-hole"></div><div class="tour-tip" role="dialog" aria-modal="true" aria-live="polite"></div>';
  document.body.appendChild(el);
  document.documentElement.classList.add('tour-on');
  requestAnimationFrame(() => el.classList.add('show'));
  const hole = el.querySelector('.tour-hole'); const tip = el.querySelector('.tour-tip');
  let i = 0; let target = null; let busy = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (sel, ms = 3500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const n = [...document.querySelectorAll(sel)].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !x.closest('.tour'); });
      if (n) return n;
      await sleep(90);
    }
    return null;
  };
  const place = () => {
    if (!target) { el.classList.add('no-target'); tip.style.left = ''; tip.style.top = ''; return; }
    el.classList.remove('no-target');
    const r = target.getBoundingClientRect(); const pad = 6;
    const br = parseFloat(getComputedStyle(target).borderRadius) || 12;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: `${Math.min(br + pad, 40)}px` });
    const tw = tip.offsetWidth; const th = tip.offsetHeight; const gap = 16;
    const below = r.bottom + pad + gap + th < innerHeight - 20 || r.top < th + 60;
    const top = below ? r.bottom + pad + gap : r.top - pad - gap - th;
    const left = Math.max(12, Math.min(innerWidth - tw - 12, r.left + r.width / 2 - tw / 2));
    tip.style.left = `${left}px`; tip.style.top = `${Math.max(12, top)}px`;
    tip.style.setProperty('--ax', `${Math.max(18, Math.min(tw - 18, r.left + r.width / 2 - left))}px`);
    tip.classList.toggle('above', !below);
  };
  const finish = () => {
    if (!tourOn) return;
    tourOn = false; setPref(TOUR_KEY, APP_VERSION); setPref(SEEN_KEY, APP_VERSION);
    el.classList.remove('show'); el.classList.add('out');
    document.documentElement.classList.remove('tour-on');
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 350);
  };
  const show = async (dir = 1) => {
    if (busy) return; busy = true;
    tip.classList.add('switching');
    const st = steps[i];
    if (st.route) {
      const want = st.route.split('?')[0];
      if (parseHash().path !== want) { if (want === '/list') { listState.tab = 'part'; saveListState(); } go(st.route); await sleep(250); }
    }
    target = st.sel ? await waitFor(st.sel) : null;
    if (st.sel && !target) {                    // Stelle gerade nicht da (z. B. leere Liste) → überspringen
      busy = false; i += dir;
      if (i < 0) i = 0;
      return i < steps.length ? show(dir) : finish();
    }
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight - 140) { target.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' }); await sleep(380); }
    }
    const real = steps.filter((s) => !s.final).length;
    const isNew = st.since === APP_VERSION && only !== 'new';
    tip.innerHTML = `
      ${st.final ? `<span class="tt-ic">${icon(db.isGuest ? 'sparkle' : 'check', 26, 2.4)}</span>` : ''}
      <div class="tt-head">${isNew ? '<span class="tt-new">Neu</span>' : ''}<b>${esc(st.title)}</b>${st.final ? '' : `<small>${i + 1} / ${real}</small>`}</div>
      <p>${esc(st.text)}</p>
      <div class="tt-foot">
        ${st.final ? '' : '<button class="tt-skip" data-t="skip">Überspringen</button>'}
        <span class="tt-dots">${st.final ? '' : steps.filter((s) => !s.final).map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
        ${i > 0 && !st.final ? `<button class="tt-btn ghost" data-t="back" aria-label="Zurück">${icon('chevL', 20, 2.4)}</button>` : ''}
        <button class="tt-btn" data-t="next">${st.final ? "Los geht's" : i === real - 1 ? 'Fertig' : 'Weiter'}</button>
      </div>`;
    place();
    requestAnimationFrame(() => { place(); tip.classList.remove('switching'); });
    busy = false;
  };
  tip.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b || busy) return;
    haptic('light');
    if (b.dataset.t === 'skip') return finish();
    if (b.dataset.t === 'back') { i = Math.max(0, i - 1); return show(-1); }
    if (steps[i].final) { if (db.isGuest) confetti(); return finish(); }
    i++; show(1);
  });
  const onKey = (e) => { if (e.key === 'Escape') finish(); if (e.key === 'ArrowRight' || e.key === 'Enter') tip.querySelector('[data-t=next]')?.click(); };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
  show();
}

// =====================================================================
//  SCAN-VERLAUF: was zuletzt gescannt wurde – mit passendem Teil
// =====================================================================
function codeLabel(code, mats = cache.materials || [], locs = cache.locations || []) {
  code = String(code || '').trim(); if (!code) return null;
  const m = mats.find((x) => x.barcode && x.barcode === code) || (/^\d+$/.test(code) && mats.find((x) => String(x.number) === code))
    || mats.find((x) => x.name.toLowerCase() === code.toLowerCase());
  if (m) return { title: m.name, m };
  const l = locs.find((x) => x.barcode && x.barcode === code);
  return l ? { title: `Lagerort ${l.name}`, l } : null;
}
setScanLabeler((c) => codeLabel(c));
const fmtScanTime = (t) => {
  const d = new Date(t); const today = new Date().toDateString() === d.toDateString();
  return today ? `Heute, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
async function viewScans() {
  const [mats, locs] = await Promise.all([getMats(), getLocs()]);
  const list = scanHistory();
  const root = screen({
    header: navbar({ left: backBtn(), title: 'Scan-Verlauf', right: list.length ? `<button class="text-btn" data-act="clear">Leeren</button>` : '' }),
    cls: 'large-title-screen scans-screen',
    body: list.length ? `
      <p class="muted small pad-x">Die letzten ${list.length} Scans auf diesem Gerät. Antippen öffnet das Teil.</p>
      <section class="ios-list scan-list">${list.map((x) => {
        const lab = codeLabel(x.code, mats, locs);
        if (lab?.m) return `<a class="ios-row recent scan-row" href="#/m/${lab.m.id}">${thumb(lab.m, 'sm')}
          <span class="r-label"><span class="r-title">${esc(lab.m.name)}</span><small>${esc(x.code)} · ${fmtScanTime(x.at)}${x.title && x.title !== 'Scanner' ? ` · ${esc(x.title)}` : ''}</small></span>
          <b class="r-val ${isLow(lab.m) ? 'red' : ''}">${fmtQty(lab.m.total)}</b></a>`;
        if (lab?.l) return `<a class="ios-row recent scan-row" href="#/list?tab=part&loc=${lab.l.id}"><span class="scan-ic loc">${icon('shelf', 20)}</span>
          <span class="r-label"><span class="r-title">${esc(lab.l.name)}</span><small>Lagerort · ${fmtScanTime(x.at)}</small></span>${icon('chevR', 16)}</a>`;
        return `<div class="ios-row recent scan-row unknown"><span class="scan-ic">${icon('barcode', 20)}</span>
          <span class="r-label"><span class="r-title selectable">${esc(x.code)}</span><small>Unbekannter Code · ${fmtScanTime(x.at)}</small></span>
          <a class="btn-tinted sm" href="#/new?kind=part&barcode=${encodeURIComponent(x.code)}">${icon('plus', 16)} Anlegen</a></div>`;
      }).join('')}</section>`
      : empty('scan', 'Noch nichts gescannt', '<span class="muted">Alles, was du scannst, erscheint hier – praktisch, wenn man mal aus Versehen weggetippt hat.</span>'),
  });
  on(root, 'clear', async () => {
    if (!await confirmBox({ title: 'Verlauf leeren?', message: 'Die Liste der gescannten Codes wird von diesem Gerät gelöscht.', okText: 'Leeren', danger: true })) return;
    clearScanHistory(); haptic('success'); viewScans();
  });
}

// =====================================================================
//  THEKENMODUS: Ansicht für Kunden – nur Verkaufspreis & Verfügbarkeit
// =====================================================================
let counterLock = null;
async function keepAwake(root) {
  try { counterLock = await navigator.wakeLock?.request('screen'); } catch { counterLock = null; }
  const again = () => { if (!root.isConnected) return document.removeEventListener('visibilitychange', again); if (document.visibilityState === 'visible') keepAwake(root); };
  document.addEventListener('visibilitychange', again, { once: true });
  const watch = setInterval(() => { if (!root.isConnected) { clearInterval(watch); counterLock?.release?.().catch(() => {}); counterLock = null; } }, 1000);
}
function counterAvail(m) {
  const t = +m.total || 0;
  if (t <= 0) return { cls: 'order', text: 'Auf Bestellung' };
  if (+m.min_stock > 0 && t <= +m.min_stock) return { cls: 'few', text: 'Nur noch wenige' };
  return { cls: 'ok', text: 'Sofort verfügbar' };
}
const counterPrice = (m) => (+m.sale_price > 0 ? fmtEUR(m.sale_price) : '');
async function viewCounter() {
  const all = (await getMats()).filter((m) => m.kind === 'part' && deviceCat(m).id !== 'klein');
  const cats = DEVICE_CATS.filter((c) => c.id !== 'klein' && all.some((m) => deviceCat(m).id === c.id));
  const st = { q: '', cat: '' };
  const root = screen({
    header: '',
    cls: 'counter-screen',
    body: `
      <div class="ct-top">
        ${brandLogo('ct-logo')}
        <button type="button" class="ct-exit" aria-label="Thekenmodus beenden – gedrückt halten">
          <svg class="ct-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18"/></svg>${icon('x', 18, 2.4)}</button>
      </div>
      <h1 class="ct-title">Ersatzteile &amp; Preise</h1>
      <p class="ct-sub">Suche nach deinem Gerät oder Teil</p>
      <label class="ct-search">${icon('search', 22, 2.2)}<input type="search" placeholder="z. B. iPhone 13 Display" autocomplete="off" enterkeyhint="search" aria-label="Suchen"></label>
      <div class="ct-chips" role="tablist">
        <button class="ct-chip on" data-cat="">Alle</button>
        ${cats.map((c) => `<button class="ct-chip" data-cat="${c.id}">${icon(c.icon, 16, 2.2)}${esc(c.label)}</button>`).join('')}
      </div>
      <div class="ct-grid" aria-live="polite"></div>
      <p class="ct-foot">Alle Teile werden von uns fachgerecht eingebaut. Fragen Sie uns gern.</p>`,
  });
  keepAwake(root);
  const grid = root.querySelector('.ct-grid');
  const render = () => {
    let list = st.q ? filterMats(all, { q: st.q }) : all.slice();
    if (st.cat) list = list.filter((m) => deviceCat(m).id === st.cat);
    list.sort((a, b) => (+(b.total > 0) - +(a.total > 0)) || a.name.localeCompare(b.name, 'de'));
    grid.innerHTML = list.slice(0, 120).map((m, i) => {
      const a = counterAvail(m); const im = m.images?.[0];
      return `<button class="ct-card" data-id="${m.id}" style="--i:${Math.min(i, 12)}">
        <span class="ct-img">${im ? `<img src="${esc(im.thumb || im.url)}" alt="" loading="lazy" decoding="async">` : icon(deviceCat(m).icon, 40, 1.5)}</span>
        <span class="ct-av ${a.cls}"><i></i>${a.text}</span>
        <b class="ct-name">${esc(m.name)}</b>
        <span class="ct-price">${counterPrice(m) || '<small>Preis auf Anfrage</small>'}</span>
      </button>`;
    }).join('') || `<div class="ct-empty">${icon('search', 44, 1.6)}<b>Nichts gefunden</b><span>Fragen Sie uns – wir bestellen das Teil gern für Sie.</span></div>`;
  };
  render();
  let tmr;
  root.querySelector('.ct-search input').oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { st.q = e.target.value.trim(); render(); }, 120); };
  root.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => {
    st.cat = b.dataset.cat; haptic('selection');
    root.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
    render();
  }));
  grid.onclick = (e) => {
    const c = e.target.closest('[data-id]'); if (!c) return;
    const m = all.find((x) => x.id === c.dataset.id); const a = counterAvail(m); const im = m.images?.[0];
    haptic('light');
    const { el, close } = layer('ct-detail-layer', `<div class="backdrop" data-x></div>
      <div class="ct-detail" role="dialog" aria-label="${esc(m.name)}">
        <button class="ct-dx" data-x aria-label="Schließen">${icon('x', 22, 2.4)}</button>
        <div class="ct-dimg">${im ? `<img src="${esc(im.url)}" alt="">` : icon(deviceCat(m).icon, 70, 1.3)}</div>
        <span class="ct-av ${a.cls}"><i></i>${a.text}</span>
        <h2>${esc(m.name)}</h2>
        ${(m.fits || []).length ? `<p class="ct-fits">Passt für: ${m.fits.map(esc).join(', ')}</p>` : ''}
        <div class="ct-dprice">${counterPrice(m) || 'Preis auf Anfrage'}</div>
        ${a.cls === 'order' ? '<p class="ct-note">Wir bestellen das Teil für Sie – meist in 1–3 Werktagen da.</p>' : ''}
      </div>`);
    el.querySelectorAll('[data-x]').forEach((x) => (x.onclick = close));
  };
  // Beenden nur mit Gedrückthalten – Kunden kommen nicht aus Versehen raus
  const ex = root.querySelector('.ct-exit'); let hold;
  const cancel = () => { clearTimeout(hold); ex.classList.remove('holding'); };
  ex.addEventListener('pointerdown', (e) => {
    e.preventDefault(); ex.classList.add('holding'); haptic('light');
    hold = setTimeout(() => { ex.classList.remove('holding'); haptic('success'); counterLock?.release?.().catch(() => {}); go('/settings', true); }, 900);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => ex.addEventListener(t, cancel));
  ex.onclick = () => { if (!ex.classList.contains('holding')) toast('Zum Beenden gedrückt halten', 'info', { icon: 'x' }); };
  ex.oncontextmenu = (e) => e.preventDefault();
}

// =====================================================================
//  WERKSTATT-GRUNDRISS: Lagerorte als Regal-Blöcke auf einem Raster
// =====================================================================
const FP_COLS = 12;
const fpOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function fpFreeSpot(layout, w, h, skip) {
  const boxes = Object.entries(layout).filter(([k]) => k !== skip).map(([, v]) => v);
  for (let y = 0; y < 200; y++) for (let x = 0; x + w <= FP_COLS; x++) {
    const c = { x, y, w, h };
    if (!boxes.some((b) => fpOverlap(c, b))) return c;
  }
  return { x: 0, y: 0, w, h };
}
const fpRows = (layout) => Math.max(8, ...Object.values(layout).map((b) => b.y + b.h + 1));
async function viewMap(q = {}) {
  const [locs, mats, fp] = await Promise.all([getLocs(), getMats(), db.loadFloorplan().catch(() => ({ layout: {}, cloud: false }))]);
  const saved = {};
  locs.forEach((l) => { const b = fp.layout?.[l.id]; if (b && [b.x, b.y, b.w, b.h].every(Number.isFinite)) saved[l.id] = { x: b.x, y: b.y, w: b.w, h: b.h }; });
  const layout = JSON.parse(JSON.stringify(saved));
  // Neue Lagerorte bekommen automatisch einen freien Platz
  let auto = 0;
  locs.forEach((l) => { if (!layout[l.id]) { layout[l.id] = fpFreeSpot(layout, 4, 3); auto++; } });
  const find = q.find ? mats.find((m) => m.id === q.find) : null;
  const hits = new Map((find?.locations || []).map((l) => [l.location_id, l.qty]));
  const stats = new Map(locs.map((l) => [l.id, shelfStats(l, mats)]));
  let editing = !!q.edit;

  const block = (l) => {
    const b = layout[l.id]; const s = stats.get(l.id);
    const hit = hits.has(l.id);
    return `<button class="fp-block ${s.low ? 'has-low' : ''} ${hit ? 'hit' : ''}" data-id="${l.id}" style="--x:${b.x};--y:${b.y};--w:${b.w};--h:${b.h}">
      <span class="fp-in"><b>${esc(l.name)}</b><small>${s.items.length} ${s.items.length === 1 ? 'Teil' : 'Teile'}${s.low ? ` · <em>${s.low} knapp</em>` : ''}</small></span>
      ${hit ? `<span class="fp-pin">${icon('box', 13, 2.4)} ${fmtQty(hits.get(l.id))}</span>` : ''}
      <span class="fp-handle" aria-hidden="true"></span>
    </button>`;
  };
  const root = screen({
    header: navbar({ left: backBtn(), title: 'Grundriss', right: `<button class="text-btn fp-edit" data-act="edit">${editing ? 'Fertig' : 'Bearbeiten'}</button>` }),
    cls: `map-screen ${editing ? 'editing' : ''} ${find ? 'finding' : ''}`,
    body: `
      <label class="fp-search">${icon('search', 19, 2.2)}<input type="search" placeholder="Wo liegt …?" autocomplete="off" aria-label="Teil suchen"><span class="fp-res"></span></label>
      ${find ? `<div class="fp-find">${thumb(find, 'sm')}<span><b>${esc(find.name)}</b><small>${hits.size ? `Liegt in ${[...hits.keys()].map((id) => esc(locs.find((l) => l.id === id)?.name || '')).join(', ')}` : 'Noch keinem Lagerort zugeordnet'}</small></span><button class="icon-btn" data-act="unfind" aria-label="Markierung aufheben">${icon('x', 20, 2.4)}</button></div>` : ''}
      ${locs.length ? `<div class="fp-room" style="--rows:${fpRows(layout)}"><div class="fp-floor"></div>${locs.map(block).join('')}</div>`
        : empty('shelf', 'Noch keine Lagerorte', '<a class="btn-tinted" href="#/locations">Lagerorte anlegen</a>')}
      <p class="fp-hint">${editing ? 'Regal ziehen zum Verschieben · Ecke unten rechts ziehen für die Größe.' : auto && !Object.keys(saved).length ? 'Deine Lagerorte wurden automatisch angeordnet. Tippe auf <b>Bearbeiten</b> und schiebe sie dahin, wo sie in deiner Werkstatt stehen.' : 'Tippe auf ein Regal, um den Inhalt zu sehen.'}</p>`,
  });
  const room = root.querySelector('.fp-room');
  const place = (el) => { const b = layout[el.dataset.id]; el.style.cssText = `--x:${b.x};--y:${b.y};--w:${b.w};--h:${b.h}`; };
  const grow = () => room && room.style.setProperty('--rows', fpRows(layout));

  on(root, 'unfind', () => { replaceHash('#/map'); viewMap({}); });
  on(root, 'edit', async () => {
    if (!editing) { editing = true; root.classList.add('editing'); root.querySelector('.fp-edit').textContent = 'Fertig'; root.querySelector('.fp-hint').innerHTML = 'Regal ziehen zum Verschieben · Ecke unten rechts ziehen für die Größe.'; haptic('light'); return; }
    const changed = locs.map((l) => l.id).filter((id) => JSON.stringify(layout[id]) !== JSON.stringify(saved[id]));
    try {
      const res = changed.length || fp.pending ? await db.saveFloorplan(layout, fp.pending ? locs.map((l) => l.id) : changed) : { cloud: fp.cloud };
      changed.forEach((id) => (saved[id] = { ...layout[id] })); fp.pending = false;
      editing = false; root.classList.remove('editing'); root.querySelector('.fp-edit').textContent = 'Bearbeiten';
      root.querySelector('.fp-hint').textContent = 'Tippe auf ein Regal, um den Inhalt zu sehen.';
      haptic('success');
      if (changed.length) toast('Grundriss gespeichert', 'ok', !res.cloud && !db.isDemo ? { sub: 'Nur auf diesem Gerät – für alle Geräte die Grundriss-Migration ausführen', duration: 4200 } : {});
    } catch (e) { errToast(e); }
  });

  // Ziehen & Größe ändern (im Bearbeiten-Modus), Antippen zeigt den Inhalt
  root.querySelectorAll('.fp-block').forEach((el) => {
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (!editing || e.button > 0) return;
      e.preventDefault();
      const id = el.dataset.id; const b = layout[id];
      const cell = room.clientWidth / FP_COLS;
      drag = { id, sx: e.clientX, sy: e.clientY, cell, start: { ...b }, mode: e.target.closest('.fp-handle') ? 'size' : 'move', pid: e.pointerId };
      el.setPointerCapture(e.pointerId); el.classList.add('dragging'); haptic('light');
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const dx = Math.round((e.clientX - drag.sx) / drag.cell); const dy = Math.round((e.clientY - drag.sy) / drag.cell);
      const s = drag.start; const b = layout[drag.id]; const prev = JSON.stringify(b);
      if (drag.mode === 'move') { b.x = Math.max(0, Math.min(FP_COLS - s.w, s.x + dx)); b.y = Math.max(0, s.y + dy); }
      else { b.w = Math.max(1, Math.min(FP_COLS - s.x, s.w + dx)); b.h = Math.max(1, Math.min(12, s.h + dy)); }
      if (JSON.stringify(b) !== prev) {
        place(el); grow(); haptic('selection');
        const bad = Object.entries(layout).some(([k, o]) => k !== drag.id && fpOverlap(b, o));
        el.classList.toggle('bad', bad);
      }
    });
    const end = () => {
      if (!drag) return;
      const b = layout[drag.id];
      if (Object.entries(layout).some(([k, o]) => k !== drag.id && fpOverlap(b, o))) {
        layout[drag.id] = { ...drag.start }; place(el); grow();
        el.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
        haptic('error');
      }
      el.classList.remove('dragging', 'bad'); drag = null;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('click', () => {
      if (editing) return;
      const l = locs.find((x) => x.id === el.dataset.id); const s = stats.get(l.id);
      haptic('light');
      sheet(`<div class="fp-sheet">
          <div class="fp-sum"><span><b>${s.items.length}</b><small>Teile</small></span><span><b>${fmtQty(s.units)}</b><small>Stück</small></span><span class="${s.low ? 'red' : ''}"><b>${s.low}</b><small>knapp</small></span></div>
          <div class="fp-items">${s.items.slice(0, 40).map((x) => `<a class="fp-item s-${x.state} ${hits.has(l.id) && x.m.id === find?.id ? 'hit' : ''}" href="#/m/${x.m.id}">${thumb(x.m, 'sm')}<span>${esc(x.m.name)}</span><b>${fmtQty(x.qty)}</b></a>`).join('') || '<p class="muted center pad">Hier liegt noch nichts</p>'}</div>
          ${s.items.length > 40 ? `<p class="muted small center">… und ${s.items.length - 40} weitere</p>` : ''}
          <div class="fp-acts"><a class="btn-tinted" href="#/list?tab=part&loc=${l.id}">${icon('list', 18)} Alle Teile</a><a class="btn-tinted" href="#/inventory?loc=${l.id}">${icon('tally', 18)} Inventur</a></div>
        </div>`, { title: l.name, onMount: (sh, close) => sh.querySelectorAll('a').forEach((a) => a.addEventListener('click', close)) });
    });
  });

  // „Wo liegt …?“ – Teil suchen, Regal leuchtet auf
  const inp = root.querySelector('.fp-search input'); const res = root.querySelector('.fp-res');
  inp.oninput = () => {
    const v = inp.value.trim();
    const list = v.length < 2 ? [] : filterMats(mats.filter((m) => m.locations.length), { q: v }).slice(0, 6);
    res.innerHTML = list.map((m) => `<button type="button" data-f="${m.id}">${thumb(m, 'sm')}<span>${esc(m.name)}</span></button>`).join('');
    res.classList.toggle('open', list.length > 0);
  };
  res.onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; inp.blur(); replaceHash(`#/map?find=${b.dataset.f}`); viewMap({ find: b.dataset.f }); };
  if (find && hits.size) requestAnimationFrame(() => root.querySelector('.fp-block.hit')?.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' }));
}

// =====================================================================
//  GASTMODUS – App mit Beispieldaten ausprobieren, ohne Konto
// =====================================================================
function enterGuest() {
  db.startGuest();
  haptic('success');
  document.documentElement.classList.add('guest-enter');
  setTimeout(() => { location.hash = '#/fav'; location.reload(); }, reduceMotion.matches ? 0 : 420);
}
async function leaveGuest(target = 'login') {
  const reg = target === 'register';
  const ok = await confirmBox({
    title: reg ? 'Jetzt registrieren?' : 'Gastmodus beenden?',
    message: 'Deine Testdaten aus dem Gastmodus werden dabei von diesem Gerät gelöscht. Dein richtiges Lager startet leer.',
    okText: reg ? 'Registrieren' : 'Beenden',
    danger: !reg,
  });
  if (!ok) return;
  db.endGuest();
  location.hash = '#/' + target;
  location.reload();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-guest-end]');
  if (b) { e.preventDefault(); leaveGuest(b.dataset.guestEnd); }
});

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
          <div class="auth-or"><span>oder</span></div>
          <button type="button" class="auth-guest" data-guest>
            <span class="ag-ic">${icon('sparkle', 20, 2.2)}</span>
            <span class="ag-txt"><b>Als Gast ausprobieren</b><small>Mit Beispieldaten, ohne Anmeldung</small></span>
            ${icon('chevR', 18)}
          </button>
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
  root.querySelector('[data-guest]').onclick = enterGuest;

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
// Vollbild-Test nur wirklich anwenden, wenn iOS die App auch unter die Statusleiste legt
// (sonst würde die Island-Pille über der Kopfzeile kleben). Erkennbar am oberen Safe-Area-Abstand.
try { localStorage.removeItem('ss-fullbleed'); } catch {}   // Test-Schalter entfernt → alten Wert aufräumen
if (document.documentElement.classList.contains('fullbleed')) {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  if (probe.offsetHeight < 20) document.documentElement.classList.remove('fullbleed');
  probe.remove();
}
installHaptics();
// iOS: Nach dem Schließen der Tastatur bleiben fest stehende Leisten (Tab-Leiste, Fußzeile) manchmal
// dort „hängen“, wo vorher die Tastatur anfing. Darum danach den Viewport zurücksetzen und die Leisten neu zeichnen.
(() => {
  const vv = window.visualViewport;
  let kbOpen = false; let t = 0;
  const settleFixed = () => {
    clearTimeout(t);
    t = setTimeout(() => requestAnimationFrame(() => {
      if (vv && vv.offsetTop > 0) window.scrollTo(window.scrollX, window.scrollY);   // Rest-Versatz der Tastatur entfernen
      window.scrollBy(0, 1); window.scrollBy(0, -1);
      document.querySelectorAll('.tabbar, .bottom-bar').forEach((el) => { el.style.transform = 'translateZ(0)'; void el.offsetHeight; el.style.transform = ''; });
    }), 80);
  };
  vv?.addEventListener('resize', () => {
    const open = vv.height < window.innerHeight - 120;
    if (kbOpen && !open) settleFixed();
    kbOpen = open;
  });
  document.addEventListener('focusout', (e) => { if (e.target?.matches?.('input, textarea, select')) settleFixed(); });
})();
// iOS: ohne touchstart-Listener zeigt Safari den :active-Zustand (Hineindrücken) nicht an
document.addEventListener('touchstart', () => {}, { passive: true });
if (!db.isDemo) db.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' || ev === 'SIGNED_IN') { invalidate(); } });

// ---------- Live: Buchungen von anderen Geräten sofort anzeigen ----------
const LIVE_VERB = { out: 'entnommen', in: 'dazugebucht', transfer: 'umgebucht', inventory: 'gezählt' };
let liveTimer = 0;
db.onRemoteMovement(async (x) => {
  invalidate('materials', 'locations'); detailMemo.movs.delete(x.material_id);
  let m = null; try { m = (await getMats()).find((z) => z.id === x.material_id); } catch { /* egal */ }
  const n = x.type === 'inventory' ? fmtQty(x.stock_after) : `${fmtQty(Math.abs(+x.qty))}×`;
  toast('Anderes Gerät', 'info', { icon: 'refresh', sub: `${n} ${m ? m.name : 'Teil'} ${LIVE_VERB[x.type] || 'gebucht'}`, duration: 3500 });
  haptic('light');
  // Liste: nur die betroffene Zeile austauschen und kurz aufleuchten lassen
  if (m) {
    patchListRow(m);
    document.querySelectorAll(`.mrow[data-id="${m.id}"], .ios-row[data-m="${m.id}"]`).forEach((r) => { r.classList.remove('live-flash'); void r.offsetWidth; r.classList.add('live-flash'); });
  }
  // Übersicht oder Detailseite dieses Teils: still neu aufbauen (Zahlen zählen weiter), wenn gerade nichts offen ist
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    const { path } = parseHash();
    const busy = document.querySelector('.layer, .sd-layer, .alert-layer') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (busy) return;
    if (path === '/fav' || path === `/m/${x.material_id}`) { keepScrollOnce = window.scrollY; nextTransition = 'none'; route(); }
  }, 400);
});

// Startseite (Einstellungen): beim Öffnen der App direkt Teile-Liste oder Scanner statt Übersicht
(() => {
  let start = 'fav';
  try { start = localStorage.getItem('ss-start') || 'fav'; } catch { /* egal */ }
  const h = location.hash;
  if (start !== 'fav' && (!h || h === '#/' || h === '#/fav') && (db.isDemo || db.sb)) {
    try { history.replaceState(history.state, '', start === 'scan' ? '#/pick?mode=info&scan=1' : '#/list'); } catch { /* egal */ }
  }
})();

// Splashscreen-Video (steht in index.html): blendet aus, sobald das Video zu Ende ist UND die App geladen hat
route().finally(() => {
  window.__appReady = true;
  if (window.__splashVideoDone) window.hideSplash?.();
  // Nach dem Splash: Gäste bekommen beim ersten Mal die Tour, alle anderen nach einem Update „Was ist neu“
  setTimeout(() => {
    if (document.querySelector('.layer, .alert-layer, .tour') || parseHash().path === '/login' || parseHash().path === '/register' || parseHash().path === '/counter') return;
    if (db.isGuest && !pref(TOUR_KEY, '')) { if (parseHash().path !== '/fav') return; setPref(SEEN_KEY, APP_VERSION); startTour(); return; }
    if (db.isDemo && !db.isGuest && !pref(SEEN_KEY, '')) { setPref(SEEN_KEY, APP_VERSION); return; }   // Entwickler-Demo: still
    if (pref(SEEN_KEY, '') !== APP_VERSION) whatsNew();
  }, 2300);
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
