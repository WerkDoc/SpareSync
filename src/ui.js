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
let toastTimer;
export function toast(msg, type = 'ok') {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icon(type === 'err' ? 'alert' : 'check', 18, 2.4)}<span>${esc(msg)}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 4200 : 2200);
}
export const errToast = (e) => { console.error(e); toast(e?.message || String(e), 'err'); };

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

// ---------- Etikett mit Barcode drucken ----------
export async function showLabel({ title, sub = '', code }) {
  const { default: JsBarcode } = await import('jsbarcode');
  sheet(`
    <div class="label-card print-area">
      <svg class="label-bc"></svg>
      <div class="label-title">${esc(title)}</div>
      ${sub ? `<div class="label-sub">${esc(sub)}</div>` : ''}
    </div>
    <button class="btn-filled full mt" data-a="print">${icon('print', 20)} Drucken</button>
    <p class="muted small center mt">Tipp: Am iPhone über AirPrint oder „Als PDF sichern“.</p>`,
  {
    title: 'Etikett',
    onMount: (root) => {
      try {
        JsBarcode(root.querySelector('.label-bc'), code, { format: 'CODE128', height: 60, displayValue: true, fontSize: 14, margin: 4 });
      } catch { root.querySelector('.label-bc').outerHTML = `<p class="muted">Code „${esc(code)}“ kann nicht als Barcode dargestellt werden.</p>`; }
      root.querySelector('[data-a=print]').onclick = () => window.print();
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
