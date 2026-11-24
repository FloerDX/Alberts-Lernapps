<?php
// JSON-API des Lernapps-Organizers. Routing über ?r=<route> (kein mod_rewrite nötig).
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out($data, int $code = 200): never { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function fail(string $m, int $c = 400): never { out(['error' => $m], $c); }
function hdr(string $n): string { return (string)($_SERVER['HTTP_' . strtoupper(str_replace('-', '_', $n))] ?? ''); }
function clean($s, int $n): string { return mb_substr(trim((string)preg_replace('/[\x00-\x1f]/u', ' ', (string)$s)), 0, $n); }
function pub(array $a): array { unset($a['ownerToken']); return $a; }

function meta(array $b): array {
    $tags = $b['tags'] ?? '';
    if (is_array($tags)) $tags = implode(',', $tags);
    $list = array_slice(array_values(array_filter(array_map(fn($t) => clean($t, 30), explode(',', (string)$tags)))), 0, 10);
    return ['title' => clean($b['title'] ?? '', 80), 'subject' => clean($b['subject'] ?? '', 40), 'grade' => clean($b['grade'] ?? '', 20),
            'description' => clean($b['description'] ?? '', 400), 'author' => clean($b['author'] ?? '', 60), 'tags' => $list];
}

function is_teacher(array $cfg): bool {
    $c = hdr('X-Code');
    return $c !== '' && (hash_equals($cfg['teacher_code'], $c) || hash_equals($cfg['admin_code'], $c));
}
function blocked_check(): void {
    $s = rl_locked();
    if ($s > 0) { header('Retry-After: ' . $s); fail('Zu viele Fehlversuche. Bitte in ' . (int)ceil($s / 60) . ' Minute(n) erneut versuchen.', 429); }
}
function bad_code(string $msg, int $status): never { rl_fail(); usleep(400000); fail($msg, $status); }

function require_teacher(array $cfg): void {
    blocked_check();
    if (!is_teacher($cfg)) bad_code('Falscher Kollegiums-Code.', 401);
    rl_reset();
}
function authorize_app(array $cfg, array $app): void {
    blocked_check();
    $isAdmin = hash_equals($cfg['admin_code'], hdr('X-Code'));
    $isOwner = hdr('X-Owner-Token') !== '' && hash_equals((string)($app['ownerToken'] ?? ''), hdr('X-Owner-Token'));
    if (!$isAdmin && !$isOwner) bad_code('Zum Ändern braucht es den Owner-Token dieser App (Header X-Owner-Token) oder den Admin-Code (Header X-Code).', 403);
}
function find_app(string $id): array {
    foreach (apps_read() as $a) if (($a['id'] ?? '') === $id) return $a;
    fail('Nicht gefunden.', 404);
}

function check_post_size(array $cfg): void {
    if (empty($_FILES) && empty($_POST) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        fail('Datei zu groß für den Server (max. ' . floor(effective_limit($cfg) / 1048576) . ' MB).', 413);
    }
}

/** Optionaler stabiler Name für Skripte/Updates: a-z, 0-9, Bindestrich. */
function clean_key($k): string {
    $k = strtolower(trim((string)$k));
    if ($k === '') return '';
    if (!preg_match('/^[a-z0-9][a-z0-9-]{0,39}$/', $k)) fail("Ungültiger 'key' (erlaubt: a-z, 0-9, Bindestrich, max. 40 Zeichen).");
    return $k;
}
function find_by_key(string $key): ?array {
    foreach (apps_read() as $a) if (($a['key'] ?? '') === $key) return $a;
    return null;
}

/** Prüft die hochgeladene Datei ($_FILES['file']) und legt den Inhalt in $dest ab. Gibt übersprungene Dateien zurück. */
function save_upload(array $cfg, string $dest): array {
    $f = $_FILES['file'] ?? null;
    if (!$f || $f['error'] === UPLOAD_ERR_NO_FILE) fail('Bitte eine HTML- oder ZIP-Datei auswählen.');
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) fail('Datei zu groß (max. ' . floor(effective_limit($cfg) / 1048576) . ' MB).', 413);
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fail('Upload fehlgeschlagen.');
    if ($f['size'] > $cfg['max_mb'] * 1048576) fail("Datei zu groß (max. {$cfg['max_mb']} MB).", 413);

    $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    $head = (string)file_get_contents($f['tmp_name'], false, null, 0, 2048);
    if ($ext === 'zip') { if (!str_starts_with($head, "PK\x03\x04")) fail('Das ist keine gültige ZIP-Datei.'); }
    elseif (in_array($ext, ['html', 'htm'], true)) { if (!str_contains($head, '<')) fail('Das sieht nicht nach HTML aus.'); }
    else fail('Nur .html oder .zip erlaubt.');

    mkdir($dest, 0755, true);
    try {
        if ($ext === 'zip') return extract_zip($f['tmp_name'], $dest, $cfg);
        move_uploaded_file($f['tmp_name'], "$dest/index.html") || throw new RuntimeException('Speichern fehlgeschlagen.');
        return [];
    } catch (Throwable $e) { rrmdir($dest); fail($e->getMessage()); }
}

