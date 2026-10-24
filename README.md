# SpareSync

Werkstatt-Lagerverwaltung als PWA für Ersatzteile, Kleinteile und Werkzeuge – iOS-Look, Barcode-Scan, Supabase-Cloud.

## Funktionen

- **Favoriten-Startseite** mit großen Kacheln (Dazu buchen, Erstellen, Entnehmen, Inventur, Werkzeug, Lagerorte, Gruppen, Details, Unter Meldebestand, Warenkorb). Kacheln über das Stift-Symbol ein-/ausblenden. Kacheln mit Strichcode-Symbol starten direkt den Scanner.
- **Listen** mit Suche (Name, Nummer, Barcode, Gruppe, eigene Felder), Filter (Gruppe, Lagerort, unter Meldebestand, Sortierung) und drei Reitern: Ersatzteile · Werkzeuge · Warenkorb.
- **Material-Ansicht** mit Tabs
  - *Infos*: Bilder, Lagerorte mit Bestand, Gesamtbestand, Kommission/Warenkorb, Aufgaben, Historie
  - *Buchung*: Entnehmen (rot), Dazu buchen (grün), Umbuchen (blau) + letzte Bewegungen
  - *Details*: Barcode, Einheit, Preise, Buchungsart, Gruppe, Dateien, eigene Felder – jede Zeile antippen zum Ändern
- **Ersatzteil / Werkzeug anlegen** mit Barcode- und Lagerort-Scan, Anfangsbestand, Melde-/Maximalbestand, Bildern (werden vor dem Upload verkleinert), „Alle Felder anzeigen“.
- **Material Gruppen** und **Lagerorte** verwalten (Lagerort-Barcode zuweisen, Etikett drucken).
- **Inventur** je Lagerort: zählen, scannen, nur Abweichungen werden gebucht.
- **Warenkorb** (Nachbestellen, Teile unter Meldebestand mit einem Tipp übernehmen, Liste teilen) und **Kommissionen** (für Aufträge reservieren, gesammelt entnehmen).
- **Etiketten** mit Code128-Barcode (AirPrint / PDF).
- **CSV-Export/-Import** (Excel-kompatibel, Semikolon) – zum Umzug aus der alten App.
- Hell/Dunkel-Modus, offline startfähig, „Zum Home-Bildschirm“.

## 1. Supabase einrichten (einmalig)

SpareSync nutzt ein **eigenes** Supabase-Projekt – getrennt von anderen Apps, mit eigenen Benutzerkonten.

1. Supabase → **SQL Editor** → *New query* → Inhalt von `supabase/schema.sql` einfügen → **Run**.
2. Supabase → **Project Settings → API**: `Project URL` und `anon public` Key kopieren.

Das Skript legt an: Tabellen, Row Level Security (jeder Login sieht nur sein eigenes Lager), die Buchungsfunktion `lager_book` (Bestandsänderungen laufen atomar in der Datenbank – kein Minusbestand möglich) und den Storage-Bucket `lager-files` für Bilder/Dateien.

## 2. Lokal starten

```bash
npm install
cp .env.example .env      # URL + anon key eintragen
npm run dev               # öffnet auf http://localhost:5173 (mit --host auch im WLAN fürs iPhone)
```

Ohne `.env` läuft die App im **Demo-Modus** mit Beispieldaten im Browser – praktisch zum Ausprobieren.

> Hinweis: Der Kamera-Scanner braucht HTTPS (oder localhost). Im WLAN-Test am iPhone also lieber die GitHub-Pages-Version nutzen.

## 3. Auf GitHub Pages veröffentlichen

1. Neues Repo anlegen (z. B. `Lager`) und den Ordnerinhalt hochladen.
2. Repo → **Settings → Pages** → Source: **GitHub Actions**.
3. Repo → **Settings → Secrets and variables → Actions** → zwei Secrets anlegen: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`.
4. Push auf `main` → der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht automatisch, z. B. unter `https://spratek.github.io/Lager/`.
5. In Supabase → **Authentication → URL Configuration** die Pages-Adresse als Site URL / Redirect URL eintragen (für die Bestätigungs-Mail).

Am iPhone: Seite in Safari öffnen → Teilen → **Zum Home-Bildschirm**.

## CSV-Import

Kopfzeile mit beliebigen dieser Spalten (Reihenfolge egal, Semikolon oder Komma):

`Nr; Typ; Name; Barcode; Gruppe; Lagerort; Bestand; Meldebestand; Maximalbestand; Einheit; Verkaufspreis; Einkaufspreis; Lieferant; Notizen`

Pflicht ist nur `Name`. Fehlende Gruppen/Lagerorte werden angelegt. Gibt es die Nr. oder den Namen schon, wird der Artikel aktualisiert und der Bestand am Lagerort auf den CSV-Wert gesetzt. Am einfachsten: erst exportieren, die Datei als Vorlage nehmen.

## Projektstruktur

```
index.html                 Einstieg
src/main.js                Router + alle Ansichten
src/db.js                  Datenschicht (Supabase oder Demo-Speicher)
src/ui.js                  iOS-Bausteine: Alert, Action-Sheet, Sheets, Scanner, Etikett
src/csv.js                 CSV-Export/-Import
src/icons.js               SVG-Icons
src/styles.css             Design (hell/dunkel)
public/                    Manifest, Service Worker, App-Icons
supabase/schema.sql        Datenbank, Sicherheit, Buchungsfunktion, Storage
.github/workflows/         Automatisches Deployment auf GitHub Pages
```

## Alte Teile mit Bildern importieren (PC)

Das Skript `tools/import-csv.mjs` liest eine CSV (Spalten z. B. „Bild“, „Name“, „Ersatzteil Gruppe“, „Haupt Lagerort (HL)“, „HL Bestand“, „HL Meldebestand“), lädt jedes Bild von der URL herunter, speichert es im Supabase-Bucket `lager-files` und legt das Teil mit Gruppe, Lagerort, Bestand und Meldebestand an.

```bash
npm install                                   # einmalig
node tools/import-csv.mjs teile.csv --probe   # Test mit 3 Zeilen
node tools/import-csv.mjs teile.csv           # alles importieren
```

Optionen: `--dry-run` (nur anzeigen), `--no-images`, `--update` (vorhandene Teile mit gleichem Namen aktualisieren statt überspringen).
Anmeldung mit dem eigenen SpareSync-Login; benötigt wird nur die Supabase-URL und der Publishable Key – kein geheimer Schlüssel.
