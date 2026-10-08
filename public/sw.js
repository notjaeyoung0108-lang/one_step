const CACHE='one-step-shell-v1';
const SHELL=['./','./index.html','./style.css','./app.js','./config.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('one-step-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
// Never cache authentication, schedules, API responses, or POST requests.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url),base=new URL(self.registration.scope);
  if(url.origin!==base.origin||!SHELL.some(p=>new URL(p,base).pathname===url.pathname))return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;}).catch(()=>caches.match(e.request)));
});
