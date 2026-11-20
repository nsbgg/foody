# Foodie

## Produkt und Gestaltung

Das Board beantwortet zuerst: Was essen wir diese Woche? Der Stapel beantwortet: Was können wir einplanen? Der Kochmodus beantwortet: Was ist jetzt zu tun?

Gewählte Richtung: `editorial-greeting`, Seed `747695860`. Die sieben Tagesbahnen ersetzen das allgemeine Dashboardraster, weil die Woche die natürliche Struktur des Produkts ist. Die Instrument-Sans-Variante verwendet einen Titel in App-Größe. Keine Neuziehung.

Palette: Gartenweiß `#f5f7f4`, Weiß `#ffffff`, Kräutergrün `#256347`, dunkles Blatt `#202c24`, Salbei `#eef2eb`, Sekundärtext `#59655c`. Die Marke erscheint als Kochtopf mit Blatt. Flache Flächen, ruhige Grenzen, wenig Farbe in der Navigation. Die Illustration eines Tellers ist als Illustration erkennbar, keine vorgetäuschte Fotografie.

Desktop: sieben gleich breite Tagesbahnen im Hauptbereich und ein 294px breiter Rezeptstapel mit 24px Abstand. Tablet: Stapel unter dem Board, zwei Rezeptspalten. Handy: Wochenleiste und eine Tagesbahn; Rezeptstapel darunter. Jeder Eintrag hat eine Alternative zum Ziehen über Datumsauswahl.

Daten: ein Haushalt, sechs vollständig ausgefüllte Beispielrezepte für zwei Portionen, vier Beispieleinträge in der ersten Startwoche. Summen und Einkaufsmengen entstehen ausschließlich aus den Einträgen. Diese Beispieldaten können über die Oberfläche archiviert beziehungsweise entfernt werden.

## Kochmodus im Vollbild

Der Displaystatus steht als Bildschirm-Symbol mit sichtbarem Text neben dem Schrittfortschritt: „Display bleibt an“ bei aktivem Wake Lock, sonst „Display kann ausgehen“. Die Anzeige ist ein Status und kein Theme-Schalter. Änderungen werden über eine höfliche Live-Region zugänglich gemacht; Sonne/Mond werden dafür nicht verwendet.

Der Kochmodus füllt den verfügbaren App-Bildschirm als nativer modaler Dialog. Die vorhandene Farbpalette und Schrift bleiben erhalten. Rezeptname und Fortschritt stehen kompakt oben, die aktuelle Anweisung trägt die größte Schrift, Zurück und Weiter bleiben am unteren Rand erreichbar. Erklärtexte und dauerhaft geöffnete Nebenbereiche entfallen.

Lange Anweisungen werden entsprechend der tatsächlich verfügbaren Textfläche auf Seiten verteilt. Zutaten und Timer öffnen eigene Ansichten im Kochmodus. Die Bedienung erfolgt über Tasten statt über Scrollen; kleine Bildschirme, Querformat und vergrößerte Darstellung werden mit Geometrieprüfungen getestet. Vollbild bezeichnet hier den verfügbaren Browser-/PWA-Inhaltsbereich; die Browserleiste wird nicht automatisch ausgeblendet.

## Mengen und Timer beim Kochen

Der Abschluss des Kochmodus zeigt eine eigene ruhige Tellerillustration mit Kräuterblatt, die große Überschrift „Guten Appetit!“ und zwei kurze Zeilen zum Servieren. Illustration und Text stehen als zusammenhängender Mittelpunkt; bei geringer verfügbarer Höhe wechseln sie nebeneinander. Die Darstellung folgt der vorhandenen Salbei-/Kräutergrünpalette und Instrument Sans, ohne Animationen oder Konfetti. „Noch einmal“ startet das Rezept erneut, „Zum Wochenplan“ schließt den Kochmodus und öffnet die Wochenübersicht. Laufende Timer bleiben im Header erreichbar.

Die Timer-Schaltfläche erscheint nur, wenn der aktuelle Rezeptschritt eine erkennbare Zeitangabe enthält oder noch ein Timer läuft, pausiert beziehungsweise abgelaufen ist. Beim Öffnen wird die erste erkannte Dauer vorausgefüllt; mehrere Dauern eines Schritts stehen in einer kompakten Auswahl. Der Start bleibt ausdrücklich manuell. Sekunden, Minuten und Stunden werden unterstützt; bei Zeitspannen gilt die längere Dauer. Nach dem Beenden verschwindet die Schaltfläche in Schritten ohne Zeitangabe. Laufende Timer werden durch einen Schrittwechsel nicht ersetzt.

