# Lernapps

Organizer für HTML-Lernapps: nach Fach und Klasse filtern, durchsuchen, per Link/QR teilen.
Kollegium kann Apps hochladen. Installierbar als PWA (Homescreen), kein Store/Sideloading nötig.

## Starten
```
npm install
TEACHER_CODE=meincode ADMIN_CODE=geheim npm start   # http://localhost:3000
```
| Variable | Bedeutung | Standard |
|---|---|---|
| `TEACHER_CODE` | Code zum Hochladen (ans Kollegium weitergeben) | `kollegium` |
| `ADMIN_CODE` | darf alle Apps bearbeiten/löschen | `admin` |
| `DATABASE_URL` | Postgres/Supabase-Verbindungsstring (aktiviert DB-Speicher) | – |
| `DATA_DIR` | nur ohne `DATABASE_URL`: Speicherort – **persistent halten/sichern** | `./data` |
| `APPS_ORIGIN` | optional: eigene (Sub-)Domain nur für Apps, z. B. `https://apps.schule.de` | – |
| `MAX_MB` | max. Upload-Größe (HTML oder ZIP) | `20` |
| `MAX_UNZIPPED_MB` | max. entpackte Größe eines ZIPs | `50` |
| `BASE_PATH` | optional: Betrieb unter einem Unterpfad der Schul-Website, z. B. `/lernapps` | – |

**Standardcodes unbedingt ändern.**

## Upload
Einzelne `.html`-Datei oder `.zip` (mit `index.html` im Hauptordner; ein umschließender Ordner wird automatisch entfernt).
Erlaubt sind übliche Web-Dateitypen (html, css, js, Bilder, Audio/Video, Fonts, json …); anderes (z. B. `.php`) wird übersprungen.

## Speicher
- **Mit `DATABASE_URL`** (Postgres, z. B. Supabase): Metadaten und alle Dateien liegen in der Datenbank (Schema `lernapps`, RLS aktiv). Tabellen werden beim Start automatisch angelegt. Keine Festplatte nötig.
- **Ohne `DATABASE_URL`**: lokale Dateien in `DATA_DIR` (dann Persistent Disk bzw. Backup nötig).

## Deployment auf Render + Supabase
1. **Supabase:** Projekt öffnen (oder neues anlegen) → *Connect* → **Session pooler**-Verbindungsstring kopieren (`…pooler.supabase.com:5432`) und `[YOUR-PASSWORD]` ersetzen (Sonderzeichen URL-kodieren). Der „Direct connection"-String funktioniert von Render aus oft nicht (nur IPv6).
2. **Render:** *New → Blueprint* → dieses Repo wählen (nutzt `render.yaml`). `DATABASE_URL`, `TEACHER_CODE`, `ADMIN_CODE` eintragen.
3. *Settings → Custom Domains*: `lernapps.eure-schule.de` eintragen und den CNAME bei der Domain anlegen.
4. In WordPress einen Menüpunkt mit diesem Link anlegen.

Hinweis Free-Plan: Der Dienst schläft nach ca. 15 Min. Inaktivität; der erste Aufruf dauert dann etwa eine Minute. Supabase-Free-Projekte werden nach längerer Inaktivität pausiert (ca. 1 Woche) – im Dashboard wieder starten.

## In die Schul-Website einbinden
- **Subdomain** (empfohlen): z. B. `lernapps.schule.de` per DNS auf den Server zeigen lassen.
- **Unterpfad**: Reverse-Proxy (nginx/Apache) von `schule.de/lernapps/` an den Server, dazu `BASE_PATH=/lernapps`.
- **Einbetten**: per `<iframe>` oder als Link/Button auf der bestehenden Seite.
Der Server braucht Node.js 18+; auf reinem PHP-/Shared-Hosting läuft er nicht.

## Sicherheit
Hochgeladene Apps laufen per CSP-`sandbox` ohne Zugriff auf den Organizer. Folge: `localStorage`/Cookies
funktionieren in den Apps nicht. Wer das braucht, hostet die Apps auf einer eigenen Domain (`APPS_ORIGIN`)
und entfernt dort die Sandbox-Einschränkung.
Ersteller:innen können ihre eigenen Uploads bearbeiten/löschen (Token im Browser), der Admin-Code alle.
