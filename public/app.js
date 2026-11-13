(() => {
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const BASE = location.pathname.replace(/[^/]*$/, ''); // funktioniert auch unter /lernapps/
let apps = [], cfg = { appsOrigin: '' };
const state = { q: '', subject: '', grade: '' };
let tokens = store.get('tokens', {});      // id -> ownerToken (nur Ersteller:in)
let adminCode = store.get('adminCode', ''); // gesetzt, wenn Admin-Code verwendet wurde

// ---------- Helfer ----------
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = t => { const el = $('#toast'); el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500); };
const appUrl = a => (cfg.appsOrigin ? cfg.appsOrigin + '/a/' : location.origin + BASE + 'a/') + a.id + '/';
async function api(path, opts = {}) {
  const r = await fetch(BASE + path.replace(/^\//, ''), opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Fehler ' + r.status);
  return j;
}
// "5", "5-6", "5–6", "Sek I" -> {lo,hi} bzw. null
function gradeRange(g) {
  const m = String(g).match(/(\d{1,2})\s*(?:[-–—]\s*(\d{1,2}))?/);
  return m ? { lo: +m[1], hi: +(m[2] || m[1]) } : null;
}
function gradeMatches(a, g) {
  const r = gradeRange(a.grade);
  if (r) return +g >= r.lo && +g <= r.hi;
  return norm(a.grade) === norm(g);
}
const hay = a => norm([a.title, a.subject, a.grade, a.description, a.author, ...(a.tags || [])].join(' '));

// ---------- Filtern & Suchen ----------
function filtered() {
  const tokens = norm(state.q).split(/\s+/).filter(Boolean);
  return apps.filter(a =>
    (!state.subject || a.subject === state.subject) &&
    (!state.grade || gradeMatches(a, state.grade)) &&
    tokens.every(t => hay(a).includes(t)));
}
function hl(text) {
  const tokens = norm(state.q).split(/\s+/).filter(Boolean);
  let out = esc(text);
  if (!tokens.length) return out;
  // Markieren auf dem Originaltext (Normalisierung kann Länge ändern -> nur wenn gleich lang)
  const n = norm(text);
  if (n.length !== text.length) return out;
  const ranges = [];
  tokens.forEach(t => { let i = -1; while ((i = n.indexOf(t, i + 1)) >= 0) ranges.push([i, i + t.length]); });
  ranges.sort((a, b) => a[0] - b[0]);
  let res = '', pos = 0;
  for (const [s, e] of ranges) { if (s < pos) continue; res += esc(text.slice(pos, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>'; pos = e; }
  return res + esc(text.slice(pos));
}

// ---------- Rendering ----------
function chips(el, items, key) {
  el.innerHTML = '';
  [['', 'Alle'], ...items.map(i => [i, i])].forEach(([v, label]) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = label;
    b.setAttribute('aria-pressed', String(state[key] === v));
    b.onclick = () => { state[key] = state[key] === v ? '' : v; render(); };
    el.append(b);
  });
}
function render() {
  const subjects = [...new Set(apps.map(a => a.subject))].sort((a, b) => a.localeCompare(b, 'de'));
  const grades = new Set();
  apps.forEach(a => { const r = gradeRange(a.grade); if (r) for (let g = r.lo; g <= r.hi; g++) grades.add(String(g)); else grades.add(a.grade); });
  chips($('#subjects'), subjects, 'subject');
  chips($('#grades'), [...grades].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })), 'grade');
  $('#dlSubjects').innerHTML = subjects.map(s => `<option value="${esc(s)}">`).join('');

  const list = filtered();
  $('#count').textContent = `${list.length} von ${apps.length} Apps`;
  $('#empty').hidden = list.length > 0;
  $('#list').innerHTML = list.map(a => {
    const mine = tokens[a.id] || adminCode;
    return `<article class="card" data-id="${a.id}">
      <h3>${hl(a.title)}</h3>
      <div class="meta"><span class="tag s">${esc(a.subject)}</span><span class="tag">Kl. ${esc(a.grade)}</span>${(a.tags || []).map(t => `<span class="tag">${hl(t)}</span>`).join('')}</div>
      <p>${hl(a.description || '')}</p>
      ${a.author ? `<span class="by">von ${esc(a.author)}</span>` : ''}
      <div class="actions"><a href="${esc(appUrl(a))}" target="_blank" rel="noopener">Öffnen</a>
        <button data-act="share" aria-label="Teilen">🔗</button>${mine ? '<button data-act="edit" aria-label="Bearbeiten">✏️</button>' : ''}</div>
    </article>`;
  }).join('');
  syncUrl();
}
function syncUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q); if (state.subject) p.set('fach', state.subject); if (state.grade) p.set('klasse', state.grade);
  history.replaceState(null, '', p.toString() ? '?' + p : location.pathname);
}
function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') || ''; state.subject = p.get('fach') || ''; state.grade = p.get('klasse') || '';
  $('#q').value = state.q;
}

