# SpareSync – Projektnotizen für Claude

Diese Datei gilt für **jeden** Claude, der an SpareSync arbeitet: Claude-Chat (Artifact), Claude Code und weitere Chats.

## Kommunikation
- **Immer auf Deutsch antworten**, per „du“.
- Vor größeren Umbauten erst den Plan erklären, dann umsetzen.

## Feste Regeln: Arbeiten nur über Pull Requests
- **Immer vom aktuellen Stand aus arbeiten.** Vor jeder Änderung `git fetch` und dann `git status` / `git log origin/main` prüfen. Nie mit einer alten lokalen Kopie oder einer alten Artifact-Version weiterarbeiten. Bei WerkDoc hat genau das dreimal fremde Änderungen überschrieben.
- **Jede Änderung auf einem eigenen Branch** (z. B. `feature/…`, `fix/…`, `docs/…`) und dann ein **Pull Request** gegen `main`. Der Nutzer prüft ihn und mergt.
- **Kein direkter Push auf `main`** und **keine Datei-Uploads** über die GitHub-Webseite („Add files via upload“) durch Claude.
- **Vor eigenen Änderungen offene PRs prüfen** (`gh api repos/WerkDoc/SpareSync/pulls`). Ändert ein offener PR dieselben Dateien, erst Bescheid geben bzw. auf dessen Stand aufbauen.
- Pull Requests per REST anlegen, falls `gh pr create` nicht geht:
  `gh api repos/WerkDoc/SpareSync/pulls -f base=main -f head=<branch> -f title="…" -F body=@pr.md`
- Vor jedem größeren Schritt lokal committen.
- Liegen auf `main` neue Commits, die nicht über einen PR kamen (z. B. Uploads vom Handy oder aus GitHub Desktop), dann vor dem Weiterarbeiten prüfen, ob sie frühere Änderungen zurückgedreht haben. Falls ja, per 3-Wege-Merge zurückholen und den Nutzer informieren.

## Achtung: Merge = live
- Jeder Push auf `main` (auch ein gemergter PR) baut und veröffentlicht die App automatisch per GitHub Actions (`.github/workflows/deploy.yml`) unter https://werkdoc.github.io/SpareSync/.
- Deshalb erst mergen, wenn die Änderung getestet ist.

## Eckdaten der App
- **SpareSync** ist die Werkstatt-Lagerverwaltung (Ersatzteile, Kleinteile, Werkzeuge) als PWA. Vite, Vanilla-JS (`src/main.js`, `ui.js`, `db.js` …), iOS-/Glassmorphism-Design.
- **Eigenständige App:** hat nichts mit der Rechnungs-App WerkDoc (`WerkDoc/Rechnung`) zu tun. Sie hat ein eigenes Supabase-Projekt „SpareSync“ und eigene Benutzerkonten, also keinen gemeinsamen Login. Bitte keine Verbindungen zu WerkDoc einbauen, wenn der Nutzer das nicht ausdrücklich will.
- Datenbank: `supabase/schema.sql` (RLS, Buchungsfunktion `lager_book`, Storage-Bucket `lager-files`) und Migrationen in `supabase/`. SQL-Änderungen führt der Nutzer selbst im Supabase-SQL-Editor aus. Neue Migrationen bekommen eine eigene Datei und werden im PR erwähnt.
- Branding: „spareSync“ („spare“ Navy, „Sync“ Mittelblau) mit dem „S“-Icon aus Pfeilen. Das Design soll eigenständig bleiben und nicht wie die frühere App „Lager im Griff“ aussehen (kein 3×3-Farbkachel-Grid).
- Service Worker `public/sw.js`: Die Cache-Version (`__BUILD__`) und die Precache-Liste setzt der Build automatisch (`vite.config.js`).
- Etikettendrucker: Brother QL-800, Rolle DK-11209 (62×29 mm).

## Geheimnisse
- **`.env` nie committen** (steht in `.gitignore`). Supabase-URL und Anon-Key liegen als GitHub-Secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Keine CSV-Dateien mit echten Lagerdaten committen (`*.csv` steht in `.gitignore`).

## Lokal testen
- `npm install`, dann `npm run dev`. Ohne `.env` läuft die App im **Demo-Modus** mit Beispieldaten im Browser.
- Build-Check: `npx vite build --outDir <Scratchpad>` (nicht ins Repo bauen).
- Der Kamera-Scanner braucht HTTPS oder localhost.
