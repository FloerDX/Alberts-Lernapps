// Speicher-Adapter. Ohne DATABASE_URL: lokale Dateien (DATA_DIR). Mit DATABASE_URL: Postgres (z. B. Supabase).
// Schnittstelle: load() -> apps[], create(entry, files), update(entry), remove(id), file(id, relPath) -> Buffer|null
const fs = require('fs');
const path = require('path');

function fileStore(dataDir) {
  const DB = path.join(dataDir, 'apps.json'), DIR = path.join(dataDir, 'apps');
  fs.mkdirSync(DIR, { recursive: true });
  let cache = [];
  const flush = () => { fs.writeFileSync(DB + '.tmp', JSON.stringify(cache, null, 2)); fs.renameSync(DB + '.tmp', DB); };
  return {
    kind: 'Dateien in ' + dataDir,
    async load() { try { cache = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { cache = []; } return cache; },
    async create(entry, files) {
      const dir = path.join(DIR, entry.id), base = path.resolve(dir);
      fs.mkdirSync(dir, { recursive: true });
      try {
        for (const f of files) {
          const t = path.resolve(base, f.name);
          if (!t.startsWith(base + path.sep)) throw new Error('Ungültiger Pfad.');
          fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, f.data);
        }
      } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
      cache = [entry, ...cache.filter(a => a.id !== entry.id)]; flush();
    },
    async update(entry) { cache = cache.map(a => (a.id === entry.id ? entry : a)); flush(); },
    async remove(id) { cache = cache.filter(a => a.id !== id); flush(); fs.rmSync(path.join(DIR, id), { recursive: true, force: true }); },
    async file(id, rel) {
      const base = path.resolve(DIR, id), t = path.resolve(base, rel);
      if (!t.startsWith(base + path.sep)) return null;
      try { return fs.readFileSync(t); } catch { return null; }
    },
  };
}

function pgStore(url) {
  const { Pool } = require('pg');
  // Supabase erzwingt SSL. Lokal ohne SSL: PGSSL=off
  const pool = new Pool({ connectionString: url, max: 5, ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false } });
  const S = 'lernapps'; // eigenes Schema -> nicht über die öffentliche Supabase-API (PostgREST) erreichbar
  return {
    kind: 'Postgres (Supabase)',
    async load() {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${S}`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ${S}.apps (id text PRIMARY KEY, created timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ${S}.app_files (app_id text NOT NULL REFERENCES ${S}.apps(id) ON DELETE CASCADE, path text NOT NULL, content bytea NOT NULL, PRIMARY KEY (app_id, path))`);
      // Zusätzlich RLS an: selbst falls das Schema je exponiert wird, sieht der anon-Key nichts (Server-Rolle umgeht RLS).
      await pool.query(`ALTER TABLE ${S}.apps ENABLE ROW LEVEL SECURITY`);
      await pool.query(`ALTER TABLE ${S}.app_files ENABLE ROW LEVEL SECURITY`);
      const { rows } = await pool.query(`SELECT data FROM ${S}.apps ORDER BY created DESC`);
      return rows.map(r => r.data);
    },
    async create(entry, files) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query(`INSERT INTO ${S}.apps (id, created, data) VALUES ($1, $2, $3)`, [entry.id, entry.created, entry]);
        for (const f of files) await c.query(`INSERT INTO ${S}.app_files (app_id, path, content) VALUES ($1, $2, $3)`, [entry.id, f.name, f.data]);
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    },
    async update(entry) { await pool.query(`UPDATE ${S}.apps SET data = $2 WHERE id = $1`, [entry.id, entry]); },
    async remove(id) { await pool.query(`DELETE FROM ${S}.apps WHERE id = $1`, [id]); },
    async file(id, rel) {
      const { rows } = await pool.query(`SELECT content FROM ${S}.app_files WHERE app_id = $1 AND path = $2`, [id, rel]);
      return rows[0]?.content || null;
    },
  };
}

module.exports = { fileStore, pgStore };
