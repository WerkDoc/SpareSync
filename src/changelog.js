// =====================================================================
//  „Was ist neu“ – Neuerungen je Version (neueste zuerst)
//  Bei jedem Update oben einen neuen Eintrag ergänzen: Die App zeigt ihn einmal nach dem Start.
//  icon: Name aus icons.js · tour: true = diese Neuerung hat eine eigene Station in der Tour
// =====================================================================
export const CHANGELOG = [
  {
    version: '1.9',
    date: '2026-11-20',
    title: 'Sprache & Englisch',
    items: [
      { icon: 'globe', title: 'Sprache: Englisch', text: 'Menü → Bedienung → „Sprache“: Automatisch, Deutsch oder English. „Automatisch“ richtet sich nach der Sprache deines Geräts.' },
      { icon: 'box', title: 'Englische Beispieldaten', text: 'Im Gastmodus auf Englisch sind auch die Beispielteile und Lagerorte englisch. Deine eigenen Daten bleiben, wie du sie eingegeben hast.' },
    ],
  },
  {
    version: '1.8',
    date: '2026-11-19',
    title: 'Deine App, dein Stil',
    items: [
      { icon: 'layers', title: 'Übersicht anpassen', text: 'Menü → Bedienung → „Übersicht anpassen“: Bereiche ein- und ausblenden und mit den Pfeilen in deine Reihenfolge bringen.' },
      { icon: 'text', title: 'Schriftgröße', text: 'Klein, Normal, Groß oder Sehr groß – im Menü unter „Bedienung“. Gilt für Listen, Seiten und Fenster.' },
      { icon: 'camera', title: 'Upload-Ring', text: 'Beim Hochladen eines Fotos läuft unten ein Ring um das Vorschaubild mit, bis zum grünen Haken.' },
    ],
  },
  {
    version: '1.7',
    date: '2026-11-19',
    title: 'Qualität, Steckbrief & Offline',
    items: [
      { icon: 'tag', title: 'Qualitätsstufe', text: 'Original, Nachbau, Pulled oder Neuwertig als farbiges Abzeichen – automatisch aus dem Namen erkannt, im Filter auswählbar und auch im Thekenmodus sichtbar.' },
      { icon: 'shelf', title: 'Lagerort-Steckbrief', text: 'Unter Lagerorte einen Lagerort antippen: Die Karte dreht sich um und zeigt Füllstand, Wert, knappe Teile und die letzte Inventur.' },
      { icon: 'cloudOff', title: 'Offline buchen', text: 'Ohne Internet kannst du trotzdem buchen. Die Buchungen warten auf dem Gerät und werden gesendet, sobald du wieder online bist. Oben siehst du, wie viele noch warten.' },
    ],
  },
  {
    version: '1.6',
    date: '2026-11-19',
    title: 'Scanner-Menü',
    items: [
      { icon: 'scan', title: 'Scanner-Menü', text: 'Der Scanner-Knopf fächert jetzt wie das + ein Menü auf: Scannen, Scannen & entnehmen, Code eintippen und Scan-Verlauf.', tour: true },
      { icon: 'cart', title: 'Warenkorb aus der Liste', text: 'Ein Teil, das du per Gedrückt-Halten in den Warenkorb legst, erscheint jetzt sofort dort.' },
    ],
  },
  {
    version: '1.5',
    date: '2026-11-19',
    title: 'Feinschliff',
    items: [
      { icon: 'sort', title: 'Standard-Sortierung', text: 'Im Menü unter „Neue Teile & Liste“ festlegen, wie die Teile-Liste sortiert ist – auch nach Chargennummer, auf- oder absteigend. Bleibt nach dem Schließen gespeichert.' },
      { icon: 'plus', title: 'Vorgaben für neue Teile', text: 'Lagerort, Gruppe und Meldebestand sind beim Anlegen schon ausgefüllt – einstellbar im Menü.' },
      { icon: 'eye', title: 'Einkaufspreise ausblenden', text: 'Einkaufspreise und Lagerwert werden unscharf, wenn jemand über die Schulter schaut. Antippen zeigt sie kurz.' },
      { icon: 'sparkle', title: 'Neue Animationen', text: 'Bestand rollt wie ein Zähler, der Warenkorb hüpft, Zeilen gleiten beim Suchen, Fenster schieben die Seite nach hinten, Speichern zeigt ein Häkchen und beim Umbuchen fliegt eine Kiste.' },
      { icon: 'swap', title: 'Wischen verbessert', text: '„Dazu buchen“ und „Löschen“ sitzen beim Durchwischen wieder mittig, und das Wischen läuft flüssiger.' },
    ],
  },
  {
    version: '1.4',
    date: '2026-11-19',
    title: 'Schneller arbeiten',
    items: [
      { icon: 'check', title: 'Mehrere Teile auf einmal', text: 'In „Teile“ auf „Auswählen“ tippen – dann mehrere Teile gleichzeitig in den Warenkorb legen, umlagern, Etiketten drucken oder löschen.', tour: true },
      { icon: 'cart', title: 'Warenkorb aufräumen', text: 'Im Warenkorb mehrere Posten auswählen und mit einem Tipp entfernen – mit Rückgängig.' },
      { icon: 'clock', title: 'Zuletzt angesehen', text: 'Beim Antippen der Suche stehen deine letzten Teile oben – ein Tipp und du bist wieder da.', tour: true },
      { icon: 'scan', title: 'Scan-Verlauf', text: 'Aus Versehen weggetippt? Im Scanner oben links auf die Uhr tippen und den letzten Code zurückholen. Alle Scans auch im Menü.', tour: true },
      { icon: 'sparkle', title: 'Kleine Animationen', text: 'Häkchen bei Aufgaben, Tab-Symbole hüpfen, knappe Teile blinken kurz rot, Plus/Minus gedrückt halten zählt schneller.' },
      { icon: 'minus', title: 'Schnellbuchen & mehr Einstellungen', text: 'Im Menü unter „Bedienung“: Startseite, Schnellbuchen (1 Tipp = 1 Stück), kompakte Liste, Haptik und Animationen.' },
      { icon: 'tag', title: 'Firmenname auf Etiketten', text: 'Dein Firmenname steht jetzt klein oben auf jedem Etikett – im Menü unter „Etiketten“ änderbar.' },
      { icon: 'help', title: 'Tour durch die App', text: 'Eine kurze Führung zeigt die wichtigsten Stellen. Jederzeit neu starten: Menü → „Tour starten“.' },
    ],
  },
  {
    version: '1.3',
    date: '2026-11-18',
    title: 'Ausprobieren & Kunden zeigen',
    items: [
      { icon: 'user', title: 'Gastmodus', text: 'Die App mit Beispieldaten ausprobieren – ohne Konto, alles bleibt nur auf dem Gerät.' },
      { icon: 'external', title: 'Shop-Link pro Teil', text: 'Link zum Artikel beim Lieferanten hinterlegen – „Im Shop öffnen“ auf der Teile-Seite und im Warenkorb.' },
      { icon: 'layers', title: 'Passt dazu', text: 'Was oft zusammen verbaut wird, schlägt die App nach dem Entnehmen vor – mit einem Tipp mit ausbuchen.' },
      { icon: 'store', title: 'Thekenmodus', text: 'Teile und Preise für Kunden zeigen – ohne Einkaufspreise. Zum Beenden das X gedrückt halten.' },
      { icon: 'map', title: 'Werkstatt-Grundriss', text: 'Lagerorte als Regale anordnen und sehen, wo ein Teil liegt.' },
    ],
  },
];
export const APP_VERSION = CHANGELOG[0].version;
