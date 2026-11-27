# Rezepte teilen

Einzelne Rezepte oder bis zu 20 ausgewählte Rezepte werden als unveränderliche Momentaufnahme geteilt. Spätere Änderungen am Original beeinflussen die Freigabe nicht. Geplante Mahlzeiten, Einkaufslisten und private Haushaltsdaten werden nicht mitgeteilt.

## Ziele und Ablauf

- **Link für Gäste:** Ohne Account lesbar. Jeder mit dem vollständigen Link kann ausschließlich die ausgewählten Rezepte bis zum Ablauf ansehen.
- **Person:** Der vollständige Link und ein angemeldeter Account mit der angegebenen E-Mail-Adresse sind nötig. Es wird keine automatische E-Mail verschickt. Die Erstellung verrät nicht, ob ein Account existiert. Da E-Mail-Adressen noch nicht verifiziert sind, gibt es bewusst keinen E-Mail-basierten Freigabe-Posteingang.
- **Eigener anderer Haushalt:** Der Link ist nur für Mitglieder dieses Zielhaushalts lesbar. Der erstellende Account muss beiden Haushalten angehören. Zum Teilen an andere Haushalte wird ein Personen- oder Gastlink verschickt; angemeldete Empfänger wählen beim Übernehmen einen eigenen Haushalt.

Links gelten 1 bis 30 Tage (Standard: 7 Tage) und sind jederzeit durch Mitglieder des Quellhaushalts widerrufbar. Das Entfernen der erstellenden Person aus dem Quellhaushalt widerruft ihre Links dauerhaft, auch bei späterem Wiedereintritt. Bereits angelegte Kopien bleiben im Zielhaushalt erhalten.

Angemeldete Empfänger können die gesamte Auswahl ausdrücklich in einen Haushalt übernehmen, dem sie angehören. Die Kopien erhalten neue IDs. Ein erneutes Übernehmen derselben Freigabe in denselben Haushalt erzeugt keine Duplikate. Batch und Übernahmebeleg werden in derselben SQLite-Transaktion geschrieben.

## Sicherheitsgrenzen

- 32 kryptografisch zufällige Bytes; ausschließlich SHA-256-Hash des Link-Geheimnisses gespeichert. Das Geheimnis wird nur bei der Erstellung zurückgegeben.
- Der Client verwendet `/share#<Geheimnis>` und überträgt das Geheimnis ausschließlich im JSON-Body. Es gehört weder in Suchparameter, Logs, Analytics noch in dauerhafte Browser-Speicher.
- Gastansichten liefern nur Rezeptdaten, Anzahl und Ablauf; keine E-Mail-Adressen, Mitglieder, Quellhaushaltsnamen oder Quellrezept-IDs.
- Jede Vorschau und Übernahme prüft Ablauf, Widerruf, Quellmitgliedschaft und gegebenenfalls Zielbindung erneut.
- Die Übernahme verlangt Anmeldung, CSRF-Prüfung und Zielmitgliedschaft. Der anonyme Vorschau-Endpunkt ist ausschließlich lesend, begrenzt Anfragen pro IP und erzeugt keine anonymen Sessions.
- Höchstens 8 MiB Snapshot-Daten pro Freigabe, höchstens 30 aktive Freigaben pro Quellhaushalt. Abgelaufene/widerrufene Freigaben werden bei der nächsten Erstellung entfernt. Externe Bildadressen werden nicht serverseitig abgerufen; die Freigabe enthält dieselben HTTP(S)-Bilder und eingebetteten JPEG-Bilder wie das ausgewählte Rezept. Bildinhalte können persönliche Informationen enthalten und sollten vor dem Teilen geprüft werden.

## API

Alle Antworten sind `Cache-Control: no-store`. Verwaltungsrouten liegen hinter der normalen API-Anmeldung, Herkunftsprüfung, CSRF- und Benutzerbegrenzung.

- `POST /api/households/:householdId/recipe-shares`: `{recipeIds, target, expiresInDays}` → `{share, token}`. Ziel: `{kind:"guest"}`, `{kind:"user",email}` oder `{kind:"household",householdId}`.
- `GET /api/households/:householdId/recipe-shares`: `{shares}` ohne Geheimnisse.
- `DELETE /api/households/:householdId/recipe-shares/:shareId`: Widerruf, `204`.
- `POST /api/recipe-shares/resolve`: `{token}` → `{id,recipeCount,createdAt,expiresAt,recipes}`. Nur Gastfreigaben funktionieren anonym. Nach erfolgreicher Autorisierung enthalten haushaltsgebundene Freigaben zusätzlich `targetHouseholdId`; die Oberfläche legt damit den einzig zulässigen Zielhaushalt fest. Gast- und Personenfreigaben enthalten dieses Feld nicht.
- `POST /api/recipe-shares/:shareId/accept`: `{token,householdId}` → `{recipeIds,alreadyAccepted}`.

Die öffentlichen Routen werden nach Sicherheits- und JSON-Middleware, aber vor der globalen API-Anmeldesperre installiert. Verwaltende Routen werden nach dieser Sperre installiert.