/** Ersetzt den Ordner einer App durch $new (alter Inhalt wird erst nach Erfolg gelöscht). */
function swap_dir(string $id, string $new): void {
    $root = data_dir() . '/apps'; $cur = "$root/$id"; $old = "$root/$id.old-" . bin2hex(random_bytes(3));
    if (is_dir($cur)) rename($cur, $old);
    if (!rename($new, $cur)) { if (is_dir($old)) rename($old, $cur); throw new RuntimeException('Aktualisieren fehlgeschlagen.'); }
    rrmdir($old);
}

/** Aktualisiert eine bestehende App: neue Datei (optional) und/oder Metadaten. Berechtigung: Owner-Token oder Admin-Code. */
function do_replace(array $cfg, array $app, array $body): never {
    authorize_app($cfg, $app);
    $skipped = [];
    $hasFile = isset($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE;
    if ($hasFile) {
        $new = data_dir() . "/apps/{$app['id']}.new-" . bin2hex(random_bytes(3));
        $skipped = save_upload($cfg, $new);
        try { swap_dir($app['id'], $new); } catch (Throwable $e) { rrmdir($new); fail($e->getMessage(), 500); }
    }
    $given = array_filter($body, fn($v) => is_array($v) || trim((string)$v) !== '');
    $m = meta($given + $app);
    $res = apps_update(function (array &$apps) use ($app, $m) {
        foreach ($apps as &$a) if ($a['id'] === $app['id']) { $a = array_merge($a, $m, ['updated' => gmdate('c')]); return pub($a); }
        return null;
    });
    out(($res ?? pub($app)) + ['skipped' => $skipped, 'fileReplaced' => $hasFile]);
}

try {
    $cfg = cfg();
    $r = (string)($_GET['r'] ?? '');
    $method = $_SERVER['REQUEST_METHOD'];
    $id = (string)($_GET['id'] ?? '');
    if ($id !== '' && !preg_match('/^[a-f0-9]{10}$/', $id)) fail('Ungültige ID.');

    switch ($r) {
    case 'config':
        out(['appsOrigin' => '', 'maxMb' => (int)floor(effective_limit($cfg) / 1048576)]);

    case 'apps':
        if ($method === 'GET') out(array_map('pub', apps_read()));
        if ($method !== 'POST') fail('Methode nicht erlaubt.', 405);
        require_teacher($cfg);
        check_post_size($cfg);
        $key = clean_key($_POST['key'] ?? '');
        if ($key !== '' && ($existing = find_by_key($key))) do_replace($cfg, $existing, $_POST); // gleicher key = Aktualisierung
        $m = meta($_POST);
        if ($m['title'] === '' || $m['subject'] === '' || $m['grade'] === '') fail('Titel, Fach und Klasse sind Pflicht.');

        $newId = bin2hex(random_bytes(5));
        $skipped = save_upload($cfg, data_dir() . "/apps/$newId");
        $entry = ['id' => $newId] + ($key !== '' ? ['key' => $key] : []) + $m + ['created' => gmdate('c'), 'ownerToken' => bin2hex(random_bytes(16))];
        apps_update(function (array &$apps) use ($entry) { array_unshift($apps, $entry); });
        out(pub($entry) + ['ownerToken' => $entry['ownerToken'], 'skipped' => $skipped], 201);

    case 'replace':
        if ($method !== 'POST' || $id === '') fail('Ungültige Anfrage.', 405);
        check_post_size($cfg);
        do_replace($cfg, find_app($id), $_POST);

    case 'check':
        require_teacher($cfg);
        out(['ok' => true, 'admin' => hash_equals($cfg['admin_code'], hdr('X-Code'))]);

    case 'update':
        if ($method !== 'POST' || $id === '') fail('Ungültige Anfrage.', 405);
        authorize_app($cfg, find_app($id));
        $body = json_decode((string)file_get_contents('php://input'), true) ?: [];
        $res = apps_update(function (array &$apps) use ($id, $body) {
            foreach ($apps as &$a) if ($a['id'] === $id) {
                $m = meta($body + ['tags' => $a['tags'], 'title' => $a['title'], 'subject' => $a['subject'], 'grade' => $a['grade'], 'description' => $a['description'], 'author' => $a['author']]);
                if ($m['title'] === '' || $m['subject'] === '' || $m['grade'] === '') return null;
                $a = array_merge($a, $m);
                return pub($a);
            }
            return null;
        });
        $res === null ? fail('Titel, Fach und Klasse sind Pflicht.') : out($res);

    case 'delete':
        if ($method !== 'POST' || $id === '') fail('Ungültige Anfrage.', 405);
        authorize_app($cfg, find_app($id));
        apps_update(function (array &$apps) use ($id) { $apps = array_filter($apps, fn($a) => $a['id'] !== $id); });
        rrmdir(data_dir() . "/apps/$id");
        out(['ok' => true]);

    default:
        fail('Unbekannte Route.', 404);
    }
} catch (RuntimeException $e) {
    fail($e->getMessage(), 500);
} catch (Throwable $e) {
    error_log('Lernapps: ' . $e);
    fail('Serverfehler.', 500);
}
