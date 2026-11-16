-- =====================================================================
--  SpareSync – Update „Favoriten“
--  Einmalig im Supabase-Projekt SpareSync ausführen:
--  SQL Editor → New query → einfügen → Run
--  (Kann gefahrlos mehrfach ausgeführt werden. Bestehende Daten bleiben erhalten.)
-- =====================================================================
alter table public.lager_materials
  add column if not exists is_favorite boolean not null default false;

-- „Zuletzt geändert“ soll sich NICHT ändern, wenn nur der Favoriten-Stern umgeschaltet wird
-- (sonst würde das Teil in „Zuletzt bewegt“ nach oben springen).
create or replace function public.lager_set_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number
      from public.lager_materials where owner_id = new.owner_id;
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'is_favorite' - 'updated_at') = (to_jsonb(old) - 'is_favorite' - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;
