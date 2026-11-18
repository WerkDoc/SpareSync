// ---------------------------------------------------------------------
//  Datenschicht: Supabase (wenn .env gesetzt) – sonst Demo-Modus mit
//  lokalem Speicher im Browser. Beide liefern exakt dieselben Objekte.
// ---------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Gastmodus: die App läuft mit Beispieldaten nur auf diesem Gerät – ohne Konto, ohne Verbindung zur Datenbank.
// So kann man alles in Ruhe ausprobieren, bevor man sich registriert.
const GUEST_KEY = 'ss-guest';
const GUEST_LS = 'sparesync-guest-v1';
export const hasCloud = !!(SB_URL && SB_KEY);
export const isGuest = hasCloud && (() => { try { return localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; } })();
export function startGuest() { try { localStorage.setItem(GUEST_KEY, '1'); } catch { /* egal */ } }
export function endGuest() { try { localStorage.removeItem(GUEST_KEY); localStorage.removeItem(GUEST_LS); } catch { /* egal */ } }

export const sb = hasCloud && !isGuest
  ? createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
export const isDemo = !sb;

const BUCKET = 'lager-files';
const T = {
  loc: 'lager_locations', grp: 'lager_groups', mat: 'lager_materials', stock: 'lager_stock',
  mov: 'lager_movements', task: 'lager_tasks', file: 'lager_files', cart: 'lager_cart', fdef: 'lager_field_defs',
};

const fail = (error) => { if (error) throw new Error(error.message || String(error)); };
const nz = (v) => (v === '' || v == null || Number.isNaN(+v) ? null : +v);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'de');

// =====================================================================
//  DEMO-SPEICHER
// =====================================================================
const LS = isGuest ? GUEST_LS : 'werkdoc-lager-demo-v1';   // Gastdaten getrennt vom Entwickler-Demo
let store = null;

function seed() {
  const L = (name) => ({ id: uid(), name, barcode: '', created_at: now() });
  const locs = [L('Kleinteilemagazin'), L('Hauptlager'), L('Werkbank')];
  const groupNames = ['AirPods Akku', 'Apple Logo´s', 'Apple Pencil Akku', 'Apple Watch Akku', 'Apple Watch Backglas',
    'Apple Watch Battery FPC On Board', 'Apple Watch Display Glass', 'Apple Watch Force Touch Flex', 'Apple Watch LCD Flex Kabeln',
    'Apple Watch LCD Kleber Sticker', 'Apple Watch OCA Kleber', 'Apple Watch Rahmen-Gehäuse-Frame', 'Apple Watch TouchScreen',
    'Apple Watch Wärme Aufkleber', 'Werkzeug'];
  const groups = groupNames.map((name) => ({ id: uid(), name, created_at: now() }));
  const g = (n) => groups.find((x) => x.name === n).id;
  const s = { locations: locs, groups, materials: [], stock: [], movements: [], tasks: [], files: [], cart: [], fieldDefs: seedFieldDefs() };
  const add = (number, name, group, qty, min = 0, extra = {}) => {
    const id = uid();
    s.materials.push({
      id, number, kind: 'part', name, barcode: '', group_id: group ? g(group) : null, default_location_id: locs[0].id,
      unit: 'Stück', booking_type: 'Einheit', sale_price: 0, purchase_price: null, min_stock: min, max_stock: null,
      supplier: '', notes: '', custom_fields: {}, created_at: now(), updated_at: now(), ...extra,
    });
    s.stock.push({ material_id: id, location_id: locs[0].id, qty });
    if (qty) s.movements.push({ id: uid(), material_id: id, type: 'in', qty, from_location_id: locs[0].id, to_location_id: null, stock_after: qty, note: 'Anfangsbestand', created_at: now() });
  };
  add(101, 'Apple AirPods 1/2 Gen. Akku Links u.Rechts Original Neu', 'AirPods Akku', 2, 0,
    { barcode: 'Apple AirPods 1/2 Gen. Akku Links u.Rechts Original Neu', unit: '2', custom_fields: { 'Chargennummer Platz': '54' } });
  add(62, 'Apple Watch 4 44mm Force Touch Flex', 'Apple Watch Force Touch Flex', 2);
  add(25, 'Apple Watch 4 44mm LCD Flex Kabel *Pulled*', 'Apple Watch LCD Flex Kabeln', 3, 1);
  add(61, 'Apple Watch 4 44mm LCD Kleber Sticker', 'Apple Watch LCD Kleber Sticker', 6, 1);
  add(43, 'Apple Watch 4 44mm TouchScreen', 'Apple Watch TouchScreen', 2);
  add(60, 'Apple Watch 4 44mm Wärme Aufkleber Orig', 'Apple Watch Wärme Aufkleber', 0);
  add(24, 'Apple Watch 4 LTE Version 40mm Backglas', 'Apple Watch Backglas', 1, 1);
  add(201, 'Apple Watch 5 / SE 40mm TouchScreen Orig', 'Apple Watch TouchScreen', 4, 2);
  const tool = (number, name) => {
    s.materials.push({ id: uid(), number, kind: 'tool', name, barcode: '', group_id: g('Werkzeug'), default_location_id: locs[2].id,
      unit: 'Stück', booking_type: 'Einheit', sale_price: 0, purchase_price: null, min_stock: 0, max_stock: null, supplier: '', notes: '',
      custom_fields: {}, created_at: now(), updated_at: now() });
    s.stock.push({ material_id: s.materials.at(-1).id, location_id: locs[2].id, qty: 1 });
  };
  tool(501, 'Heißluftstation'); tool(502, 'Lötstation'); tool(503, 'Stereo-Mikroskop'); tool(504, 'Pinzetten-Set ESD');
  return s;
}
function seedFieldDefs() {
  return [{ id: uid(), name: 'Chargennummer Platz', type: 'text', options: [], applies_to: 'both', position: 0, created_at: now() }];
}
function load() {
  if (!store) {
    try { store = JSON.parse(localStorage.getItem(LS) || 'null'); } catch { store = null; }
    if (!store) { store = seed(); save(); }
    if (!store.fieldDefs) { store.fieldDefs = seedFieldDefs(); save(); }   // ältere Demo-Daten nachrüsten
  }
  return store;
}
function save() {
  try { localStorage.setItem(LS, JSON.stringify(store)); }
  catch { throw new Error('Speicher voll – im Demo-Modus bitte weniger/kleinere Bilder verwenden.'); }
}
export function resetDemo() { localStorage.removeItem(LS); store = null; load(); }

