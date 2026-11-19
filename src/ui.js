// ---------------------------------------------------------------------
//  UI-Bausteine im iOS-Stil: Alert, Action-Sheet, Bottom-Sheet, Picker,
//  Toast, Barcode-Scanner, Etikett, Bildkomprimierung
// ---------------------------------------------------------------------
import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtQty = (n) => (n == null || n === '' ? '–' : (+n).toLocaleString('de-DE', { maximumFractionDigits: 3 }));
export const fmtEUR = (n) => (+(n || 0)).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const fmtDate = (s) => new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export { haptic } from './haptics.js';
import { haptic } from './haptics.js';

// ---------- Hintergrund sperren, solange ein Fenster offen ist ----------
// iOS ignoriert overflow:hidden am body – deshalb wird die Seite kurz fixiert
// und die Scroll-Position danach exakt wiederhergestellt.
let lockCount = 0; let lockedY = 0;
function lockScroll() {
  if (lockCount++ > 0) return;
  lockedY = window.scrollY;
  const b = document.body.style;
  b.position = 'fixed'; b.top = `-${lockedY}px`; b.left = '0'; b.right = '0'; b.width = '100%';
  document.documentElement.classList.add('modal-open');
}
function unlockScroll() {
  if (lockCount === 0 || --lockCount > 0) return;
  const b = document.body.style;
  b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = '';
  document.documentElement.classList.remove('modal-open');
  window.scrollTo(0, lockedY);
}

export function layer(cls, html) {
  const el = document.createElement('div');
  el.className = `layer ${cls}`;
  el.innerHTML = html;
  document.body.appendChild(el);
  lockScroll();
  requestAnimationFrame(() => el.classList.add('show'));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    el.classList.remove('show');
    setTimeout(() => { el.remove(); unlockScroll(); }, 250);
  };
  return { el, close };
}

// ---------- Bottom-Sheet nach unten wegwischen ----------
function enableSwipeDown(sheetEl, dismiss) {
  const body = sheetEl.querySelector('.bsheet-body');
  let startY = 0; let lastY = 0; let lastT = 0; let vel = 0;
  let tracking = false; let dragging = false; let fromHandle = false;

  sheetEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.target;
    fromHandle = !!t.closest('.grabber, .bsheet-grab, .bsheet-head') && !t.closest('button');
    // im Inhalt nur, wenn er ganz oben ist (sonst normales Scrollen)
    // Drehregler & Co. (data-no-sheet-drag) ziehen das Sheet nicht mit
    tracking = !t.closest('[data-no-sheet-drag]') && (fromHandle || (!t.closest('input, textarea, select') && (!body || body.scrollTop <= 0)));
    dragging = false;
    startY = lastY = e.touches[0].clientY; lastT = performance.now(); vel = 0;
  }, { passive: true });

  sheetEl.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const y = e.touches[0].clientY; const dy = y - startY;
    if (!dragging) {
      if (dy < 0 || (!fromHandle && body && body.scrollTop > 0)) { tracking = false; return; }   // nach oben = Inhalt scrollen
      if (dy < 4) return;
      dragging = true;
      sheetEl.style.transition = 'none';
    }
    e.preventDefault();
    const now = performance.now();
    vel = (y - lastY) / Math.max(1, now - lastT); lastY = y; lastT = now;
    sheetEl.style.transform = `translate3d(0, ${Math.max(0, dy)}px, 0)`;
  }, { passive: false });

  const end = () => {
    if (!dragging) { tracking = false; return; }
    tracking = false; dragging = false;
    const dy = Math.max(0, lastY - startY);
    const h = sheetEl.offsetHeight || 400;
    sheetEl.style.transition = 'transform .28s cubic-bezier(.2,.9,.3,1)';
    if (dy > Math.min(140, h * 0.3) || (dy > 30 && vel > 0.55)) {
      sheetEl.style.transform = 'translate3d(0, 105%, 0)';
      dismiss();
    } else {
      sheetEl.style.transform = '';
      setTimeout(() => { sheetEl.style.transition = ''; }, 300);
    }
  };
  sheetEl.addEventListener('touchend', end, { passive: true });
  sheetEl.addEventListener('touchcancel', end, { passive: true });
}

// ---------- Suchfelder: „x“ zum schnellen Löschen ----------
export function enhanceSearch(root) {
  root.querySelectorAll('.search-field input[type="search"]').forEach((inp) => {
    if (inp.dataset.clearable) return;
    inp.dataset.clearable = '1';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'search-clear'; btn.setAttribute('aria-label', 'Suche löschen');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="var(--clear-x, #fff)" stroke-width="2.2" stroke-linecap="round"/></svg>';
    inp.insertAdjacentElement('afterend', btn);
    const sync = () => { btn.hidden = !inp.value; };
    sync();
    inp.addEventListener('input', sync);
    // pointerdown: Tastatur bleibt offen, Fokus bleibt im Feld
    btn.addEventListener('pointerdown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      inp.value = '';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.focus();
    });
  });
}

// ---------- Toast ----------
// ---------- „Dynamic Island“-Benachrichtigung ----------
// Schwarze Pille, die aus der Notch herauswächst, kurz stehen bleibt und wieder darin verschwindet.
let toastTimer; let toastHide;
/**
 * @param {string} msg   Haupttext
 * @param {'ok'|'err'|'info'} [type]
 * @param {{ sub?: string, icon?: string, duration?: number }} [opt]
 */
export function toast(msg, type = 'ok', opt = {}) {
  const prev = document.querySelector('.toast');
  if (prev) { prev._finish?.(); prev.remove(); clearTimeout(toastTimer); clearTimeout(toastHide); }
  const t = document.createElement('div');
  t.className = `toast ${type}${opt.action ? ' has-action' : ''}${opt.cls ? ` ${opt.cls}` : ''}`;
  t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
  const ic = opt.icon || (type === 'err' ? 'alert' : type === 'info' ? 'info' : 'check');
  const dur = opt.duration ?? (opt.action ? 5000 : type === 'err' ? 3500 : 2400);
  // Mit Aktion (z. B. „Rückgängig“): Knopf rechts mit einem Ring, der in `dur` Millisekunden abläuft
  const act = opt.action ? `<button type="button" class="di-act" style="--dur:${dur}ms">
      <svg class="di-ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>
      <span>${esc(opt.action.label)}</span></button>` : '';
  t.innerHTML = `<span class="di-ic">${icon(ic, 17, 2.6)}</span><span class="di-text"><b>${esc(msg)}</b>${opt.sub ? `<small>${esc(opt.sub)}</small>` : ''}</span>${act}`;
  document.body.appendChild(t);
  void t.offsetWidth;                                     // Startzustand (klein in der Notch) übernehmen
  t.classList.add('show');
  let done = false;
  const hide = () => { clearTimeout(toastTimer); t.classList.remove('show'); t.classList.add('hide'); toastHide = setTimeout(() => t.remove(), 600); };
  // Läuft die Zeit ab (oder kommt eine neue Pille), gilt die Aktion als NICHT gewählt
  t._finish = () => { if (done) return; done = true; opt.onTimeout?.(); };
  toastTimer = setTimeout(() => { t._finish(); hide(); }, dur);
  t.onclick = (e) => {
    if (opt.action && e.target.closest('.di-act')) {
      if (done) return; done = true;
      haptic('medium'); hide(); opt.action.onClick();
      return;
    }
    t._finish(); hide();
  };
}
export const errToast = (e) => {
  console.error(e);
  const msg = e?.message || String(e);
  if (!navigator.onLine || /failed to fetch|load failed|networkerror|fetch failed/i.test(msg)) {
    toast('Offline – Änderungen sind erst wieder mit Internet möglich.', 'err'); return;
  }
  toast(msg, 'err');
};

// ---------- iOS-Alert mit Eingabefeld ----------
export function prompt({ title, message = '', value = '', placeholder = '', okText = 'Speichern', type = 'text' }) {
  return new Promise((resolve) => {
    const { el, close } = layer('alert-layer', `
      <div class="alert" role="dialog">
        <div class="alert-body">
          <h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}
          <input class="alert-input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${type === 'number' ? 'inputmode="decimal"' : ''}>
        </div>
        <button class="alert-btn" data-a="cancel">Abbrechen</button>
        <button class="alert-btn strong" data-a="ok">${esc(okText)}</button>
      </div>`);
    const inp = el.querySelector('input');
    setTimeout(() => { inp.focus(); inp.select(); }, 80);
    const done = (v) => { close(); resolve(v); };
    el.querySelector('[data-a=cancel]').onclick = () => done(null);
    el.querySelector('[data-a=ok]').onclick = () => done(inp.value.trim());
    inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value.trim()); };
  });
}

/** iOS-Hinweisfenster mit eigenem Inhalt (HTML) und einem OK-Knopf */
export function infoBox({ title, html = '', okText = 'OK' }) {
  return new Promise((resolve) => {
    const { el, close } = layer('alert-layer', `
      <div class="alert" role="dialog" aria-modal="true">
        <div class="alert-body"><h3>${esc(title)}</h3><div class="alert-content">${html}</div></div>
        <button class="alert-btn strong" data-a="ok">${esc(okText)}</button>
      </div>`);
    el.querySelector('[data-a=ok]').onclick = () => { close(); resolve(true); };
  });
}

/**
 * Fortschritts-Fenster im iOS-Stil mit blauem Balken.
 * const pp = progressPanel({ title }); pp.set(0.4, 'Bilder 120/307'); pp.done({...}); pp.fail('…');
 */
