-- =====================================================================
--  SpareSync – Update „Eigene Felder“
--  Einmalig im Supabase-Projekt SpareSync ausführen:
--  SQL Editor → New query → einfügen → Run
--  (Kann gefahrlos mehrfach ausgeführt werden. Bestehende Daten bleiben erhalten.)
-- =====================================================================
create table if not exists public.lager_field_defs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  type        text not null default 'text' check (type in ('text','number','select','bool','date')),
  options     text[] not null default '{}',
  applies_to  text not null default 'both' check (applies_to in ('part','tool','both')),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.lager_field_defs enable row level security;
drop policy if exists "own rows" on public.lager_field_defs;
create policy "own rows" on public.lager_field_defs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.lager_field_defs to authenticated;
