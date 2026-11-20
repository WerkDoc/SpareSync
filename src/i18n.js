// =====================================================================
//  SPRACHE (Deutsch / English)
//  Die App ist auf Deutsch geschrieben. Bei Englisch übersetzt diese Datei alle sichtbaren Texte
//  beim Anzeigen: Text, Platzhalter, aria-label und title werden über das Wörterbuch (i18n-en.js)
//  ersetzt. Fehlt ein Eintrag, bleibt der deutsche Text stehen – es geht also nie etwas kaputt.
//  Zahlen in Texten sind Platzhalter: „# Einträge“ passt auf „8 Einträge“ → „8 items“.
//  Eigene Daten (Teilenamen, Lagerorte …) in den markierten Bereichen werden nicht angefasst.
// =====================================================================
import EN from './i18n-en.js';

const pref = () => { try { return localStorage.getItem('ss-lang') || 'auto'; } catch { return 'auto'; } };
const detect = () => {
  const p = pref();
  if (p === 'de' || p === 'en') return p;
  const l = (navigator.languages?.[0] || navigator.language || 'de').toLowerCase();
  return l.startsWith('de') ? 'de' : 'en';
};
export const LANG = detect();
export const LOCALE = LANG === 'en' ? 'en-US' : 'de-DE';
export const langPref = pref;
export function setLang(v) { try { localStorage.setItem('ss-lang', v); } catch { /* egal */ } }
try { document.documentElement.lang = LANG; } catch { /* egal */ }

const DICT = new Map(Object.entries(EN));
const NUM = /\d+(?:[.,:]\d+)*/g;
const HAS_WORD = /[A-Za-zÄÖÜäöüß]{2}/;
const miss = new Set();
const collect = (() => { try { return localStorage.getItem('ss-i18n-collect') === '1'; } catch { return false; } })();

function lookup(k) {
  if (DICT.has(k)) return DICT.get(k);
  // Zitate („Suchwort“, „Teilename“) und Zahlen sind Platzhalter: „Nichts gefunden für „*““, „# Einträge“
  const quotes = []; const nums = [];
  const tpl = k.replace(/„([^“]*)“/g, (m, q) => { quotes.push(q); return '„*“'; })
    .replace(NUM, (m) => { nums.push(m); return '#'; });
  if ((nums.length || quotes.length) && DICT.has(tpl)) {
    let i = 0; let j = 0;
    return DICT.get(tpl).replace(/#/g, () => nums[i++] ?? '#').replace(/\*/g, () => quotes[j++] ?? '');
  }
  return null;
}
/** Einen Text übersetzen (Deutsch → Englisch); unbekannt → unverändert */
export function tr(s) {
  if (LANG === 'de' || s == null) return s;
  const str = String(s);
  const k = str.trim();
  if (!k || !HAS_WORD.test(k)) return str;
  let out = lookup(k);
  if (out == null) {
    // zusammengesetzte Texte: „Bestand 3 · Meb 1“, „Teile: 4“, „Name – Lagerort“
    for (const sep of [' · ', ' – ', ' — ', ': ', ' | ']) {
      if (!k.includes(sep)) continue;
      const parts = k.split(sep);
      const done = parts.map((p) => (HAS_WORD.test(p) ? lookup(p.trim()) : p));
      if (done.some((x, i) => x != null && x !== parts[i])) { out = done.map((x, i) => x ?? parts[i]).join(sep); break; }
    }
  }
  if (out == null) {
    // Trennzeichen am Anfang/Ende: „· Standard“, „8 Teile ·“
    const m = k.match(/^([·–—•]\s*)?(.*?)(\s*[·–—•])?$/);
    if (m && (m[1] || m[3]) && m[2]) { const o = lookup(m[2]); if (o != null) out = (m[1] || '') + o + (m[3] || ''); }
  }
  if (out == null) {
    // Anzahl in Klammern am Ende: „Original (3)“, „Hauptlager (2)“
    const m = k.match(/^(.*\S)\s+\((\d+)\)$/);
    if (m) { const o = lookup(m[1]); if (o != null) out = `${o} (${m[2]})`; }
  }
  if (out == null) {
    // Satzzeichen am Ende („Gespeichert!“, „Lädt…“)
    const m = k.match(/^(.*?)([.!?…:]+)$/);
    if (m && m[1]) { const o = lookup(m[1]); if (o != null) out = o + m[2]; }
  }
  if (out == null) { if (collect) miss.add(k.replace(NUM, '#')); return str; }
  const lead = str.match(/^\s*/)[0]; const trail = str.match(/\s*$/)[0];
  return lead + out + trail;
}
/** Für Code: t('Entnehmen') – liefert je nach Sprache den passenden Text */
export const t = tr;

// ---------- Sichtbare Texte übersetzen ----------
// Bereiche mit eigenen Daten (Teilenamen, Lagerorte, Notizen) bleiben, wie sie sind
const SKIP = 'script,style,textarea,[contenteditable],[data-no-i18n],.mrow-title,.r-title,.nr,.crow-name,.ct-name,.selectable,.lbl,.print-root,.oq-t b,.lc-t b,.fp-in b,.po-name b,.pair-chip b,.viewed-card b,.mov-note,.note-text';
const ATTRS = ['placeholder', 'aria-label', 'title'];
function skip(el) { return !el || (el.closest && el.closest(SKIP)); }
function doText(n) {
  const v = n.nodeValue;
  if (!v || !HAS_WORD.test(v) || skip(n.parentElement)) return;
  const o = tr(v);
  if (o !== v) n.nodeValue = o;
}
function doAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (!v || !HAS_WORD.test(v)) continue;
    const o = tr(v);
    if (o !== v) el.setAttribute(a, o);
  }
}
function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || skip(root)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}
export function translateDom(root = document.body) { if (LANG !== 'de' && root) walk(root); }

if (LANG !== 'de') {
  const start = () => {
    translateDom(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes' && !skip(m.target)) doAttrs(m.target);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const tt = document.querySelector('title');
    if (tt) { tt.textContent = tr(tt.textContent); }
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  // Für die Wörterbuch-Pflege: window.__i18nMissing() listet fehlende Texte (nur mit ss-i18n-collect=1)
  window.__i18nMissing = () => [...miss].sort();
}
