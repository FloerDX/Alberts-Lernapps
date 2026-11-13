<?php
// Liefert hochgeladene Apps unter <ordner>/a/<id>/… aus – immer mit Sandbox-Header (unabhängig von mod_headers).
declare(strict_types=1);
require __DIR__ . '/lib.php';

function notfound(): never { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Nicht gefunden.'; exit; }

$path = (string)parse_url((string)$_SERVER['REQUEST_URI'], PHP_URL_PATH);
$base = rtrim(str_replace('\\', '/', dirname((string)$_SERVER['SCRIPT_NAME'])), '/');
$prefix = "$base/a/";
if (!str_starts_with($path, $prefix)) notfound();
$rest = substr($path, strlen($prefix));
if (!preg_match('#^([a-f0-9]{10})(?:/(.*))?$#s', $rest, $m)) notfound();
$id = $m[1];
$rel = rawurldecode($m[2] ?? '');

if (!isset($m[2])) { // /a/<id> -> /a/<id>/ (relative Pfade brauchen den Schrägstrich)
    $q = (string)($_SERVER['QUERY_STRING'] ?? '');
    header('Location: ' . $path . '/' . ($q !== '' ? "?$q" : ''), true, 301); exit;
}
if ($rel === '' || str_ends_with($rel, '/')) $rel .= 'index.html';
foreach (explode('/', $rel) as $seg) if ($seg === '..' || str_starts_with($seg, '.') || str_contains($seg, "\0")) notfound();

$dir = realpath(data_dir() . "/apps/$id");
if ($dir === false) notfound();
$file = realpath("$dir/$rel");
if ($file === false || !str_starts_with($file, $dir . DIRECTORY_SEPARATOR) || !is_file($file)) notfound();

$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
if (!isset(MIME[$ext])) notfound();

header('Content-Type: ' . MIME[$ext]);
header('Content-Security-Policy: sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-cache');
header('Accept-Ranges: bytes');

$size = filesize($file); $start = 0; $end = $size - 1;
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/^bytes=(\d*)-(\d*)$/', trim($_SERVER['HTTP_RANGE']), $r) && ($r[1] !== '' || $r[2] !== '')) {
    if ($r[1] === '') { $start = max(0, $size - (int)$r[2]); } else { $start = (int)$r[1]; if ($r[2] !== '') $end = min($end, (int)$r[2]); }
    if ($start > $end || $start >= $size) { http_response_code(416); header("Content-Range: bytes */$size"); exit; }
    http_response_code(206); header("Content-Range: bytes $start-$end/$size");
}
header('Content-Length: ' . ($end - $start + 1));
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') exit;
$fh = fopen($file, 'rb'); fseek($fh, $start);
$left = $end - $start + 1;
while ($left > 0 && !feof($fh)) { $chunk = fread($fh, min(65536, $left)); if ($chunk === false) break; echo $chunk; $left -= strlen($chunk); }
fclose($fh);
