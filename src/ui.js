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

function layer(cls, html) {
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
    tracking = fromHandle || (!t.closest('input, textarea, select') && (!body || body.scrollTop <= 0));
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
  if (prev) { prev.remove(); clearTimeout(toastTimer); clearTimeout(toastHide); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
  const ic = opt.icon || (type === 'err' ? 'alert' : type === 'info' ? 'info' : 'check');
  t.innerHTML = `<span class="di-ic">${icon(ic, 17, 2.6)}</span><span class="di-text"><b>${esc(msg)}</b>${opt.sub ? `<small>${esc(opt.sub)}</small>` : ''}</span>`;
  document.body.appendChild(t);
  void t.offsetWidth;                                     // Startzustand (klein in der Notch) übernehmen
  t.classList.add('show');
  const dur = opt.duration ?? (type === 'err' ? 3500 : 2400);
  toastTimer = setTimeout(() => {
    t.classList.remove('show'); t.classList.add('hide');  // erst Inhalt aus, dann Pille zurück in die Notch
    toastHide = setTimeout(() => t.remove(), 600);
  }, dur);
  t.onclick = () => { clearTimeout(toastTimer); t.classList.remove('show'); t.classList.add('hide'); toastHide = setTimeout(() => t.remove(), 600); };
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

export function scan({ title = 'Scanner' } = {}) {
  return new Promise((resolve) => {
    let mode = 'auto';
    try { mode = localStorage.getItem('wl-scan-mode') || 'auto'; } catch {}
    if (!['auto', 'area', 'multi', 'input'].includes(mode)) mode = 'auto';

    const { el, close } = layer('sc-layer', `
      <div class="sc-top">
        <div class="sc-bar">
          <span class="sc-side"></span>
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
          <div class="sc-frame" hidden><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><span class="sc-line"></span></div>
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
      haptic('success'); frame.classList.add('hit');
      setTimeout(() => finish(text), 120);
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
async function qrSvg(text) {
  const QR = (await import('qrcode')).default;
  // margin 1 = schmaler weißer Ruherand (wichtig fürs Scannen); kurze Inhalte → große, robuste Punkte
  return QR.toString(String(text), { type: 'svg', margin: 1, errorCorrectionLevel: String(text).length <= 24 ? 'Q' : 'M', color: { dark: '#000000', light: '#ffffff' } });
}
/** Etikett-HTML in Millimetern (für Vorschau und Druck identisch) */
function labelHTML({ name, line2 = '', line3 = '', svg }, size) {
  return `<div class="lbl" style="--lw:${size.w}mm;--lh:${size.h}mm">
    <div class="lbl-qr">${svg}</div>
    <div class="lbl-text">
      <div class="lbl-name">${esc(name)}</div>
      ${line2 ? `<div class="lbl-l2">${esc(line2)}</div>` : ''}
      ${line3 ? `<div class="lbl-l3">${esc(line3)}</div>` : ''}
    </div>
  </div>`;
}
/** Druckt NUR das Etikett: eigenes Druck-Element + @page in Etikettengröße, alles andere ist beim Druck ausgeblendet */
function printLabel(html, size, copies = 1) {
  document.getElementById('print-root')?.remove();
  document.getElementById('print-page')?.remove();
  const rootEl = document.createElement('div');
  rootEl.id = 'print-root';
  rootEl.innerHTML = Array.from({ length: Math.max(1, Math.min(50, copies)) }, () => `<div class="print-page">${html}</div>`).join('');
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
  const onAfter = () => { cleanup(); successHUD('Etikett gesendet', copies > 1 ? `${copies} Stück` : ''); };
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
export async function showLabel({ title, sub = '', code, extra = '' }) {
  let sizeId = '62x29';
  try { sizeId = localStorage.getItem('wl-label-size') || sizeId; } catch {}
  let svg;
  try { svg = await qrSvg(code); } catch (e) { toast('QR-Code konnte nicht erzeugt werden', 'err'); return; }
  const size = () => LABEL_SIZES.find((x) => x.id === sizeId) || LABEL_SIZES[0];
  const data = { name: title, line2: sub, line3: extra, svg };
  sheet(`
    <div class="lbl-preview"><div class="lbl-scale"></div></div>
    <p class="muted small center"><span data-f="hint"></span> · QR-Inhalt: <b class="selectable">${esc(code)}</b></p>
    <div class="form-group">
      <label class="frow"><span>Etikettengröße</span>
        <select data-f="size">${LABEL_SIZES.map((x) => `<option value="${x.id}" ${x.id === sizeId ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
      <div class="frow"><span>Anzahl</span>
        <div class="stepper sm"><button type="button" data-c="-1" aria-label="Weniger">${icon('minus', 16, 2.4)}</button><span data-f="copies">1</span><button type="button" data-c="1" aria-label="Mehr">${icon('plus', 16, 2.4)}</button></div></div>
    </div>
    <button class="btn-filled full mt" data-a="print">${icon('print', 20)} Etikett drucken</button>
    <p class="muted small center mt">Drucken am PC (Edge/Chrome): Ränder „Keine“, Kopf- und Fußzeilen aus.</p>`,
  {
    title: 'Etikett drucken',
    onMount: (root) => {
      const prev = root.querySelector('.lbl-scale');
      const render = () => { prev.innerHTML = labelHTML(data, size()); root.querySelector('[data-f=hint]').textContent = `${size().label} (${size().hint})`; };
      render();
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
        printLabel(labelHTML(data, size()), size(), copies);
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
