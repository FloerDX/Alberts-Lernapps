<?php
// Gemeinsame Funktionen für api.php und serve.php.
declare(strict_types=1);

const ALLOWED_EXT = ['html','htm','css','js','mjs','json','txt','csv','xml','png','jpg','jpeg','gif','webp','svg','ico','avif','mp3','wav','ogg','m4a','mp4','webm','woff','woff2','ttf','otf','wasm','md'];
const MIME = [
    'html'=>'text/html; charset=utf-8','htm'=>'text/html; charset=utf-8','css'=>'text/css; charset=utf-8',
    'js'=>'text/javascript; charset=utf-8','mjs'=>'text/javascript; charset=utf-8','json'=>'application/json; charset=utf-8',
    'txt'=>'text/plain; charset=utf-8','csv'=>'text/csv; charset=utf-8','xml'=>'application/xml; charset=utf-8','md'=>'text/plain; charset=utf-8',
    'png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','gif'=>'image/gif','webp'=>'image/webp','svg'=>'image/svg+xml',
    'ico'=>'image/x-icon','avif'=>'image/avif','mp3'=>'audio/mpeg','wav'=>'audio/wav','ogg'=>'audio/ogg','m4a'=>'audio/mp4',
    'mp4'=>'video/mp4','webm'=>'video/webm','woff'=>'font/woff','woff2'=>'font/woff2','ttf'=>'font/ttf','otf'=>'font/otf','wasm'=>'application/wasm',
];

function cfg(): array {
    static $c = null;
    if ($c !== null) return $c;
    $file = __DIR__ . '/config.php';
    if (!is_file($file)) throw new RuntimeException('config.php fehlt. Bitte config.sample.php zu config.php kopieren und Codes eintragen.');
    $c = array_merge(['max_mb' => 20, 'max_unzipped_mb' => 50], (array)require $file);
    foreach (['teacher_code','admin_code'] as $k) {
        if (!is_string($c[$k] ?? null) || $c[$k] === '' || str_starts_with($c[$k], 'BITTE-AENDERN')) {
            throw new RuntimeException("In config.php muss '$k' geändert werden.");
        }
    }
    return $c;
}

function data_dir(): string {
    $d = __DIR__ . '/data';
    foreach ([$d, "$d/apps"] as $x) if (!is_dir($x) && !@mkdir($x, 0755, true)) throw new RuntimeException('Ordner data/ kann nicht angelegt werden (Schreibrechte?).');
    $ht = "$d/.htaccess";
    if (!is_file($ht)) @file_put_contents($ht, "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
    return $d;
}

// ---- Metadaten: JSON in einer PHP-Datei mit Exit-Zeile (auch ohne .htaccess nie auslesbar) ----
const GUARD = "<?php http_response_code(404); exit; ?>\n";

function apps_read(): array {
    $f = data_dir() . '/apps.php';
    if (!is_file($f)) return [];
    $raw = (string)file_get_contents($f);
    $j = json_decode(substr($raw, strlen(GUARD)), true);
    return is_array($j) ? $j : [];
}

/** Liest, ändert (per Callback) und schreibt atomar unter Sperre. */
function apps_update(callable $fn) {
    $dir = data_dir();
    $lock = fopen("$dir/.lock", 'c');
    flock($lock, LOCK_EX);
    try {
        $apps = apps_read();
        $result = $fn($apps);
        $tmp = "$dir/apps.php.tmp";
        file_put_contents($tmp, GUARD . json_encode(array_values($apps), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        rename($tmp, "$dir/apps.php");
        return $result;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function rrmdir(string $d): void {
    if (!is_dir($d)) return;
    foreach (scandir($d) ?: [] as $f) {
        if ($f === '.' || $f === '..') continue;
        $p = "$d/$f";
        is_dir($p) && !is_link($p) ? rrmdir($p) : @unlink($p);
    }
    @rmdir($d);
}

function ini_bytes(string $v): int {
    $v = trim($v); if ($v === '') return 0;
    $n = (float)$v; $u = strtolower(substr($v, -1));
    return (int)($u === 'g' ? $n * 1073741824 : ($u === 'm' ? $n * 1048576 : ($u === 'k' ? $n * 1024 : $n)));
}

/** Tatsächliches Upload-Limit in Bytes (Konfiguration und PHP-Grenzen). */
function effective_limit(array $cfg): int {
    $php = array_filter([ini_bytes((string)ini_get('upload_max_filesize')), ini_bytes((string)ini_get('post_max_size'))]);
    return min($cfg['max_mb'] * 1048576, $php ? min($php) : PHP_INT_MAX);
}

/** ZIP sicher nach $dest entpacken. Gibt übersprungene Dateien zurück. */
function extract_zip(string $zipPath, string $dest, array $cfg): array {
    if (!class_exists('ZipArchive')) throw new RuntimeException('Auf dem Server fehlt die PHP-Erweiterung "zip".');
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) throw new RuntimeException('ZIP-Datei ist beschädigt.');
    $files = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $st = $zip->statIndex($i);
        $name = ltrim(str_replace('\\', '/', (string)$st['name']), '/');
        if ($name === '' || str_ends_with($name, '/')) continue;
        if (preg_match('#(^|/)(__MACOSX|\.[^/]*)(/|$)#', $name)) continue; // macOS-Müll, versteckte Dateien
        $files[] = ['i' => $i, 'name' => $name, 'size' => (int)$st['size']];
    }
    if (!$files) throw new RuntimeException('ZIP ist leer.');
    if (count($files) > 500) throw new RuntimeException('Zu viele Dateien (max. 500).');
    $tops = array_unique(array_map(fn($f) => explode('/', $f['name'])[0], $files));
    if (count($tops) === 1 && !array_filter($files, fn($f) => !str_contains($f['name'], '/'))) {
        foreach ($files as &$f) $f['name'] = implode('/', array_slice(explode('/', $f['name']), 1));
        unset($f);
    }
    if (!array_filter($files, fn($f) => $f['name'] === 'index.html')) throw new RuntimeException('Im ZIP fehlt eine index.html (im Hauptordner).');
    $limit = $cfg['max_unzipped_mb'] * 1048576;
    if (array_sum(array_column($files, 'size')) > $limit) throw new RuntimeException("Entpackt zu groß (max. {$cfg['max_unzipped_mb']} MB).");
    $skipped = []; $total = 0; $base = rtrim($dest, '/');
    foreach ($files as $f) {
        $parts = explode('/', $f['name']);
        if (in_array('..', $parts, true) || in_array('', $parts, true)) throw new RuntimeException('Ungültiger Pfad im ZIP.');
        if (!in_array(strtolower(pathinfo($f['name'], PATHINFO_EXTENSION)), ALLOWED_EXT, true)) { $skipped[] = $f['name']; continue; }
        $data = $zip->getFromIndex($f['i'], $f['size'] + 1);
        if ($data === false) throw new RuntimeException('Datei im ZIP nicht lesbar: ' . $f['name']);
        $total += strlen($data);
        if ($total > $limit) throw new RuntimeException("Entpackt zu groß (max. {$cfg['max_unzipped_mb']} MB).");
        $target = "$base/{$f['name']}";
        if (!is_dir(dirname($target))) mkdir(dirname($target), 0755, true);
        file_put_contents($target, $data);
    }
    $zip->close();
    return $skipped;
}