export function progressPanel({ title = 'Bitte warten …', icon: ic = 'save' } = {}) {
  const { el, close } = layer('alert-layer progress-layer', `
    <div class="alert pp" role="dialog" aria-modal="true" aria-live="polite">
      <div class="pp-body">
        <div class="pp-ic">${icon(ic, 26, 2)}</div>
        <h3 class="pp-title">${esc(title)}</h3>
        <p class="pp-step">Vorbereiten …</p>
        <div class="pp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        <div class="pp-pct">0 %</div>
      </div>
      <div class="pp-actions"></div>
    </div>`);
  const $ = (q) => el.querySelector(q);
  let last = 0;
  const api = {
    set(frac, text) {
      if (typeof frac === 'number' && !Number.isNaN(frac)) {
        last = Math.max(last, Math.min(1, frac));                 // Balken läuft nie rückwärts
        $('.pp-bar i').style.transform = `scaleX(${last})`;
        $('.pp-bar').setAttribute('aria-valuenow', String(Math.round(last * 100)));
        $('.pp-pct').textContent = `${Math.round(last * 100)} %`;
      }
      if (text) $('.pp-step').textContent = text;
    },
    done({ title: t, message = '', actions = [] } = {}) {
      api.set(1);
      el.querySelector('.pp').classList.add('is-done');
      $('.pp-ic').innerHTML = icon('check', 28, 2.6);
      if (t) $('.pp-title').textContent = t;
      $('.pp-step').textContent = message;
      const box = $('.pp-actions');
      box.innerHTML = actions.map((a, i) => `<button class="alert-btn ${a.primary ? 'strong' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('');
      box.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { const a = actions[+b.dataset.i]; if (a.close !== false) close(); a.onClick?.(); }));
    },
    fail(message) {
      el.querySelector('.pp').classList.add('is-error');
      $('.pp-ic').innerHTML = icon('alert', 26, 2.2);
      $('.pp-title').textContent = 'Das hat nicht geklappt';
      $('.pp-step').textContent = message;
      $('.pp-actions').innerHTML = '<button class="alert-btn strong" data-a="ok">OK</button>';
      $('[data-a=ok]').onclick = close;
    },
    close,
  };
  return api;
}

export function confirmBox({ title, message = '', okText = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const { el, close } = layer('alert-layer', `
      <div class="alert" role="dialog">
        <div class="alert-body"><h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}</div>
        <button class="alert-btn" data-a="cancel">Abbrechen</button>
        <button class="alert-btn strong ${danger ? 'danger' : ''}" data-a="ok">${esc(okText)}</button>
      </div>`);
    el.querySelector('[data-a=cancel]').onclick = () => { close(); resolve(false); };
    el.querySelector('[data-a=ok]').onclick = () => { close(); resolve(true); };
  });
}

// ---------- Action-Sheet ----------
export function actionSheet(title, options) {
  return new Promise((resolve) => {
    const { el, close } = layer('sheet-layer', `
      <div class="backdrop" data-a="x"></div>
      <div class="action-sheet">
        <div class="as-group">
          ${title ? `<div class="as-title">${esc(title)}</div>` : ''}
          ${options.map((o, i) => `<button class="as-btn ${o.danger ? 'danger' : ''}" data-i="${i}">${o.icon ? icon(o.icon, 20) : ''}${esc(o.label)}</button>`).join('')}
        </div>
        <button class="as-btn as-cancel" data-a="x">Abbrechen</button>
      </div>`);
    el.querySelectorAll('[data-a=x]').forEach((b) => (b.onclick = () => { close(); resolve(null); }));
    el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { close(); resolve(options[+b.dataset.i].value); }));
  });
}

// ---------- Bottom-Sheet (frei befüllbar) ----------
export function sheet(html, { title = '', onMount } = {}) {
  const { el, close } = layer('sheet-layer', `
    <div class="backdrop" data-a="x"></div>
    <div class="bsheet">
      <div class="grabber"></div>
      ${title ? `<div class="bsheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-a="x" aria-label="Schließen">${icon('x', 22)}</button></div>` : ''}
      <div class="bsheet-body">${html}</div>
    </div>`);
  el.querySelectorAll('[data-a=x]').forEach((b) => (b.onclick = close));
  const sh = el.querySelector('.bsheet');
  // Wegwischen wirkt wie ein Tipp auf den Hintergrund (damit auch Auswahl-Dialoge sauber „abbrechen“)
  enableSwipeDown(sh, () => el.querySelector('.backdrop').click());
  onMount?.(sh, close);
  return close;
}

// ---------- Auswahl-Liste mit Suche ----------
export function pickFrom({ title, items, selected = null, allowNone = false, createLabel = null, onCreate = null }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v, close) => { if (done) return; done = true; close(); resolve(v); };
    sheet(`
      <div class="search-field">${icon('search', 18)}<input type="search" placeholder="Suchen…" class="pick-search"></div>
      <div class="pick-list"></div>
      ${createLabel ? `<button class="btn-tinted full mt" data-a="create">${icon('plus', 18)} ${esc(createLabel)}</button>` : ''}
    `, {
      title,
      onMount: (root, close) => {
        const list = root.querySelector('.pick-list');
        const render = (q = '') => {
          const f = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
          list.innerHTML = (allowNone ? `<button class="pick-row" data-v="">— keine —</button>` : '')
            + f.map((i) => `<button class="pick-row ${i.value === selected ? 'sel' : ''}" data-v="${esc(i.value)}">
                <span>${esc(i.label)}</span>${i.value === selected ? icon('check', 20) : (i.hint ? `<small>${esc(i.hint)}</small>` : '')}</button>`).join('')
            || '<p class="muted center pad">Nichts gefunden</p>';
          list.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => finish(b.dataset.v || null, close)));
        };
        render();
        root.querySelector('.pick-search').oninput = (e) => render(e.target.value);
        enhanceSearch(root);
        const cb = root.querySelector('[data-a=create]');
        if (cb) cb.onclick = async () => {
          const v = await onCreate(); if (v) finish(v, close);
        };
        root.closest('.layer').querySelectorAll('[data-a=x]').forEach((b) => b.addEventListener('click', () => { if (!done) { done = true; resolve(undefined); } }));
      },
    });
  });
}

// ---------- Barcode-Scanner (Kamera) ----------
// Erkennung läuft NUR im sichtbaren Rahmen: html5-qrcode schneidet über „qrbox“
// genau diesen Ausschnitt aus jedem Kamerabild und wertet nur ihn aus.
// Damit Rahmen und Ausschnitt deckungsgleich sind, wird das Video NICHT
// beschnitten (kein object-fit: cover) und der Rahmen exakt in Video-Mitte
// mit denselben Maßen gezeichnet, die die Library verwendet.
const SCAN_MODES = [
  { id: 'auto', label: 'Auto', icon: 'corners' },
  { id: 'area', label: 'Bereich', icon: 'barcode' },
  { id: 'multi', label: 'Multi', icon: 'list' },
  { id: 'ocr', label: 'OCR', icon: 'camera' },
  { id: 'input', label: 'Eingabe', icon: 'edit' },
  { id: 'nfc', label: 'NFC', icon: 'nfc' },
];
const SCAN_HINTS = {
  auto: 'Barcode oder QR-Code in den Rahmen halten',
  area: 'Nur der Code im schmalen Rahmen wird gelesen – ideal bei vielen Etiketten nebeneinander',
  multi: 'Codes nacheinander in den Rahmen halten, dann den richtigen antippen',
  input: 'Code eintippen oder mit einem Bluetooth-/USB-Scanner einlesen',
  nfc: 'NFC-Tag an die Rückseite des Geräts halten',
};
/** Rahmengröße je Modus – wird 1:1 für Erkennung (qrbox) UND Anzeige verwendet */
function scanBox(mode, vw, vh) {
  const area = mode === 'area';
  let w = vw * (area ? 0.74 : 0.84);
  let h = area ? Math.min(vh * 0.26, w * 0.4) : Math.min(vh * 0.5, w * 0.62);
  w = Math.floor(Math.max(80, Math.min(w, vw - 8)));
  h = Math.floor(Math.max(56, Math.min(h, vh - 8)));
  return { width: w, height: h };
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// ---------- Scan-Verlauf: jeder erkannte Code wird gemerkt (nur auf diesem Gerät) ----------
const SCAN_HIST = 'ss-scan-hist';
let scanLabeler = () => null;                    // Code → { title, sub } – setzt main.js (kennt die Teile)
export function setScanLabeler(fn) { scanLabeler = fn; }
export function scanHistory() { try { return JSON.parse(localStorage.getItem(SCAN_HIST) || '[]'); } catch { return []; } }
export function clearScanHistory() { try { localStorage.removeItem(SCAN_HIST); } catch { /* egal */ } }
function rememberScan(code, title) {
  try {
    const list = scanHistory().filter((x) => x.code !== code);
    list.unshift({ code, title, at: Date.now() });
    localStorage.setItem(SCAN_HIST, JSON.stringify(list.slice(0, 40)));
  } catch { /* egal */ }
}
const agoShort = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
};

export function scan({ title = 'Scanner' } = {}) {
  return new Promise((resolve) => {
    let mode = 'auto';
    try { mode = localStorage.getItem('wl-scan-mode') || 'auto'; } catch {}
    if (!['auto', 'area', 'multi', 'input'].includes(mode)) mode = 'auto';

    const { el, close } = layer('sc-layer', `
      <div class="sc-top">
        <div class="sc-bar">
          <span class="sc-side"><button type="button" class="sc-icon" data-a="hist" aria-label="Scan-Verlauf">${icon('clock', 24)}</button></span>
          <h2>${esc(title)}</h2>
          <span class="sc-side right">
            <button type="button" class="sc-icon" data-a="help" aria-label="Scanner Hilfe">${icon('help', 24)}</button>
            <button type="button" class="sc-icon" data-a="x" aria-label="Schließen">${icon('x', 26)}</button>
          </span>
        </div>
        <div class="sc-modes" role="tablist" aria-label="Scan-Modus">
          ${SCAN_MODES.map((m) => `<button type="button" role="tab" data-mode="${m.id}">${icon(m.icon, 23, 1.8)}<span>${m.label}</span></button>`).join('')}
        </div>
      </div>
      <div class="sc-view">
        <div class="sc-stage">
          <div id="sc-reader"></div>
          <div class="sc-frame" hidden><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><span class="sc-line"></span><span class="sc-ok" aria-hidden="true">${icon('check', 34, 3)}</span></div>
        </div>
        <div class="sc-msg" hidden></div>
        <button type="button" class="sc-torch" data-a="torch" aria-label="Taschenlampe" hidden>${icon('flash', 28, 2)}</button>
      </div>
      <div class="sc-bottom">
        <label class="sc-zoom" hidden>${icon('search', 16)}<input type="range" min="1" max="5" step="0.1" value="1" aria-label="Zoom"><span>1×</span></label>
        <div class="sc-multi" hidden>
          <div class="sc-multi-head"><b>Gefundene Codes</b><button type="button" data-a="mclear">Leeren</button></div>
          <div class="sc-chips"><span class="sc-empty">Noch nichts erkannt</span></div>
        </div>
        <p class="sc-hint"></p>
        <form class="sc-manual"><input placeholder="…oder Code eintippen" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="submit">OK</button></form>
      </div>`);

    const $ = (q) => el.querySelector(q);
    const frame = $('.sc-frame'); const msg = $('.sc-msg'); const hint = $('.sc-hint');
    const torchBtn = $('.sc-torch'); const zoomWrap = $('.sc-zoom'); const multiBox = $('.sc-multi');
    const input = $('.sc-manual input');
    let qr = null; let lib = null; let running = false; let starting = null; let finished = false;
    let lastBox = null; let torchOn = false; let nfcAbort = null;
    const found = [];

    const showMsg = (t) => { msg.textContent = t; msg.hidden = !t; };
    const placeFrame = () => {
      if (!lastBox) return;
      frame.style.width = `${lastBox.width}px`;
      frame.style.height = `${lastBox.height}px`;
      frame.hidden = false;
    };
    const stopCam = async () => {
      if (starting) { try { await starting; } catch {} }
      if (qr && running) { try { await qr.stop(); } catch {} }
      running = false;
      try { qr?.clear(); } catch {}
      qr = null; frame.hidden = true; torchBtn.hidden = true; zoomWrap.hidden = true; torchOn = false;
    };
    const finish = async (v) => {
      if (finished) return; finished = true;
      if (v) rememberScan(String(v).trim(), title);
      try { nfcAbort?.abort(); } catch {}
      await stopCam(); close(); resolve(v);
    };
    const renderChips = () => {
      $('.sc-chips').innerHTML = found.length
        ? found.map((c, i) => `<button type="button" class="sc-chip" data-i="${i}">${esc(c)}</button>`).join('')
        : '<span class="sc-empty">Noch nichts erkannt</span>';
      el.querySelectorAll('.sc-chip').forEach((b) => (b.onclick = () => finish(found[+b.dataset.i])));
    };
    const onCode = (text) => {
      text = String(text || '').trim(); if (!text || finished) return;
      if (mode === 'multi') {
        if (found.includes(text)) return;
        found.unshift(text); haptic('light'); renderChips();
        frame.classList.remove('hit'); void frame.offsetWidth; frame.classList.add('hit');
        return;
      }
      // Treffer: Rahmen blitzt grün auf, zieht sich zusammen, Haken erscheint – dann erst schließen
      haptic('success'); frame.classList.add('hit', 'got');
      setTimeout(() => finish(text), reduced() ? 150 : 560);
    };

    const startCam = () => {
      starting = (async () => {
        lib ??= await import('html5-qrcode');
        if (finished) return;
        const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = lib;
        const m = mode;
        qr = new Html5Qrcode('sc-reader', {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.ITF, F.DATA_MATRIX, F.CODABAR],
        });
        await qr.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            aspectRatio: 1.7777778,          // Hochformat am Handy: füllt den Bildschirm weitgehend
            disableFlip: true,
            qrbox: (vw, vh) => { lastBox = scanBox(m, vw, vh); requestAnimationFrame(placeFrame); return lastBox; },
          },
          (text) => onCode(text),
          () => {},
        );
        running = true;
        placeFrame();
        // Taschenlampe & Zoom nur anzeigen, wenn die Kamera es kann
        try {
          const caps = qr.getRunningTrackCameraCapabilities();
          const torch = caps.torchFeature();
          if (torch.isSupported()) {
            torchBtn.hidden = false;
            torchBtn.onclick = async () => {
              torchOn = !torchOn;
              try { await torch.apply(torchOn); torchBtn.classList.toggle('on', torchOn); haptic('light'); } catch { torchOn = !torchOn; }
            };
          }
          const zoom = caps.zoomFeature();
          if (m === 'area' && zoom.isSupported()) {
            const r = zoomWrap.querySelector('input'); const lab = zoomWrap.querySelector('span');
            r.min = zoom.min(); r.max = Math.min(zoom.max(), 8); r.step = zoom.step() || 0.1; r.value = zoom.value() || zoom.min();
            lab.textContent = `${(+r.value).toFixed(1)}×`;
            r.oninput = () => { lab.textContent = `${(+r.value).toFixed(1)}×`; try { zoom.apply(+r.value); } catch {} };
            zoomWrap.hidden = false;
          }
        } catch { /* Funktionen nicht verfügbar */ }
      })();
      return starting.then(() => { starting = null; showMsg(''); }).catch(() => {
        starting = null; running = false;
        showMsg('Kamera nicht verfügbar. Bitte Kamera-Zugriff erlauben (Einstellungen › Safari › Kamera) oder den Code unten eintippen.');
      });
    };

    const startNfc = async () => {
      try {
        nfcAbort = new AbortController();
        const reader = new window.NDEFReader();
        await reader.scan({ signal: nfcAbort.signal });
        reader.onreading = (e) => {
          let text = '';
          for (const rec of e.message?.records || []) {
            if (rec.recordType === 'text' || rec.recordType === 'url') { text = new TextDecoder(rec.encoding || 'utf-8').decode(rec.data); break; }
          }
          onCode(text || e.serialNumber);
        };
      } catch { showMsg('NFC konnte nicht gestartet werden.'); }
    };

    const setMode = async (m, first = false) => {
      if (m === 'ocr') { toast('OCR (Text aus Foto) folgt im nächsten Schritt – bis dahin bitte „Eingabe“ nutzen.'); return; }
      if (m === 'nfc' && !('NDEFReader' in window)) { toast('NFC wird von iPhone-Browsern leider nicht unterstützt (nur Android/Chrome).', 'err'); return; }
      if (m === mode && !first) return;
      mode = m;
      if (m !== 'nfc') { try { localStorage.setItem('wl-scan-mode', m); } catch {} }
      el.querySelectorAll('[data-mode]').forEach((b) => {
        const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
      });
      el.classList.toggle('mode-input', m === 'input' || m === 'nfc');
      hint.textContent = SCAN_HINTS[m] || '';
      multiBox.hidden = m !== 'multi';
      try { nfcAbort?.abort(); } catch {} nfcAbort = null;
      await stopCam();
      if (finished) return;
      if (m === 'input') { showMsg(''); setTimeout(() => input.focus(), 50); return; }
      if (m === 'nfc') { showMsg('NFC-Tag an das Gerät halten …'); startNfc(); return; }
      startCam();
    };

    el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { haptic('light'); setMode(b.dataset.mode); }));
    $('[data-a=x]').onclick = () => finish(null);
    $('[data-a=mclear]').onclick = () => { found.length = 0; renderChips(); };
    $('[data-a=help]').onclick = () => infoBox({
      title: 'Scanner Hilfe',
      html: `<dl class="sc-help">
        <dt>Auto</dt><dd>Erster erkannter Barcode wird übernommen.</dd>
        <dt>Bereich</dt><dd>Nur Barcodes im markierten Bereich.${'' /* Zoom, falls verfügbar */}</dd>
        <dt>Multi</dt><dd>Mehrere Barcodes sammeln, dann auswählen.</dd>
        <dt>OCR</dt><dd>Text aus Foto erkennen (z.&nbsp;B. Seriennummern).</dd>
        <dt>Eingabe</dt><dd>Tastatur oder Bluetooth-/USB-Scanner.</dd>
        <dt>NFC</dt><dd>Liest einen NFC-Tag aus.</dd>
      </dl>`,
      okText: 'Ok',
    });
    // Verlauf: zuletzt erkannte Codes – antippen übernimmt den Code wie frisch gescannt
    $('[data-a=hist]').onclick = () => {
      el.querySelector('.sc-hist')?.remove();
      const list = scanHistory().slice(0, 15);
      const p = document.createElement('div');
      p.className = 'sc-hist';
      p.innerHTML = `<div class="sch-head"><b>Zuletzt gescannt</b><button type="button" class="sc-icon" data-h="x" aria-label="Verlauf schließen">${icon('x', 22)}</button></div>
        <div class="sch-list">${list.length ? list.map((x, i) => { const lab = scanLabeler(x.code); return `<button type="button" class="sch-row" data-i="${i}">
          <span class="sch-ic ${lab ? 'ok' : ''}">${icon(lab ? 'box' : 'barcode', 18, 2)}</span>
          <span class="sch-t"><b>${esc(lab?.title || x.code)}</b><small>${lab ? `${esc(x.code)} · ` : 'Unbekannter Code · '}${agoShort(x.at)}</small></span>${icon('chevR', 16)}</button>`; }).join('')
          : '<p class="sch-empty">Noch nichts gescannt</p>'}</div>`;
      el.appendChild(p);
      requestAnimationFrame(() => p.classList.add('show'));
      haptic('light');
      const shut = () => { p.classList.remove('show'); setTimeout(() => p.remove(), 300); };
      p.querySelector('[data-h=x]').onclick = shut;
      p.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { haptic('success'); finish(list[+b.dataset.i].code); }));
    };
    $('.sc-manual').onsubmit = (e) => { e.preventDefault(); const v = input.value.trim(); if (v) finish(v); };
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.alert-layer')) { document.removeEventListener('keydown', onKey); finish(null); } };
    document.addEventListener('keydown', onKey);

    setMode(mode, true);
  });
}

// ---------- Etikett mit QR-Code drucken ----------
// Gängige Rollen: Brother DK-11209 (62×29), Dymo 11352 (54×25), Zebra/Allgemein (50×30)
export const LABEL_SIZES = [
  { id: '62x29', w: 62, h: 29, label: '62 × 29 mm', hint: 'Brother DK-11209' },
  { id: '54x25', w: 54, h: 25, label: '54 × 25 mm', hint: 'Dymo 11352' },
  { id: '50x30', w: 50, h: 30, label: '50 × 30 mm', hint: 'Allgemein' },
];
export async function qrSvg(text) {
  const QR = (await import('qrcode')).default;
  // margin 1 = schmaler weißer Ruherand (wichtig fürs Scannen); kurze Inhalte → große, robuste Punkte
  return QR.toString(String(text), { type: 'svg', margin: 1, errorCorrectionLevel: String(text).length <= 24 ? 'Q' : 'M', color: { dark: '#000000', light: '#ffffff' } });
}
/** Etikett-HTML in Millimetern (für Vorschau und Druck identisch) */
export const LABEL_BRAND_DEFAULT = 'RepairMobile';
export function labelBrand() {
  try { if (localStorage.getItem('ss-label-brand-on') === '0') return ''; return localStorage.getItem('ss-label-brand') ?? LABEL_BRAND_DEFAULT; } catch { return LABEL_BRAND_DEFAULT; }
}
function labelHTML({ name, line2 = '', line3 = '', svg }, size) {
  const brand = labelBrand().trim();
  return `<div class="lbl" style="--lw:${size.w}mm;--lh:${size.h}mm">
    <div class="lbl-qr">${svg}</div>
    <div class="lbl-text">
      ${brand ? `<div class="lbl-brand">${esc(brand)}</div>` : ''}
      <div class="lbl-name">${esc(name)}</div>
      ${line2 ? `<div class="lbl-l2">${esc(line2)}</div>` : ''}
      ${line3 ? `<div class="lbl-l3">${esc(line3)}</div>` : ''}
    </div>
  </div>`;
}
/** Druckt NUR das Etikett: eigenes Druck-Element + @page in Etikettengröße, alles andere ist beim Druck ausgeblendet */
function printLabel(html, size, copies = 1) {
  const pages = Array.isArray(html) ? html : [html];
  document.getElementById('print-root')?.remove();
  document.getElementById('print-page')?.remove();
  const rootEl = document.createElement('div');
  rootEl.id = 'print-root';
  const n = Math.max(1, Math.min(50, copies));
  rootEl.innerHTML = pages.map((h) => Array.from({ length: n }, () => `<div class="print-page">${h}</div>`).join('')).join('');
  document.body.appendChild(rootEl);
  const st = document.createElement('style');
  st.id = 'print-page';
  st.textContent = `@page { size: ${size.w}mm ${size.h}mm; margin: 0; }`;
  document.head.appendChild(st);
  document.documentElement.classList.add('print-label');
  const cleanup = () => {
    document.documentElement.classList.remove('print-label');
    rootEl.remove(); st.remove();
    window.removeEventListener('afterprint', onAfter);
  };
  const total = pages.length * n;
  const onAfter = () => { cleanup(); successHUD(total > 1 ? 'Etiketten gesendet' : 'Etikett gesendet', total > 1 ? `${total} Stück` : ''); };
  window.addEventListener('afterprint', onAfter);
  // direkt im Klick aufrufen – Safari blockiert print() nach einer Verzögerung
  try { window.print(); } catch { cleanup(); }
  setTimeout(() => { if (document.documentElement.classList.contains('print-label')) cleanup(); }, 60000);
}

/**
 * Etikett-Dialog: Vorschau, Größe, Anzahl, Drucken.
 * @param {{title:string, sub?:string, code:string, number?:string|number}} o
 *   title = Name, sub = 2. Zeile (z. B. Chargennummer/Platz), code = Inhalt des QR-Codes
 */
/** Ein Etikett ({ title, sub, code, extra }) oder mehrere (Array) – bei mehreren blättert man in der Vorschau */
export async function showLabel(arg) {
  const items = (Array.isArray(arg) ? arg : [arg]).filter((x) => x && x.code);
  if (!items.length) return;
  const multi = items.length > 1;
  let sizeId = '62x29';
  try { sizeId = localStorage.getItem('wl-label-size') || sizeId; } catch {}
  let datas;
  try { datas = await Promise.all(items.map(async (x) => ({ name: x.title, line2: x.sub || '', line3: x.extra || '', svg: await qrSvg(x.code), code: x.code }))); }
  catch (e) { toast('QR-Code konnte nicht erzeugt werden', 'err'); return; }
  const size = () => LABEL_SIZES.find((x) => x.id === sizeId) || LABEL_SIZES[0];
  let cur = 0;
  let data = datas[0];
  const code = data.code;
  sheet(`
    <div class="lbl-preview"><span class="lbl-slot" aria-hidden="true"></span><div class="lbl-scale"></div></div>
    ${multi ? `<div class="lbl-pager"><button type="button" class="icon-btn" data-p="-1" aria-label="Vorheriges Etikett">${icon('chevL', 22)}</button><span data-f="pos">1 von ${datas.length}</span><button type="button" class="icon-btn" data-p="1" aria-label="Nächstes Etikett">${icon('chevR', 22)}</button></div>` : ''}
    <p class="muted small center"><span data-f="hint"></span> · QR-Inhalt: <b class="selectable" data-f="code">${esc(code)}</b></p>
    <div class="form-group">
      <label class="frow"><span>Etikettengröße</span>
        <select data-f="size">${LABEL_SIZES.map((x) => `<option value="${x.id}" ${x.id === sizeId ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
      <div class="frow"><span>Anzahl</span>
        <div class="stepper sm"><button type="button" data-c="-1" aria-label="Weniger">${icon('minus', 16, 2.4)}</button><span data-f="copies">1</span><button type="button" data-c="1" aria-label="Mehr">${icon('plus', 16, 2.4)}</button></div></div>
    </div>
    <button class="btn-filled full mt" data-a="print">${icon('print', 20)} ${multi ? `Alle ${datas.length} Etiketten drucken` : 'Etikett drucken'}</button>
    <p class="muted small center mt">Drucken am PC (Edge/Chrome): Ränder „Keine“, Kopf- und Fußzeilen aus.</p>`,
  {
    title: multi ? `${datas.length} Etiketten drucken` : 'Etikett drucken',
    onMount: (root) => {
      const prev = root.querySelector('.lbl-scale');
      const render = () => {
        data = datas[cur];
        prev.innerHTML = labelHTML(data, size()); root.querySelector('[data-f=hint]').textContent = `${size().label} (${size().hint})`;
        root.querySelector('[data-f=code]').textContent = data.code;
        if (multi) root.querySelector('[data-f=pos]').textContent = `${cur + 1} von ${datas.length}`;
      };
      render();
      root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { cur = (cur + +b.dataset.p + datas.length) % datas.length; haptic('light'); render(); }));
      let copies = 1;
      root.querySelector('[data-f=size]').onchange = (e) => { sizeId = e.target.value; try { localStorage.setItem('wl-label-size', sizeId); } catch {} render(); };
      root.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { copies = Math.max(1, Math.min(50, copies + +b.dataset.c)); root.querySelector('[data-f=copies]').textContent = copies; haptic('light'); }));
      root.querySelector('[data-a=print]').onclick = () => {
        const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const homeApp = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
        if (iOS && homeApp) {
          infoBox({
            title: 'Drucken am iPhone',
            html: `<p>Als App vom Home-Bildschirm lässt iOS leider keinen Druckdialog zu.</p>
                   <p>Der <b>Brother QL-800</b> hängt außerdem nur per USB am PC – das iPhone erreicht ihn nicht.</p>
                   <p>Etiketten bitte am <b>PC</b> drucken. Scannen klappt am iPhone ganz normal.</p>`,
          });
          return;
        }
        // Etikett „kommt aus dem Drucker“: schiebt sich aus dem Schlitz heraus, dann erst der Druckdialog.
        // Safari blockiert print() nach einer Verzögerung → dort sofort drucken (ohne Vorab-Animation).
        const safari = /^((?!chrome|android|crios|edg).)*safari/i.test(navigator.userAgent);
        const prev = root.querySelector('.lbl-preview');
        const go = () => printLabel(datas.map((d) => labelHTML(d, size())), size(), copies);
        if (safari || matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
        prev.classList.remove('printing'); void prev.offsetWidth; prev.classList.add('printing');
        haptic('light');
        setTimeout(() => { go(); prev.classList.remove('printing'); }, 900);
      };
    },
  });
}

