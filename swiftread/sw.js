/* Swiftread offline cache: network first, cached copy when offline. Only this folder's GET requests. */
var C = "swiftread-v3";
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(C).then(function (c) { return c.addAll(["./", "swiftread.css", "swiftread.js", "../config.js", "data/y8-en-1-1.json", "data/y7-en-1-1.json"]); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r && r.ok) { var copy = r.clone(); caches.open(C).then(function (c) { c.put(e.request, copy); }); }
    return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
