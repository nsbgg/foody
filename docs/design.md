# Foody

## Produkt und Gestaltung

Das Board beantwortet zuerst: Was essen wir diese Woche? Der Stapel beantwortet: Was können wir einplanen? Der Kochmodus beantwortet: Was ist jetzt zu tun?

Gewählte Richtung: `editorial-greeting`, Seed `747695860`. Die sieben Tagesbahnen ersetzen das allgemeine Dashboardraster, weil die Woche die natürliche Struktur des Produkts ist. Die Instrument-Sans-Variante verwendet einen Titel in App-Größe. Keine Neuziehung.

Palette: Logogrün `#00b74c`, Weiß `#ffffff`, Gartenweiß `#f4f9f6`, Mint `#e8f6ec`, dunkles Blatt `#142e21` und Textgrün `#006f2f`. Die Wortmarke verwendet `foody_green.svg`, Favicon und App-Icons stammen aus `foody_small.svg`. Das kräftige Logogrün kennzeichnet Hauptaktionen und den heutigen Tag; darauf steht dunkelgrüner Text (`#032311`) für ausreichenden Kontrast. Kleine grüne Texte, Fokusrahmen und Checkboxen verwenden das dunklere Textgrün. Ausgewählte Navigation, Filter und Kochhinweise liegen auf Mintflächen (`#d7f2e0`), Sekundärtext verwendet `#435b4c`. Farben werden als gemeinsame CSS-Variablen für alle Ansichten und Illustrationen gepflegt. Flache Flächen und ruhige Grenzen halten die Wochenplanung übersichtlich. Die Tellerillustration bleibt als Illustration erkennbar.

Desktop: sieben gleich breite Tagesbahnen im Hauptbereich und ein 294px breiter Rezeptstapel mit 24px Abstand. Tablet: Stapel unter dem Board, zwei Rezeptspalten. Handy: Wochenleiste und eine Tagesbahn; Rezeptstapel darunter. Jeder Eintrag hat eine Alternative zum Ziehen über Datumsauswahl.

Nur die kleine, abgerundete Grifflasche oben links auf dem Kartenbild startet das Ziehen. Das Punktsymbol sitzt in einer abgerundeten Aussparung am oberen linken Bildrand. Die Fläche übernimmt die Kartenfarbe und geht mit einer konkaven Rundung in das Bild über; eine zusätzliche Kopfzeile entfällt. Auf Touch-Geräten bleibt die unsichtbare Trefferfläche 44px groß. Die übrige Karte bleibt zum Lesen, Scrollen und Öffnen des Rezepts frei. Ein Klick beziehungsweise Enter auf dem Griff öffnet die Planung. Der Gerichtestapel hebt sich beim Zurückziehen eines Planeintrags als Ablageziel hervor. Dabei wird nur dieser Planeintrag entfernt; ein archiviertes Original wird bei Bedarf wiederhergestellt. Oben und unten bleiben beim Ziehen unsichtbare, 80px hohe Scrollbereiche aktiv. Dort scrollt die Seite kontinuierlich, zum äußeren Rand hin schneller; es erscheinen keine Flächen, Beschriftungen oder Pfeile. Außerhalb der Zonen, beim Loslassen oder bei Escape stoppt das Scrollen; die Scrollzonen selbst sind keine Ablageziele. Bibliothekskarten im Tab „Gerichte“ haben weder Griff noch Drag-Verhalten.

Daten: ein Haushalt, sechs vollständig ausgefüllte Beispielrezepte für zwei Portionen, vier Beispieleinträge in der ersten Startwoche. Summen und Einkaufsmengen entstehen ausschließlich aus den Einträgen. Diese Beispieldaten können über die Oberfläche archiviert beziehungsweise entfernt werden.

## Heller und dunkler Modus

Lesbarkeit: Begleittexte verwenden mindestens 13 px, Bedienelemente in der Grunddarstellung 14 px, Rezepttitel im Stapel 15 px und Formulareingaben 16 px. Ein ruhiger Zeilenabstand und kräftigere Sekundärtextfarben unterstützen beide Farbmodi. Deaktivierte Schaltflächen bleiben lesbar und sind durch Farbe und Zustand gekennzeichnet; Rezeptkarten werden beim Erscheinen nicht ausgeblendet. In schmalen Tagesbahnen dürfen Aktionen umbrechen, statt Text abzuschneiden. Die große Schrift und gemessene Seiteneinteilung des Kochmodus bleiben erhalten.