// ---------- Bilder verkleinern vor dem Upload ----------
export async function compressImage(file, max = 1400, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    blob.name = file.name.replace(/\.\w+$/, '') + '.jpg';
    return blob;
  } catch { return file; }
}

export function pickFiles({ accept = 'image/*', multiple = true, capture = false } = {}) {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple;
    if (capture) i.setAttribute('capture', 'environment');
    i.onchange = () => resolve([...i.files]);
    i.click();
  });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Kopiert'); }
  catch { toast('Kopieren nicht möglich', 'err'); }
}

// =====================================================================
//  Micro-Interactions: Count-Up, Pop, Erfolgs-HUD
// =====================================================================
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Animationen „reduziert“ (Einstellungen): Konfetti, fliegende Bilder, Zahnräder usw. bleiben weg */
const fxCalm = () => { try { return localStorage.getItem('ss-motion') === 'reduced'; } catch { return false; } };

/** Wartet, bis der Video-Splash ausgeblendet wird (sonst liefe die Animation unsichtbar darunter ab) */
export function afterSplash() {
  const sp = document.getElementById('splash');
  if (!sp || sp.classList.contains('out')) return Promise.resolve();
  return new Promise((resolve) => {
    const mo = new MutationObserver(() => { if (!sp.isConnected || sp.classList.contains('out')) { mo.disconnect(); resolve(); } });
    mo.observe(sp, { attributes: true, attributeFilter: ['class'] });
    mo.observe(document.body, { childList: true });
  });
}

