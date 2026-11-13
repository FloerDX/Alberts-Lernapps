<?php
// Prüfseite: zeigt PHP-Version, Upload-Limit und ob alles Nötige vorhanden ist. Nach dem Test LÖSCHEN.
header('Content-Type: text/html; charset=utf-8');
require __DIR__ . '/lib.php';
$rows = [];
$ok = fn($b) => $b ? '✅' : '❌';
$rows[] = ['PHP-Version (min. 8.1 nötig)', PHP_VERSION, $ok(version_compare(PHP_VERSION, '8.1', '>='))];
$u = ini_get('upload_max_filesize'); $p = ini_get('post_max_size');
$rows[] = ['upload_max_filesize', $u, ''];
$rows[] = ['post_max_size', $p, ''];
$eff = min(array_filter([ini_bytes($u), ini_bytes($p)]) ?: [0]);
$rows[] = ['➜ Effektives Upload-Limit pro Datei', round($eff / 1048576, 1) . ' MB', $ok($eff >= 4 * 1048576)];
$rows[] = ['memory_limit', ini_get('memory_limit'), ''];
$rows[] = ['ZIP-Unterstützung (ZipArchive)', class_exists('ZipArchive') ? 'vorhanden' : 'fehlt', $ok(class_exists('ZipArchive'))];
$rows[] = ['file_uploads', ini_get('file_uploads') ? 'an' : 'aus', $ok((bool)ini_get('file_uploads'))];
try { $d = data_dir(); $w = is_writable($d); } catch (Throwable $e) { $w = false; }
$rows[] = ['Ordner data/ beschreibbar', $w ? 'ja' : 'nein', $ok($w)];
$rows[] = ['config.php vorhanden', is_file(__DIR__ . '/config.php') ? 'ja' : 'nein (noch anlegen)', $ok(is_file(__DIR__ . '/config.php'))];
try { @file_put_contents(data_dir() . '/probe.txt', 'probe'); } catch (Throwable $e) {}
$rows[] = ['mod_rewrite (Apache)', function_exists('apache_get_modules') ? (in_array('mod_rewrite', apache_get_modules()) ? 'aktiv' : 'nicht aktiv') : 'nicht prüfbar (FastCGI) – Test: Lernapp öffnen', ''];
?><!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lernapps – Servercheck</title>
<style>body{font:16px system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;color:#1f2933}td{padding:.4rem .6rem;border-bottom:1px solid #d9e2ec}table{border-collapse:collapse;width:100%}</style>
<h1>Servercheck</h1>
<table><?php foreach ($rows as [$k, $v, $s]) echo '<tr><td>' . htmlspecialchars($k) . '</td><td>' . htmlspecialchars((string)$v) . '</td><td>' . $s . '</td></tr>'; ?></table>
<h2>Browser-Tests</h2>
<table id="bt"><tr><td>Ordner data/ von außen gesperrt</td><td id="t1">…</td></tr><tr><td>Apps-Auslieferung (Rewrite) funktioniert</td><td id="t2">…</td></tr></table>
<script>
fetch('data/probe.txt',{cache:'no-store'}).then(r=>t1.textContent=r.status===200?'❌ ERREICHBAR – data/ ist nicht geschützt!':'✅ gesperrt ('+r.status+')').catch(()=>t1.textContent='✅ gesperrt');
fetch('a/0000000000/x',{cache:'no-store'}).then(r=>r.text()).then(t=>t2.textContent=t.trim()==='Nicht gefunden.'?'✅ ja':'❌ nein – .htaccess/mod_rewrite prüfen').catch(()=>t2.textContent='❌ Fehler');
</script>
<p><b>Wichtig:</b> Diese Datei (<code>check.php</code>) nach dem Test vom Server löschen.</p>
