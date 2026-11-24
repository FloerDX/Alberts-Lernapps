# Schnittstelle (API) – Apps hochladen und aktualisieren

Gilt für die **PHP-Variante** (Strato). Der Node-Server hat nur die Grundfunktionen (anlegen, ändern von Metadaten, löschen) und kein Ersetzen von Dateien per `key`.

Basis-URL: `https://eure-schule.de/lernapps` – alle Aufrufe gehen an `api.php?r=<route>`.
Antworten sind JSON. Fehler haben die Form `{"error":"…"}` mit passendem HTTP-Status.

## Zugriff

| Header | Bedeutung |
|---|---|
| `X-Code: <Code>` | Kollegiums-Code (anlegen) oder Admin-Code (alles) – aus `config.php` |
| `X-Owner-Token: <Token>` | Besitzer-Token einer App. Wird beim Anlegen **einmalig** zurückgegeben. Berechtigt zum Ändern genau dieser App |

Nach 5 falschen Codes sperrt der Server die IP-Adresse 15 Minuten (HTTP 429).
Die Schnittstelle ist bewusst nicht für fremde Webseiten freigegeben (kein CORS); sie ist für Skripte, Terminal und Server gedacht. Den Code nie in öffentlichen Seiten oder Repos ablegen.

## Routen

### App anlegen – `POST api.php?r=apps` (multipart/form-data)
Header: `X-Code`

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `file` | ja | `.html` oder `.zip` (mit `index.html` im Hauptordner) |
| `title`, `subject`, `grade` | ja | Titel, Fach, Klasse (z. B. `5` oder `5-6`) |
| `description`, `tags`, `author` | nein | Tags kommagetrennt |
| `key` | nein | Stabiler Name (`a-z`, `0-9`, `-`, max. 40). Ermöglicht späteres Aktualisieren mit demselben Namen |

Antwort `201`: App-Objekt mit `id`, … und **`ownerToken`** (sicher aufbewahren) sowie `skipped` (übersprungene Dateien).
Die App ist danach unter `<Basis-URL>/a/<id>/` erreichbar.

### App aktualisieren – zwei gleichwertige Wege
Header: `X-Owner-Token` (oder `X-Code` mit dem Admin-Code)

1. **Per `key`:** `POST api.php?r=apps` wie beim Anlegen, mit demselben `key`. Existiert die App schon, wird sie aktualisiert (Antwort `200`).
   Dafür braucht es zusätzlich zum Kollegiums-Code den `X-Owner-Token` (sonst `403`).
2. **Per ID:** `POST api.php?r=replace&id=<id>` mit beliebigen der Felder oben.

Beim Aktualisieren gilt: Wird `file` mitgeschickt, ersetzt es **alle** Dateien der App (die alte Version bleibt bei einem Fehler erhalten). Nicht mitgeschickte Felder bleiben unverändert. `id`, Link und QR-Code bleiben gleich. Antwort `200` mit `updated` (Zeitstempel) und `fileReplaced`.

### Weitere Routen
| Route | Zweck |
|---|---|
| `GET api.php?r=apps` | Liste aller Apps (ohne Tokens) |
| `GET api.php?r=config` | Upload-Limit in MB (`maxMb`) |
| `POST api.php?r=update&id=<id>` | Nur Metadaten, JSON-Body `{"title":…,"subject":…,"grade":…,"description":…,"tags":"a, b"}` |
| `POST api.php?r=delete&id=<id>` | App löschen (Owner-Token oder Admin-Code) |
| `POST api.php?r=check` | Code prüfen: `{"ok":true,"admin":false}` |

## Beispiele (curl)

```bash
URL=https://eure-schule.de/lernapps

# neu anlegen (Token aus der Antwort speichern!)
curl -X POST "$URL/api.php?r=apps" -H "X-Code: $KOLLEGIUMS_CODE" \
  -F key=bruchrechnen -F title="Bruchrechnen" -F subject=Mathe -F grade=5-6 \
  -F file=@bruchrechnen.zip

# aktualisieren (gleicher key + Token)
curl -X POST "$URL/api.php?r=apps" -H "X-Code: $KOLLEGIUMS_CODE" -H "X-Owner-Token: $TOKEN" \
  -F key=bruchrechnen -F file=@bruchrechnen.zip

# nur Beschreibung ändern, per ID
curl -X POST "$URL/api.php?r=replace&id=$ID" -H "X-Owner-Token: $TOKEN" -F description="Neu"
```

## Fertiges Skript

`scripts/lernapps-push.sh` erledigt das inklusive Token-Verwaltung (`~/.lernapps-tokens`):

```bash
export LERNAPPS_URL=https://eure-schule.de/lernapps
export LERNAPPS_CODE=…
./scripts/lernapps-push.sh bruchrechnen.zip --key bruchrechnen --title "Bruchrechnen" --subject Mathe --grade 5-6
# später nach Änderungen einfach erneut aufrufen – aktualisiert dieselbe App
```

## Grenzen
- Upload-Größe: siehe `check.php` bzw. `GET …?r=config` (PHP-Limit und `max_mb`).
- Erlaubte Dateitypen im ZIP: html, css, js, json, Bilder, Audio, Video, Schriften u. a. Anderes (z. B. `.php`) wird übersprungen.
- Der Token ist nicht wiederherstellbar. Geht er verloren, kann nur der Admin-Code die App noch ändern.