function demoNorm(m) {
  const s = load();
  const locations = s.stock.filter((x) => x.material_id === m.id).map((x) => ({
    location_id: x.location_id, name: s.locations.find((l) => l.id === x.location_id)?.name || '?', qty: +x.qty,
  })).sort(byName);
  const files = s.files.filter((f) => f.material_id === m.id).map((f) => ({ ...f, url: f.path }));
  return {
    ...m,
    group_name: s.groups.find((x) => x.id === m.group_id)?.name || '',
    locations, total: locations.reduce((a, b) => a + b.qty, 0),
    files, images: files.filter((f) => f.kind === 'image'),
  };
}

// =====================================================================
//  SUPABASE-HILFEN
// =====================================================================
const pubUrl = (path) => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
// Kleines Vorschaubild liegt neben dem Foto: <pfad>.thumb.jpg (gleicher Ordner → gleiche Speicher-Regeln)
const THUMB = '.thumb.jpg';
export const thumbPathOf = (path) => path + THUMB;
const MAT_SELECT = '*, lager_groups(name), lager_stock(qty, location_id, lager_locations(name)), lager_files(id, name, path, kind, created_at)';
function sbNorm(r) {
  const locations = (r.lager_stock || []).map((x) => ({ location_id: x.location_id, name: x.lager_locations?.name || '?', qty: +x.qty })).sort(byName);
  const files = (r.lager_files || []).map((f) => ({ ...f, url: pubUrl(f.path), ...(f.kind === 'image' ? { thumb: pubUrl(f.path + THUMB) } : {}) }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { lager_groups, lager_stock, lager_files, ...rest } = r;
  return {
    ...rest, group_name: lager_groups?.name || '', locations,
    total: locations.reduce((a, b) => a + b.qty, 0), files, images: files.filter((f) => f.kind === 'image'),
  };
}
async function myId() {
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error('Nicht angemeldet');
  return data.user.id;
}

// =====================================================================
//  AUTH
// =====================================================================
export async function getUser() {
  if (isDemo) return { email: 'Demo-Modus' };
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.user) return data.session.user;
  } catch { /* offline */ }
  // Offline: gespeicherte Anmeldung lesen, damit die App ohne Netz nicht zum Login springt
  if (!navigator.onLine) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) {
          const v = JSON.parse(localStorage.getItem(k));
          const u = v?.user || v?.currentSession?.user;
          if (u) return u;
        }
      }
    } catch {}
  }
  return null;
}
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password }); fail(error);
}
export async function signUp(email, password, meta = {}) {
  // Bestätigungslink führt zurück zur Lager-App (nicht zur Site URL)
  const emailRedirectTo = location.origin + location.pathname;
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo, data: meta } });
  if (error) {
    const m = error.message || '';
    if (/registered|exists/i.test(m)) throw new Error('Für diese E-Mail gibt es schon einen Zugang – bitte anmelden.');
    if (/password/i.test(m)) throw new Error('Passwort zu schwach – bitte mindestens 8 Zeichen verwenden.');
    if (/rate|too many/i.test(m)) throw new Error('Zu viele Versuche – bitte in ein paar Minuten erneut probieren.');
    fail(error);
  }
  // Supabase meldet eine schon registrierte E-Mail ohne Fehler, aber ohne Identitäten
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('Für diese E-Mail gibt es schon einen Zugang – bitte anmelden.');
  }
  return !!data.session;
}

/** Legt beim ersten Login den bei der Registrierung angegebenen Lager-Namen als ersten Lagerort an */
let starterChecked = false;
export async function ensureStarterLocation() {
  if (isDemo || starterChecked) return false;
  starterChecked = true;
  try {
    const { data } = await sb.auth.getUser();
    const name = data.user?.user_metadata?.lager_name?.trim();
    if (!name) return false;
    const { count } = await sb.from(T.loc).select('id', { count: 'exact', head: true });
    if (count) return false;
    await createLocation(name);
    return true;
  } catch { return false; }
}
export async function signOut() { starterChecked = false; clearOfflineCache(); if (!isDemo) await sb.auth.signOut(); }

// =====================================================================
//  GRUPPEN
// =====================================================================
export async function listGroups() {
  if (isDemo) {
    const s = load();
    return s.groups.map((g) => ({ ...g, count: s.materials.filter((m) => m.group_id === g.id).length })).sort(byName);
  }
  const { data, error } = await sb.from(T.grp).select('id, name, lager_materials(count)').order('name'); fail(error);
  return data.map((g) => ({ id: g.id, name: g.name, count: g.lager_materials?.[0]?.count || 0 }));
}
export async function createGroup(name) {
  name = name.trim(); if (!name) throw new Error('Name fehlt');
  if (isDemo) {
    const s = load();
    if (s.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) throw new Error('Gruppe existiert bereits');
    const g = { id: uid(), name, created_at: now() }; s.groups.push(g); save(); return g;
  }
  const { data, error } = await sb.from(T.grp).insert({ name }).select().single();
  if (error?.code === '23505') throw new Error('Gruppe existiert bereits'); fail(error); return data;
}
export async function renameGroup(id, name) {
  if (isDemo) { load().groups.find((g) => g.id === id).name = name.trim(); save(); return; }
  const { error } = await sb.from(T.grp).update({ name: name.trim() }).eq('id', id); fail(error);
}
export async function deleteGroup(id) {
  if (isDemo) {
    const s = load(); s.groups = s.groups.filter((g) => g.id !== id);
    s.materials.forEach((m) => { if (m.group_id === id) m.group_id = null; }); save(); return;
  }
  const { error } = await sb.from(T.grp).delete().eq('id', id); fail(error);
}