/** Zahl weich von `from` auf `to` hochzählen (ease-out: schnell los, sanft bremsen) */
export function countUp(el, to, { from = 0, dur = 800 } = {}) {
  to = +to || 0; from = +from || 0;
  const fmt = (v) => fmtQty(Number.isInteger(to) ? Math.round(v) : Math.round(v * 10) / 10);
  if (from === to || reducedMotion()) { el.textContent = fmtQty(to); return; }
  el.textContent = fmt(from);
  afterSplash().then(() => {
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);        // easeOutCubic
    const step = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** Kurzes „Pop“ (scale 1.2 → zurückfedern) */
export function pop(el) {
  if (!el || reducedMotion()) return;
  el.classList.remove('num-pop');
  void el.offsetWidth;                                  // Animation neu starten
  el.classList.add('num-pop');
  el.addEventListener('animationend', () => el.classList.remove('num-pop'), { once: true });
}
/** Alle [data-pop="key"] mit data-v vergleichen: hat sich der Wert seit dem letzten Anzeigen geändert → Pop */
const popMemo = new Map();
export function popChanged(root) {
  root.querySelectorAll('[data-pop]').forEach((el) => {
    const k = el.dataset.pop; const v = el.dataset.v;
    if (popMemo.has(k) && popMemo.get(k) !== v) pop(el);
    popMemo.set(k, v);
  });
}

/** Natives iOS-Erfolgs-HUD: dunkles, unscharfes Quadrat mit animiertem Haken; blendet nach 1,5 s aus */
let hudTimer;
export function successHUD(title = 'Erledigt', sub = '') {
  document.querySelector('.hud')?.remove();
  clearTimeout(hudTimer);
  const el = document.createElement('div');
  el.className = 'hud'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <svg class="hud-check" viewBox="0 0 52 52" aria-hidden="true">
      <circle class="hud-ring" cx="26" cy="26" r="23"/>
      <path class="hud-tick" d="M15 27.5l7.2 7.2L37.5 19"/>
    </svg>
    <b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  document.body.appendChild(el);
  haptic('success');
  requestAnimationFrame(() => el.classList.add('show'));
  hudTimer = setTimeout(() => {
    el.classList.remove('show'); el.classList.add('hide');
    setTimeout(() => el.remove(), 320);
  }, 1500);
}

/** Skeleton-Bausteine (grau mit wanderndem Glanz) */
export const skel = (cls = '', style = '') => `<span class="skel ${cls}" ${style ? `style="${style}"` : ''}></span>`;

// =====================================================================
//  Haptic Touch: langes Drücken → schwebendes Kontextmenü
// =====================================================================
/**
 * Langes Drücken (500 ms) auf Elemente innerhalb von `container`.
 * Abbruch bei Bewegung (Scrollen) oder frühem Loslassen. Der Klick danach wird geschluckt.
 */
export function onLongPress(container, selector, handler, { delay = 500, enabled = () => true } = {}) {
  let timer = 0; let startX = 0; let startY = 0; let target = null; let fired = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; target?.classList.remove('lp-hold'); target = null; };
  container.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !enabled()) return;
    const el = e.target.closest(selector);
    if (!el || !container.contains(el)) return;
    cancel();
    target = el; startX = e.clientX; startY = e.clientY;
    el.classList.add('lp-hold');                    // sanftes Eindrücken während des Haltens
    timer = setTimeout(() => {
      const t = target; cancel();
      if (!t) return;
      fired = Date.now();
      haptic('medium');
      handler(t);
    }, delay);
  });
  container.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
  }, { passive: true });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => container.addEventListener(ev, cancel));
  window.addEventListener('scroll', cancel, { passive: true });
  // Klick, der direkt auf das lange Drücken folgt, nicht als „Öffnen“ werten
  container.addEventListener('click', (e) => {
    if (Date.now() - fired < 900) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // Rechtsklick am PC bzw. Android-Kontextereignis → gleiches Menü
  container.addEventListener('contextmenu', (e) => {
    const el = e.target.closest(selector);
    if (!el || !enabled()) return;
    e.preventDefault();
    if (Date.now() - fired < 900) return;
    cancel(); fired = Date.now(); handler(el);
  });
}

/**
 * iOS-Kontextmenü: Element „hebt ab“ (scale 1.03), Rest verschwimmt, Menü schwebt darunter/darüber.
 * items: [{ label, value, icon, danger }] oder '-' als Trenner. Liefert den gewählten value (oder null).
 */
export function contextMenu(sourceEl, { title = '', sub = '', items = [] } = {}) {
  return new Promise((resolve) => {
    const rect = sourceEl.getBoundingClientRect();
    const groups = [[]];
    items.forEach((it) => (it === '-' ? groups.push([]) : groups[groups.length - 1].push(it)));
    const { el, close } = layer('ctx-layer', `
      <div class="ctx-backdrop"></div>
      <div class="ctx-preview"></div>
      <div class="ctx-menu" role="menu">
        ${title ? `<div class="ctx-head"><b>${esc(title)}</b>${sub ? `<small>${sub}</small>` : ''}</div>` : ''}
        ${groups.filter((g) => g.length).map((g) => `<div class="ctx-group">${g.map((it, i) => `
          <button class="ctx-item ${it.danger ? 'danger' : ''}" role="menuitem" data-v="${esc(it.value)}"><span>${esc(it.label)}</span>${it.icon ? icon(it.icon, 20) : ''}</button>`).join('')}</div>`).join('')}
      </div>`);
    // Vorschau: Kopie des Elements an exakt derselben Stelle, leicht vergrößert
    const prev = el.querySelector('.ctx-preview');
    const clone = sourceEl.cloneNode(true);
    clone.removeAttribute('href'); clone.classList.remove('lp-hold');
    prev.appendChild(clone);
    Object.assign(prev.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    sourceEl.classList.add('ctx-source');

    const menu = el.querySelector('.ctx-menu');
    const vh = window.innerHeight; const vw = window.innerWidth;
    const safeT = 54; const safeB = 34; const gap = 10;
    const mh = menu.offsetHeight; const mw = menu.offsetWidth;
    let top; let shift = 0; let origin = 'top';
    if (rect.bottom + gap + mh <= vh - safeB) top = rect.bottom + gap;
    else if (rect.top - gap - mh >= safeT) { top = rect.top - gap - mh; origin = 'bottom'; }
    else { top = vh - safeB - mh; shift = Math.min(0, top - gap - rect.bottom); }   // Element nach oben schieben
    if (shift && rect.top + shift < safeT) shift = safeT - rect.top;
    const left = Math.min(Math.max(12, rect.left + 16), vw - mw - 12);
    Object.assign(menu.style, { top: `${top}px`, left: `${left}px`, transformOrigin: `${origin} left` });
    prev.style.setProperty('--shift', `${shift}px`);

    let done = false;
    const opened = Date.now();
    const finish = (v) => {
      if (done || Date.now() - opened < 350) return;   // Loslassen des Fingers nicht als Tipp werten
      done = true;
      el.classList.add('closing');
      setTimeout(() => sourceEl.classList.remove('ctx-source'), 230);
      close(); resolve(v);
    };
    el.querySelector('.ctx-backdrop').onclick = () => finish(null);
    prev.onclick = () => finish(null);
    el.querySelectorAll('.ctx-item').forEach((b) => (b.onclick = () => { haptic('light'); finish(b.dataset.v); }));
  });
}

// =====================================================================
//  Wisch-Aktionen für Listenzeilen (wie in Mail/Outlook)
//  nach links  → Aktionen von rechts (z. B. Bearbeiten, Löschen)
//  nach rechts → Aktion von links  (z. B. Dazu buchen)
//  Kurz wischen = Knöpfe bleiben offen stehen, weit wischen = Hauptaktion sofort.
// =====================================================================
/**
 * @param {HTMLElement} container  Element, in dem die Zeilen liegen (bleibt beim Neuaufbau der Liste bestehen)
 * @param {string} selector        Zeilen-Selektor, z. B. '.mrow'
 * @param {{ left?: Array, right?: Array, enabled?: () => boolean, onAction: (key: string, row: HTMLElement) => void }} opt
 *        left/right: [{ key, label, icon, tone, width }] – die LETZTE Aktion von `left` bzw. die ERSTE von `right` ist die Hauptaktion (voller Wisch)
 */
export function enableSwipeActions(container, selector, { left = [], right = [], enabled = () => true, onAction }) {
  const BTN = 78;                       // Standardbreite eines Knopfs (pro Aktion über `width` änderbar)
  let row = null; let under = null; let side = null;      // side: 'left' (Zeile wandert nach links) | 'right'
  let startX = 0; let startY = 0; let base = 0; let dx = 0;
  let dragging = false; let decided = false; let full = false; let lastEnd = 0;
  let open = null;                      // { row, under, side, x }

  const widthOf = (s) => (s === 'left' ? left : right).reduce((sum, a) => sum + (a.width || BTN), 0);
  const build = (r, s) => {
    const acts = s === 'left' ? left : right;
    const u = document.createElement('div');
    u.className = `swipe-under swipe-${s}`;
    u.style.top = `${r.offsetTop}px`; u.style.height = `${r.offsetHeight}px`;
    u.innerHTML = acts.map((a, i) => {
      const main = s === 'left' ? i === acts.length - 1 : i === 0;
      return `<button type="button" class="swipe-btn tone-${a.tone || 'gray'} ${main ? 'main' : ''}" data-key="${a.key}">${a.icon ? icon(a.icon, 22) : ''}<span>${esc(a.label)}</span></button>`;
    }).join('');
    r.parentNode.insertBefore(u, r);
    u.addEventListener('click', (e) => {
      const b = e.target.closest('.swipe-btn'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const target = r; close(); haptic('light'); onAction(b.dataset.key, target);
    });
    return u;
  };
  const setX = (x, animate) => {
    if (!row) return;
    row.classList.toggle('swiping', !animate);
    row.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    if (under) {
      under.classList.toggle('no-anim', !animate);
      under.style.setProperty('--w', `${Math.abs(x)}px`);
    }
  };
  function close(animate = true) {
    const o = open || (row ? { row, under } : null);
    if (!o) return;
    open = null;
    o.row.classList.remove('swiping');
    if (!animate) o.row.style.transition = 'none';
    o.row.style.transform = '';
    o.under?.style.setProperty('--w', '0px');
    o.under?.classList.remove('no-anim', 'full');
    const u = o.under; const r = o.row;
    setTimeout(() => { u?.remove(); r.classList.remove('swipe-open'); r.style.transition = ''; }, animate ? 320 : 0);
    if (row === o.row) { row = null; under = null; side = null; }
  }

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || !enabled()) return;
    const r = e.target.closest(selector);
    if (e.target.closest('.swipe-under')) return;           // Tipp auf einen Aktionsknopf
    if (open && open.row !== r) { close(); }                // andere Zeile berührt → offene schließen
    if (!r || !container.contains(r)) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    dragging = true; decided = false; full = false; dx = 0;
    if (open && open.row === r) { row = r; under = open.under; side = open.side; base = open.x; }
    else { row = r; under = null; side = null; base = 0; }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!dragging || !row) return;
    const mx = e.touches[0].clientX - startX; const my = e.touches[0].clientY - startY;
    if (!decided) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      if (Math.abs(my) > Math.abs(mx)) { dragging = false; if (!open) { row = null; } return; }   // senkrecht = scrollen
      decided = true;
      row.classList.add('swipe-open');
    }
    e.preventDefault(); e.stopPropagation();                // nicht scrollen, kein Pull-to-Refresh
    let x = base + mx;
    const want = x < 0 ? 'left' : x > 0 ? 'right' : side;
    if (want && !(want === 'left' ? left : right).length) x = 0;   // in diese Richtung gibt es keine Aktion
    if (want && want !== side && x !== 0) { under?.remove(); side = want; under = build(row, side); }
    const w = row.offsetWidth; const max = widthOf(side || 'left');
    // über die Knopfbreite hinaus: leichter Widerstand
    const over = Math.abs(x) - max;
    if (over > 0) x = Math.sign(x) * (max + over * 0.75);
    x = Math.max(-w, Math.min(w, x));
    dx = x;
    const nowFull = Math.abs(x) > Math.max(max + 50, w * 0.55);
    if (nowFull !== full) { full = nowFull; under?.classList.toggle('full', full); haptic(full ? 'medium' : 'light'); }
    setX(x, false);
  }, { passive: false });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (!decided || !row) return;
    lastEnd = Date.now();
    const max = widthOf(side || 'left');
    if (full && under) {                                    // weit gewischt → Hauptaktion sofort
      const key = under.querySelector('.swipe-btn.main')?.dataset.key;
      const target = row;
      open = { row, under, side, x: dx };
      close();
      if (key) onAction(key, target);
      return;
    }
    if (Math.abs(dx) > max * 0.45 && under) {               // offen stehen lassen
      const x = side === 'left' ? -max : max;
      setX(x, true);
      open = { row, under, side, x };
    } else {
      open = { row, under, side, x: 0 };
      close();
    }
  };
  container.addEventListener('touchend', end, { passive: true });
  container.addEventListener('touchcancel', end, { passive: true });

  // Tipp direkt nach dem Wischen bzw. auf eine offene Zeile: schließen statt öffnen
  container.addEventListener('click', (e) => {
    if (e.target.closest('.swipe-under')) return;
    if (open || Date.now() - lastEnd < 350) {
      e.preventDefault(); e.stopPropagation();
      if (open) close();
    }
  }, true);
  window.addEventListener('scroll', () => { if (open && !dragging) close(); }, { passive: true });
  document.addEventListener('touchstart', (e) => { if (open && !container.contains(e.target)) close(); }, { passive: true });

  return { close: () => close(false) };
}