Im Kochmodus sind die Scrollbalken des Vollbilddialogs, seiner Zutaten-/Timeransichten und der dahinterliegenden Seite ausgeblendet. Nach dem Schließen gilt wieder die normale Scrollbalkendarstellung der Seite. Die Seiteneinteilung hält die Kochinhalte weiterhin ohne Scrollen erreichbar.

Erkannte Zutatennamen im aktuellen Schritt erhalten die auf die gewählten Portionen skalierte Menge vorangestellt, etwa „200g Linsen“. Gewichts- und Volumeneinheiten stehen kompakt an der Zahl; Stückangaben werden als „1 Zwiebel“ dargestellt. Bereits ausgeschriebene Mengen werden nicht überschrieben oder automatisch skaliert. Bei Teilmengen wie „etwas“, „die Hälfte“ oder „den Rest“ ergänzt Foodie keine Gesamtmenge. Unbekannte Mengen und mehrdeutige Namen erhalten ebenfalls keine Mengenangabe. Die gespeicherte Anleitung bleibt unverändert; die Zutatenansicht enthält die vollständige skalierte Liste.

Für die gewünschte ADHS-orientierte Lesbarkeit trennt der Kochscreen Sätze mit ruhigem Abstand. Zutaten werden semantisch mit `mark` ausgezeichnet und mit dunklem Kräutergrün, einer sanften Salbeifläche und mittlerem Schriftgewicht hervorgehoben. Keine blinkenden Hinweise, zusätzlichen Bedienelemente oder automatischen Schrittwechsel. Die Messansicht verwendet dieselben Satzblöcke und Hervorhebungen wie die sichtbare Anleitung, damit lange Texte auch mit kräftigerer Schrift ohne Scrollen vollständig erreichbar bleiben.

Die Erkennung verwendet vollständige Namen und eine kleine geprüfte Liste gebräuchlicher Varianten, etwa „Rote Linsen“/„Linsen“ und „Blattspinat“/„Spinat“. Sie ist keine freie Sprachinterpretation. Die gemessene Seiteneinteilung gilt auch für die ergänzten Mengenangaben.

Die Timeransicht verwendet dieselbe Kräutergrün-/Salbeipalette und Instrument Sans. Ein ruhiger Uhrenring mit großer Ziffernanzeige bildet den Schwerpunkt. Zeitvorgaben, Start, Pause, Fortsetzen und Zurücksetzen sind direkt bedienbar. „Minimieren“ schließt die Timeransicht und lässt den Countdown als wieder aufklappbare Schaltfläche im Kochmodus-Header sichtbar. Endzeit, ursprüngliche Dauer und pausierte Restzeit werden gerätelokal gespeichert. Es werden keine zusätzlichen Browserberechtigungen angefordert.

Die reine PWA hat keine browserübergreifend verlässliche Schnittstelle zum Starten und Bestätigen des Standard-Geräte-Timers. Daher verwendet sie den internen Timer. Androids [Timer-Intent](https://developer.android.com/guide/components/intents-common#CreateTimer) gehört zur nativen App-Schnittstelle; [Chrome erlaubt externe Intent-Aufrufe nur für entsprechend freigegebene Activities](https://developer.chrome.com/docs/android/intents). Ein Fensterwechsel beweist keinen gestarteten Timer. Unbestätigte Deep Links und erfundene native Schnittstellen werden nicht verwendet. Der interne Timer meldet seinen Ablauf in der geöffneten App; er ersetzt keinen Hintergrundalarm des Betriebssystems.

## Synchronisierung

SQLite enthält unabhängig versionierte Objekte für Rezepte, Planeinträge, zusätzliche Einkaufsartikel und Häkchen. IndexedDB speichert den lokalen Stand, ausstehende Änderungen und Konflikte. Operationen besitzen eine eindeutige Kennung; Wiederholungen nach Verbindungsabbrüchen sind idempotent. Bei Versionskonflikten werden lokaler und entfernter Stand nebeneinander angezeigt. Rezeptfassungen liegen zusätzlich unveränderlich im jeweiligen Planeintrag.

Die PWA speichert das gebaute App-Gerüst und lokal geladene Schriftdateien vorab. Gesehene Rezeptbilder werden zwischengespeichert. Timer und Kochfortschritt bleiben gerätelokal. Bei geöffneter App erfolgen Synchronisierungen nach Änderungen, beim Wiederverbinden, beim Zurückkehren und alle 15 Sekunden.