// =====================================================================
//  LAGERORTE
// =====================================================================
export async function listLocations() {
  if (isDemo) {
    const s = load();
    return s.locations.map((l) => ({ ...l, count: s.stock.filter((x) => x.location_id === l.id).length })).sort(byName);
  }
  const { data, error } = await sb.from(T.loc).select('id, name, barcode, lager_stock(count)').order('name'); fail(error);
  return data.map((l) => ({ id: l.id, name: l.name, barcode: l.barcode, count: l.lager_stock?.[0]?.count || 0 }));
}
export async function createLocation(name, barcode = '') {
  name = name.trim(); if (!name) throw new Error('Name fehlt');
  if (isDemo) {
    const s = load();
    if (s.locations.some((l) => l.name.toLowerCase() === name.toLowerCase())) throw new Error('Lagerort existiert bereits');
    const l = { id: uid(), name, barcode, created_at: now() }; s.locations.push(l); save(); return l;
  }
  const { data, error } = await sb.from(T.loc).insert({ name, barcode: barcode || null }).select().single();
  if (error?.code === '23505') throw new Error('Lagerort existiert bereits'); fail(error); return data;
}
export async function updateLocation(id, patch) {
  if (isDemo) { Object.assign(load().locations.find((l) => l.id === id), patch); save(); return; }
  const { error } = await sb.from(T.loc).update(patch).eq('id', id); fail(error);
}
export async function deleteLocation(id) {
  if (isDemo) {
    const s = load();
    if (s.stock.some((x) => x.location_id === id && x.qty > 0)) throw new Error('An diesem Lagerort liegt noch Bestand – erst umbuchen.');
    s.locations = s.locations.filter((l) => l.id !== id); s.stock = s.stock.filter((x) => x.location_id !== id); save(); return;
  }
  const { count } = await sb.from(T.stock).select('qty', { count: 'exact', head: true }).eq('location_id', id).gt('qty', 0);
  if (count) throw new Error('An diesem Lagerort liegt noch Bestand – erst umbuchen.');
  const { error } = await sb.from(T.loc).delete().eq('id', id); fail(error);
}

// =====================================================================
//  MATERIALIEN
// =====================================================================
export async function listMaterials() {
  if (isDemo) return load().materials.map(demoNorm).sort((a, b) => a.number - b.number);
  const { data, error } = await sb.from(T.mat).select(MAT_SELECT).order('number').range(0, 9999); fail(error);
  return data.map(sbNorm);
}
export async function getMaterial(id) {
  if (isDemo) { const m = load().materials.find((x) => x.id === id); return m ? demoNorm(m) : null; }
  const { data, error } = await sb.from(T.mat).select(MAT_SELECT).eq('id', id).maybeSingle(); fail(error);
  return data ? sbNorm(data) : null;
}
/** Favoriten-Stern setzen/entfernen (ändert „zuletzt geändert“ nicht) */
export async function setFavorite(id, on) {
  if (isDemo) { const s = load(); const m = s.materials.find((x) => x.id === id); if (m) m.is_favorite = !!on; save(s); return; }
  const { error } = await sb.from(T.mat).update({ is_favorite: !!on }).eq('id', id);
  if (error && /is_favorite/.test(error.message || '')) {
    throw new Error('Für Favoriten fehlt noch ein Datenbank-Update: bitte supabase/migration-favoriten.sql im Supabase-SQL-Editor ausführen.');
  }
  fail(error);
}
/** Sucht per Barcode, exakter Artikelnummer oder exaktem Namen */
export async function findByCode(code) {
  code = String(code).trim(); if (!code) return null;
  const all = await listMaterials();
  return all.find((m) => m.barcode && m.barcode === code)
    || (/^\d+$/.test(code) && all.find((m) => String(m.number) === code))
    || all.find((m) => m.name.toLowerCase() === code.toLowerCase()) || null;
}

const MAT_FIELDS = ['number', 'kind', 'name', 'barcode', 'group_id', 'default_location_id', 'unit', 'booking_type',
  'sale_price', 'purchase_price', 'min_stock', 'max_stock', 'supplier', 'notes', 'custom_fields', 'fits'];