// =====================================================================
//  Konfetti für Meilensteine (Inventur fertig, Warenkorb komplett eingebucht …)
//  Kurz, dezent, in den Markenfarben – blockiert keine Eingaben.
// =====================================================================
export function confetti({ count = 90, duration = 1700 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || fxCalm()) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = innerWidth; const H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const colors = ['#1d4e89', '#2f80ed', '#4ab3f4', '#f7931e', '#ff5e3a', '#34c759', '#ffd60a'];
  // zwei „Kanonen“ unten links und rechts, schießen schräg nach oben zur Mitte
  const parts = Array.from({ length: count }, (_, i) => {
    const left = i % 2 === 0;
    const a = (left ? -60 : -120) + (Math.random() * 36 - 18);
    const v = 11 + Math.random() * 7;
    return {
      x: left ? -10 : W + 10, y: H * 0.78,
      vx: Math.cos((a * Math.PI) / 180) * v, vy: Math.sin((a * Math.PI) / 180) * v,
      w: 6 + Math.random() * 5, h: 9 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35,
      c: colors[i % colors.length], tilt: Math.random() * 10,
    };
  });
  haptic('success');
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    g.clearRect(0, 0, W, H);
    const fade = Math.max(0, 1 - Math.max(0, t - duration * 0.6) / (duration * 0.4));
    parts.forEach((p) => {
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;           // Schwerkraft + Luftwiderstand
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.tilt += 0.12;
      g.save(); g.globalAlpha = fade; g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.tilt)), p.w, p.h * Math.abs(Math.cos(p.tilt)));
      g.restore();
    });
    if (t < duration) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

