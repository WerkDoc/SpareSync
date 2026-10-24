// CSV-Export und -Import (Semikolon, Excel-kompatibel)
import * as db from './db.js';

const COLS = ['Nr', 'Typ', 'Name', 'Barcode', 'Gruppe', 'Lagerort', 'Bestand', 'Meldebestand', 'Maximalbestand',
  'Einheit', 'Verkaufspreis', 'Einkaufspreis', 'Lieferant', 'Notizen'];

const cell = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const de = (n) => (n == null || n === '' ? '' : String(n).replace('.', ','));

export function exportCSV(materials) {
  const lines = [COLS.join(';')];
  for (const m of materials) {
    const locs = m.locations.length ? m.locations : [{ name: '', qty: 0 }];
    for (const l of locs) {
      lines.push([m.number, m.kind === 'tool' ? 'Werkzeug' : 'Ersatzteil', m.name, m.barcode, m.group_name, l.name, de(l.qty),
        de(m.min_stock), de(m.max_stock), m.unit, de(m.sale_price), de(m.purchase_price), m.supplier, m.notes].map(cell).join(';'));
    }
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const name = `lagerbestand-${new Date().toISOString().slice(0, 10)}.csv`;
  const file = new File([blob], name, { type: 'text/csv' });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(() => {});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function parse(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const ALIASES = {
  number: ['nr', 'nummer', 'artikelnummer', 'artikelnr', 'id'], kind: ['typ', 'art', 'kind'], name: ['name', 'bezeichnung', 'artikel', 'material'],
  barcode: ['barcode', 'ean', 'code'], group: ['gruppe', 'ersatzteil gruppe', 'kategorie', 'materialgruppe', 'material gruppe'], location: ['lagerort', 'lager', 'ort', 'haupt lagerort (hl)', 'haupt lagerort', 'hauptlagerort'],
  qty: ['bestand', 'menge', 'aktueller bestand', 'anzahl', 'hl bestand'], min_stock: ['meldebestand', 'meb', 'mindestbestand', 'hl meldebestand'], max_stock: ['maximalbestand', 'max', 'hl maximalbestand'],
  image: ['bild', 'bild url', 'image', 'foto'],
  unit: ['einheit'], sale_price: ['verkaufspreis', 'vk', 'preis'], purchase_price: ['einkaufspreis', 'ek'], supplier: ['lieferant'], notes: ['notizen', 'notiz', 'bemerkung'],
};
const num = (s) => { s = String(s ?? '').trim(); if (!s) return null; s = s.replace(/\s|€/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return Number.isNaN(+s) ? null : +s; };

/** Legt fehlende Gruppen/Lagerorte an, aktualisiert vorhandene Artikel (gleiche Nr. oder gleicher Name) */
export async function importCSV(text, progress) {
  const rows = parse(text);
  if (rows.length < 2) throw new Error('CSV enthält keine Daten');
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
  const idx = {};
  for (const [k, al] of Object.entries(ALIASES)) idx[k] = head.findIndex((h) => al.includes(h));
  if (idx.name < 0) throw new Error('Spalte „Name“ fehlt in der Kopfzeile');

  const groups = await db.listGroups(); const locs = await db.listLocations(); const mats = await db.listMaterials();
  const ensure = async (list, name, create) => {
    if (!name) return null;
    let x = list.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (!x) { x = await create(name); list.push(x); }
    return x.id;
  };
  const res = { created: 0, updated: 0, errors: [] };
  const data = rows.slice(1);
  for (let i = 0; i < data.length; i++) {
    const r = data[i]; const get = (k) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
    if (i % 10 === 0) progress?.(i + 1, data.length);
    try {
      const name = get('name'); if (!name) continue;
      const group_id = await ensure(groups, get('group'), db.createGroup);
      const location_id = await ensure(locs, get('location'), (n) => db.createLocation(n));
      const d = { name, kind: /werkzeug|tool/i.test(get('kind')) ? 'tool' : 'part' };
      if (get('number')) d.number = num(get('number'));
      if (get('barcode')) d.barcode = get('barcode');
      if (group_id) d.group_id = group_id;
      if (location_id) d.default_location_id = location_id;
      for (const k of ['min_stock', 'max_stock', 'sale_price', 'purchase_price']) if (get(k)) d[k] = num(get(k));
      for (const k of ['unit', 'supplier', 'notes']) if (get(k)) d[k] = get(k);
      const qty = num(get('qty'));
      const ex = mats.find((m) => (d.number != null && m.number === d.number) || m.name.toLowerCase() === name.toLowerCase());
      if (ex) {
        await db.saveMaterial(ex.id, d);
        if (location_id && qty != null) await db.book({ material_id: ex.id, type: 'inventory', qty, location_id, note: 'CSV-Import' });
        res.updated++;
      } else {
        const id = await db.saveMaterial(null, d, { initial: location_id ? { location_id, qty: qty || 0 } : null });
        mats.push({ id, name, number: d.number, locations: [] });
        res.created++;
        const img = get('image');
        if (/^https?:\/\//i.test(img)) {
          try {
            const r = await fetch(img); if (!r.ok) throw new Error('HTTP ' + r.status);
            const blob = await r.blob(); if (!blob.type.startsWith('image/')) throw new Error('kein Bild');
            await db.addFile(id, blob, 'bild.jpg', 'image'); res.images = (res.images || 0) + 1;
          } catch { res.imageErrors = (res.imageErrors || 0) + 1; }
        }
      }
    } catch (e) { res.errors.push(`Zeile ${i + 2}: ${e.message}`); }
  }
  return res;
}
