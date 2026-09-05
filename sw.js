/* Home screen service worker.
 *
 * This one is registered from the site ROOT, so unlike the per-app workers its
 * scope is the whole origin — every app lives under "/".  A worker with that
 * reach must not behave like an app worker: caching everything it sees, or
 * falling back to its own index.html for a missed path, would mean an offline
 * visit to another app could be served this page instead.  Narrower workers do
 * win for their own folders, but relying on that is exactly the kind of subtle
 * thing that has served stale copies on this origin before.
 *
 * So it handles an explicit list of its own files and nothing else.  Every
 * other request — every other app — is left completely alone.
 */
const VERSION = "home-2026-09-05";
const CORE = ["/", "/index.html", "/manifest.webmanifest",
              "/icon-180.png", "/icon-192.png", "/icon-512.png"];
const MINE = new Set(CORE);

self.addEventListener("install", e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).catch(()=>{}));
});

self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==VERSION && k.startsWith("home-")).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;
  let url;
  try{ url = new URL(req.url); }catch(err){ return; }
  if(url.origin !== self.location.origin) return;
  /* The whole point: only this page's own files, never another app's. */
  if(!MINE.has(url.pathname)) return;

  /* Network first, so a new deploy always wins when there is a signal. */
  e.respondWith(
    fetch(req).then(res=>{
      if(res && res.ok && res.type === "basic"){
        const copy = res.clone();
        caches.open(VERSION).then(c=>c.put(req, copy)).catch(()=>{});
      }
      return res;
    }).catch(()=>caches.match(req, {ignoreSearch:true})
      .then(hit => hit || (req.mode === "navigate" ? caches.match("/index.html") : undefined))
      .then(hit => hit || new Response("Offline, and this page has not been saved yet.",
        {status:503, headers:{"Content-Type":"text/plain"}})))
  );
});
