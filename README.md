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
| `DATA_DIR` | Speicherort (apps.json + Dateien) – **persistent halten/sichern** | `./data` |
| `APPS_ORIGIN` | optional: eigene (Sub-)Domain nur für Apps, z. B. `https://apps.schule.de` | – |
| `MAX_MB` | max. Upload-Größe | `5` |

**Standardcodes unbedingt ändern.**

## Sicherheit
Hochgeladene Apps laufen per CSP-`sandbox` ohne Zugriff auf den Organizer. Folge: `localStorage`/Cookies
funktionieren in den Apps nicht. Wer das braucht, hostet die Apps auf einer eigenen Domain (`APPS_ORIGIN`)
und entfernt dort die Sandbox-Einschränkung.
Ersteller:innen können ihre eigenen Uploads bearbeiten/löschen (Token im Browser), der Admin-Code alle.
