-- =====================================================================
--  SpareSync – Live-Updates: Buchungen von anderen Geräten sofort anzeigen
--  Einmal im Supabase-SQL-Editor ausführen.
--  Fügt die Tabelle lager_movements der Realtime-Veröffentlichung hinzu.
--  Die Zeilensicherheit (RLS) gilt weiterhin: jedes Konto sieht nur die eigenen Buchungen.
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lager_movements'
  ) then
    alter publication supabase_realtime add table public.lager_movements;
  end if;
end $$;
