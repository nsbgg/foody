# KI-Anbindung über MCP

Im **Account-Menü → KI-Verbindungen → KI verbinden** eine Verbindung für den aktiven Haushalt erstellen. Lesen ist vorausgewählt; Schreibrechte müssen pro Bereich ausdrücklich aktiviert werden. Der einmalig angezeigte Schlüssel wird beim Schließen des Menüs ausgeblendet. Die Konfiguration vorher kopieren und im MCP-Client hinterlegen. Der Schlüssel funktioniert ohne Browser-Anmeldung; nicht in Chats, Screenshots oder Git ablegen.

## Verbindung

- Transport: zustandsloses **Streamable HTTP**, JSON-Antworten, `POST /api/mcp`.
- Authentifizierung: `Authorization: Bearer <MCP-Schlüssel>`.
- Nur MCP-Clients mit HTTP und eigenen Authorization-Headern werden unterstützt. OAuth-Clients ohne eigene Header sind nicht kompatibel.
- Beispielkonfiguration; das Konfigurationsformat hängt vom Client ab:

```json
{
  "mcpServers": {
    "foody": {
      "type": "http",
      "url": "http://localhost:4307/api/mcp",
      "headers": {
        "Authorization": "Bearer <MCP-Schlüssel>"
      }
    }
  }
}
```

Die Oberfläche kopiert ihre aktuelle Herkunft als Adresse; im Entwicklungsbetrieb wird `/api` über Vite an das Backend weitergeleitet. Auf einem anderen Rechner verweist `localhost` auf diesen anderen Rechner. Entfernte Clients benötigen die erreichbare HTTPS-Adresse dieser Foody-Installation und passende `ALLOWED_HOSTS`. Es wird kein Cloud-Dienst eingerichtet. Browser-CORS bleibt geschlossen; Server-Clients benötigen keine CORS-Freigabe. Der Backend-Host bleibt standardmäßig `127.0.0.1`.

## Werkzeuge

| Werkzeug                          | Recht             | Funktion                                                     |
| --------------------------------- | ----------------- | ------------------------------------------------------------ |
| `recipes_list`, `recipes_get`     | `recipes:read`    | Rezepte suchen und lesen                                     |
| `recipes_add`                     | `recipes:write`   | Bis zu 20 Rezepte hinzufügen                                 |
| `recipes_update`                  | `recipes:write`   | Rezeptinhalte bearbeiten                                     |
| `recipes_update` mit `archived`   | `recipes:delete`  | Archivieren und wiederherstellen                             |
| `plan_list`                       | `plan:read`       | Wochenplan auslesen                                          |
| `plan_add`, `plan_update`         | `plan:write`      | Einplanen, verschieben und Portionen ändern                  |
| `plan_remove`                     | `plan:delete`     | Aus dem Wochenplan entfernen                                 |
| `shopping_list`                   | `shopping:read`   | Einkaufsartikel mit Mengen und Häkchen auslesen              |
| `shopping_add`, `shopping_update` | `shopping:write`  | Artikel ergänzen, abhaken und zusätzliche Artikel umbenennen |
| `shopping_update` mit `deleted`   | `shopping:delete` | Artikel entfernen und wiederherstellen                       |

Lese-, Schreib- und Löschrechte werden pro Bereich unabhängig vergeben und serverseitig geprüft. Reine Löschrechte erlauben keine Inhaltsbearbeitung. Kombinierte Änderungen erfordern alle betroffenen Rechte. Bestehende Verbindungen erhalten keine Löschrechte automatisch; bei Bedarf eine neue Verbindung mit den passenden Rechten erstellen. Für die praktische Arbeit auch Leserechte aktivieren, damit die KI IDs und Revisionen auslesen kann.

`days: null` bedeutet bei der Schlüsselanlage unbegrenzte Gültigkeit; `expiresAt: null` kennzeichnet sie in Antworten. Intern wird dafür der Wert 0 in der vorhandenen Datenbankspalte verwendet. Auch unbegrenzte Schlüssel zählen zum Verbindungslimit und bleiben widerrufbar. Mitgliedschaftsprüfungen gelten weiterhin.

