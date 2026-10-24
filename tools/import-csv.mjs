#!/usr/bin/env node
// =====================================================================
//  SpareSync – CSV-Import mit Bildern
//
//  Liest eine CSV-Datei (Export aus der alten Lager-App), lädt jedes Bild
//  von der URL in der Spalte „Bild“ herunter, speichert es in Supabase
//  Storage und legt das Ersatzteil inkl. Gruppe, Lagerort, Bestand und
//  Meldebestand an.
//
//  Aufruf (im Projektordner):
//    node tools/import-csv.mjs teile.csv
//
//  Optionen:
//    --probe        nur die ersten 3 Zeilen importieren (zum Testen)
//    --dry-run      nichts speichern, nur anzeigen, was passieren würde
//    --no-images    Bilder überspringen
//    --update       vorhandene Teile (gleicher Name) aktualisieren statt überspringen
//
//  Anmeldung erfolgt mit DEINEM SpareSync-Login (E-Mail + Passwort).
//  Es wird KEIN geheimer Supabase-Schlüssel benötigt – nur der öffentliche
//  Publishable/anon Key. Alles landet in deinem eigenen Lager.
// =====================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'lager-files';           // derselbe Bucket, den die App nutzt
const IMAGE_TIMEOUT_MS = 20000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// ---------- Argumente ----------
const args = argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (f) => args.includes(f);
const DRY = flag('--dry-run');
const PROBE = flag('--probe');
const NO_IMAGES = flag('--no-images');
const UPDATE = flag('--update');

if (!file) {
  console.log('\nAufruf:  node tools/import-csv.mjs <datei.csv> [--probe] [--dry-run] [--no-images] [--update]\n');
  exit(1);
}
if (!existsSync(file)) { console.error(`Datei nicht gefunden: ${file}`); exit(1); }

// ---------- Hilfen ----------
const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };
const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, def = '') => ((await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def);

function readEnv() {
  const env = { ...process.env };
  for (const f of ['.env', '.env.local']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

/** Datei als Text: UTF-8, bei kaputten Umlauten automatisch Windows-1252 (Excel) */
function readText(path) {
  const buf = readFileSync(path);
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
  return text.replace(/^﻿/, '');
}

/** CSV-Parser: erkennt ; oder , oder Tab, beachtet Anführungszeichen und Zeilenumbrüche in Feldern */
function parseCSV(text) {
  const first = text.split(/\r?\n/)[0];
  const count = (ch) => (first.match(new RegExp(ch === '\t' ? '\t' : `\\${ch}`, 'g')) || []).length;
  const sep = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// Spaltennamen der alten App + allgemeine Alternativen (Groß/Klein egal)
const ALIASES = {
  image: ['bild', 'bild url', 'image', 'foto', 'vorschaubild'],
  name: ['name', 'bezeichnung', 'artikel', 'material'],
  group: ['ersatzteil gruppe', 'gruppe', 'materialgruppe', 'material gruppe', 'kategorie'],
  location: ['haupt lagerort (hl)', 'haupt lagerort', 'hauptlagerort', 'lagerort', 'lager'],
  qty: ['hl bestand', 'bestand', 'aktueller bestand', 'menge'],
  min: ['hl meldebestand', 'meldebestand', 'meb', 'mindestbestand'],
  max: ['hl maximalbestand', 'maximalbestand', 'max'],
  number: ['nr', 'nummer', 'artikelnummer', 'id'],
  barcode: ['barcode', 'ean'],
  price: ['verkaufspreis', 'vk', 'preis'],
};
const num = (s) => {
  s = String(s ?? '').trim().replace(/\s|€/g, ''); if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : null;
};

async function withTimeout(promise, ms, msg) {
  let t; const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); });
  try { return await Promise.race([promise, timer]); } finally { clearTimeout(t); }
}

async function downloadImage(url) {
  const res = await withTimeout(fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'SpareSync-Import/1.0' } }), IMAGE_TIMEOUT_MS, 'Zeitüberschreitung beim Bild-Download');
  if (!res.ok) throw new Error(`Bild nicht erreichbar (HTTP ${res.status})`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('Bild ist leer');
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('Bild größer als 10 MB');
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg';
  return { buf, type: type.startsWith('image/') ? type : 'image/jpeg', ext };
}

// ---------- Start ----------
console.log(c.b('\nSpareSync – CSV-Import\n'));