function cleanMaterial(d) {
  const o = {};
  MAT_FIELDS.forEach((k) => { if (k in d) o[k] = d[k]; });
  ['sale_price', 'purchase_price', 'min_stock', 'max_stock', 'number'].forEach((k) => { if (k in o) o[k] = nz(o[k]); });
  if ('sale_price' in o && o.sale_price == null) o.sale_price = 0;
  if ('min_stock' in o && o.min_stock == null) o.min_stock = 0;
  ['barcode', 'group_id', 'default_location_id', 'supplier', 'notes'].forEach((k) => { if (k in o && o[k] === '') o[k] = null; });
  if (o.name != null) o.name = o.name.trim();
  // „Passt für“: Liste ohne Leereinträge/Doppelte (Groß/klein egal)
  if ('fits' in o) {
    const seen = new Set();
    o.fits = (Array.isArray(o.fits) ? o.fits : String(o.fits || '').split(/[,;\n]/)).map((x) => String(x).trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
  }
  return o;
}

/**
 * Legt ein Material an oder speichert es.
 * opts.initial = { location_id, qty }  (nur beim Anlegen)
 * opts.images  = [Blob]               (neue Bilder)
 */
export async function saveMaterial(id, data, opts = {}) {
  const d = cleanMaterial(data);
  if (!id && !d.name) throw new Error('Bitte einen Namen eingeben');
  if (isDemo) {
    const s = load();
    if (d.number != null && s.materials.some((m) => m.number === d.number && m.id !== id)) throw new Error(`Artikelnummer ${d.number} ist schon vergeben`);
    if (id) {
      Object.assign(s.materials.find((m) => m.id === id), d, { updated_at: now() });
    } else {
      id = uid();
      const number = d.number ?? (Math.max(0, ...s.materials.map((m) => m.number)) + 1);
      s.materials.push({ kind: 'part', unit: 'Stück', booking_type: 'Einheit', sale_price: 0, min_stock: 0, custom_fields: {},
        ...d, id, number, created_at: now(), updated_at: now() });
    }
    save();
  } else {
    // Fehlt die Spalte „fits“ noch (Datenbank-Update nicht ausgeführt), trotzdem alles andere speichern
    const noFitsCol = (e) => e && (e.code === '42703' || e.code === 'PGRST204') && /fits/.test(e.message || '');
    let fitsLost = false;
    const run = async () => {
      if (id) { const { error } = await sb.from(T.mat).update(d).eq('id', id); return { error }; }
      const { data: row, error } = await sb.from(T.mat).insert(d).select('id').single(); return { error, row };
    };
    let r = await run();
    if (noFitsCol(r.error)) { fitsLost = (d.fits || []).length > 0; delete d.fits; r = await run(); }
    if (r.error?.code === '23505') throw new Error(`Artikelnummer ${d.number} ist schon vergeben`); fail(r.error);
    if (!id) id = r.row.id;
    if (fitsLost) {
      opts.onWarning?.('„Passt für“ wurde nicht gespeichert: bitte supabase/migration-passt-fuer-zusammenfuehren.sql im Supabase-SQL-Editor ausführen.');
    }
  }
  const ini = opts.initial;
  if (ini?.location_id) {
    if (+ini.qty > 0) await book({ material_id: id, type: 'in', qty: +ini.qty, location_id: ini.location_id, note: 'Anfangsbestand' });
    else await addStockLocation(id, ini.location_id);
  }
  for (const img of opts.images || []) await addFile(id, img, img.name || 'bild.jpg', 'image');
  return id;
}
export async function deleteMaterial(id) {
  if (isDemo) {
    const s = load();
    s.materials = s.materials.filter((m) => m.id !== id);
    ['stock', 'movements', 'tasks', 'files', 'cart'].forEach((k) => { s[k] = s[k].filter((x) => x.material_id !== id); });
    save(); return;
  }
  const { data: files } = await sb.from(T.file).select('path, kind').eq('material_id', id);
  if (files?.length) await sb.storage.from(BUCKET).remove(files.flatMap((f) => (f.kind === 'image' ? [f.path, f.path + THUMB] : [f.path])));
  const { error } = await sb.from(T.mat).delete().eq('id', id); fail(error);
}
/** Zwei Teile zusammenführen: drop geht in keep auf (Bestand addiert, Historie/Bilder/Aufgaben wandern mit). Liefert neuen Gesamtbestand. */
export async function mergeMaterials(keepId, dropId) {
  if (keepId === dropId) throw new Error('Bitte zwei verschiedene Teile wählen');
  if (isDemo) {
    const s = load();
    const k = s.materials.find((m) => m.id === keepId); const d = s.materials.find((m) => m.id === dropId);
    if (!k || !d) throw new Error('Teil nicht gefunden');
    s.stock.filter((x) => x.material_id === dropId).forEach((x) => {
      const t = s.stock.find((y) => y.material_id === keepId && y.location_id === x.location_id);
      if (t) t.qty = +t.qty + +x.qty; else s.stock.push({ ...x, material_id: keepId });
    });
    s.stock = s.stock.filter((x) => x.material_id !== dropId);
    ['movements', 'files', 'tasks', 'cart'].forEach((t) => s[t].forEach((x) => { if (x.material_id === dropId) x.material_id = keepId; }));
    ['barcode', 'group_id', 'default_location_id', 'purchase_price', 'max_stock', 'supplier', 'notes'].forEach((f) => { if (k[f] == null || k[f] === '') k[f] = d[f] ?? k[f]; });
    if (!+k.sale_price) k.sale_price = d.sale_price;
    k.min_stock = Math.max(+k.min_stock || 0, +d.min_stock || 0);
    k.custom_fields = { ...(d.custom_fields || {}), ...(k.custom_fields || {}) };
    k.fits = [...new Set([...(k.fits || []), ...(d.fits || [])])];
    k.is_favorite = !!(k.is_favorite || d.is_favorite); k.updated_at = now();
    s.materials = s.materials.filter((m) => m.id !== dropId);
    save();
    return s.stock.filter((x) => x.material_id === keepId).reduce((a, b) => a + +b.qty, 0);
  }
  const { data, error } = await sb.rpc('lager_merge', { p_keep: keepId, p_drop: dropId });
  if (error && /lager_merge|function/i.test(error.message || '') && /not find|does not exist|schema cache/i.test(error.message || '')) {
    throw new Error('Für das Zusammenführen fehlt noch ein Datenbank-Update: bitte supabase/migration-passt-fuer-zusammenfuehren.sql im Supabase-SQL-Editor ausführen.');
  }
  fail(error);
  return +data;
}

/** Mehrere Materialien auf einmal löschen (inkl. Bestand, Historie, Bilder). onProgress(fertig, gesamt) */
export async function deleteMaterials(ids, onProgress) {
  ids = [...new Set(ids)];
  if (isDemo) {
    const s = load(); const set = new Set(ids);
    s.materials = s.materials.filter((m) => !set.has(m.id));
    ['stock', 'movements', 'tasks', 'files', 'cart'].forEach((k) => { s[k] = s[k].filter((x) => !set.has(x.material_id)); });
    save(); onProgress?.(ids.length, ids.length); return ids.length;
  }
  let done = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data: files } = await sb.from(T.file).select('path, kind').in('material_id', chunk);
    const paths = (files || []).flatMap((f) => (f.kind === 'image' ? [f.path, f.path + THUMB] : [f.path]));
    for (let j = 0; j < paths.length; j += 500) await sb.storage.from(BUCKET).remove(paths.slice(j, j + 500));
    const { error } = await sb.from(T.mat).delete().in('id', chunk); fail(error);
    done += chunk.length; onProgress?.(done, ids.length);
  }
  return done;
}
export async function addStockLocation(material_id, location_id) {
  if (isDemo) {
    const s = load();
    if (!s.stock.some((x) => x.material_id === material_id && x.location_id === location_id)) {
      s.stock.push({ material_id, location_id, qty: 0 }); save();
    }
    return;
  }
  const { error } = await sb.from(T.stock).upsert({ material_id, location_id, qty: 0 }, { onConflict: 'material_id,location_id', ignoreDuplicates: true });
  fail(error);
}
export async function removeStockLocation(material_id, location_id) {
  if (isDemo) {
    const s = load();
    const row = s.stock.find((x) => x.material_id === material_id && x.location_id === location_id);
    if (row?.qty > 0) throw new Error('Lagerort hat noch Bestand – erst umbuchen oder entnehmen.');
    s.stock = s.stock.filter((x) => x !== row); save(); return;
  }
  const { data } = await sb.from(T.stock).select('qty').match({ material_id, location_id }).maybeSingle();
  if (data?.qty > 0) throw new Error('Lagerort hat noch Bestand – erst umbuchen oder entnehmen.');
  const { error } = await sb.from(T.stock).delete().match({ material_id, location_id }); fail(error);
}