// =====================================================================
//  Foto-Ansicht im Vollbild (wie die iOS-Fotos-App)
//  Wischen zwischen Bildern · Zwei-Finger-Zoom · Doppeltipp-Zoom ·
//  nach unten ziehen zum Schließen · Tipp blendet die Leisten aus
// =====================================================================
export function photoViewer({ images, start = 0, title = '', onDelete = null, onChange = null }) {
  const n = images.length;
  const { el, close: closeLayer } = layer('photo-layer', `
    <div class="pv-bg"></div>
    <div class="pv-top">
      <button class="pv-btn" data-a="x" aria-label="Schließen">${icon('x', 22)}</button>
      <div class="pv-title"><b>${esc(title)}</b>${n > 1 ? `<span class="pv-count">${start + 1} von ${n}</span>` : ''}</div>
      ${onDelete ? `<button class="pv-btn" data-a="del" aria-label="Bild löschen">${icon('trash', 21)}</button>` : '<span class="pv-btn"></span>'}
    </div>
    <div class="pv-track">${images.map((im) => `<div class="pv-slide"><img src="${esc(im.url)}" alt="" draggable="false"></div>`).join('')}</div>
    ${n > 1 ? `<div class="pv-dots">${images.map((_, i) => `<i class="${i === start ? 'on' : ''}"></i>`).join('')}</div>` : ''}`);
  const track = el.querySelector('.pv-track');
  const bg = el.querySelector('.pv-bg');
  const slides = [...el.querySelectorAll('.pv-slide')];
  const count = el.querySelector('.pv-count');
  const dots = [...el.querySelectorAll('.pv-dots i')];
  let idx = start;
  let z = { s: 1, x: 0, y: 0 };                      // Zoom des aktuellen Bildes
  const img = () => slides[idx].querySelector('img');
  const W = () => track.clientWidth;

  requestAnimationFrame(() => { track.scrollLeft = start * W(); });
  const setIdx = (i) => {
    if (i === idx) return;
    resetZoom(false); idx = i;
    if (count) count.textContent = `${i + 1} von ${n}`;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    haptic('selection'); onChange?.(i);
  };
  track.addEventListener('scroll', () => setIdx(Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / W())))), { passive: true });

  // ---- Zoom & Verschieben ----
  const bounds = (s) => {
    const im = img(); const w = im.offsetWidth; const h = im.offsetHeight;   // Größe ohne Zoom
    return { bx: Math.max(0, (w * s - track.clientWidth) / 2), by: Math.max(0, (h * s - track.clientHeight) / 2) };
  };
  const apply = (anim) => {
    const im = img();
    im.style.transition = anim ? 'transform .32s cubic-bezier(.22,1,.36,1)' : 'none';
    im.style.transform = `translate3d(${z.x}px, ${z.y}px, 0) scale(${z.s})`;
    const zoomed = z.s > 1.01;
    track.classList.toggle('zoomed', zoomed);
  };
  const clampZ = () => {
    z.s = Math.max(1, Math.min(5, z.s));
    const { bx, by } = bounds(z.s);
    z.x = Math.max(-bx, Math.min(bx, z.x)); z.y = Math.max(-by, Math.min(by, z.y));
    if (z.s === 1) { z.x = 0; z.y = 0; }
  };
  function resetZoom(anim = true) { if (z.s === 1 && !z.x && !z.y) return; z = { s: 1, x: 0, y: 0 }; apply(anim); }
  /** Zoomen um einen Bildschirmpunkt (der Punkt bleibt unter dem Finger) */
  const zoomAt = (s, cx, cy, base = z) => {
    const r = slides[idx].getBoundingClientRect();
    const px = cx - (r.left + r.width / 2); const py = cy - (r.top + r.height / 2);
    const k = s / base.s;
    z = { s, x: px - (px - base.x) * k, y: py - (py - base.y) * k };
  };

  let t0 = null; let mode = ''; let lastTap = 0; let tapTimer = 0; let moved = false;
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const mid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
  track.addEventListener('touchstart', (e) => {
    moved = false;
    if (e.touches.length === 2) {
      e.preventDefault();
      mode = 'pinch';
      t0 = { d: dist(e.touches[0], e.touches[1]), m: mid(e.touches[0], e.touches[1]), z: { ...z } };
      track.classList.add('zoomed');                                 // Wischen zwischen Bildern sperren
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      t0 = { x: t.clientX, y: t.clientY, z: { ...z }, time: performance.now() };
      mode = z.s > 1.01 ? 'pan' : '';
    }
  }, { passive: false });
  track.addEventListener('touchmove', (e) => {
    if (!t0) return;
    if (mode === 'pinch' && e.touches.length === 2) {
      e.preventDefault(); moved = true;
      const s = Math.max(0.6, Math.min(6, t0.z.s * dist(e.touches[0], e.touches[1]) / t0.d));
      const m = mid(e.touches[0], e.touches[1]);
      zoomAt(s, t0.m.x, t0.m.y, t0.z);
      z.x += m.x - t0.m.x; z.y += m.y - t0.m.y;
      apply(false); return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0]; const dx = t.clientX - t0.x; const dy = t.clientY - t0.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
    if (mode === 'pan') {
      e.preventDefault();
      z.x = t0.z.x + dx; z.y = t0.z.y + dy;
      // über den Rand hinaus nur gebremst (Gummiband)
      const { bx, by } = bounds(z.s);
      const rub = (v, b) => (Math.abs(v) <= b ? v : Math.sign(v) * (b + (Math.abs(v) - b) * 0.35));
      z.x = rub(z.x, bx); z.y = rub(z.y, by);
      apply(false); return;
    }
    if (!mode && moved) mode = Math.abs(dy) > Math.abs(dx) * 1.2 && dy > 0 ? 'dismiss' : 'swipe';
    if (mode === 'dismiss') {
      e.preventDefault();
      const p = Math.min(1, dy / 400);
      img().style.transition = 'none';
      img().style.transform = `translate3d(${dx * 0.6}px, ${dy}px, 0) scale(${1 - p * 0.25})`;
      bg.style.opacity = String(1 - p * 0.9);
      el.classList.add('pv-chrome-off');
    }
  }, { passive: false });
  const onEnd = (e) => {
    if (!t0) return;
    if (mode === 'pinch') {
      if (e.touches.length === 1) {                 // ein Finger bleibt liegen → weiter verschieben
        const t = e.touches[0]; clampZ(); apply(true);
        t0 = { x: t.clientX, y: t.clientY, z: { ...z } }; mode = z.s > 1.01 ? 'pan' : ''; return;
      }
      clampZ(); apply(true);
      if (z.s > 1.01) haptic('light');
    } else if (mode === 'pan') { clampZ(); apply(true); }
    else if (mode === 'dismiss') {
      const dy = (e.changedTouches[0]?.clientY ?? t0.y) - t0.y;
      const v = dy / Math.max(1, performance.now() - t0.time);
      if (dy > 120 || v > 0.6) { close(); return; }
      img().style.transition = 'transform .35s cubic-bezier(.34,1.4,.64,1)'; img().style.transform = '';
      bg.style.transition = 'opacity .3s'; bg.style.opacity = ''; el.classList.remove('pv-chrome-off');
      setTimeout(() => { bg.style.transition = ''; }, 320);
    } else if (!moved && e.touches.length === 0) {
      // Tipp: zweimal schnell → Zoom an dieser Stelle; einmal → Leisten ein/aus
      const t = e.changedTouches[0]; const now = performance.now();
      if (now - lastTap < 300) {
        clearTimeout(tapTimer); lastTap = 0;
        if (z.s > 1.01) resetZoom(); else { zoomAt(2.5, t.clientX, t.clientY); clampZ(); apply(true); }
        haptic('light');
        e.preventDefault();
      } else {
        lastTap = now;
        tapTimer = setTimeout(() => el.classList.toggle('pv-chrome-off'), 280);
      }
    }
    if (e.touches.length === 0) { t0 = null; mode = ''; }
  };
  track.addEventListener('touchend', onEnd, { passive: false });
  track.addEventListener('touchcancel', onEnd, { passive: false });

  // Maus/Trackpad (PC): Doppelklick zoomt, Pfeiltasten blättern, Esc schließt
  track.addEventListener('dblclick', (e) => {
    if (z.s > 1.01) resetZoom(); else { zoomAt(2.5, e.clientX, e.clientY); clampZ(); apply(true); }
  });
  track.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;                          // Trackpad-Pinch
    e.preventDefault(); zoomAt(Math.max(1, Math.min(5, z.s * Math.exp(-e.deltaY / 100))), e.clientX, e.clientY); clampZ(); apply(false);
  }, { passive: false });
  const go = (i) => { i = Math.max(0, Math.min(n - 1, i)); track.scrollTo({ left: i * W(), behavior: 'smooth' }); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(idx + 1);
    else if (e.key === 'ArrowLeft') go(idx - 1);
  };
  document.addEventListener('keydown', onKey);
  const onResize = () => { resetZoom(false); track.scrollLeft = idx * W(); };
  window.addEventListener('resize', onResize);

  function close() {
    document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize);
    closeLayer();
  }
  el.querySelector('[data-a=x]').onclick = close;
  el.querySelector('[data-a=del]')?.addEventListener('click', () => onDelete(images[idx], close));
  return close;
}