Ohne eigene Auswahl folgt die App der Systemeinstellung und reagiert auch auf deren Änderungen. Der Schalter mit Mond-/Sonnensymbol im App-Header und in den Kochwerkzeugen speichert die eigene Auswahl gerätelokal. Beide Schalter steuern dieselbe Einstellung; der Displaystatus bleibt davon unabhängig. Ist der Browserspeicher gesperrt, funktioniert der Wechsel für die laufende Sitzung weiter. Eine frühe Initialisierung vor dem ersten Zeichnen verhindert einen hellen Start bei gewähltem Darkmode.

Im Darkmode verwenden alle Ansichten, Dialoge, Zutaten, Timer und Abschlussillustrationen die gemeinsamen Farbvariablen: Hintergrund `#101a15`, Flächen `#18261f`, Mintflächen `#20362a`/`#244b33`, Text `#e6f2e9`, Sekundärtext `#bcd0c1` und helle grüne Hervorhebungen `#67df92`. Das Logogrün bleibt für Hauptaktionen erhalten. Native Eingabefelder und die Browserleiste folgen dem gewählten Modus; Rezeptfotos behalten ihre natürlichen Farben.

## Kochmodus im Vollbild

Der Displaystatus steht als Bildschirm-Symbol mit sichtbarem Text neben dem Schrittfortschritt: „Display bleibt an“ bei aktivem Wake Lock, sonst „Display kann ausgehen“. Die Anzeige ist ein Status und kein Theme-Schalter. Änderungen werden über eine höfliche Live-Region zugänglich gemacht; Sonne/Mond werden dafür nicht verwendet.

Der Kochmodus füllt den verfügbaren App-Bildschirm als nativer modaler Dialog. Die vorhandene Farbpalette und Schrift bleiben erhalten. Rezeptname und Fortschritt stehen kompakt oben, die aktuelle Anweisung trägt die größte Schrift, Zurück und Weiter bleiben am unteren Rand erreichbar. Erklärtexte und dauerhaft geöffnete Nebenbereiche entfallen.

Lange Anweisungen werden entsprechend der tatsächlich verfügbaren Textfläche auf Seiten verteilt. Zutaten und Timer öffnen eigene Ansichten im Kochmodus. Die Bedienung erfolgt über Tasten statt über Scrollen; kleine Bildschirme, Querformat und vergrößerte Darstellung werden mit Geometrieprüfungen getestet. Vollbild bezeichnet hier den verfügbaren Browser-/PWA-Inhaltsbereich; die Browserleiste wird nicht automatisch ausgeblendet.

## Mengen und Timer beim Kochen

Der Abschluss des Kochmodus zeigt eine eigene ruhige Tellerillustration mit Kräuterblatt, die große Überschrift „Guten Appetit!“ und zwei kurze Zeilen zum Servieren. Illustration und Text stehen als zusammenhängender Mittelpunkt; bei geringer verfügbarer Höhe wechseln sie nebeneinander. Die Darstellung folgt der vorhandenen Salbei-/Kräutergrünpalette und Instrument Sans, ohne Animationen oder Konfetti. „Noch einmal“ startet das Rezept erneut, „Zum Wochenplan“ schließt den Kochmodus und öffnet die Wochenübersicht. Laufende Timer bleiben im Header erreichbar.

Die Timer-Schaltfläche erscheint nur, wenn der aktuelle Rezeptschritt eine erkennbare Zeitangabe enthält oder noch ein Timer läuft, pausiert beziehungsweise abgelaufen ist. Beim Öffnen wird die erste erkannte Dauer vorausgefüllt; mehrere Dauern eines Schritts stehen in einer kompakten Auswahl. Der Start bleibt ausdrücklich manuell. Sekunden, Minuten und Stunden werden unterstützt; bei Zeitspannen gilt die längere Dauer. Nach dem Beenden verschwindet die Schaltfläche in Schritten ohne Zeitangabe. Laufende Timer werden durch einen Schrittwechsel nicht ersetzt.

Im Kochmodus sind die Scrollbalken des Vollbilddialogs, seiner Zutaten-/Timeransichten und der dahinterliegenden Seite ausgeblendet. Nach dem Schließen gilt wieder die normale Scrollbalkendarstellung der Seite. Die Seiteneinteilung hält die Kochinhalte weiterhin ohne Scrollen erreichbar.

