// ---------------------------------------------------------------------
//  Pull-to-Refresh im iOS-Stil
//  Am oberen Rand nach unten ziehen → Inhalt folgt mit Widerstand,
//  iOS-Spinner erscheint. Ab 60 px loslassen = aktualisieren.
// ---------------------------------------------------------------------
import { haptic } from './haptics.js';

const THRESHOLD = 60;      // ab hier wird aktualisiert
const HOLD = 56;           // Position des Inhalts während des Ladens
const MAX = 120;           // weiter lässt sich nicht ziehen

const spinnerSVG = () => {
  // klassischer iOS-Aktivitätsindikator: 8 Speichen mit abnehmender Deckkraft
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += `<rect x="11" y="2" width="2.4" height="6.5" rx="1.2" fill="currentColor" opacity="${(1 - i * 0.11).toFixed(2)}" transform="rotate(${-i * 45} 12.2 12)"/>`;
  }
  return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">${s}</svg>`;
};

/**
 * @param {HTMLElement} screenEl  die aktuelle Seite (.screen)
 * @param {() => Promise<void>} onRefresh  lädt die Daten neu (Supabase)
 * @param {() => void} [onDone]  nach dem Zurückfedern (z. B. Seite neu zeichnen)
 */
export function setupPullToRefresh(screenEl, onRefresh, onDone) {
  const content = screenEl.querySelector('.content');
  if (!content) return;
  const ptr = document.createElement('div');
  ptr.className = 'ptr';
  ptr.innerHTML = `<div class="ptr-spin">${spinnerSVG()}</div>`;
  content.before(ptr);
  const spin = ptr.firstElementChild;

  let startY = 0; let startX = 0; let pull = 0; let active = false; let armed = false; let busy = false; let decided = false;

  const set = (d, animate) => {
    content.style.transition = animate ? 'transform .45s cubic-bezier(.2, .9, .3, 1.15)' : 'none';
    spin.style.transition = animate ? 'opacity .3s, transform .45s cubic-bezier(.2, .9, .3, 1.15)' : 'none';
    content.style.transform = d ? `translate3d(0, ${d}px, 0)` : '';
    const p = Math.min(1, d / THRESHOLD);
    spin.style.opacity = busy ? 1 : Math.max(0, (p - 0.25) / 0.75);
    spin.style.transform = `translate3d(-50%, ${Math.max(0, d - 40) / 2}px, 0) scale(${0.6 + 0.4 * p})${busy ? '' : ` rotate(${d * 3}deg)`}`;
  };

  const blocked = (t) => t.closest('input, textarea, select, .layer, .select-bar, .tabbar, .bsheet');

  screenEl.addEventListener('touchstart', (e) => {
    if (busy || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target) || screenEl.classList.contains('selecting')) { active = false; return; }
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; pull = 0; active = true; armed = false; decided = false;
  }, { passive: true });

  screenEl.addEventListener('touchmove', (e) => {
    if (!active) return;
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    if (!decided) {
      if (Math.abs(dx) > Math.abs(dy) || dy <= 0 || window.scrollY > 0) { active = false; return; }   // seitlich oder nach oben = normales Scrollen
      decided = true;
    }
    if (dy <= 0) { set(0); return; }
    e.preventDefault();                                   // iOS-Gummiband während des Ziehens unterdrücken
    pull = Math.min(MAX, dy * 0.5 - (dy * dy) / 4000);   // zunehmender Widerstand
    pull = Math.max(0, pull);
    if (!armed && pull >= THRESHOLD) { armed = true; haptic('medium'); }
    if (armed && pull < THRESHOLD - 8) armed = false;
    spin.classList.toggle('armed', armed);
    set(pull);
  }, { passive: false });

  const end = async () => {
    if (!active) return;
    active = false;
    if (!armed) { set(0, true); return; }
    busy = true; spin.classList.add('spinning');
    set(HOLD, true);
    const t0 = Date.now();
    try { await onRefresh(); } catch (err) { console.error(err); }
    const wait = Math.max(0, 600 - (Date.now() - t0));     // Spinner kurz sichtbar lassen – fühlt sich ruhiger an
    setTimeout(() => {
      busy = false; spin.classList.remove('spinning', 'armed');
      set(0, true);
      setTimeout(() => onDone?.(), 420);                 // erst zurückfedern, dann neu zeichnen
    }, wait);
  };
  screenEl.addEventListener('touchend', end, { passive: true });
  screenEl.addEventListener('touchcancel', end, { passive: true });
}

// ---------------------------------------------------------------------
//  Pull-Down-Suche (Spotlight): gleiche Geste, aber statt Spinner
//  erscheint eine Such-Pille. Loslassen ab Schwelle → onOpen() – und zwar
//  noch im touchend, damit iOS die Tastatur (focus) überhaupt zulässt.
// ---------------------------------------------------------------------
export function setupPullToSearch(screenEl, onOpen) {
  const content = screenEl.querySelector('.content');
  if (!content) return;
  const pill = document.createElement('div');
  pill.className = 'pts';
  pill.innerHTML = `<span class="pts-pill"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>Suchen</span>`;
  content.before(pill);
  const p = pill.firstElementChild;
  let startY = 0; let startX = 0; let pull = 0; let active = false; let armed = false; let decided = false;

  const set = (d, animate) => {
    content.style.transition = animate ? 'transform .45s cubic-bezier(.2, .9, .3, 1.1)' : 'none';
    p.style.transition = animate ? 'opacity .25s, transform .45s cubic-bezier(.2, .9, .3, 1.1)' : 'none';
    content.style.transform = d ? `translate3d(0, ${d}px, 0)` : '';
    const k = Math.min(1, d / THRESHOLD);
    p.style.opacity = Math.max(0, (k - 0.2) / 0.8);
    p.style.transform = `translate3d(-50%, ${Math.max(0, d - 46) / 2}px, 0) scale(${0.7 + 0.3 * k})`;
  };
  const blocked = (t) => t.closest('input, textarea, select, .layer, .select-bar, .tabbar, .bsheet, .dash-nav');

  screenEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) { active = false; return; }
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; pull = 0; active = true; armed = false; decided = false;
  }, { passive: true });

  screenEl.addEventListener('touchmove', (e) => {
    if (!active) return;
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    if (!decided) {
      if (Math.abs(dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy) || dy <= 0 || window.scrollY > 0) { active = false; return; }   // normales Scrollen
      decided = true;
    }
    e.preventDefault();
    pull = Math.max(0, Math.min(MAX, dy * 0.5 - (dy * dy) / 4000));
    if (!armed && pull >= THRESHOLD) { armed = true; haptic('medium'); }
    if (armed && pull < THRESHOLD - 8) armed = false;
    p.classList.toggle('armed', armed);
    set(pull);
  }, { passive: false });

  const end = () => {
    if (!active) return;
    active = false;
    const open = armed; armed = false; p.classList.remove('armed');
    if (open) onOpen();          // synchron im Touch-Ende → Autofokus funktioniert auf dem iPhone
    set(0, true);
  };
  screenEl.addEventListener('touchend', end, { passive: true });
  screenEl.addEventListener('touchcancel', () => { active = false; set(0, true); }, { passive: true });
}
