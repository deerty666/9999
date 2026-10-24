const CACHE_NAME = "deerty-delivery-ledger-v1";

const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png"
];


/* =========================
   تثبيت التطبيق وتخزين ملفاته
========================= */

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .catch(error => {
                console.error(
                    "تعذر تخزين بعض ملفات التطبيق:",
                    error
                );
            })
    );

    self.skipWaiting();
});


/* =========================
   تفعيل النسخة الجديدة
========================= */

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );

    self.clients.claim();
});


/* =========================
   التعامل مع طلبات الملفات
========================= */

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") {
        return;
    }

    const requestURL = new URL(event.request.url);

    // لا نتعامل مع مواقع خارج التطبيق.
    if (requestURL.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then(response => {
                if (
                    response &&
                    response.status === 200 &&
                    response.type === "basic"
                ) {
                    const responseCopy = response.clone();

                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseCopy);
                    });
                }

                return response;
            }).catch(() => {
                if (event.request.mode === "navigate") {
                    return caches.match("./index.html");
                }

                return new Response(
                    "الملف غير متوفر دون اتصال بالإنترنت.",
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