Die KI extrahiert Rezepttexte selbst in die strukturierten Felder; der MCP-Server führt keine beliebigen URLs aus und lädt keine externen Bilder herunter.

## Änderungen und Wiederholungen

Datumswerte sind `YYYY-MM-DD`, Wochen beginnen montags. Listen liefern IDs und Revisionen. Änderungen erfordern `expectedRev` und eine neue UUID als `requestId`. Bei einem Konflikt zuerst neu lesen und die Änderung prüfen. Beim Wiederholen einer identischen Anfrage dieselbe UUID verwenden. Neue Rezepte, Planeinträge und zusätzliche Artikel erhalten eine vom Client erzeugte UUID als `id`; sie dient gleichzeitig der Wiederholungserkennung.

Sammelanlagen liefern ein Ergebnis pro Artikel/Rezept und sind keine gemeinsame Transaktion. Bereits gespeicherte Ergebnisse nicht mit neuen IDs erneut hinzufügen. Geplante Gerichte sind Kopien: Eine Rezeptänderung verändert vorhandene Planeinträge nicht rückwirkend. Geänderte Portionszahlen passen die Einkaufsmenge an. Entfernte automatisch erzeugte Zutaten werden nur für die betreffende Woche ausgeblendet; Rezept und Zutaten bleiben erhalten. `shopping_list(includeDeleted: true)` ermöglicht das Wiederherstellen solcher Artikel, solange das Gericht noch in der Woche eingeplant ist. Entfernen muss die KI vorher mit dem Nutzer abstimmen; die MCP-Hinweise sind keine technische Bestätigungssperre.

## Sicherheit

Schlüssel sind zufällige 256-Bit-Werte und werden nur als SHA-256-Hash gespeichert. Sie gehören einem Nutzer und genau einem Haushalt, haben eine wählbare Laufzeit von 1 bis 90 Tagen oder sind ausdrücklich unbegrenzt gültig und können einzeln widerrufen werden. Die Freigabe eines neuen Schlüssels verlangt eine Anmeldung innerhalb der letzten zehn Minuten. Bei älteren Sitzungen erscheint direkt im Account-Menü eine Bestätigung per Passwort oder Passkey; danach wird die Verbindung automatisch mit den gewählten Einstellungen erstellt. Ein Passkey muss zum aktuell angemeldeten Account gehören. Widerruf ist auch ohne erneute Bestätigung möglich. Jede MCP-Anfrage prüft die aktuelle Mitgliedschaft, den Ablauf und den Widerruf. Entfernte Mitglieder verlieren ihren Zugriff sofort. Ein Schlüssel kann keine Haushalte, Mitglieder, Passkeys oder andere Schlüssel verwalten.

Verwaltungsendpunkte verwenden weiterhin Browser-Sitzung, CSRF-Prüfung und explizite Haushaltsauswahl. MCP verwendet ausschließlich den Bearer-Schlüssel, niemals eine Browser-Sitzung als Ersatz. Host-/Origin-Prüfungen gelten weiter. Antworten werden nicht gecacht; die API ist vom Service-Worker-Cache ausgeschlossen. Es gilt eine zusätzliche Begrenzung von 120 MCP-Anfragen pro Nutzer und Minute. Texte aus Rezepten bleiben nicht vertrauenswürdige Daten und dürfen vom KI-Client nicht als Anweisungen ausgeführt werden.

Verifikation: echte SDK-Clienttests für Rezept-Sammelanlage, Konflikte, Wiederholungen, Planung, Einkaufslisten und Widerruf; Unit-Tests für Hash-Speicherung, Ablauf und Haushaltsgrenzen; Account-Menü-Browsertest. Die Implementierung folgt dem [offiziellen SDK-Beispiel für zustandsloses Streamable HTTP](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStatelessStreamableHttp.ts).
