// Lernapps-Organizer: kleiner Server (Express) ohne Datenbank.
// Metadaten: data/apps.json, Dateien: data/apps/<id>/index.html
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const TEACHER_CODE = process.env.TEACHER_CODE || 'kollegium';   // zum Hochladen
const ADMIN_CODE = process.env.ADMIN_CODE || 'admin';           // darf alles löschen/ändern
const APPS_ORIGIN = (process.env.APPS_ORIGIN || '').replace(/\/$/, ''); // optional: eigene Subdomain für Apps
const MAX_MB = Number(process.env.MAX_MB || 5);

const DB_FILE = path.join(DATA, 'apps.json');
const APP_DIR = path.join(DATA, 'apps');
fs.mkdirSync(APP_DIR, { recursive: true });

// ---------- Mini-Speicher ----------
let apps = [];
try { apps = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { apps = []; }
const save = () => {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(apps, null, 2));
  fs.renameSync(tmp, DB_FILE);
};
const pub = ({ ownerToken, ...a }) => a; // Token nie ausliefern

const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
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

app.post('/api/apps', requireTeacher, upload.single('file'), (req, res) => {
  const m = meta(req.body);
  if (!m.title || !m.subject || !m.grade) return res.status(400).json({ error: 'Titel, Fach und Klasse sind Pflicht.' });
  if (!req.file) return res.status(400).json({ error: 'Bitte eine HTML-Datei auswählen.' });
  if (!/\.html?$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Nur .html-Dateien erlaubt.' });
  const head = req.file.buffer.subarray(0, 2048).toString('utf8').toLowerCase();
  if (!head.includes('<')) return res.status(400).json({ error: 'Das sieht nicht nach HTML aus.' });

  const id = crypto.randomBytes(5).toString('hex');
  const ownerToken = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.join(APP_DIR, id));
  fs.writeFileSync(path.join(APP_DIR, id, 'index.html'), req.file.buffer);
  const entry = { id, ...m, created: new Date().toISOString(), ownerToken };
  apps.unshift(entry);
  save();
  res.status(201).json({ ...pub(entry), ownerToken }); // Token nur dem Uploader zeigen
});

function findOwned(req, res) {
  const a = apps.find(x => x.id === req.params.id);
  if (!a) { res.status(404).json({ error: 'Nicht gefunden.' }); return null; }
  const isAdmin = safeEq(req.get('x-code') || '', ADMIN_CODE);
  const isOwner = safeEq(req.get('x-owner-token') || '', a.ownerToken);
  if (!isAdmin && !isOwner) { res.status(403).json({ error: 'Nur Ersteller:in oder Admin darf das.' }); return null; }
  return a;
}

app.put('/api/apps/:id', (req, res) => {
  const a = findOwned(req, res); if (!a) return;
  const m = meta({ ...a, ...req.body, tags: req.body.tags ?? a.tags.join(',') });
  if (!m.title || !m.subject || !m.grade) return res.status(400).json({ error: 'Titel, Fach und Klasse sind Pflicht.' });
  Object.assign(a, m); save(); res.json(pub(a));
});

app.delete('/api/apps/:id', (req, res) => {
  const a = findOwned(req, res); if (!a) return;
  apps = apps.filter(x => x !== a); save();
  fs.rmSync(path.join(APP_DIR, a.id), { recursive: true, force: true });
  res.json({ ok: true });
});

// QR-Code als SVG
app.get('/api/qr', async (req, res) => {
  const text = clean(req.query.text, 500);
  if (!text) return res.status(400).end();
  res.type('image/svg+xml').send(await QRCode.toString(text, { type: 'svg', margin: 1 }));
});

// Hochgeladene Apps: strikt gesandboxt (kein Zugriff auf den Organizer, keine Cookies/Storage des Hosts).
app.get('/a/:id', (req, res) => {
  const a = apps.find(x => x.id === req.params.id);
  if (!a) return res.status(404).send('App nicht gefunden.');
  res.set({
    'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-cache',
  });
  res.type('html').sendFile(path.join(APP_DIR, a.id, 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Datei zu groß (max. ${MAX_MB} MB).` });
  console.error(err); res.status(500).json({ error: 'Serverfehler.' });
});

if (require.main === module) app.listen(PORT, () => console.log(`Lernapps läuft auf http://localhost:${PORT}`));
module.exports = app;
