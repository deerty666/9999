"use strict";

const CACHE_NAME = "deerty-drivers-v3";

const APP_FILES = [
"./",
"./index.html",
"./style.css",
"./app.js",
"./manifest.json",
"./Icon-192.png",
"./Icon-512.png"
];

self.addEventListener("install", event => {
event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => cache.addAll(APP_FILES))
.then(() => self.skipWaiting())
);
});

self.addEventListener("activate", event => {
event.waitUntil(
caches.keys()
.then(keys => Promise.all(
keys
.filter(key => key.startsWith("deerty-drivers-") && key !== CACHE_NAME)
.map(key => caches.delete(key))
))
.then(() => self.clients.claim())
);
});

self.addEventListener("fetch", event => {
if (event.request.method !== "GET") return;

const requestURL = new URL(event.request.url);

if (requestURL.origin !== self.location.origin) return;

// جلب ملفات التطبيق الأساسية من الشبكة أولًا للتحقق من آخر إصدار
if (
event.request.mode === "navigate" ||
APP_FILES.some(file => new URL(file, self.registration.scope).href === requestURL.href)
) {
event.respondWith(
fetch(event.request)
.then(response => {
if (response && response.ok) {
const copy = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => cache.put(event.request, copy));

        return response;
      }

      return caches.match(event.request).then(cached => cached || response);
    })
    .catch(() =>
      caches.match(event.request).then(cached =>
        cached || caches.match("./index.html")
      )
    )
);

return;

}

// الملفات الأخرى: استخدام الكاش أولًا
event.respondWith(
caches.match(event.request)
.then(cachedResponse => {
if (cachedResponse) return cachedResponse;

    return fetch(event.request)
      .then(response => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, copy));
        }

        return response;
      })
      .catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }

        return new Response(
          "هذا الملف غير متاح دون اتصال بالإنترنت.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      });
  })

);
});
