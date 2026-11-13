// Network-first für API & Apps, Cache-Fallback für die Oberfläche (offline nutzbar).
const C='lernapps-v2',SHELL=['./','style.css','app.js','icon-192.png','albert-head.png','manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url); if(u.origin!==location.origin||u.pathname.includes('/api/qr')) return;
  e.respondWith(fetch(r).then(res=>{if(res.ok&&!u.pathname.includes('/a/')){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r)));
});
