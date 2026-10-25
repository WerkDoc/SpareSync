// =====================================================================
//  Gyro-Parallax: Dashboard-Kacheln neigen sich mit dem Handy
//  (DeviceOrientationEvent → CSS-Variablen --tx / --ty auf dem Dashboard)
// =====================================================================
const KEY = 'ss-gyro';
const MAX_DEG = 18;              // ab dieser Neigung (Grad) ist der volle Effekt erreicht
let listening = false;
let target = null;               // aktuelles Dashboard-Element
let base = null;                 // „Ruhelage“ – wie der Nutzer das Handy gerade hält
let raw = { x: 0, y: 0 };        // Ziel (-1 … 1)
let cur = { x: 0, y: 0 };        // geglätteter Wert
let raf = 0;
let lastEvent = 0;

export const gyroEnabled = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setGyroEnabled = (on) => {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  if (!on) { target?.classList.remove('gyro'); target?.style.removeProperty('--tx'); target?.style.removeProperty('--ty'); }
};
const supported = () => typeof window.DeviceOrientationEvent !== 'undefined';
const needsPermission = () => supported() && typeof DeviceOrientationEvent.requestPermission === 'function';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v) => Math.max(-1, Math.min(1, v));

function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  lastEvent = performance.now();
  // Bildschirmdrehung berücksichtigen (Querformat tauscht die Achsen)
  const angle = (screen.orientation?.angle ?? window.orientation ?? 0) % 360;
  let x = e.gamma; let y = e.beta;
  if (angle === 90) { x = e.beta; y = -e.gamma; } else if (angle === 270 || angle === -90) { x = -e.beta; y = e.gamma; } else if (angle === 180) { x = -e.gamma; y = -e.beta; }
  if (!base) base = { x, y };
  // Ruhelage folgt langsam nach → hält man das Handy dauerhaft anders, zentriert sich der Effekt wieder
  base.x += (x - base.x) * 0.012; base.y += (y - base.y) * 0.012;
  raw = { x: clamp((x - base.x) / MAX_DEG), y: clamp((y - base.y) / MAX_DEG) };
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  raf = 0;
  if (!target?.isConnected) return;
  // weiche Feder-Glättung (kein Zittern vom Sensor)
  cur.x += (raw.x - cur.x) * 0.14; cur.y += (raw.y - cur.y) * 0.14;
  target.style.setProperty('--tx', cur.x.toFixed(4));
  target.style.setProperty('--ty', cur.y.toFixed(4));
  if (Math.abs(raw.x - cur.x) > 0.002 || Math.abs(raw.y - cur.y) > 0.002) raf = requestAnimationFrame(tick);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('deviceorientation', onOrient, { passive: true });
  document.addEventListener('visibilitychange', () => { base = null; });
}

/** iOS: Erlaubnis nur nach einem Tipp möglich. Liefert true, wenn Sensor-Daten fließen dürfen. */
export async function requestGyro() {
  if (!supported()) return false;
  if (needsPermission()) {
    try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false; } catch { return false; }
  }
  listen();
  return true;
}

/** Beim Aufbau des Dashboards aufrufen */
export function attachGyro(el) {
  target = el; base = null;
  if (!gyroEnabled() || reduced() || !supported()) return;
  el.classList.add('gyro');
  if (!needsPermission()) { listen(); return; }
  if (listening && performance.now() - lastEvent < 2000) return;
  // iOS: erster Tipp auf dem Dashboard fragt einmalig nach „Bewegung & Ausrichtung“
  const ask = () => { requestGyro(); };
  el.addEventListener('click', ask, { once: true, capture: true });
}
