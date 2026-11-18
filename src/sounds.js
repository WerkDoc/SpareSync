// =====================================================================
//  Dezente Sounds – direkt im Browser erzeugt (Web Audio), keine Audiodateien nötig.
//  tick: Drehregler-Raste · ping: Buchung erfolgreich · cash: im Warenkorb
//  Abschaltbar im Menü („Töne“). Standard: an.
// =====================================================================
const KEY = 'ss-sounds';
let ctx = null;
export const soundsOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setSoundsOn = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* egal */ } };

function ac() {
  if (!soundsOn()) return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
/** ein kurzer Ton mit weichem Ein-/Ausklingen */
function tone(c, { f = 880, f2 = null, t = 0, dur = 0.12, type = 'sine', vol = 0.12 }) {
  const o = c.createOscillator(); const g = c.createGain();
  const t0 = c.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
let lastTick = 0;
export function tick() {
  const now = performance.now(); if (now - lastTick < 35) return; lastTick = now;      // nicht „rattern“ beim schnellen Drehen
  const c = ac(); if (!c) return;
  tone(c, { f: 2400, f2: 1600, dur: 0.025, type: 'square', vol: 0.035 });
}
export function ping() {
  const c = ac(); if (!c) return;
  tone(c, { f: 1318.5, dur: 0.22, vol: 0.10 });              // E6
  tone(c, { f: 1975.5, t: 0.07, dur: 0.30, vol: 0.07 });     // B6
}
export function cash() {
  const c = ac(); if (!c) return;
  tone(c, { f: 2093, dur: 0.09, type: 'triangle', vol: 0.10 });          // „Kling“
  tone(c, { f: 2637, t: 0.08, dur: 0.12, type: 'triangle', vol: 0.09 });
  tone(c, { f: 3136, t: 0.16, dur: 0.35, type: 'triangle', vol: 0.08 });  // „-gelt“
  // kleines „Rattern“ der Kassenlade
  for (let i = 0; i < 4; i++) tone(c, { f: 180 + i * 20, t: 0.02 + i * 0.03, dur: 0.03, type: 'square', vol: 0.025 });
}
