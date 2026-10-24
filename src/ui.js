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
export function scan({ title = 'Barcode scannen' } = {}) {
  return new Promise((resolve) => {
    const { el, close } = layer('scan-layer', `
      <div class="scan-top">
        <button class="scan-x" data-a="x">${icon('x', 26)}</button>
        <span>${esc(title)}</span><span style="width:44px"></span>
      </div>
      <div id="wl-reader" class="scan-reader"></div>
      <div class="scan-frame"><i></i></div>
      <div class="scan-bottom">
        <p class="scan-hint">Barcode oder QR-Code in den Rahmen halten</p>
        <div class="scan-manual"><input placeholder="…oder Code eintippen" enterkeyhint="go"><button data-a="ok">OK</button></div>
      </div>`);
    let qr = null; let finished = false;
    const finish = async (v) => {
      if (finished) return; finished = true;
      try { if (qr?.isScanning) await qr.stop(); qr?.clear(); } catch {}
      close(); resolve(v);
    };
    el.querySelector('[data-a=x]').onclick = () => finish(null);
    const inp = el.querySelector('input');
    el.querySelector('[data-a=ok]').onclick = () => inp.value.trim() && finish(inp.value.trim());
    inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim()) finish(inp.value.trim()); };

    import('html5-qrcode').then(({ Html5Qrcode, Html5QrcodeSupportedFormats: F }) => {
      if (finished) return;
      qr = new Html5Qrcode('wl-reader', {
        verbose: false, useBarCodeDetectorIfSupported: true,
        formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.DATA_MATRIX, F.ITF, F.CODE_93],
      });
      qr.start({ facingMode: 'environment' }, { fps: 12, aspectRatio: window.innerHeight / window.innerWidth },
        (text) => { haptic(40); finish(text); }, () => {})
        .catch(() => {
          el.querySelector('.scan-hint').textContent = 'Kamera nicht verfügbar – bitte Code eintippen (Kamera-Zugriff in den Einstellungen erlauben).';
          inp.focus();
        });
    });
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
