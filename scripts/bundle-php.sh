#!/usr/bin/env bash
# Baut das Upload-Paket für Strato: dist/lernapps/ und dist/lernapps-strato.zip
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/lernapps
cp -r public/. dist/lernapps/
cp php/api.php php/serve.php php/lib.php php/check.php php/config.sample.php dist/lernapps/
cp php/htaccess.txt dist/lernapps/.htaccess
(cd dist && zip -qr lernapps-strato.zip lernapps)
echo "Fertig: dist/lernapps-strato.zip"