// =====================================================================
//  DATEIEN / BILDER
// =====================================================================
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
export async function addFile(material_id, blob, name, kind = 'file') {
  if (isDemo) {
    if (blob.size > 1.5e6) throw new Error('Im Demo-Modus sind Dateien bis 1,5 MB möglich.');
    const s = load();
    s.files.push({ id: uid(), material_id, name, path: await blobToDataUrl(blob), kind, created_at: now() }); save(); return;
  }
  const safe = name.replace(/[^\w.\-]+/g, '_').slice(-60);
  const path = `${await myId()}/${material_id}/${Date.now()}-${safe}`;
  const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || undefined, upsert: false }); fail(up.error);
  const { error } = await sb.from(T.file).insert({ material_id, name, path, kind }); fail(error);
  if (kind === 'image') { try { await uploadThumb(path, blob); } catch { /* wird später nachgeholt */ } }
}

// =====================================================================
//  VORSCHAUBILDER (für Listen: ~240 px statt des vollen Fotos)
// =====================================================================
const THUMB_MAX = 240;
async function makeThumb(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, THUMB_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);          // transparente PNGs → weißer Grund wie in der Liste
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((r, rej) => c.toBlob((b) => (b ? r(b) : rej(new Error('Vorschaubild fehlgeschlagen'))), 'image/jpeg', 0.8));
}
async function uploadThumb(path, blob) {
  const t = await makeThumb(blob);
  // ohne upsert: Überschreiben bräuchte zusätzliche Lese-Rechte im Speicher. Gibt es das Bild schon, ist das kein Fehler.
  const { error } = await sb.storage.from(BUCKET).upload(path + THUMB, t, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error && !/exist|duplicate|409/i.test(`${error.message} ${error.statusCode || ''}`)) fail(error);
  return t.size;
}
/** Vorschaubild für ein vorhandenes Foto erzeugen (lädt das Foto, verkleinert, lädt hoch) */
export async function ensureThumb(file) {
  if (isDemo || !file?.path || file.kind !== 'image') return false;
  const res = await fetch(pubUrl(file.path), { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`Foto nicht ladbar (${res.status})`);
  await uploadThumb(file.path, await res.blob());
  return true;
}
/** Gibt es das Vorschaubild schon? */
export async function hasThumb(file) {
  if (isDemo) return true;
  try { const r = await fetch(pubUrl(file.path + THUMB), { method: 'HEAD', mode: 'cors', credentials: 'omit', cache: 'no-store' }); return r.ok; } catch { return false; }
}
/** Für alle Fotos fehlende Vorschaubilder erzeugen. onProgress(fertig, gesamt, erzeugt) */
export async function generateMissingThumbs(mats, onProgress) {
  const files = mats.flatMap((m) => m.images || []);
  let done = 0; let made = 0; const errors = [];
  const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      try { if (!(await hasThumb(f))) { await ensureThumb(f); made += 1; } } catch (e) { errors.push(`${f.name}: ${e.message}`); }
      done += 1; onProgress?.(done, files.length, made);
    }
  };
  await Promise.all([worker(), worker(), worker()]);         // 3 gleichzeitig – schnell, ohne das Netz zu verstopfen
  return { total: files.length, made, errors };
}
export async function deleteFile(file) {
  if (isDemo) { const s = load(); s.files = s.files.filter((f) => f.id !== file.id); save(); return; }
  await sb.storage.from(BUCKET).remove([file.path, ...(file.kind === 'image' ? [file.path + THUMB] : [])]);
  const { error } = await sb.from(T.file).delete().eq('id', file.id); fail(error);
}

// =====================================================================
//  BUCHUNGEN
// =====================================================================
/** type: 'in' | 'out' | 'transfer' | 'inventory'  – liefert neuen Gesamtbestand */
// ---------- Live-Updates: Buchungen von anderen Geräten ----------
// Eigene Buchungen merken, damit sie nicht als „von einem anderen Gerät“ gemeldet werden
const localBooks = [];
const demoLive = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ss-demo-live') : null;   // Demo: zwischen Browser-Tabs
function isOwnBooking(row) {
  const now = Date.now();
  while (localBooks.length && now - localBooks[0].at > 15000) localBooks.shift();
  const i = localBooks.findIndex((b) => b.material_id === row.material_id && b.type === row.type);
  if (i < 0) return false;
  localBooks.splice(i, 1); return true;
}
let liveSub = null;
/** cb(row) für jede neue Buchung, die NICHT von diesem Gerät kommt. Liefert eine Funktion zum Abmelden. */
export function onRemoteMovement(cb) {
  if (isDemo) {
    if (!demoLive) return () => {};
    const h = (e) => { if (e.data?.type === 'movement') { store = null; cb(e.data.row); } };   // anderen Tab-Stand neu einlesen
    demoLive.addEventListener('message', h);
    return () => demoLive.removeEventListener('message', h);
  }
  liveSub?.unsubscribe?.();
  liveSub = sb.channel('lager-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lager_movements' }, (p) => { if (p?.new && !isOwnBooking(p.new)) cb(p.new); })
    .subscribe();
  return () => { liveSub?.unsubscribe?.(); liveSub = null; };
}

