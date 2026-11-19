# Foodie

## Produkt und Gestaltung

Das Board beantwortet zuerst: Was essen wir diese Woche? Der Stapel beantwortet: Was können wir einplanen? Der Kochmodus beantwortet: Was ist jetzt zu tun?

Gewählte Richtung: `editorial-greeting`, Seed `747695860`. Die sieben Tagesbahnen ersetzen das allgemeine Dashboardraster, weil die Woche die natürliche Struktur des Produkts ist. Die Instrument-Sans-Variante verwendet einen Titel in App-Größe. Keine Neuziehung.

Palette: Gartenweiß `#f5f7f4`, Weiß `#ffffff`, Kräutergrün `#256347`, dunkles Blatt `#202c24`, Salbei `#eef2eb`, Sekundärtext `#59655c`. Die Marke erscheint als Kochtopf mit Blatt. Flache Flächen, ruhige Grenzen, wenig Farbe in der Navigation. Die Illustration eines Tellers ist als Illustration erkennbar, keine vorgetäuschte Fotografie.

Desktop: sieben gleich breite Tagesbahnen im Hauptbereich und ein 294px breiter Rezeptstapel mit 24px Abstand. Tablet: Stapel unter dem Board, zwei Rezeptspalten. Handy: Wochenleiste und eine Tagesbahn; Rezeptstapel darunter. Jeder Eintrag hat eine Alternative zum Ziehen über Datumsauswahl.

Daten: ein Haushalt, sechs vollständig ausgefüllte Beispielrezepte für zwei Portionen, vier Beispieleinträge in der ersten Startwoche. Summen und Einkaufsmengen entstehen ausschließlich aus den Einträgen. Diese Beispieldaten können über die Oberfläche archiviert beziehungsweise entfernt werden.

## Kochmodus im Vollbild

Der Kochmodus füllt den verfügbaren App-Bildschirm als nativer modaler Dialog. Die vorhandene Farbpalette und Schrift bleiben erhalten. Rezeptname und Fortschritt stehen kompakt oben, die aktuelle Anweisung trägt die größte Schrift, Zurück und Weiter bleiben am unteren Rand erreichbar. Erklärtexte und dauerhaft geöffnete Nebenbereiche entfallen.

Lange Anweisungen werden entsprechend der tatsächlich verfügbaren Textfläche auf Seiten verteilt. Zutaten und Timer öffnen eigene Ansichten im Kochmodus. Die Bedienung erfolgt über Tasten statt über Scrollen; kleine Bildschirme, Querformat und vergrößerte Darstellung werden mit Geometrieprüfungen getestet. Vollbild bezeichnet hier den verfügbaren Browser-/PWA-Inhaltsbereich; die Browserleiste wird nicht automatisch ausgeblendet.

## Synchronisierung

SQLite enthält unabhängig versionierte Objekte für Rezepte, Planeinträge, zusätzliche Einkaufsartikel und Häkchen. IndexedDB speichert den lokalen Stand, ausstehende Änderungen und Konflikte. Operationen besitzen eine eindeutige Kennung; Wiederholungen nach Verbindungsabbrüchen sind idempotent. Bei Versionskonflikten werden lokaler und entfernter Stand nebeneinander angezeigt. Rezeptfassungen liegen zusätzlich unveränderlich im jeweiligen Planeintrag.

Die PWA speichert das gebaute App-Gerüst und lokal geladene Schriftdateien vorab. Gesehene Rezeptbilder werden zwischengespeichert. Timer und Kochfortschritt bleiben gerätelokal. Bei geöffneter App erfolgen Synchronisierungen nach Änderungen, beim Wiederverbinden, beim Zurückkehren und alle 15 Sekunden.
