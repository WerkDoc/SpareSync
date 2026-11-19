// =====================================================================
//  „Was ist neu“ – Neuerungen je Version (neueste zuerst)
//  Bei jedem Update oben einen neuen Eintrag ergänzen: Die App zeigt ihn einmal nach dem Start.
//  icon: Name aus icons.js · tour: true = diese Neuerung hat eine eigene Station in der Tour
// =====================================================================
export const CHANGELOG = [
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