export async function book({ material_id, type, qty, location_id, to_location_id = null, note = null }) {
  qty = +qty;
  localBooks.push({ material_id, type, at: Date.now() });
  if (!location_id) throw new Error('Bitte Lagerort wählen');
  if (!(qty >= 0)) throw new Error('Ungültige Menge');
  if (type !== 'inventory' && qty === 0) throw new Error('Menge muss größer 0 sein');
  if (!isDemo) {
    const { data, error } = await sb.rpc('lager_book', {
      p_material: material_id, p_type: type, p_qty: qty, p_location: location_id, p_to_location: to_location_id, p_note: note || null,
    });
    fail(error); return +data;
  }
  const s = load();
  const row = (loc) => {
    let r = s.stock.find((x) => x.material_id === material_id && x.location_id === loc);
    if (!r) { r = { material_id, location_id: loc, qty: 0 }; s.stock.push(r); }
    return r;
  };
  const r = row(location_id);
  let diff;
  if (type === 'in') { r.qty += qty; diff = qty; }
  else if (type === 'out') {
    if (r.qty < qty) throw new Error(`Nicht genug Bestand an diesem Lagerort (verfügbar: ${r.qty})`);
    r.qty -= qty; diff = -qty;
  } else if (type === 'transfer') {
    if (!to_location_id || to_location_id === location_id) throw new Error('Bitte einen anderen Ziel-Lagerort wählen');
    if (r.qty < qty) throw new Error(`Nicht genug Bestand an diesem Lagerort (verfügbar: ${r.qty})`);
    r.qty -= qty; row(to_location_id).qty += qty; diff = qty;
  } else if (type === 'inventory') { diff = qty - r.qty; r.qty = qty; }
  else throw new Error('Unbekannte Buchungsart');
  const total = s.stock.filter((x) => x.material_id === material_id).reduce((a, b) => a + b.qty, 0);
  s.movements.push({ id: uid(), material_id, type, qty: diff, from_location_id: location_id,
    to_location_id: type === 'transfer' ? to_location_id : null, stock_after: total, note, created_at: now() });
  const m = s.materials.find((x) => x.id === material_id); if (m) m.updated_at = now();
  save();
  try { demoLive?.postMessage({ type: 'movement', row: s.movements[s.movements.length - 1] }); } catch { /* egal */ }
  return total;
}
export async function listMovements(material_id, limit = 200) {
  if (isDemo) {
    const s = load(); const ln = (id) => s.locations.find((l) => l.id === id)?.name || '';
    return s.movements.filter((x) => x.material_id === material_id).sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit).map((x) => ({ ...x, from_name: ln(x.from_location_id), to_name: ln(x.to_location_id) }));
  }
  const { data, error } = await sb.from(T.mov)
    .select('*, from_loc:lager_locations!lager_movements_from_location_id_fkey(name), to_loc:lager_locations!lager_movements_to_location_id_fkey(name)')
    .eq('material_id', material_id).order('created_at', { ascending: false }).limit(limit);
  fail(error);
  return data.map(({ from_loc, to_loc, ...x }) => ({ ...x, from_name: from_loc?.name || '', to_name: to_loc?.name || '' }));
}

