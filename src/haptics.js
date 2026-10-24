// ---------------------------------------------------------------------
//  Haptisches Feedback (Taptic-Engine-Simulation)
//
//  1. Android / Chrome: navigator.vibrate(…)  – kurzer, knackiger Impuls
//  2. iPhone (Safari 18+ / iOS 18+): Safari kennt navigator.vibrate NICHT.
//     Trick: Das Umschalten eines versteckten iOS-Schalters
//     (<input type="checkbox" switch>) löst dort einen echten Haptik-„Tick“ aus.
//  3. Alles andere: es passiert einfach nichts – nie ein Absturz.
//
//  Wichtig: Browser erlauben Haptik nur direkt in einer Nutzer-Aktion
//  (Tippen, Loslassen nach dem Ziehen) – genau dort rufen wir sie auf.
// ---------------------------------------------------------------------

const PATTERNS = {
  light: 10,          // Tabs, Schnellaktionen
  medium: 15,         // Neu laden, Bestätigungen
  success: [12, 60, 18],
  warning: [20, 80, 20],
};

let switchLabel = null;
function iosTick() {
  try {
    if (!switchLabel) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');           // iOS-18-Schalter mit eingebauter Haptik
      input.id = 'haptic-switch';
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      switchLabel = document.createElement('label');
      switchLabel.htmlFor = input.id;
      switchLabel.setAttribute('aria-hidden', 'true');
      for (const el of [input, switchLabel]) {
        Object.assign(el.style, { position: 'fixed', left: '-9999px', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
      }
      document.body.append(input, switchLabel);
    }
    switchLabel.click();
  } catch { /* nicht unterstützt – egal */ }
}

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const isIOS = typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
let lastTick = 0;

/**
 * Kurzes haptisches Feedback.
 * @param {'light'|'medium'|'success'|'warning'|number} kind
 */
export function haptic(kind = 'light') {
  try {
    if (matchMedia?.('(prefers-reduced-motion: reduce)').matches && kind === 'light') return;
    const now = Date.now();
    if (now - lastTick < 40) return;               // Doppelauslösung vermeiden
    lastTick = now;
    const pattern = typeof kind === 'number' ? kind : (PATTERNS[kind] ?? PATTERNS.light);
    if (canVibrate) { navigator.vibrate(pattern); return; }
    if (isIOS) {
      iosTick();
      if (Array.isArray(pattern) && pattern.length > 2) setTimeout(iosTick, 90);   // „Doppel-Tick“ für Erfolg/Warnung
    }
  } catch { /* nie abstürzen */ }
}

/** Haptik für alle wichtigen Bedienelemente – einmal global anmelden */
export function installHaptics(root = document) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest?.(
      '.segment > button:not(.on), .quick, .widget, .tab:not(.on), [data-act="refresh"], [data-act="reload"], .glass-btn, .book-card, .card-btn',
    );
    if (!t) return;
    haptic(t.matches('[data-act="refresh"], [data-act="reload"]') ? 'medium' : 'light');
  }, { capture: true, passive: true });
}