const rows = parseCSV(readText(file));
if (rows.length < 2) { console.error('Die CSV enthält keine Datenzeilen.'); exit(1); }
const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
const col = {};
for (const [k, al] of Object.entries(ALIASES)) col[k] = head.findIndex((h) => al.includes(h));
if (col.name < 0) { console.error(`Spalte „Name“ nicht gefunden. Gefundene Spalten: ${rows[0].join(' | ')}`); exit(1); }

console.log('Erkannte Spalten:');
for (const [k, label] of [['image', 'Bild'], ['name', 'Name'], ['group', 'Gruppe'], ['location', 'Lagerort'], ['qty', 'Bestand'], ['min', 'Meldebestand'], ['max', 'Maximalbestand'], ['number', 'Nummer'], ['barcode', 'Barcode']]) {
  console.log(`  ${label.padEnd(15)} ${col[k] >= 0 ? c.g('✓ ' + rows[0][col[k]]) : c.d('– nicht vorhanden')}`);
}
let data = rows.slice(1);
if (PROBE) data = data.slice(0, 3);
console.log(`\n${data.length} Zeilen${PROBE ? ' (Probelauf: nur die ersten 3)' : ''}${DRY ? c.y('  – DRY-RUN, es wird nichts gespeichert') : ''}\n`);

const env = readEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || await ask('Supabase-URL (z. B. https://xxxx.supabase.co)');
const key = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || await ask('Publishable/anon Key (sb_publishable_…)');
if (/sb_secret_|service_role/.test(key)) { console.error(c.r('Bitte NICHT den geheimen Schlüssel verwenden, sondern den Publishable Key.')); exit(1); }
const email = env.SPARESYNC_EMAIL || await ask('SpareSync E-Mail');
const password = env.SPARESYNC_PASSWORD || await ask('SpareSync Passwort');
rl.close();

const sb = createClient(url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), key, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password });
if (authErr) { console.error(c.r(`\nAnmeldung fehlgeschlagen: ${authErr.message}`)); exit(1); }
const uid = auth.user.id;
console.log(c.g(`\nAngemeldet als ${auth.user.email}\n`));

// Vorhandene Daten laden (Gruppen, Lagerorte, Teile) – für Zuordnung & Duplikat-Schutz
const load = async (table, cols) => { const { data: d, error } = await sb.from(table).select(cols).range(0, 9999); if (error) throw error; return d; };
const groups = await load('lager_groups', 'id,name');
const locs = await load('lager_locations', 'id,name');
const mats = await load('lager_materials', 'id,name,number');
const byName = (list, n) => list.find((x) => x.name.trim().toLowerCase() === n.trim().toLowerCase());

async function ensure(list, table, name) {
  if (!name) return null;
  const hit = byName(list, name); if (hit) return hit.id;
  if (DRY) { const fake = { id: `neu:${name}`, name }; list.push(fake); return fake.id; }
  const { data: row, error } = await sb.from(table).insert({ name }).select('id,name').single();
  if (error) throw new Error(`${table === 'lager_groups' ? 'Gruppe' : 'Lagerort'} „${name}“: ${error.message}`);
  list.push(row); return row.id;
}

const stats = { created: 0, updated: 0, skipped: 0, images: 0, imageErrors: 0, errors: 0 };
const failures = [];

