# Foodie

Eine React-PWA mit Node.js-Backend für einen gemeinsamen Haushalt: Wochenplanung von Montag bis Sonntag, Rezeptstapel, Rezeptimport, Einkaufsliste und ein großer Schritt-für-Schritt-Kochmodus.

## Start

Voraussetzung: Node.js ab **22.19.0**, npm.

```sh
npm ci
npm run build
npm start
```

Anschließend **http://127.0.0.1:4307** öffnen. Die App enthält sechs vollständige Beispielrezepte und vier Planeinträge in der beim ersten Start aktuellen Woche. Eigene Daten bleiben in SQLite unter `data/foodie.sqlite` erhalten.

Zur Entwicklung: `npm run dev`, dann die von Vite angezeigte Adresse öffnen (normalerweise http://localhost:5173). Die installierbare Offline-PWA wird im Produktionsbuild getestet; im Entwicklungsmodus ist der Service Worker deaktiviert.

## Funktionen

- **Wochenplan:** mehrere Gerichte pro Tag, beliebige Wochen, dieselben Rezepte mehrfach verwendbar. Am Desktop mit sieben Spalten, am Handy mit Tagesansicht und Wochenleiste. Über den Griff ziehen oder mit „Einplanen“ beziehungsweise „Ändern“ ein Datum auswählen. Beim Ziehen vor einem anderen Gericht wird die Reihenfolge angepasst.
- **Gerichtestapel:** eigene Rezepte, Suche nach Namen oder Zutaten, Kategorien und Schnellfilter. Rezepte archivieren und wiederherstellen. Pro Rezept Portionen, strukturierte Zutaten, Kochschritte, Dauer, optionale Bildadresse und Quelle.
- **Import:** öffentliche HTTP-/HTTPS-Seiten mit Schema.org-Recipe-Daten in JSON-LD. Der Import unterstützt verschachtelte Rezeptabschnitte, Mengen, Bilder und Quellen. Vor dem Speichern sind alle Daten bearbeitbar. Nicht unterstützte oder blockierte Seiten liefern eine verständliche Fehlermeldung; fehlende Angaben lassen sich ergänzen. Login- und JavaScript-Scraping sind nicht enthalten.
- **Einkauf:** automatische Skalierung nach Portionen pro Planeintrag. Gramm/Kilogramm sowie Milliliter/Liter werden zusammengeführt. Unterschiedliche Einheiten bleiben getrennt. Zusätzliche Artikel und abhakbare Einträge werden mit dem Haushalt synchronisiert.
- **Kochmodus:** jeweils ein großer Schritt, Zurück/Weiter, Fortschritt, aufklappbare skalierte Zutaten und ein frei einstellbarer Timer. Fortschritt und Timer-Endzeit bleiben pro Gericht beziehungsweise Planeintrag auf dem Gerät gespeichert. Das Display bleibt über die Screen Wake Lock API wach, soweit Browser und Gerätezustand das zulassen. Timer zeigen ihren Ablauf in der geöffneten App an; keine Hintergrundbenachrichtigungen.

## Offline und mehrere Geräte

Nach dem ersten vollständigen Online-Aufruf sind App-Gerüst, Schriften, Rezepte und Plan offline verfügbar. Angesehene Bilder werden separat bis zu einer Obergrenze von 100 Bildern gespeichert. Eine Erstinstallation ohne Verbindung kann noch keine Haushaltsdaten laden.

IndexedDB speichert die lokale Datenkopie und ausstehende Änderungen. Die Synchronisierung läuft nach Änderungen, bei wiederhergestellter Verbindung, beim Zurückkehren in die App und alle 15 Sekunden während die App sichtbar ist. Im Hintergrund geschlossene Apps synchronisieren beim nächsten Öffnen. Konflikte zeigen beide Fassungen; erst die explizite Auswahl ersetzt eine davon. Änderungen an unterschiedlichen Objekten werden unabhängig übernommen. Wiederholte Requests sind durch eindeutige Operationskennungen idempotent. Mehrere Tabs teilen sich eine atomar geschriebene Warteschlange; ein blockierter Eintrag hält seine späteren Änderungen zurück. Offene Entwürfe behalten ihre ursprüngliche Revision, damit zwischenzeitliche Änderungen als Konflikt sichtbar werden. Bei einem lokalen Speicherfehler bleibt der Rezepteditor zum erneuten Speichern geöffnet.

Ein Planeintrag enthält seine eigene Rezeptfassung. Änderungen und Archivieren in der Rezeptbibliothek ändern vorhandene Planeinträge nicht. Über „Ändern → Aktuelle Rezeptfassung übernehmen“ lässt sich ein Eintrag ausdrücklich aktualisieren.

## Betrieb und Installation auf Handy/Tablet

Alle Geräte müssen dieselbe Serveradresse öffnen. Für den Zugriff im Heimnetz kann `HOST=0.0.0.0` gesetzt werden. `PORT` (Standard `4307`) und `DATA_DIR` (Standard `data`) sind ebenfalls konfigurierbar. Beispiel in PowerShell:

```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '4307'
npm start
```

Für PWA-Installation, Service Worker und Wake Lock auf anderen Geräten ist **HTTPS** erforderlich; `localhost` und `127.0.0.1` gelten auf dem lokalen Rechner als sichere Entwicklungsumgebung. Im Haushalt bietet sich ein privater HTTPS-Reverse-Proxy vor Node.js an. Backend und Frontend werden unter derselben Herkunft ausgeliefert, ohne gesonderte CORS-Konfiguration. Loopback-Hosts sind erlaubt; LAN-/Proxy-Namen oder IP-Adressen müssen zusätzlich über `ALLOWED_HOSTS` freigegeben werden. Die Liste enthält Hostnamen ohne Schema oder Pfad. Details stehen in [docs/network-boundary.md](./docs/network-boundary.md).

Es gibt bewusst keine Benutzerkonten. Wer die Serveradresse erreicht, kann den gemeinsamen Haushalt lesen und bearbeiten. Der Server ist für ein privates Haushaltsnetz gedacht; für Zugriff aus dem Internet ist eine vorgeschaltete Zugangskontrolle nötig. Der Rezeptimport blockiert private IP-Bereiche, prüft Weiterleitungen und bindet die validierte DNS-Adresse an die Verbindung.

Die Datenbankdatei einschließlich aktiver WAL-Dateien gehört auf ein dauerhaftes Volume. Für konsistente Sicherungen den Server kurz beenden und den gesamten Datenordner kopieren. Browserdaten und ausstehende Offline-Änderungen gehen beim Löschen des Browserprofils verloren; vorher synchronisieren.

## Prüfen

```sh
npm test
npm run build
npm run test:e2e
npm run format:check
npm audit
```

Die Browserprüfungen verwenden das installierte Microsoft Edge und starten einen eigenen Testserver auf Port 3002 mit separaten Daten in `test-results/server-data`. Für eine Chromium-Installation `npx playwright install chromium` ausführen und `PLAYWRIGHT_BROWSER=chromium` setzen; in PowerShell mit `$env:PLAYWRIGHT_BROWSER = 'chromium'`. Die Tests decken Desktop und Handy, Drag-and-drop, Offline-Neuladen, Rücksynchronisierung, konkurrierende Änderungen, Rezeptfassungen, Archivieren und automatisierte Barrierefreiheit ab.

## Aufbau

- [src/components](./src/components/): Rezepteditor, Import, Planung, Einkaufsliste, Kochmodus und Dialoge.
- [src/store.ts](./src/store.ts): lokale Speicherung und Synchronisierung.
- [src/sw.ts](./src/sw.ts): versionierter Offline-Cache und Bildcache.
- [server](./server/): Express-API, SQLite-Objektspeicher und abgesicherter Rezeptimport.
- [shared](./shared/): Datenmodell, Validierung, Einkaufsberechnung und Beispieldaten.

Gestaltungsentscheidungen stehen in [docs/design.md](./docs/design.md). Die Schrift wird lokal mitgeliefert. Tellerabbildungen sind eigene SVG-Illustrationen und werden bei hinterlegten Rezeptfotos durch diese ersetzt.
