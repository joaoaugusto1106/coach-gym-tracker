/* Coach — service worker.

   Goal: the app opens and a full session can be logged with no network at all.

   IMPORTANT: this only ever touches the Cache Storage buckets it created
   itself. Your training data lives in localStorage, which a service worker
   cannot read, write or clear. Nothing here can lose a session.

   Strategy
   - navigations (the HTML shell): network-first, falling back to cache, so you
     get updates when online but the app still opens on the gym floor
   - same-origin static assets: stale-while-revalidate — serve the cached copy
     instantly, refresh it in the background for next launch
   - anything cross-origin: passed straight through, never cached

   To ship a new version, bump VERSION. Old caches are deleted on activate. */

var VERSION = "v4.0.0";
var CACHE = "coach-" + VERSION;

var SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./js/util.js",
  "./js/data.js",
  "./js/store.js",
  "./js/model.js",
  "./js/ui.js",
  "./js/views.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/favicon-64.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll is all-or-nothing; add individually so one bad entry can't
      // leave the app with no offline shell at all
      return Promise.all(SHELL.map(function (url) {
        return c.add(new Request(url, { cache: "reload" }))["catch"](function (err) {
          console.warn("Coach SW: could not precache", url, err);
        });
      }));
    })
  );
  // do NOT skipWaiting here — the page decides when to switch, so an update
  // never yanks the ground out from under a session in progress
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        // only ever delete our own buckets
        if (k.indexOf("coach-") === 0 && k !== CACHE) return caches["delete"](k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data && e.data.type === "VERSION") {
    if (e.source) e.source.postMessage({ type: "VERSION", version: VERSION });
  }
});

function isStatic(url) {
  return /\.(?:css|js|png|svg|webmanifest|json|woff2?)$/i.test(url.pathname);
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;      // never touch third parties

  // The HTML shell: prefer the network so updates land, fall back to cache.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        return res;
      })["catch"](function () {
        return caches.match("./index.html").then(function (hit) {
          return hit || caches.match("./") || new Response(
            "<h1>Coach is offline</h1><p>Open the app once while online to finish installing it.</p>",
            { headers: { "Content-Type": "text/html" } }
          );
        });
      })
    );
    return;
  }

  if (!isStatic(url)) return;

  // Static assets: cache-first for speed, refreshed in the background.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })["catch"](function () { return hit; });
      return hit || net;
    })
  );
});