for (let i = 0; i < data.length; i++) {
  const r = data[i];
  const get = (k) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '');
  const name = get('name');
  const tag = c.d(`[${String(i + 1).padStart(String(data.length).length)}/${data.length}]`);
  if (!name) continue;
  try {
    const group_id = await ensure(groups, 'lager_groups', get('group'));
    const location_id = await ensure(locs, 'lager_locations', get('location'));
    const qty = num(get('qty')) ?? 0;
    const payload = { name, kind: 'part', group_id, default_location_id: location_id, min_stock: num(get('min')) ?? 0 };
    if (col.max >= 0 && num(get('max')) != null) payload.max_stock = num(get('max'));
    if (col.barcode >= 0 && get('barcode')) payload.barcode = get('barcode');
    if (col.price >= 0 && num(get('price')) != null) payload.sale_price = num(get('price'));
    if (col.number >= 0 && num(get('number')) != null && !mats.some((m) => m.number === num(get('number')))) payload.number = num(get('number'));

    const existing = byName(mats, name);
    if (existing && !UPDATE) { stats.skipped++; console.log(`${tag} ${c.y('übersprungen')}  ${name} ${c.d('(existiert schon)')}`); continue; }
    if (DRY) { console.log(`${tag} ${c.g(existing ? 'würde aktualisieren' : 'würde anlegen')}  ${name}  ${c.d(`· ${get('group') || '–'} · ${get('location') || '–'} · ${qty} Stk.`)}`); existing ? stats.updated++ : stats.created++; continue; }

    // 1) Teil anlegen bzw. aktualisieren
    let id;
    if (existing) {
      delete payload.number;
      const { error } = await sb.from('lager_materials').update(payload).eq('id', existing.id); if (error) throw error;
      id = existing.id;
    } else {
      const { data: row, error } = await sb.from('lager_materials').insert(payload).select('id,name,number').single(); if (error) throw error;
      id = row.id; mats.push(row);
    }

    // 2) Bestand buchen (Anfangsbestand bzw. Inventur bei Aktualisierung)
    if (location_id) {
      if (existing) {
        const { error } = await sb.rpc('lager_book', { p_material: id, p_type: 'inventory', p_qty: qty, p_location: location_id, p_to_location: null, p_note: 'CSV-Import' });
        if (error) throw error;
      } else if (qty > 0) {
        const { error } = await sb.rpc('lager_book', { p_material: id, p_type: 'in', p_qty: qty, p_location: location_id, p_to_location: null, p_note: 'Anfangsbestand (CSV-Import)' });
        if (error) throw error;
      } else {
        const { error } = await sb.from('lager_stock').upsert({ material_id: id, location_id, qty: 0 }, { onConflict: 'material_id,location_id', ignoreDuplicates: true });
        if (error) throw error;
      }
    }

    // 3) Bild herunterladen → Supabase Storage → mit dem Teil verknüpfen
    let imgNote = '';
    const imgUrl = get('image');
    if (imgUrl && !NO_IMAGES && /^https?:\/\//i.test(imgUrl)) {
      try {
        const { data: hasImg } = await sb.from('lager_files').select('id').eq('material_id', id).eq('kind', 'image').limit(1);
        if (hasImg?.length) imgNote = c.d(' · Bild vorhanden');
        else {
          const img = await downloadImage(imgUrl);
          const path = `${uid}/${id}/${Date.now()}-import.${img.ext}`;
          const up = await sb.storage.from(BUCKET).upload(path, img.buf, { contentType: img.type, upsert: false });
          if (up.error) throw up.error;
          const { error } = await sb.from('lager_files').insert({ material_id: id, name: `bild.${img.ext}`, path, kind: 'image' });
          if (error) throw error;
          const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          stats.images++; imgNote = c.g(' · Bild ✓') + c.d(` ${publicUrl.split('/').slice(-1)[0]}`);
        }
      } catch (e) {
        stats.imageErrors++; imgNote = c.y(` · Bild fehlgeschlagen: ${e.message}`);
        failures.push({ zeile: i + 2, name, fehler: `Bild: ${e.message}`, url: imgUrl });
      }
    }
    existing ? stats.updated++ : stats.created++;
    console.log(`${tag} ${c.g(existing ? 'aktualisiert' : 'angelegt   ')}  ${name}  ${c.d(`· ${qty} Stk.`)}${imgNote}`);
  } catch (e) {
    stats.errors++;
    failures.push({ zeile: i + 2, name, fehler: e.message || String(e), url: get('image') });
    console.log(`${tag} ${c.r('Fehler')}  ${name}: ${e.message || e}`);
  }
}

console.log(c.b('\nFertig.'));
console.log(`  angelegt:       ${stats.created}`);
console.log(`  aktualisiert:   ${stats.updated}`);
console.log(`  übersprungen:   ${stats.skipped}${stats.skipped && !UPDATE ? c.d('  (mit --update werden vorhandene Teile aktualisiert)') : ''}`);
console.log(`  Bilder:         ${stats.images}${stats.imageErrors ? c.y(`  (${stats.imageErrors} fehlgeschlagen)`) : ''}`);
console.log(`  Fehler:         ${stats.errors ? c.r(stats.errors) : 0}`);
if (failures.length) {
  const out = 'import-fehler.csv';
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  writeFileSync(out, '﻿Zeile;Name;Fehler;Bild-URL\r\n' + failures.map((f) => [f.zeile, f.name, f.fehler, f.url].map(esc).join(';')).join('\r\n'));
  console.log(c.y(`\nDetails zu Problemen: ${out}`));
}
await sb.auth.signOut();
console.log('');
