-- SpareSync: Werkstatt-Grundriss
-- Speichert, wo jeder Lagerort auf dem Grundriss steht (Spalte, Zeile, Breite, Höhe),
-- damit der Grundriss auf allen Geräten gleich aussieht.
-- Einmal im Supabase-SQL-Editor ausführen. Ohne diese Spalte speichert die App den Grundriss nur auf dem Gerät.

alter table public.lager_locations add column if not exists map jsonb;
