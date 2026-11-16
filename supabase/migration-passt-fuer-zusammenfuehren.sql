-- =====================================================================
--  SpareSync – Update „Passt für“ + „Doppelte Teile zusammenführen“
--  Einmalig im Supabase-Projekt SpareSync ausführen:
--  SQL Editor → New query → einfügen → Run
--  (Kann gefahrlos mehrfach ausgeführt werden. Bestehende Daten bleiben erhalten.)
-- =====================================================================

-- 1) Passende Geräte je Teil, z. B. {"iPhone 13","iPhone 13 Pro"}
alter table public.lager_materials
  add column if not exists fits text[] not null default '{}';

-- 2) Zwei Teile zu einem zusammenführen (alles in EINEM Schritt – klappt etwas nicht, bleibt alles wie vorher)
--    Bestand wird je Lagerort addiert, Historie/Bilder/Aufgaben/Warenkorb wandern zum behaltenen Teil,
--    leere Felder des behaltenen Teils werden vom anderen ergänzt, danach wird das andere Teil gelöscht.
create or replace function public.lager_merge(p_keep uuid, p_drop uuid)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  k     public.lager_materials;
  d     public.lager_materials;
  total numeric;
begin
  if p_keep = p_drop then raise exception 'Bitte zwei verschiedene Teile wählen'; end if;
  select * into k from public.lager_materials where id = p_keep and owner_id = uid for update;
  select * into d from public.lager_materials where id = p_drop and owner_id = uid for update;
  if k.id is null or d.id is null then raise exception 'Teil nicht gefunden'; end if;

  -- Bestand je Lagerort addieren
  insert into public.lager_stock (material_id, location_id, owner_id, qty)
    select p_keep, location_id, uid, qty from public.lager_stock where material_id = p_drop
  on conflict (material_id, location_id) do update set qty = public.lager_stock.qty + excluded.qty;
  delete from public.lager_stock where material_id = p_drop;

  update public.lager_movements set material_id = p_keep where material_id = p_drop;
  update public.lager_files     set material_id = p_keep where material_id = p_drop;
  update public.lager_tasks     set material_id = p_keep where material_id = p_drop;
  update public.lager_cart      set material_id = p_keep where material_id = p_drop;

  -- Leere Angaben des behaltenen Teils vom anderen übernehmen
  update public.lager_materials set
    barcode             = coalesce(nullif(k.barcode, ''), d.barcode),
    group_id            = coalesce(k.group_id, d.group_id),
    default_location_id = coalesce(k.default_location_id, d.default_location_id),
    purchase_price      = coalesce(k.purchase_price, d.purchase_price),
    sale_price          = case when coalesce(k.sale_price, 0) = 0 then d.sale_price else k.sale_price end,
    min_stock           = greatest(coalesce(k.min_stock, 0), coalesce(d.min_stock, 0)),
    max_stock           = coalesce(k.max_stock, d.max_stock),
    supplier            = coalesce(nullif(k.supplier, ''), d.supplier),
    notes               = coalesce(nullif(k.notes, ''), d.notes),
    custom_fields       = coalesce(d.custom_fields, '{}'::jsonb) || coalesce(k.custom_fields, '{}'::jsonb),
    fits                = array(select distinct unnest(k.fits || d.fits)),
    is_favorite         = k.is_favorite or d.is_favorite
  where id = p_keep;

  delete from public.lager_materials where id = p_drop;

  select coalesce(sum(qty), 0) into total from public.lager_stock where material_id = p_keep;
  return total;
end $$;

grant execute on function public.lager_merge(uuid, uuid) to authenticated;
