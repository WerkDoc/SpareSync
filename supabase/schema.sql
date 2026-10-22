-- =====================================================================
--  WerkDoc Lager – Supabase Schema
--  Im Supabase-Dashboard unter  SQL Editor → New query  komplett einfügen
--  und auf "Run" drücken. Das Skript kann gefahrlos mehrfach laufen.
--
--  Alle Tabellen haben das Präfix "lager_", damit sie im selben
--  Supabase-Projekt wie WerkDoc liegen können, ohne sich zu stören.
--  Jeder Datensatz gehört einem Benutzer (owner_id) – jeder Login sieht
--  nur sein eigenes Lager (Row Level Security).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Lagerorte ------------------------------------------------
create table if not exists public.lager_locations (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  barcode     text,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- ---------- Material-Gruppen ----------------------------------------
create table if not exists public.lager_groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- ---------- Materialien (Ersatzteile + Werkzeuge) --------------------
create table if not exists public.lager_materials (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users on delete cascade,
  number              integer,                         -- Artikelnummer (z.B. 101)
  kind                text not null default 'part' check (kind in ('part','tool')),
  name                text not null,
  barcode             text,
  group_id            uuid references public.lager_groups on delete set null,
  default_location_id uuid references public.lager_locations on delete set null,
  unit                text default 'Stück',
  booking_type        text default 'Einheit',
  sale_price          numeric(10,2) default 0,
  purchase_price      numeric(10,2),
  min_stock           numeric default 0,               -- Meldebestand
  max_stock           numeric,                         -- Maximalbestand
  supplier            text,
  notes               text,
  custom_fields       jsonb not null default '{}'::jsonb,  -- Eigene Felder
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (owner_id, number)
);
create index if not exists lager_materials_barcode_idx on public.lager_materials (owner_id, barcode);

-- fortlaufende Artikelnummer pro Benutzer, falls keine angegeben wird
create or replace function public.lager_set_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number
      from public.lager_materials where owner_id = new.owner_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists lager_materials_number on public.lager_materials;
create trigger lager_materials_number
  before insert or update on public.lager_materials
  for each row execute function public.lager_set_number();

-- ---------- Bestand je Lagerort -------------------------------------
create table if not exists public.lager_stock (
  material_id uuid not null references public.lager_materials on delete cascade,
  location_id uuid not null references public.lager_locations on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  qty         numeric not null default 0,
  primary key (material_id, location_id)
);

-- ---------- Bestandsänderungen (Historie) ----------------------------
create table if not exists public.lager_movements (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users on delete cascade,
  material_id      uuid not null references public.lager_materials on delete cascade,
  type             text not null check (type in ('in','out','transfer','inventory')),
  qty              numeric not null,          -- Veränderung (+/-)
  from_location_id uuid references public.lager_locations on delete set null,
  to_location_id   uuid references public.lager_locations on delete set null,
  stock_after      numeric,                   -- Gesamtbestand danach
  note             text,
  created_at       timestamptz not null default now()
);
create index if not exists lager_movements_material_idx on public.lager_movements (material_id, created_at desc);

-- ---------- Aufgaben je Material ------------------------------------
create table if not exists public.lager_tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  material_id uuid not null references public.lager_materials on delete cascade,
  title       text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- Bilder & Dateien ----------------------------------------
create table if not exists public.lager_files (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  material_id uuid not null references public.lager_materials on delete cascade,
  name        text,
  path        text not null,                  -- Pfad im Storage-Bucket
  kind        text not null default 'image' check (kind in ('image','file')),
  created_at  timestamptz not null default now()
);

-- ---------- Warenkorb (Nachbestellen) & Kommissionen -----------------
create table if not exists public.lager_cart (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  list        text not null check (list in ('cart','commission')),
  material_id uuid not null references public.lager_materials on delete cascade,
  qty         numeric not null default 1,
  commission  text,                            -- z.B. Auftrag / Kunde
  created_at  timestamptz not null default now()
);

-- =====================================================================
--  Row Level Security: jeder sieht nur seine eigenen Daten
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['lager_locations','lager_groups','lager_materials','lager_stock',
                           'lager_movements','lager_tasks','lager_files','lager_cart']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

-- =====================================================================
--  Buchungsfunktion (atomar): Dazu buchen / Entnehmen / Umbuchen / Inventur
-- =====================================================================
create or replace function public.lager_book(
  p_material    uuid,
  p_type        text,
  p_qty         numeric,
  p_location    uuid,
  p_to_location uuid default null,
  p_note        text default null
) returns numeric
language plpgsql security invoker as $$
declare
  v_cur   numeric;
  v_total numeric;
  v_diff  numeric;
begin
  if not exists (select 1 from public.lager_materials where id = p_material) then
    raise exception 'Material nicht gefunden';
  end if;
  if p_location is null then raise exception 'Bitte Lagerort wählen'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Ungültige Menge'; end if;

  insert into public.lager_stock (material_id, location_id, qty)
       values (p_material, p_location, 0)
  on conflict (material_id, location_id) do nothing;

  select qty into v_cur from public.lager_stock
   where material_id = p_material and location_id = p_location for update;

  if p_type = 'in' then
    if p_qty = 0 then raise exception 'Menge muss größer 0 sein'; end if;
    update public.lager_stock set qty = qty + p_qty
     where material_id = p_material and location_id = p_location;
    v_diff := p_qty;

  elsif p_type = 'out' then
    if p_qty = 0 then raise exception 'Menge muss größer 0 sein'; end if;
    if v_cur < p_qty then
      raise exception 'Nicht genug Bestand an diesem Lagerort (verfügbar: %)', v_cur;
    end if;
    update public.lager_stock set qty = qty - p_qty
     where material_id = p_material and location_id = p_location;
    v_diff := -p_qty;

  elsif p_type = 'transfer' then
    if p_qty = 0 then raise exception 'Menge muss größer 0 sein'; end if;
    if p_to_location is null or p_to_location = p_location then
      raise exception 'Bitte einen anderen Ziel-Lagerort wählen';
    end if;
    if v_cur < p_qty then
      raise exception 'Nicht genug Bestand an diesem Lagerort (verfügbar: %)', v_cur;
    end if;
    update public.lager_stock set qty = qty - p_qty
     where material_id = p_material and location_id = p_location;
    insert into public.lager_stock (material_id, location_id, qty)
         values (p_material, p_to_location, p_qty)
    on conflict (material_id, location_id) do update set qty = public.lager_stock.qty + excluded.qty;
    v_diff := p_qty;

  elsif p_type = 'inventory' then
    v_diff := p_qty - v_cur;
    update public.lager_stock set qty = p_qty
     where material_id = p_material and location_id = p_location;

  else
    raise exception 'Unbekannte Buchungsart %', p_type;
  end if;

  select coalesce(sum(qty), 0) into v_total
    from public.lager_stock where material_id = p_material;

  insert into public.lager_movements
         (material_id, type, qty, from_location_id, to_location_id, stock_after, note)
  values (p_material, p_type, v_diff, p_location,
          case when p_type = 'transfer' then p_to_location end, v_total, p_note);

  update public.lager_materials set updated_at = now() where id = p_material;
  return v_total;
end $$;

grant execute on function public.lager_book(uuid, text, numeric, uuid, uuid, text) to authenticated;

-- =====================================================================
--  Storage-Bucket für Bilder & Dateien
--  Dateien liegen unter  <user-id>/<material-id>/<datei>
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('lager-files', 'lager-files', true)
on conflict (id) do nothing;

drop policy if exists "lager upload own"  on storage.objects;
drop policy if exists "lager update own"  on storage.objects;
drop policy if exists "lager delete own"  on storage.objects;

create policy "lager upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'lager-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "lager update own" on storage.objects for update to authenticated
  using (bucket_id = 'lager-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "lager delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'lager-files' and (storage.foldername(name))[1] = auth.uid()::text);
