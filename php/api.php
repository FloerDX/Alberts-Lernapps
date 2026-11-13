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
function require_teacher(array $cfg): void {
    if (!is_teacher($cfg)) { usleep(400000); fail('Falscher Kollegiums-Code.', 401); }
}
function authorize_app(array $cfg, array $app): void {
    $isAdmin = hash_equals($cfg['admin_code'], hdr('X-Code'));
    $isOwner = hdr('X-Owner-Token') !== '' && hash_equals((string)($app['ownerToken'] ?? ''), hdr('X-Owner-Token'));
    if (!$isAdmin && !$isOwner) { usleep(400000); fail('Nur Ersteller:in oder Admin darf das.', 403); }
}
function find_app(string $id): array {
    foreach (apps_read() as $a) if (($a['id'] ?? '') === $id) return $a;
    fail('Nicht gefunden.', 404);
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
        if (empty($_FILES) && empty($_POST) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
            fail('Datei zu groß für den Server (max. ' . floor(effective_limit($cfg) / 1048576) . ' MB).', 413);
        }
        $m = meta($_POST);
        if ($m['title'] === '' || $m['subject'] === '' || $m['grade'] === '') fail('Titel, Fach und Klasse sind Pflicht.');
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

        $newId = bin2hex(random_bytes(5));
        $dest = data_dir() . "/apps/$newId";
        mkdir($dest, 0755, true);
        $skipped = [];
        try {
            if ($ext === 'zip') $skipped = extract_zip($f['tmp_name'], $dest, $cfg);
            else move_uploaded_file($f['tmp_name'], "$dest/index.html") || throw new RuntimeException('Speichern fehlgeschlagen.');
        } catch (Throwable $e) { rrmdir($dest); fail($e->getMessage()); }

        $entry = ['id' => $newId] + $m + ['created' => gmdate('c'), 'ownerToken' => bin2hex(random_bytes(16))];
        apps_update(function (array &$apps) use ($entry) { array_unshift($apps, $entry); });
        out(pub($entry) + ['ownerToken' => $entry['ownerToken'], 'skipped' => $skipped], 201);

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
