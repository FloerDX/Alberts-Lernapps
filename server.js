// Lernapps-Organizer: kleiner Server (Express).
// Speicher: lokale Dateien (DATA_DIR) oder Postgres/Supabase (DATABASE_URL) – siehe storage.js
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const AdmZip = require('adm-zip');
const { fileStore, pgStore } = require('./storage');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const TEACHER_CODE = process.env.TEACHER_CODE || 'kollegium';   // zum Hochladen
const ADMIN_CODE = process.env.ADMIN_CODE || 'admin';           // darf alles löschen/ändern
const APPS_ORIGIN = (process.env.APPS_ORIGIN || '').replace(/\/$/, ''); // optional: eigene Subdomain für Apps
const MAX_MB = Number(process.env.MAX_MB || 20);                 // max. Upload (HTML oder ZIP)
const MAX_UNZIPPED_MB = Number(process.env.MAX_UNZIPPED_MB || 50); // max. entpackte Gesamtgröße
const BASE_PATH = ('/' + (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')).replace(/^\/$/, ''); // z. B. /lernapps
const ALLOWED_EXT = new Set('html htm css js mjs json txt csv xml png jpg jpeg gif webp svg ico avif mp3 wav ogg m4a mp4 webm woff woff2 ttf otf wasm md'.split(' '));

const store = process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : fileStore(DATA);
let apps = []; // Metadaten im Speicher (klein), Dateien liegen im Store
const pub = ({ ownerToken, ...a }) => a; // Token nie ausliefern

const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// ---------- App ----------
const root = express();
root.disable('x-powered-by');
const app = express.Router();
app.use(express.json({ limit: '50kb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
});

function requireTeacher(req, res, next) {
  const code = req.get('x-code') || '';
  if (safeEq(code, TEACHER_CODE) || safeEq(code, ADMIN_CODE)) return next();
  res.status(401).json({ error: 'Falscher Kollegiums-Code.' });
}

function meta(body) {
  return {
    title: clean(body.title, 80),
    subject: clean(body.subject, 40),
    grade: clean(body.grade, 20),
    description: clean(body.description, 400),
    author: clean(body.author, 60),
    tags: clean(body.tags, 200).split(',').map(t => clean(t, 30)).filter(Boolean).slice(0, 10),
  };
}

app.get('/api/config', (req, res) => res.json({ appsOrigin: APPS_ORIGIN, maxMb: MAX_MB }));
app.get('/api/apps', (req, res) => res.json(apps.map(pub)));

app.post('/api/check', requireTeacher, (req, res) => res.json({ ok: true, admin: safeEq(req.get('x-code'), ADMIN_CODE) }));

// ZIP sicher entpacken (im Speicher): nur erlaubte Dateitypen, kein Path-Traversal, Größen-/Anzahllimits.
function extractZip(buf) {
  let zip, entries;
  try { zip = new AdmZip(buf); entries = zip.getEntries(); } catch { throw new Error('ZIP-Datei ist beschädigt.'); }
  let files = entries.filter(e => !e.isDirectory).map(e => ({ e, name: e.entryName.replace(/\\/g, '/').replace(/^\/+/, '') }))
    .filter(f => !/(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(f.name)); // macOS-Müll & versteckte Dateien
  if (!files.length) throw new Error('ZIP ist leer.');
  if (files.length > 500) throw new Error('Zu viele Dateien (max. 500).');
  // Gemeinsamen Top-Level-Ordner entfernen (typisch beim Zippen eines Ordners)
  const tops = new Set(files.map(f => f.name.split('/')[0]));
  if (tops.size === 1 && files.every(f => f.name.includes('/'))) files.forEach(f => { f.name = f.name.split('/').slice(1).join('/'); });
  if (!files.some(f => f.name === 'index.html')) throw new Error('Im ZIP fehlt eine index.html (im Hauptordner).');
  const limit = MAX_UNZIPPED_MB * 1024 * 1024;
  if (files.reduce((n, f) => n + f.e.header.size, 0) > limit) throw new Error(`Entpackt zu groß (max. ${MAX_UNZIPPED_MB} MB).`);
  const out = [], skipped = []; let total = 0;
  for (const f of files) {
    const ext = path.extname(f.name).slice(1).toLowerCase();
    if (f.name.split('/').some(p => p === '..' || p === '')) throw new Error('Ungültiger Pfad im ZIP.');
    if (!ALLOWED_EXT.has(ext)) { skipped.push(f.name); continue; }
    const data = f.e.getData();
    if ((total += data.length) > limit) throw new Error(`Entpackt zu groß (max. ${MAX_UNZIPPED_MB} MB).`);
    out.push({ name: f.name, data });
  }
  return { files: out, skipped };
}

app.post('/api/apps', requireTeacher, upload.single('file'), async (req, res, next) => {
  try {
    const m = meta(req.body);
    if (!m.title || !m.subject || !m.grade) return res.status(400).json({ error: 'Titel, Fach und Klasse sind Pflicht.' });
    if (!req.file) return res.status(400).json({ error: 'Bitte eine HTML- oder ZIP-Datei auswählen.' });
    const isZip = /\.zip$/i.test(req.file.originalname);
    if (!isZip && !/\.html?$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Nur .html oder .zip erlaubt.' });
    if (!isZip && !req.file.buffer.subarray(0, 2048).toString('utf8').includes('<')) return res.status(400).json({ error: 'Das sieht nicht nach HTML aus.' });
    if (isZip && req.file.buffer.subarray(0, 4).toString('hex') !== '504b0304') return res.status(400).json({ error: 'Das ist keine gültige ZIP-Datei.' });

    let files, skipped = [];
    try {
      if (isZip) ({ files, skipped } = extractZip(req.file.buffer));
      else files = [{ name: 'index.html', data: req.file.buffer }];
    } catch (e) { return res.status(400).json({ error: e.message }); }

    const id = crypto.randomBytes(5).toString('hex');
    const ownerToken = crypto.randomBytes(16).toString('hex');
    const entry = { id, ...m, created: new Date().toISOString(), ownerToken };
    await store.create(entry, files);
    apps.unshift(entry);
    res.status(201).json({ ...pub(entry), ownerToken, skipped }); // Token nur dem Uploader zeigen
  } catch (e) { next(e); }
});

function findOwned(req, res) {
  const a = apps.find(x => x.id === req.params.id);
  if (!a) { res.status(404).json({ error: 'Nicht gefunden.' }); return null; }
  const isAdmin = safeEq(req.get('x-code') || '', ADMIN_CODE);
  const isOwner = safeEq(req.get('x-owner-token') || '', a.ownerToken);
  if (!isAdmin && !isOwner) { res.status(403).json({ error: 'Nur Ersteller:in oder Admin darf das.' }); return null; }
  return a;
}

app.put('/api/apps/:id', async (req, res, next) => {
  try {
    const a = findOwned(req, res); if (!a) return;
    const m = meta({ ...a, ...req.body, tags: req.body.tags ?? a.tags.join(',') });
    if (!m.title || !m.subject || !m.grade) return res.status(400).json({ error: 'Titel, Fach und Klasse sind Pflicht.' });
    const next_ = { ...a, ...m }; await store.update(next_); Object.assign(a, m); res.json(pub(a));
  } catch (e) { next(e); }
});

app.delete('/api/apps/:id', async (req, res, next) => {
  try {
    const a = findOwned(req, res); if (!a) return;
    await store.remove(a.id); apps = apps.filter(x => x !== a);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// QR-Code als SVG
app.get('/api/qr', async (req, res) => {
  const text = clean(req.query.text, 500);
  if (!text) return res.status(400).end();
  res.type('image/svg+xml').send(await QRCode.toString(text, { type: 'svg', margin: 1 }));
});

// Hochgeladene Apps: strikt gesandboxt (kein Zugriff auf den Organizer, keine Cookies/Storage des Hosts).
app.use('/a/:id', (req, res, next) => {
  const a = apps.find(x => x.id === req.params.id);
  if (!a) return res.status(404).send('App nicht gefunden.');
  const [p, q] = req.originalUrl.split('?'); // relative Pfade brauchen den Schrägstrich
  if (p.endsWith(a.id)) return res.redirect(301, p + '/' + (q ? '?' + q : ''));
  res.set({
    'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-cache',
  });
  next();
}, async (req, res, next) => {
  try {
    let rel; try { rel = decodeURIComponent(req.path.replace(/^\/+/, '')); } catch { return res.status(400).end(); }
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    if (rel.split('/').some(p => p === '..' || p.startsWith('.'))) return res.status(404).send('Nicht gefunden.');
    const buf = await store.file(req.params.id, rel);
    if (!buf) return res.status(404).send('Nicht gefunden.');
    res.type(path.extname(rel) || 'html').send(buf);
  } catch (e) { next(e); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Datei zu groß (max. ${MAX_MB} MB).` });
  console.error(err); res.status(500).json({ error: 'Serverfehler.' });
});

if (BASE_PATH) root.use((req, res, next) => (req.originalUrl.split('?')[0] === BASE_PATH ? res.redirect(BASE_PATH + '/') : next()));
root.use(BASE_PATH || '/', app);

const ready = store.load().then(a => { apps = a; });
if (require.main === module) {
  ready.then(() => root.listen(PORT, () => console.log(`Lernapps läuft auf http://localhost:${PORT}${BASE_PATH}/ – Speicher: ${store.kind}`)))
    .catch(e => { console.error('Start fehlgeschlagen:', e.message); process.exit(1); });
}
module.exports = root;
module.exports.ready = ready;