// =====================================================================
//  „Ab in den Warenkorb“: ein Bild fliegt im Bogen zu einem Ziel, das Ziel hüpft
// =====================================================================
export function flyTo({ from, to, img = '', onLand } = {}) {
  if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches || fxCalm()) { onLand?.(); return false; }
  const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
  const b = to.getBoundingClientRect();
  const size = 58;
  const el = document.createElement('div');
  el.className = 'fly-item';
  el.innerHTML = img ? `<img src="${esc(img)}" alt="">` : icon('box', 26, 2.2);
  el.style.cssText = `left:${a.left + a.width / 2 - size / 2}px;top:${a.top + a.height / 2 - size / 2}px;width:${size}px;height:${size}px`;
  document.body.appendChild(el);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const lift = Math.min(160, Math.max(70, Math.abs(dx) * 0.4 + 60));   // Bogenhöhe
  const frames = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = dx * t; const y = dy * t - lift * 4 * t * (1 - t);           // Parabel
    const s = 1 - 0.72 * t; const r = 25 * t;
    frames.push({ transform: `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`, opacity: t > .9 ? (1 - t) * 10 : 1 });
  }
  const anim = el.animate(frames, { duration: 720, easing: 'cubic-bezier(.45, 0, .25, 1)' });
  anim.onfinish = () => {
    el.remove();
    to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(.92)' }, { transform: 'scale(1)' }],
      { duration: 480, easing: 'cubic-bezier(.34, 1.5, .64, 1)' });
    haptic('success');
    onLand?.();
  };
  return true;
}

// =====================================================================
//  Easter Egg: Zahnrad-Regen (fällt von oben, dreht sich, prallt leicht ab)
// =====================================================================
export function gearRain({ count = 34, duration = 3200 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || fxCalm()) return;
  const cv = document.createElement('canvas'); cv.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1); const W = innerWidth; const H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; document.body.appendChild(cv);
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const colors = ['#1d4e89', '#2f80ed', '#4ab3f4', '#f7931e', '#ff5e3a'];
  const gears = Array.from({ length: count }, (_, i) => ({
    x: Math.random() * W, y: -40 - Math.random() * H * 0.8, vy: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 1.2,
    r: 9 + Math.random() * 14, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.18, c: colors[i % colors.length], teeth: 6 + (i % 4) * 2, bounced: false,
  }));
  const gear = (p) => {
    g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.beginPath();
    const n = p.teeth; const ro = p.r; const ri = p.r * 0.76;
    for (let k = 0; k < n * 2; k++) {
      const a0 = (k / (n * 2)) * Math.PI * 2; const a1 = ((k + 1) / (n * 2)) * Math.PI * 2; const rr = k % 2 ? ri : ro;
      g.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr); g.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
    }
    g.closePath(); g.moveTo(p.r * 0.34, 0); g.arc(0, 0, p.r * 0.34, 0, Math.PI * 2, true); g.fill('evenodd'); g.restore();
  };
  haptic('success');
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0; g.clearRect(0, 0, W, H);
    g.globalAlpha = t > duration - 600 ? Math.max(0, (duration - t) / 600) : 1;
    for (const p of gears) {
      p.vy += 0.12; p.y += p.vy; p.x += p.vx; p.a += p.va;
      if (!p.bounced && p.y > H - p.r - 8) { p.y = H - p.r - 8; p.vy *= -0.45; p.va *= -1.4; p.bounced = true; }
      gear(p);
    }
    if (t < duration) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

