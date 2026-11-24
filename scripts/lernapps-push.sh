#!/usr/bin/env bash
# Lernapp (HTML oder ZIP) hochladen bzw. aktualisieren – für Skripte, Terminal und CI.
#
#   export LERNAPPS_URL=https://eure-schule.de/lernapps
#   export LERNAPPS_CODE=<Kollegiums-Code oder Admin-Code>
#   ./lernapps-push.sh meine-app.zip --key bruchrechnen --title "Bruchrechnen" --subject Mathe --grade 5-6 \
#                      [--description "…"] [--tags "Bruch, Übung"] [--author "Frau Beispiel"]
#
# Beim ersten Aufruf wird die App angelegt; der Besitzer-Token wird in ~/.lernapps-tokens gemerkt.
# Jeder weitere Aufruf mit demselben --key ersetzt die Dateien (Link und QR-Code bleiben gleich).
set -euo pipefail

die() { echo "Fehler: $*" >&2; exit 1; }
[ $# -ge 1 ] || die "Aufruf: $0 <datei.html|datei.zip> --key NAME [--title T --subject F --grade K ...]"
file=$1; shift
[ -f "$file" ] || die "Datei nicht gefunden: $file"
url=${LERNAPPS_URL:-}; code=${LERNAPPS_CODE:-}
[ -n "$url" ] || die "LERNAPPS_URL fehlt"; [ -n "$code" ] || die "LERNAPPS_CODE fehlt"
url=${url%/}

key=; declare -a fields=()
while [ $# -gt 0 ]; do
  case $1 in
    --key) key=${2:?}; shift 2 ;;
    --title|--subject|--grade|--description|--tags|--author) fields+=(--form-string "${1#--}=${2:?}"); shift 2 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done
[ -n "$key" ] || die "--key fehlt (stabiler Name der App, z. B. bruchrechnen)"

tokfile=${LERNAPPS_TOKENS:-$HOME/.lernapps-tokens}
token=
[ -f "$tokfile" ] && token=$(awk -v u="$url" -v k="$key" '$1==u && $2==k {print $3}' "$tokfile" | tail -n1)

args=(-sS -X POST "$url/api.php?r=apps" -H "X-Code: $code" --form-string "key=$key" -F "file=@$file" "${fields[@]}")
[ -n "$token" ] && args+=(-H "X-Owner-Token: $token")

resp=$(curl "${args[@]}" -w $'\n%{http_code}') || die "Server nicht erreichbar"
status=${resp##*$'\n'}; body=${resp%$'\n'*}
field() { printf '%s' "$body" | grep -o "\"$1\":\"[^\"]*\"" | head -n1 | cut -d'"' -f4; }

case $status in
  201)
    id=$(field id); tok=$(field ownerToken)
    umask 077; echo "$url $key $tok" >> "$tokfile"
    echo "✔ Angelegt: $url/a/$id/" ;;
  200)
    echo "✔ Aktualisiert: $url/a/$(field id)/" ;;
  *)
    die "HTTP $status – $(field error)" ;;
esac
