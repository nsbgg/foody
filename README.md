# <img src="./public/foody_small.svg" height="22px" alt=""> Foody

Eine React-PWA mit Node.js-Backend für einen gemeinsamen Haushalt: Wochenplanung von Montag bis Sonntag, Rezeptstapel, Rezeptimport, Einkaufsliste und ein großer Schritt-für-Schritt-Kochmodus.

## Start

Voraussetzung: Node.js ab **22.19.0**, npm.

```sh
npm ci
npm run build
npm start
```

Anschließend **http://localhost:4307** öffnen, einen Account erstellen und einen Haushalt anlegen oder mit Einladungscode beitreten. Neue Haushalte starten leer. Accounts und Haushaltsdaten bleiben in SQLite unter `data/` erhalten. Bestehende Daten aus der Version ohne Accounts werden geschützt aufbewahrt und nicht automatisch einem neuen Account zugeordnet; siehe [Account-API](./docs/accounts-api.md#existing-installations).

Zur Entwicklung: `npm run dev`, dann die von Vite angezeigte Adresse öffnen (normalerweise http://localhost:5173). Die installierbare Offline-PWA wird im Produktionsbuild getestet; im Entwicklungsmodus ist der Service Worker deaktiviert.

## Funktionen

- **KI-Anbindung:** Im Account-Menü haushaltsgebundene MCP-Verbindungen mit getrennten Lese-, Schreib- und Löschrechten für Rezepte, Wochenplan und Einkaufsliste erstellen. Mehrere Rezepte auf einmal hinzufügen, bearbeiten, planen und Einkäufe abhaken oder entfernen. Schlüssel sind wahlweise befristet oder unbegrenzt gültig und einzeln widerrufbar. Einrichtung und Werkzeugliste: [MCP-Anbindung](./docs/mcp.md).

- **Accounts und Haushalte:** Anmeldung mit Passwort oder Passkey, mehrere Haushalte pro Account und persönliche Einladungscodes für weitere Mitglieder. Profilbild anklicken, um Haushalte, Mitglieder, Passkeys und den Synchronisierungsstatus zu verwalten.
- **Wochenplan:** mehrere Gerichte pro Tag, beliebige Wochen, dieselben Rezepte mehrfach verwendbar. Am Desktop mit sieben Spalten, am Handy mit Tagesansicht und Wochenleiste. Zum Ziehen dient ausschließlich die kleine Grifflasche oben links auf dem Kartenbild; Rezepttitel öffnen wie gewohnt das Rezept. Mit „Einplanen“ beziehungsweise „Ändern“ lässt sich ein Datum auswählen. Beim Ziehen vor einem anderen Gericht wird die Reihenfolge angepasst. Zurückziehen in den Gerichtestapel entfernt nur den Planeintrag und erhält das Rezept. Im Tab „Gerichte“ gibt es keine Ziehfunktion.
- **Gerichtestapel:** eigene Rezepte, Suche nach Namen oder Zutaten, Kategorien und Schnellfilter. Rezepte archivieren und wiederherstellen. Pro Rezept Portionen, strukturierte Zutaten, Kochschritte, Dauer, optionale Bildadresse und Quelle.
- **Import:** öffentliche HTTP-/HTTPS-Seiten mit Schema.org-Recipe-Daten in JSON-LD. Der Import unterstützt verschachtelte Rezeptabschnitte, Mengen, Bilder und Quellen. Vor dem Speichern sind alle Daten bearbeitbar. Nicht unterstützte oder blockierte Seiten liefern eine verständliche Fehlermeldung; fehlende Angaben lassen sich ergänzen. Login- und JavaScript-Scraping sind nicht enthalten.
- **Einkauf:** automatische Skalierung nach Portionen pro Planeintrag. Gramm/Kilogramm sowie Milliliter/Liter werden zusammengeführt. Unterschiedliche Einheiten bleiben getrennt. Zusätzliche Artikel und abhakbare Einträge werden mit dem Haushalt synchronisiert.
- **Kochmodus:** füllt den verfügbaren App-Bildschirm ohne Scrollen. Die aktuelle Anweisung steht groß in der Mitte; Fortschritt und Zurück/Weiter bleiben sichtbar. Lange Schritte und Zutatenlisten lassen sich seitenweise durchblättern. Skalierte Zutaten und der frei einstellbare Timer öffnen sich bei Bedarf in einer eigenen Ansicht. Fortschritt und Timer-Endzeit bleiben pro Gericht beziehungsweise Planeintrag auf dem Gerät gespeichert. Das Display bleibt über die Screen Wake Lock API wach, soweit Browser und Gerätezustand das zulassen. Timer zeigen ihren Ablauf in der geöffneten App an; keine Hintergrundbenachrichtigungen.

Im Kochschritt erscheinen erkannte Zutaten mit ihrer skalierten **Rezeptmenge**. Bereits im Text ausgeschriebene Mengen bleiben unverändert; unbekannte oder mehrdeutige Angaben werden nicht geraten. Der Timer besitzt Zeitvorgaben, Pause/Fortsetzen und eine Schaltfläche zum Minimieren in den Kochmodus-Header. In dieser PWA läuft der Timer intern, da der Geräte-Timer aus dem Browser nicht verlässlich gestartet und bestätigt werden kann. Er benötigt für die Ablaufanzeige eine geöffnete App. Einzelheiten und Grenzen stehen in [docs/design.md](./docs/design.md).

## Offline und mehrere Geräte

Nach dem ersten vollständigen Online-Aufruf sind App-Gerüst, Schriften, Rezepte und Plan offline verfügbar. Die lokale Anmeldung gilt höchstens zwölf Stunden seit dem letzten erfolgreichen Sessionabgleich und endet spätestens mit der Serversession. Angesehene Bilder werden separat bis zu einer Obergrenze von 100 Bildern gespeichert. Eine Erstinstallation ohne Verbindung kann noch keine Haushaltsdaten laden.

IndexedDB speichert die lokale Datenkopie und ausstehende Änderungen. Die Synchronisierung läuft nach Änderungen, bei wiederhergestellter Verbindung, beim Zurückkehren in die App und alle 15 Sekunden während die App sichtbar ist. Im Hintergrund geschlossene Apps synchronisieren beim nächsten Öffnen. Konflikte zeigen beide Fassungen; erst die explizite Auswahl ersetzt eine davon. Änderungen an unterschiedlichen Objekten werden unabhängig übernommen. Wiederholte Requests sind durch eindeutige Operationskennungen idempotent. Mehrere Tabs teilen sich eine atomar geschriebene Warteschlange; ein blockierter Eintrag hält seine späteren Änderungen zurück. Offene Entwürfe behalten ihre ursprüngliche Revision, damit zwischenzeitliche Änderungen als Konflikt sichtbar werden. Bei einem lokalen Speicherfehler bleibt der Rezepteditor zum erneuten Speichern geöffnet.

Ein Planeintrag enthält seine eigene Rezeptfassung. Änderungen und Archivieren in der Rezeptbibliothek ändern vorhandene Planeinträge nicht. Über „Ändern → Aktuelle Rezeptfassung übernehmen“ lässt sich ein Eintrag ausdrücklich aktualisieren.

Die Marke und das npm-Projekt heißen **Foody** (`foody`). Bestehende technische
Speichernamen mit `foodie` bleiben teilweise zur Datenkompatibilität erhalten,
insbesondere `data/foodie.sqlite` und der Bildcache. Private Browserdaten,
ausstehende Änderungen und Kochfortschritte werden nach Account und Haushalt
getrennt gespeichert. Beim Abmelden werden die privaten lokalen Daten des
Accounts entfernt; bei ungesendeten Änderungen erscheint vorher ein Hinweis.

## Chefkoch-Rezepte importieren

Im Rezeptstapel **Rezept aus dem Internet** wählen, einen vollständigen Chefkoch-Rezeptlink
einfügen und **Rezept übernehmen** anklicken. Foody öffnet die Angaben zur
Kontrolle im Editor; erst beim Speichern kommt das Rezept in den Stapel. Quelle,
verfügbare Zutatenmengen, Portionen und Kochschritte werden übernommen. Fehlende
Angaben bleiben zur Ergänzung offen. Andere Rezeptseiten mit JSON-LD funktionieren
weiterhin über denselben Import.

Der Chefkoch-Adapter verwendet die Datenmodelle und Textbereinigung von
[`chefkoch-api` 1.2.2](https://github.com/gamersi/chefkoch-api). Das upstream als
veraltet markierte Paket liefert selbst keine Schritte oder Portionenzahlen;
Foody ergänzt diese aus strukturierten Seitendaten und passenden HTML-Feldern.
Der Download läuft ausschließlich über Foodys abgesicherten Importer. Die
Netzwerk-, Such-, Crawl- und Dateioperationen des Pakets werden nicht verwendet.
Dies ist keine offizielle Chefkoch-Schnittstelle; Änderungen oder Zugriffssperren
der Website können den Import beeinträchtigen. Es werden nur einzelne verlinkte
Rezepte geladen, keine Rezeptsammlungen heruntergeladen.

## Betrieb und Installation auf Handy/Tablet

Alle Geräte müssen dieselbe Serveradresse öffnen. Für den Zugriff im Heimnetz kann `HOST=0.0.0.0` gesetzt werden. `PORT` (Standard `4307`) und `DATA_DIR` (Standard `data`) sind ebenfalls konfigurierbar. Beispiel in PowerShell:

```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '4307'
npm start
```

Für PWA-Installation, Service Worker und Wake Lock auf anderen Geräten ist **HTTPS** erforderlich; `localhost` und `127.0.0.1` gelten auf dem lokalen Rechner als sichere Entwicklungsumgebung. Im Haushalt bietet sich ein privater HTTPS-Reverse-Proxy vor Node.js an. Backend und Frontend werden unter derselben Herkunft ausgeliefert, ohne gesonderte CORS-Konfiguration. Loopback-Hosts sind erlaubt; LAN-/Proxy-Namen oder IP-Adressen müssen zusätzlich über `ALLOWED_HOSTS` freigegeben werden. Die Liste enthält Hostnamen ohne Schema oder Pfad. Details stehen in [docs/network-boundary.md](./docs/network-boundary.md).

Haushaltsdaten sind nur für angemeldete Mitglieder erreichbar. Passwörter werden mit scrypt gehasht; Passkeys verwenden WebAuthn mit erforderlicher Benutzerverifikation. Mutationen benötigen einen CSRF-Token. Für den produktiven Betrieb sind HTTPS, `APP_ORIGIN`, `WEBAUTHN_RP_ID` und `ALLOWED_HOSTS` zu konfigurieren. Passkeys sind an den gewählten Hostnamen gebunden. E-Mail-Verifikation und Passwortwiederherstellung sind noch nicht enthalten. Details und API-Verträge stehen in [docs/accounts-api.md](./docs/accounts-api.md). Der Rezeptimport blockiert private IP-Bereiche, prüft Weiterleitungen und bindet die validierte DNS-Adresse an die Verbindung.

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

## Mitarbeit und öffentlicher Quellcode

[CONTRIBUTING.md](./CONTRIBUTING.md) beschreibt Änderungen, Prüfungen und die Pflege der Abhängigkeitshinweise. [SECURITY.md](./SECURITY.md) erklärt die Sicherheitsgrenzen und den Umgang mit vertraulichen Fehlerberichten. [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) enthält die Lizenzhinweise der Abhängigkeiten; diese erteilen keine Lizenz für Foody selbst. Die Projektlizenz ist noch durch den Eigentümer festzulegen.

Die [GitHub-Prüfung](./.github/workflows/ci.yml) installiert das Lockfile unter Node.js 22.19 und 24 und prüft Formatierung, Tests, Produktionsbuild, Abhängigkeiten und Browserabläufe mit Chromium. Lokale Freigaben und tatsächliche Ergebnisse stehen in [docs/release-gates.md](./docs/release-gates.md). Ein erfolgreicher GitHub-Lauf kann erst nach Veröffentlichung des Repositorys nachgewiesen werden. Konfigurationsvariablen sind in [.env.example](./.env.example) beschrieben; echte Haushaltsdaten und lokale Einstellungen gehören nicht ins Repository.