/** Alle Buchungen der letzten `days` Tage (für die Auswertung), neueste zuerst */
export async function listMovementsSince(days) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  if (isDemo) return load().movements.filter((x) => x.created_at >= since).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const out = []; const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {          // Supabase liefert höchstens 1000 Zeilen pro Abruf
    const { data, error } = await sb.from(T.mov).select('id, material_id, type, qty, note, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).range(from, from + PAGE - 1);
    fail(error);
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/** Zeitpunkt der allerersten Buchung (ISO) oder null – damit die Auswertung weiß, seit wann es Daten gibt */
export async function firstMovementDate() {
  if (isDemo) { const all = load().movements.map((x) => x.created_at).sort(); return all[0] || null; }
  const { data, error } = await sb.from(T.mov).select('created_at').order('created_at', { ascending: true }).limit(1);
  fail(error);
  return data[0]?.created_at || null;
}

// =====================================================================
//  AUFGABEN
// =====================================================================
export async function listTasks(material_id) {
  if (isDemo) return load().tasks.filter((t) => t.material_id === material_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { data, error } = await sb.from(T.task).select('*').eq('material_id', material_id).order('created_at'); fail(error); return data;
}
export async function addTask(material_id, title) {
  if (isDemo) { load().tasks.push({ id: uid(), material_id, title, done: false, created_at: now() }); save(); return; }
  const { error } = await sb.from(T.task).insert({ material_id, title }); fail(error);
}
export async function setTaskDone(id, done) {
  if (isDemo) { load().tasks.find((t) => t.id === id).done = done; save(); return; }
  const { error } = await sb.from(T.task).update({ done }).eq('id', id); fail(error);
}
export async function deleteTask(id) {
  if (isDemo) { const s = load(); s.tasks = s.tasks.filter((t) => t.id !== id); save(); return; }
  const { error } = await sb.from(T.task).delete().eq('id', id); fail(error);
}

// =====================================================================
//  WARENKORB & KOMMISSIONEN
// =====================================================================
export async function listCart() {
  if (isDemo) return [...load().cart].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { data, error } = await sb.from(T.cart).select('*').order('created_at'); fail(error); return data;
}
export async function addToCart(list, material_id, qty = 1, commission = null) {
  commission = commission?.trim() || null;
  const items = await listCart();
  const ex = items.find((c) => c.list === list && c.material_id === material_id && (c.commission || null) === commission);
  if (ex) return updateCart(ex.id, +ex.qty + +qty);
  if (isDemo) { load().cart.push({ id: uid(), list, material_id, qty: +qty, commission, created_at: now() }); save(); return; }
  const { error } = await sb.from(T.cart).insert({ list, material_id, qty, commission }); fail(error);
}
export async function updateCart(id, qty) {
  if (isDemo) { load().cart.find((c) => c.id === id).qty = +qty; save(); return; }
  const { error } = await sb.from(T.cart).update({ qty }).eq('id', id); fail(error);
}
export async function deleteCart(id) {
  if (isDemo) { const s = load(); s.cart = s.cart.filter((c) => c.id !== id); save(); return; }
  const { error } = await sb.from(T.cart).delete().eq('id', id); fail(error);
}

// =====================================================================
//  EIGENE FELDER (Vorlagen für Ersatzteile / Werkzeuge)
//  type: 'text' | 'number' | 'select' | 'bool' | 'date'
//  applies_to: 'part' | 'tool' | 'both'
// =====================================================================
export const FIELD_TYPES = { text: 'Text', number: 'Zahl', select: 'Auswahl', bool: 'Ja / Nein', date: 'Datum' };
export const FIELD_SCOPES = { both: 'Material & Werkzeug', part: 'Material', tool: 'Werkzeug' };
const cleanDef = (d) => ({
  name: String(d.name || '').trim(),
  type: FIELD_TYPES[d.type] ? d.type : 'text',
  options: d.type === 'select' ? (d.options || []).map((o) => String(o).trim()).filter(Boolean) : [],
  applies_to: FIELD_SCOPES[d.applies_to] ? d.applies_to : 'both',
});
const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.created_at || '').localeCompare(b.created_at || '');

export async function listFieldDefs() {
  if (isDemo) return [...load().fieldDefs].sort(byPos);
  const { data, error } = await sb.from(T.fdef).select('*').order('position').order('created_at');
  if (error && /lager_field_defs/.test(error.message)) {
    throw new Error('Eigene Felder sind in Supabase noch nicht eingerichtet – bitte supabase/migration-eigene-felder.sql im SQL Editor ausführen.');
  }
  fail(error); return data;
}
export async function saveFieldDef(id, data) {
  const d = cleanDef(data);
  if (!d.name) throw new Error('Bitte einen Feldnamen eingeben');
  if (d.type === 'select' && !d.options.length) throw new Error('Bitte mindestens eine Auswahl-Option angeben');
  const all = await listFieldDefs();
  if (all.some((f) => f.id !== id && f.name.toLowerCase() === d.name.toLowerCase())) throw new Error(`Ein Feld „${d.name}“ gibt es schon`);
  const oldName = id ? all.find((f) => f.id === id)?.name : null;   // vor dem Speichern merken
  if (isDemo) {
    const s = load();
    if (id) Object.assign(s.fieldDefs.find((f) => f.id === id), d);
    else s.fieldDefs.push({ id: uid(), ...d, position: all.length, created_at: now() });
    save();
  } else if (id) {
    const { error } = await sb.from(T.fdef).update(d).eq('id', id); fail(error);
  } else {
    const { error } = await sb.from(T.fdef).insert({ ...d, position: all.length }); fail(error);
  }
  // Umbenannt? Vorhandene Werte in allen Materialien mitnehmen
  if (oldName && oldName !== d.name) await renameCustomKey(oldName, d.name);
}
export async function deleteFieldDef(id) {
  if (isDemo) { const s = load(); s.fieldDefs = s.fieldDefs.filter((f) => f.id !== id); save(); return; }
  const { error } = await sb.from(T.fdef).delete().eq('id', id); fail(error);
}
export async function moveFieldDef(id, dir) {
  const all = await listFieldDefs();
  const i = all.findIndex((f) => f.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  if (isDemo) { const s = load(); all.forEach((f, k) => { s.fieldDefs.find((x) => x.id === f.id).position = k; }); save(); return; }
  for (let k = 0; k < all.length; k++) {
    const { error } = await sb.from(T.fdef).update({ position: k }).eq('id', all[k].id); fail(error);
  }
}
async function renameCustomKey(oldKey, newKey) {
  const mats = await listMaterials();
  for (const m of mats) {
    const cf = m.custom_fields || {};
    if (!(oldKey in cf)) continue;
    const next = {};
    Object.entries(cf).forEach(([k, v]) => { next[k === oldKey ? newKey : k] = v; });
    await saveMaterial(m.id, { custom_fields: next });
  }
}

// =====================================================================
//  DATENSICHERUNG (Backup & Wiederherstellen)
//  Eine JSON-Datei mit allen Tabellen des eigenen Lagers.
//  Optional inkl. Bilder/Dateien (als eingebettete Daten).
// =====================================================================
const BACKUP_TABLES = [            // Reihenfolge = Wiederherstellungs-Reihenfolge (Abhängigkeiten)
  ['locations', T.loc, 'id'],
  ['groups', T.grp, 'id'],
  ['field_defs', T.fdef, 'id'],
  ['materials', T.mat, 'id'],
  ['stock', T.stock, 'material_id,location_id'],
  ['movements', T.mov, 'id'],
  ['tasks', T.task, 'id'],
  ['files', T.file, 'id'],
  ['cart', T.cart, 'id'],
];
const DEMO_KEYS = { locations: 'locations', groups: 'groups', field_defs: 'fieldDefs', materials: 'materials', stock: 'stock', movements: 'movements', tasks: 'tasks', files: 'files', cart: 'cart' };

async function fetchAllRows(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').range(from, from + 999);
    if (error) {
      if (table === T.fdef && /lager_field_defs/.test(error.message)) return out;   // Tabelle noch nicht angelegt
      fail(error);
    }
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const dataURLToBlob = async (u) => (await fetch(u)).blob();

/** Erstellt das Backup-Objekt. onProgress(text) */
export async function createBackup({ withFiles = false, onProgress } = {}) {
  const backup = { app: 'SpareSync', format: 1, created_at: now(), with_files: withFiles, tables: {} };
  if (isDemo) {
    const s = load();
    for (const [name] of BACKUP_TABLES) backup.tables[name] = JSON.parse(JSON.stringify(s[DEMO_KEYS[name]] || []));
    if (!withFiles) backup.tables.files = backup.tables.files.map(({ path, ...f }) => ({ ...f, path: '' }));
    return backup;
  }
  const { data: u } = await sb.auth.getUser();
  backup.account = u.user?.email || '';
  const LABEL = { locations: 'Lagerorte', groups: 'Gruppen', field_defs: 'Eigene Felder', materials: 'Teile & Werkzeuge', stock: 'Bestände', movements: 'Buchungen', tasks: 'Aufgaben', files: 'Bilderliste', cart: 'Warenkorb' };
  const dataShare = withFiles ? 0.15 : 0.95;           // Anteil am Balken für die Tabellen
  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    const [name, table] = BACKUP_TABLES[i];
    onProgress?.(`${LABEL[name]} …`, (i / BACKUP_TABLES.length) * dataShare);
    backup.tables[name] = await fetchAllRows(table);
  }
  if (withFiles) {
    const files = backup.tables.files;
    let done = 0; let next = 0;
    const worker = async () => {                        // 6 Bilder gleichzeitig laden
      while (next < files.length) {
        const f = files[next++];
        try {
          const { data, error } = await sb.storage.from(BUCKET).download(f.path);
          if (error) throw error;
          f.data = await blobToDataURL(data);
        } catch { f.data = null; }
        done++;
        onProgress?.(`Bilder ${done} von ${files.length}`, 0.15 + (done / Math.max(1, files.length)) * 0.8);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
  }
  onProgress?.('Datei wird erstellt …', 0.97);
  return backup;
}

export function backupSummary(b) {
  const t = b?.tables || {};
  const mats = t.materials || [];
  return {
    parts: mats.filter((m) => (m.kind || 'part') === 'part').length,
    tools: mats.filter((m) => m.kind === 'tool').length,
    locations: (t.locations || []).length, groups: (t.groups || []).length,
    movements: (t.movements || []).length, files: (t.files || []).length,
    withFiles: !!b?.with_files, created: b?.created_at, account: b?.account || '',
  };
}

/**
 * Stellt ein Backup wieder her. Vorhandene Einträge mit gleicher ID werden
 * überschrieben, alles andere bleibt bestehen (nichts wird gelöscht).
 */
export async function restoreBackup(backup, { onProgress } = {}) {
  if (backup?.app !== 'SpareSync' || !backup.tables) throw new Error('Das ist keine gültige SpareSync-Sicherung.');
  const report = { ok: 0, errors: [] };
  if (isDemo) {
    const s = load();
    for (const [name] of BACKUP_TABLES) {
      const rows = backup.tables[name] || [];
      const key = DEMO_KEYS[name];
      const keyOf = name === 'stock' ? (r) => `${r.material_id}|${r.location_id}` : (r) => r.id;
      const map = new Map((s[key] || []).map((r) => [keyOf(r), r]));
      rows.forEach((r) => { const c = { ...r }; delete c.owner_id; if (name === 'files' && c.data) { c.path = c.data; delete c.data; } map.set(keyOf(c), c); report.ok++; });
      s[key] = [...map.values()];
    }
    save(); return report;
  }
  const uid = await myId();
  for (let ti = 0; ti < BACKUP_TABLES.length; ti++) {
    const [name, table, conflict] = BACKUP_TABLES[ti];
    onProgress?.(null, 0.6 + (ti / BACKUP_TABLES.length) * 0.4);
    let rows = (backup.tables[name] || []).map((r) => { const c = { ...r }; delete c.owner_id; return c; });
    if (!rows.length) continue;
    if (name === 'files') {
      // Bilder hochladen (nur wenn im Backup enthalten); Pfad ins eigene Konto umschreiben
      const prepared = [];
      for (let i = 0; i < rows.length; i++) {
        const f = rows[i]; const data = f.data; delete f.data;
        const base = String(f.path || '').split('/').pop() || `${f.id}.jpg`;
        const newPath = `${uid}/${f.material_id}/${base}`;
        if (data) {
          onProgress?.(`Bilder ${i + 1} von ${rows.length}`, 0.1 + ((i + 1) / rows.length) * 0.5);
          try {
            const blob = await dataURLToBlob(data);
            const up = await sb.storage.from(BUCKET).upload(newPath, blob, { contentType: blob.type || undefined, upsert: true });
            if (up.error) throw up.error;
            f.path = newPath;
          } catch (e) { report.errors.push(`Bild ${base}: ${e.message || e}`); continue; }
        } else if (!String(f.path || '').startsWith(`${uid}/`)) continue;   // Datei liegt nicht im eigenen Speicher
        prepared.push(f);
      }
      rows = prepared;
    }
    onProgress?.(`Speichere ${({ locations: 'Lagerorte', groups: 'Gruppen', field_defs: 'Eigene Felder', materials: 'Teile & Werkzeuge', stock: 'Bestände', movements: 'Buchungen', tasks: 'Aufgaben', files: 'Bilder', cart: 'Warenkorb' })[name]} …`);
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb.from(table).upsert(chunk, { onConflict: conflict });
      if (error) {
        if (table === T.fdef && /lager_field_defs/.test(error.message)) break;
        report.errors.push(`${name}: ${error.message}`);
      } else report.ok += chunk.length;
    }
  }
  return report;
}

// =====================================================================
//  OFFLINE-MODUS
//  Jede erfolgreich geladene Liste wird lokal gespeichert (localStorage).
//  Ohne Netz liefert die App diese Kopie – nur lesend.
// =====================================================================
const OFF = 'ss-offline:';
export const offlineState = { active: false, savedAt: null };
const isNetError = (e) => !navigator.onLine || /failed to fetch|load failed|networkerror|network request failed|fetch failed|err_internet|timeout/i.test(e?.message || String(e || ''));
function setOffline(active, savedAt = null) {
  const changed = offlineState.active !== active;
  offlineState.active = active;
  if (savedAt) offlineState.savedAt = savedAt;
  if (changed) window.dispatchEvent(new CustomEvent('ss-offline', { detail: { ...offlineState } }));
}
function cacheWrite(key, data) {
  try { localStorage.setItem(OFF + key, JSON.stringify({ t: Date.now(), data })); } catch { /* Speicher voll – egal */ }
}
function cacheRead(key) {
  try { return JSON.parse(localStorage.getItem(OFF + key) || 'null'); } catch { return null; }
}
export function clearOfflineCache() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(OFF)).forEach((k) => localStorage.removeItem(k)); } catch {}
}
export function offlineSavedAt() { return cacheRead('materials')?.t || null; }

/** Online laden & lokal sichern – offline (oder bei Netzfehler) aus der lokalen Kopie */
function withOffline(key, fn, fallback) {
  return async (...args) => {
    if (isDemo) return fn(...args);
    const k = typeof key === 'function' ? key(...args) : key;
    const fromCache = () => {
      const c = cacheRead(k);
      if (c) { setOffline(true, c.t); return c.data; }
      const fb = fallback?.(...args);
      if (fb !== undefined) { setOffline(true); return fb; }
      return undefined;
    };
    if (!navigator.onLine) { const v = fromCache(); if (v !== undefined) return v; }
    try {
      const data = await fn(...args);
      cacheWrite(k, data);
      setOffline(false);
      return data;
    } catch (e) {
      if (isNetError(e)) {
        const v = fromCache(); if (v !== undefined) return v;
        throw new Error('Keine Internetverbindung – und noch keine Offline-Kopie vorhanden. Bitte einmal mit Internet öffnen.');
      }
      throw e;
    }
  };
}
// Lese-Funktionen mit Offline-Kopie versehen (die exportierten Namen bleiben gleich)
listMaterials = withOffline('materials', listMaterials);
listGroups = withOffline('groups', listGroups);
listLocations = withOffline('locations', listLocations);
listCart = withOffline('cart', listCart);
listFieldDefs = withOffline('fields', listFieldDefs, () => []);
listMovements = withOffline((id) => `mov:${id}`, listMovements, () => []);
listTasks = withOffline((id) => `tasks:${id}`, listTasks, () => []);
listMovementsSince = withOffline((days) => `movs:${days}`, listMovementsSince, () => []);
firstMovementDate = withOffline('movs:first', firstMovementDate, () => null);
getMaterial = withOffline((id) => `mat:${id}`, getMaterial,
  (id) => (cacheRead('materials')?.data || []).find((m) => m.id === id) ?? undefined);
