# Prüfung der ersten vollständigen Version

Stand: 19. November 2026.

Dieser Bericht beschreibt die erste Implementierung vor dem unabhängigen Folgeaudit. Aktuelle Korrekturen, Prüfergebnisse und Commits werden in [release-gates.md](./release-gates.md) dokumentiert; die damaligen Testzahlen bleiben hier als historischer Nachweis erhalten.

## Nachweise

| Prüfung                                            | Ergebnis                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript und Produktionsbuild                    | Erfolgreich, einschließlich gebautem Service Worker und Installationsmanifest                                                                                                                                                                             |
| Fachtests                                          | 10 bestanden: Mengenumrechnung, Brüche, lokale Kalenderdaten, idempotente Änderungen, Konflikte, Rezeptfassungen, Validierung, JSON-LD und private IP-Bereiche                                                                                            |
| Browserprüfungen in Microsoft Edge                 | 9 Szenarien: automatisierte Barrierefreiheit, Planung und Kochen, Handyansicht, Pointer-Ziehen, Offline-Neuladen und Rücksynchronisierung, konkurrierende Fassungen, unveränderte Rezeptkopien und Archivieren, API-Validierung, Reihenfolge per Tastatur |
| Automatisierte Barrierefreiheit                    | Keine Axe-Verstöße auf Wochenplan und Rezepteditor; auch Kochmodus separat ohne Verstöße                                                                                                                                                                  |
| Produktionsoberfläche bei 1440, 768 und 390 Pixeln | Designinspektor: 0 Fehler, 0 Warnungen; Screenshots manuell angesehen                                                                                                                                                                                     |
| Design-Quellcodeprüfung                            | 0 Fehler; zwei begründete Warnungen: führende Null in der Timer-Uhr und Schatten ausschließlich auf der schwebenden Statusmeldung                                                                                                                         |
| Formatierung                                       | Alle geprüften Dateien entsprechen Prettier                                                                                                                                                                                                               |
| npm-Abhängigkeiten                                 | 0 bekannte Schwachstellen; korrigierte transitive Glob-/Minimatch-Versionen im Lockfile festgehalten                                                                                                                                                      |
| Echter Import                                      | [Easy pancakes bei BBC Good Food](https://www.bbcgoodfood.com/recipes/easy-pancakes): Titel, sechs Zutaten, fünf Schritte, Ausbeute und Quelle erfolgreich erkannt; keine fremden Rezeptinhalte als Beispieldaten gespeichert                             |

## Gestaltungsprüfung

Richtung: Editorial greeting, Seed 747695860, Instrument Sans. Das Gesicht des Produkts sind salbeifarbene Küchenflächen, Topf-mit-Blatt-Marke, erkennbare Tellerillustrationen und die sieben Tagesbahnen mit wiederverwendbarem Rezeptstapel. Keine Neuziehung.

Runde 1: Die Wochenstruktur ist sofort erkennbar; zu viele kleine Beschriftungen. Beschriftungen vergrößert und Rezeptstapel in seiner eigenen scrollbaren Fläche verkürzt.

Runde 2: Desktop gut lesbar, auf dem Tablet waren lange Gerichtnamen und Aktionen in sieben schmalen Spalten gedrängt. Tablet bis 900 Pixel auf die Tagesansicht mit Wochenleiste umgestellt. Auf dem Handy Kopfbereich kompakter angeordnet.

Runde 3: Desktop zeigt Board, Stapel und direkten Kochzugriff im ersten Bildschirm. Auf Tablet und Handy stehen Wochenleiste und aktueller Tag vor dem Stapel. Gleichmäßige Außenabstände, sichtbare Aktionen, keine seitlich abgeschnittenen Inhalte. Kochmodus zusätzlich bei 1440 und 390 Pixeln angesehen; große Schritttexte und Navigation bleiben erreichbar.

Eigene Bewertung: Gestaltung 7,5; Bedienung 8; Eigenständigkeit 7; Inhalt 8; gewichtet 7,6/10. Die Teller sind bewusst Illustrationen; individuelle Rezeptfotos lassen sich ergänzen. Die Bild- und Bewegungsvorgaben für Marketingseiten wurden nicht auf diese Arbeitsoberfläche übertragen.

## Modern Web Guidance

- **dialog:** Native modale Dialoge mit `showModal()`, benannt über ihre Überschrift, mit normalem Escape-Verhalten und Scroll-Begrenzung auf Dialog und Hintergrund. Keine zweite Fokusfalle. Angewandte Regel: “Use the native `<dialog>` element”.
- **accessibility:** Sichtbare Beschriftungen und zugängliche Namen stimmen überein; Änderungen werden über eine Statusmeldung angekündigt, Formulare besitzen Labels und sichtbaren Fokus. Angewandte Regel: “Do include a control's visible text in its accessible name”.
- **drag-and-drop:** Ein eigener Ziehgriff hält den übrigen Inhalt scrollbar. Tages- und Reihenfolgeauswahl bieten eine tatsächlich mit Tastatur geprüfte Alternative. Die Reihenfolge kommt aus den Daten und dem DOM, nicht aus CSS `order`. Angewandte Regel: “Provide a keyboard-accessible alternative to pointer reordering.” Der Einachsen-Guide wurde nicht als vollständige Lösung für das Verschieben zwischen Tagescontainern behandelt.

Importformat: [Schema.org Recipe](https://schema.org/Recipe). Display-Wachhalten folgt der [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API), mit Anzeige bei fehlender Unterstützung und erneuter Anforderung beim Zurückkehren in den Vordergrund.

## Grenzen

Die Browserprüfung fand in Edge statt; echte Installation und Bedienung in iOS/Safari sind noch nicht separat geprüft. Auf anderen Geräten benötigen Installation und Offline-Service-Worker eine HTTPS-Adresse. Import funktioniert für auslesbare strukturierte Rezeptdaten, nicht für jede Website. Geschlossene Apps synchronisieren beim nächsten Öffnen; Timer zeigen ihren Ablauf innerhalb der geöffneten App an. Die App besitzt wie vereinbart keine Benutzerkonten. Betrieb und Datensicherung sind in der [Startanleitung](../README.md) beschrieben.

## Selbstprüfung

| Achse                       | Wert | Beleg und konkrete Verbesserungsmöglichkeit                                                                                                             |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Korrektheit                 | 4/5  | Fach- und Browserprüfungen bestanden; eine echte iOS-/Safari-Prüfung würde die verbleibende Browserunsicherheit reduzieren.                             |
| Vollständigkeit             | 4/5  | Alle vereinbarten Abläufe implementiert; zusätzliche reale Rezeptseiten würden die Abdeckung von Varianten strukturierter Daten erhöhen.                |
| Verständlichkeit            | 4/5  | Getrennte UI-Komponenten, gemeinsame Datenregeln und Betriebsanleitung; das große Wochenplan-Rendering ließe sich weiter in eigene Ansichten aufteilen. |
| Nutzbarkeit des Ergebnisses | 5/5  | Lokale Vorschau, reproduzierbare npm-Befehle, fertiger Produktionsbuild und dokumentierte Konfiguration liegen vor.                                     |
| Kürze                       | 4/5  | Oberfläche auf Planen und Kochen konzentriert; die CSS-Regeln könnten bei einer Folgeüberarbeitung stärker zusammengeführt werden.                      |

Gesamt: 4,2/5. Keine blockierende Lücke in den vereinbarten Abläufen gefunden. Die Einschätzung ist an überprüfbare Ergebnisse gebunden; reale Safari-Installation und weitere Importseiten sind die nächsten sinnvollen ergänzenden Prüfungen.