// ---------- Teilen ----------
let sharing = null;
function openShare(title, url) {
  sharing = { title, url };
  $('#shareTitle').textContent = title; $('#shareUrl').value = url;
  $('#qr').src = BASE + 'api/qr?text=' + encodeURIComponent(url);
  $('#btnNative').hidden = !navigator.share;
  $('#dlgShare').showModal();
}
$('#btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText(sharing.url); } catch { $('#shareUrl').select(); document.execCommand('copy'); }
  toast('Link kopiert');
};
$('#btnNative').onclick = () => navigator.share({ title: sharing.title, url: sharing.url }).catch(() => {});
$('#btnShareView').onclick = () => openShare('Diese Ansicht', location.href);

// ---------- Events ----------
$('#q').addEventListener('input', e => { state.q = e.target.value; render(); });
$('#btnReset').onclick = () => { state.q = state.subject = state.grade = ''; $('#q').value = ''; render(); };
document.addEventListener('click', e => { if (e.target.classList.contains('cancel')) e.target.closest('dialog').close(); });
$('#list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const a = apps.find(x => x.id === btn.closest('.card').dataset.id);
  if (btn.dataset.act === 'share') openShare(a.title, appUrl(a));
  if (btn.dataset.act === 'edit') openEdit(a);
});

// Upload
$('#btnUpload').onclick = () => { $('#formUpload').code.value = store.get('code', ''); $('#uploadErr').hidden = true; $('#dlgUpload').showModal(); };
$('#formUpload').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, err = $('#uploadErr'), btn = $('#btnSend');
  const fd = new FormData(f); const code = fd.get('code'); fd.delete('code');
  btn.disabled = true; err.hidden = true;
  try {
    const a = await api('/api/apps', { method: 'POST', headers: { 'x-code': code }, body: fd });
    tokens[a.id] = a.ownerToken; store.set('tokens', tokens); store.set('code', code);
    const c = await api('/api/check', { method: 'POST', headers: { 'x-code': code } });
    if (c.admin) { adminCode = code; store.set('adminCode', code); }
    delete a.ownerToken; const sk = a.skipped; delete a.skipped; apps.unshift(a); const skipped = sk;
    f.reset(); $('#dlgUpload').close(); render(); toast(skipped?.length ? `Hochgeladen – ${skipped.length} Datei(en) mit nicht erlaubtem Typ übersprungen` : 'Hochgeladen ✔');
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  btn.disabled = false;
});

// Bearbeiten / Löschen
let editing = null;
const authHeaders = a => adminCode ? { 'x-code': adminCode } : { 'x-owner-token': tokens[a.id] };
function openEdit(a) {
  editing = a; const f = $('#formEdit');
  f.title.value = a.title; f.subject.value = a.subject; f.grade.value = a.grade;
  f.description.value = a.description || ''; f.tags.value = (a.tags || []).join(', ');
  $('#dlgEdit').showModal();
}
$('#formEdit').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  try {
    const u = await api('/api/apps/' + editing.id, { method: 'PUT', headers: { 'content-type': 'application/json', ...authHeaders(editing) },
      body: JSON.stringify({ title: f.title.value, subject: f.subject.value, grade: f.grade.value, description: f.description.value, tags: f.tags.value }) });
    Object.assign(editing, u); $('#dlgEdit').close(); render(); toast('Gespeichert');
  } catch (ex) { toast(ex.message); }
});
$('#btnDelete').onclick = async () => {
  if (!confirm(`„${editing.title}" wirklich löschen?`)) return;
  try {
    await api('/api/apps/' + editing.id, { method: 'DELETE', headers: authHeaders(editing) });
    apps = apps.filter(x => x !== editing); delete tokens[editing.id]; store.set('tokens', tokens);
    $('#dlgEdit').close(); render(); toast('Gelöscht');
  } catch (ex) { toast(ex.message); }
};

// ---------- Start ----------
(async () => {
  readUrl();
  try { [cfg, apps] = await Promise.all([api('/api/config'), api('/api/apps')]); }
  catch { toast('Offline – zuletzt geladene Daten'); }
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
