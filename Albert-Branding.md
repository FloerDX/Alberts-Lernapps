# Albert-Branding: „Alberts Lernapps“ (Albert-Schweitzer-Schule Frankenthal)

**Was es ist:** Eine Web-App (PWA), in der Lehrkräfte HTML-Lernapps nach Fach und Klasse organisieren, durchsuchen, teilen und hochladen. Sie liegt in diesem Repo im Ordner `public/`. Geplant ist der Betrieb unter `eure-schule.de/lernapps/`, neben der WordPress-Schulwebsite.

**Quelle des Designs:** Übernommen aus der echten Schul-Website `albert-schweitzer-schule-frankenthal.de` (WordPress, Kadence-Theme). Ein offizielles Styleguide-Dokument gibt es nicht.

## Farben (Light)

| Rolle | Hex |
|---|---|
| Primärblau (Buttons, Überschriften, Akzentlinien) | `#1f4e79` |
| Hellblau (Kartenoberkante, Hover, sekundär) | `#4f7ea8` |
| Text | `#1f2933` |
| Gedämpfter Text | `#5b6770` |
| Seitenhintergrund | `#fafaf8` |
| Karten | `#ffffff` |
| Heller Blauton für Flächen (Tags, Begrüßungsbox) | `#eef3f8` |
| Linien und Ränder | `#d9e2ec` |
| Akzent Amber (Streifen an der Begrüßung) | `#f5a524` |
| Suchtreffer-Markierung | `#fdd79a` |
| Fehler | `#b82105` |

## Farben (Dark Mode, automatisch per `prefers-color-scheme`)

Hintergrund `#0f1a24`, Karten `#172531`, Text `#e6edf3`, gedämpft `#9fb0c0`, Linien `#2a3d4f`, Flächen `#1c2f40`, Primär (Buttons) `#4f7ea8` mit weißem Text, Überschriften `#9cc3e8`.

Alle Werte stehen als CSS-Variablen im Block `:root` am Anfang von `public/style.css`.

## Schrift

Systemschrift wie auf der Schul-Website:
`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif`.

Es werden bewusst **keine** Google Fonts oder andere externe Dienste geladen (Datenschutz). Titel und Überschriften sind kursiv und halbfett, so wie der Seitentitel der Schul-Website.

## Logo und Bildmaterial (alles in `public/`)

- **`logo.png`:** Das Schullogo, 480 px breit, transparenter Hintergrund. Es zeigt das Porträt in einem Kreis, den Schriftzug „Albert Schweitzer Schule Frankenthal“ und einen kleinen Brunnen. Farbe: sehr dunkles Marineblau (`#012748`). Im Dark Mode wird es per CSS-Filter (`brightness(0) invert(1)`) weiß dargestellt. Es sitzt links oben im Kopf, 54 px hoch.
- **`albert-head.png`:** Freundliche Zeichnung eines älteren Herrn mit weißem Schnurrbart, Kopf und Schultern, transparenter Hintergrund. Das ist das Maskottchen „Albert“. Es erscheint in der Begrüßungsbox rechts, am unteren Rand angeschnitten.
- **`icon-192.png` und `icon-512.png`:** Alberts Kopf auf `#eef3f8`, für den Homescreen.
- Das Original der Albert-Zeichnung (ganze Figur, schwarzer Hintergrund) liegt nicht im Repo, nur diese freigestellten Ausschnitte.
- Logo-Quelle: `https://albert-schweitzer-schule-frankenthal.de/wp-content/uploads/2026/06/cropped-Logo_ASS_blau.png`

## Stil der Oberfläche

- Ruhig, hell und flach, ohne Comic-Effekte (ausprobiert und wieder verworfen).
- **Karten:** weiß, 1 px Rand `#d9e2ec`, 14 px Rundung, 4 px Linie in Hellblau oben, zarter Schatten, leichtes Anheben beim Darüberfahren.
- **Buttons:** Primärblau gefüllt, 10 px Rundung. Filter-Chips sind rund und werden bei Auswahl blau gefüllt.
- **Kopfzeile:** weiß, 4 px blaue Linie ganz oben, darunter ein dünner Rand.
- **Begrüßungsbox:** Hellblau-Fläche, Amber-Streifen links, Überschrift kursiv in Blau, Albert rechts.
- Mobil zuerst (ab 390 px geprüft), automatischer Dark Mode.

## Ton

Duzen, freundlich und einfach, auf Deutsch und kurz. Die Begrüßung lautet:

> Hallo! Ich bin Albert. Hier findest du Lernapps für jedes Fach und jede Klasse. Wähle ein Fach, suche ein Thema oder teile eine App mit deiner Klasse.

## Freigaben und Vorgaben

- **Logo:** Die Nutzung des Schullogos in der App ist von der Schule erlaubt.
- **Albert-Zeichnung:** Die Nutzung ist ebenfalls erlaubt.
- **Weitere Vorgaben:** Die Schule hat keine weiteren Branding-Vorgaben, zum Beispiel keine festen Schriften oder Farbregeln über das oben Beschriebene hinaus. Alles Weitere ist frei gestaltbar, solange es zu dem ruhigen, hellen und blauen Stil passt.