// =====================================================================
//  Fliegende Zahl beim Buchen: „−2“ steigt aus dem Bestand auf und zerplatzt in Funken,
//  „+5“ fällt von oben in den Bestand hinein
// =====================================================================
export function floatDelta({ text, kind = 'out', anchor = null } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || fxCalm()) return;
  const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2 - 20, top: innerHeight * 0.45, width: 40, height: 40 };
  const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
  const el = document.createElement('div');
  el.className = `float-delta ${kind}`; el.textContent = text;
  el.style.left = `${cx}px`; el.style.top = `${cy}px`;
  document.body.appendChild(el);
  const up = kind === 'out';
  const a = el.animate(up
    ? [{ transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%, -90%) scale(1.15)', opacity: 1, offset: .25 }, { transform: 'translate(-50%, -260%) scale(1)', opacity: 1 }]
    : [{ transform: 'translate(-50%, -360%) scale(1)', opacity: 0 }, { transform: 'translate(-50%, -260%) scale(1.1)', opacity: 1, offset: .3 }, { transform: 'translate(-50%, -50%) scale(.5)', opacity: .9 }],
  { duration: up ? 760 : 680, easing: up ? 'cubic-bezier(.2, .8, .3, 1)' : 'cubic-bezier(.55, 0, .8, .4)', fill: 'forwards' });
  a.onfinish = () => {
    const b = el.getBoundingClientRect(); el.remove();
    // Funken: beim Entnehmen dort, wo die Zahl zerplatzt, beim Dazubuchen am Bestand (Spritzer nach oben)
    const x0 = up ? b.left + b.width / 2 : cx; const y0 = up ? b.top + b.height / 2 : cy;
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i'); s.className = `float-spark ${kind}`;
      s.style.left = `${x0}px`; s.style.top = `${y0}px`; document.body.appendChild(s);
      const ang = up ? (i / 12) * Math.PI * 2 : Math.PI + (i / 11) * Math.PI;   // in: nur nach oben spritzen
      const d = 26 + Math.random() * 22;
      s.animate([{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * d}px), calc(-50% + ${Math.sin(ang) * d}px)) scale(.2)`, opacity: 0 }],
        { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2, .8, .3, 1)' }).onfinish = () => s.remove();
    }
    if (anchor?.animate) anchor.animate([{ transform: 'scale(1)' }, { transform: `scale(${up ? .88 : 1.18})` }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.34, 1.5, .64, 1)' });
  };
}

// =====================================================================
//  Fächer-Menü („Speed Dial“): das + dreht sich zum ×, Optionen fächern sich als runde Bubbles im Bogen auf
// =====================================================================
export function speedDial(btn, items, { radius = 170 } = {}) {
  return new Promise((resolve) => {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    const ov = document.createElement('div'); ov.className = 'sd-layer';
    const n = items.length;
    // Bubbles fächern sich in einem nach links gewölbten Bogen unter dem Knopf auf (Abstand je 72 px, Beschriftung links daneben)
    const pos = items.map((_, i) => ({ x: -18 - (radius * 0.42) * Math.sin((Math.PI * (i + 0.5)) / n), y: 74 + i * 72 }));
    ov.innerHTML = `<div class="sd-dim"></div>
      ${items.map((it, i) => `<button class="sd-item" data-v="${esc(it.value)}" style="left:${cx}px;top:${cy}px;--x:${pos[i].x.toFixed(1)}px;--y:${pos[i].y.toFixed(1)}px;--i:${i}">
        <span class="sd-bubble ${it.tone ? `tone-${it.tone}` : ''}">${icon(it.icon, 24, 2.1)}</span><span class="sd-label">${esc(it.label)}</span></button>`).join('')}
      <button class="sd-close" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px" aria-label="Schließen">${icon('plus', 22, 2.3)}</button>`;
    document.body.appendChild(ov);
    btn.style.visibility = 'hidden';
    haptic('light');
    requestAnimationFrame(() => ov.classList.add('open'));
    const done = (v) => {
      ov.classList.remove('open'); ov.classList.add('closing');
      setTimeout(() => { ov.remove(); btn.style.visibility = ''; }, 320);
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', (e) => {
      const it = e.target.closest('.sd-item');
      if (it) { haptic('selection'); done(it.dataset.v); return; }
      done(null);
    });
  });
}

// =====================================================================
//  Kamera: kurzer weißer Blitz – danach fällt das Foto (wie ein Sofortbild) in die Galerie
// =====================================================================
export function cameraFlash() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || fxCalm()) return;
  const f = document.createElement('div'); f.className = 'cam-flash'; document.body.appendChild(f);
  f.animate([{ opacity: 0 }, { opacity: .95, offset: .12 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' }).onfinish = () => f.remove();
  haptic('medium');
}
export function photoDrop(blob, target) {
  if (!blob || !target || matchMedia('(prefers-reduced-motion: reduce)').matches || fxCalm()) return;
  const url = URL.createObjectURL(blob);
  const t = target.getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'photo-drop'; el.innerHTML = `<img src="${url}" alt="">`;
  const w = Math.min(230, innerWidth * 0.6);
  el.style.cssText = `left:${innerWidth / 2 - w / 2}px;top:${innerHeight * 0.28}px;width:${w}px`;
  document.body.appendChild(el);
  const dx = t.left + t.width / 2 - innerWidth / 2; const dy = t.top + t.height / 2 - (innerHeight * 0.28 + w * 0.55);
  const s = Math.max(0.25, Math.min(1, t.width / w * 0.7));
  el.animate([
    { transform: 'translateY(-30px) rotate(-8deg) scale(1.08)', opacity: 0 },
    { transform: 'translateY(0) rotate(-4deg) scale(1)', opacity: 1, offset: .25 },
    { transform: `translate(${dx}px, ${dy}px) rotate(2deg) scale(${s})`, opacity: .9, offset: .85 },
    { transform: `translate(${dx}px, ${dy}px) rotate(0) scale(${s * 0.92})`, opacity: 0 },
  ], { duration: 1100, easing: 'cubic-bezier(.45, 0, .2, 1)' }).onfinish = () => {
    el.remove(); URL.revokeObjectURL(url);
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.34, 1.5, .64, 1)' });
    haptic('light');
  };
}

// =====================================================================
//  „Papierkorb saugt ein“ (wie der Genie-Effekt am Mac): die Zeile wird schmal und fließt ins Ziel
// =====================================================================
export function genieInto(el, target) {
  if (!el || !target || matchMedia('(prefers-reduced-motion: reduce)').matches || fxCalm()) return false;
  const a = el.getBoundingClientRect(); const b = target.getBoundingClientRect();
  if (!a.width) return false;
  const ghost = el.cloneNode(true);
  ghost.classList.add('genie-ghost');
  ghost.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
  document.body.appendChild(ghost);
  const tx = b.left + b.width / 2 - (a.left + a.width / 2); const ty = b.top + b.height / 2 - (a.top + a.height / 2);
  // Trichter: die Seite zum Ziel hin wird zuerst schmal, dann rutscht alles hinein
  const fx = ((b.left + b.width / 2 - a.left) / a.width) * 100;
  const up = ty < 0;
  const edge = up ? 'top' : 'bottom';
  const funnel = (w) => up
    ? `polygon(${fx - w}% 0, ${fx + w}% 0, 100% 100%, 0 100%)`
    : `polygon(0 0, 100% 0, ${fx + w}% 100%, ${fx - w}% 100%)`;
  ghost.animate([
    { clipPath: funnel(50), transform: 'translate(0,0) scale(1)', opacity: 1 },
    { clipPath: funnel(6), transform: `translate(${tx * 0.15}px, ${ty * 0.1}px) scaleY(.9)`, opacity: 1, offset: .35 },
    { clipPath: funnel(2), transform: `translate(${tx}px, ${ty}px) scale(.06)`, opacity: .2 },
  ], { duration: 620, easing: 'cubic-bezier(.55, 0, .35, 1)', fill: 'forwards' }).onfinish = () => {
    ghost.remove();
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-8deg)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34, 1.5, .64, 1)' });
  };
  ghost.style.transformOrigin = `${fx}% ${edge === 'top' ? '0%' : '100%'}`;
  return true;
}

// =====================================================================
//  Karte umdrehen: das Teil dreht sich in 3D um, hinten steht der Code groß zum Scannen
// =====================================================================
export async function flipCard({ title, sub = '', img = '', code, number = '' }) {
  let svg = '';
  try { svg = await qrSvg(code); } catch { toast('QR-Code konnte nicht erzeugt werden', 'err'); return; }
  const { el, close } = layer('flip-layer', `
    <div class="flip-dim"></div>
    <div class="flip-stage">
      <div class="flip-card">
        <div class="flip-face front">${img ? `<img src="${esc(img)}" alt="">` : icon('box', 64, 1.4)}<b>${esc(title)}</b>${number !== '' ? `<small>Nr. ${esc(number)}</small>` : ''}</div>
        <div class="flip-face back"><div class="flip-qr">${svg}</div><b>${esc(title)}</b><small class="selectable">${esc(code)}</small>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      </div>
      <p class="flip-hint">Tippen zum Umdrehen · daneben tippen schließt</p>
    </div>`);
  const card = el.querySelector('.flip-card');
  // Bildschirm hell drehen hilft dem Scanner (nur Hinweis – Helligkeit kann eine Web-App nicht steuern)
  const turn = () => { card.classList.toggle('flipped'); haptic('light'); };
  setTimeout(turn, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280);
  // Der Finger vom langen Drücken liegt beim Loslassen oft schon auf der Karte → diesen „Tipp“ nicht mitzählen
  const t0 = performance.now(); const fresh = () => performance.now() - t0 < 650;
  card.addEventListener('click', (e) => { e.stopPropagation(); if (!fresh()) turn(); });
  el.querySelector('.flip-dim').onclick = () => { if (!fresh()) close(); };
  el.querySelector('.flip-hint').onclick = () => { if (!fresh()) close(); };
}

// ---------- Plus/Minus gedrückt halten: zählt immer schneller (Mengen-Stepper) ----------
// Gilt für Stepper-Knöpfe mit data-s (Buchen) und data-c (Etiketten); Warenkorb nicht (jeder Tipp speichert sofort).
(() => {
  let timer = null; let btn = null; let fired = 0; let suppress = 0;
  const stop = () => { clearTimeout(timer); timer = null; if (btn) btn.classList.remove('repeating'); btn = null; };
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.stepper button[data-s], .stepper button[data-c]');
    if (!b || e.button > 0) return;
    stop(); btn = b; fired = 0;
    const step = () => {
      if (!btn || !btn.isConnected || btn.disabled) return stop();
      btn.click(); fired++; btn.classList.add('repeating');
      if (fired % 2 === 0) haptic('light');
      timer = setTimeout(step, Math.max(45, 190 - fired * 14));   // wird immer schneller
    };
    timer = setTimeout(step, 420);
  }, true);
  const release = () => { if (btn && fired) suppress = Date.now(); stop(); };
  ['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, release, true));
  document.addEventListener('pointerleave', (e) => { if (e.target === btn) release(); }, true);
  window.addEventListener('blur', release);
  // Der normale Klick nach dem Loslassen soll nicht noch einmal zählen
  document.addEventListener('click', (e) => {
    if (!suppress || Date.now() - suppress > 400 || !e.isTrusted) return;
    if (e.target.closest?.('.stepper button[data-s], .stepper button[data-c]')) { e.preventDefault(); e.stopImmediatePropagation(); suppress = 0; }
  }, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('.stepper button')) e.preventDefault(); }, true);
})();