Erkannte Zutatennamen im aktuellen Schritt erhalten die auf die gewählten Portionen skalierte Menge vorangestellt, etwa „200g Linsen“. Gewichts- und Volumeneinheiten stehen kompakt an der Zahl; Stückangaben werden als „1 Zwiebel“ dargestellt. Bereits ausgeschriebene Mengen werden nicht überschrieben oder automatisch skaliert. Bei Teilmengen wie „etwas“, „die Hälfte“ oder „den Rest“ ergänzt Foody keine Gesamtmenge. Unbekannte Mengen und mehrdeutige Namen erhalten ebenfalls keine Mengenangabe. Die gespeicherte Anleitung bleibt unverändert; die Zutatenansicht enthält die vollständige skalierte Liste.

Für die gewünschte ADHS-orientierte Lesbarkeit trennt der Kochscreen Sätze mit ruhigem Abstand. Zutaten werden semantisch mit `mark` ausgezeichnet und mit dunklem Kräutergrün, einer sanften Salbeifläche und mittlerem Schriftgewicht hervorgehoben. Keine blinkenden Hinweise, zusätzlichen Bedienelemente oder automatischen Schrittwechsel. Die Messansicht verwendet dieselben Satzblöcke und Hervorhebungen wie die sichtbare Anleitung, damit lange Texte auch mit kräftigerer Schrift ohne Scrollen vollständig erreichbar bleiben.

Die Erkennung verwendet vollständige Namen und eine kleine geprüfte Liste gebräuchlicher Varianten, etwa „Rote Linsen“/„Linsen“ und „Blattspinat“/„Spinat“. Sie ist keine freie Sprachinterpretation. Die gemessene Seiteneinteilung gilt auch für die ergänzten Mengenangaben.

Die Timeransicht verwendet dieselbe Logogrün-/Mintpalette und Instrument Sans. Ein ruhiger Uhrenring mit großer Ziffernanzeige bildet den Schwerpunkt. Zeitvorgaben, Start, Pause, Fortsetzen und Zurücksetzen sind direkt bedienbar. „Minimieren“ schließt die Timeransicht und lässt den Countdown als wieder aufklappbare Schaltfläche im Kochmodus-Header sichtbar. Endzeit, ursprüngliche Dauer und pausierte Restzeit werden gerätelokal gespeichert. Es werden keine zusätzlichen Browserberechtigungen angefordert.

Die reine PWA hat keine browserübergreifend verlässliche Schnittstelle zum Starten und Bestätigen des Standard-Geräte-Timers. Daher verwendet sie den internen Timer. Androids [Timer-Intent](https://developer.android.com/guide/components/intents-common#CreateTimer) gehört zur nativen App-Schnittstelle; [Chrome erlaubt externe Intent-Aufrufe nur für entsprechend freigegebene Activities](https://developer.chrome.com/docs/android/intents). Ein Fensterwechsel beweist keinen gestarteten Timer. Unbestätigte Deep Links und erfundene native Schnittstellen werden nicht verwendet. Der interne Timer meldet seinen Ablauf in der geöffneten App; er ersetzt keinen Hintergrundalarm des Betriebssystems.

## Zutaten bereitstellen

Die Zutatenansicht im Kochmodus ist eine Checkliste mit nativen Checkboxen und großen anklickbaren Zeilen. Mengen folgen den gewählten Portionen. Häkchen werden pro Rezept beziehungsweise Planeintrag zusammen mit dem Kochfortschritt gerätelokal gespeichert; Schließen, Seitenwechsel und Neuladen behalten sie bei. Beim Start über „Noch einmal“ werden die Häkchen zurückgesetzt. Rezeptdaten und Einkaufsliste bleiben unabhängig davon. Die Seiteneinteilung misst die tatsächlichen Checkboxzeilen, damit auch lange Namen ohne Abschneiden erreichbar bleiben. Wird eine lange Zutat auf mehrere Seiten verteilt, steuern alle Fragmente dasselbe Häkchen.

## Synchronisierung

SQLite enthält unabhängig versionierte Objekte für Rezepte, Planeinträge, zusätzliche Einkaufsartikel und Häkchen. IndexedDB speichert den lokalen Stand, ausstehende Änderungen und Konflikte. Operationen besitzen eine eindeutige Kennung; Wiederholungen nach Verbindungsabbrüchen sind idempotent. Bei Versionskonflikten werden lokaler und entfernter Stand nebeneinander angezeigt. Rezeptfassungen liegen zusätzlich unveränderlich im jeweiligen Planeintrag.

Die PWA speichert das gebaute App-Gerüst und lokal geladene Schriftdateien vorab. Gesehene Rezeptbilder werden zwischengespeichert. Timer und Kochfortschritt bleiben gerätelokal. Bei geöffneter App erfolgen Synchronisierungen nach Änderungen, beim Wiederverbinden, beim Zurückkehren und alle 15 Sekunden.
