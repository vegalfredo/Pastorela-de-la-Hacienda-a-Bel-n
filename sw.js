// Guarda la página, las letras y los audios para que funcionen sin internet.
// Este archivo lo genera el armado de la página: los nombres cambian si cambian los audios o las letras.
const CACHE_PAGINA = 'pastorela-pagina';
const CACHE_RECURSOS = 'pastorela-recursos-0fbd40246158';
const LETRAS = ["fonts/literata.woff2", "fonts/special-elite.woff2"];
const ESPERA_RED = 3500;

self.addEventListener('install', function (evento) {
  evento.waitUntil(Promise.all([
    caches.open(CACHE_PAGINA).then(function (c) { return c.add('./'); }),
    caches.open(CACHE_RECURSOS).then(function (c) { return c.addAll(LETRAS); })
  ]).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(caches.keys().then(function (nombres) {
    return Promise.all(nombres.filter(function (n) {
      return n.indexOf('pastorela-') === 0 && n !== CACHE_PAGINA && n !== CACHE_RECURSOS;
    }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

// La página: se usa la versión más nueva si hay red; si no hay o tarda, la guardada
async function pagina(evento) {
  const cache = await caches.open(CACHE_PAGINA);
  const guardada = await cache.match('./');
  const red = fetch(evento.request).then(function (r) {
    if (r.ok) return cache.put('./', r.clone()).then(function () { return r; });
    return r;
  });
  if (!guardada) return red;
  evento.waitUntil(red.catch(function () {}));
  return Promise.race([
    red.catch(function () { return guardada; }),
    new Promise(function (listo) { setTimeout(function () { listo(guardada); }, ESPERA_RED); })
  ]);
}

// Los audios: los teléfonos, sobre todo iPhone, los piden por pedazos
async function audio(peticion) {
  const cache = await caches.open(CACHE_RECURSOS);
  const guardado = await cache.match(peticion.url, { ignoreSearch: true, ignoreVary: true });
  if (!guardado) return fetch(peticion);
  const rango = peticion.headers.get('range');
  if (!rango) return guardado;
  const datos = await guardado.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(rango);
  const total = datos.size;
  let inicio = m && m[1] !== '' ? Number(m[1]) : 0;
  let fin = m && m[2] !== '' ? Math.min(Number(m[2]), total - 1) : total - 1;
  if (m && m[1] === '' && m[2] !== '') {
    inicio = Math.max(0, total - Number(m[2]));
    fin = total - 1;
  }
  if (inicio >= total) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
  }
  return new Response(datos.slice(inicio, fin + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fin - inicio + 1),
      'Content-Range': 'bytes ' + inicio + '-' + fin + '/' + total
    }
  });
}

self.addEventListener('fetch', function (evento) {
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (evento.request.mode === 'navigate') {
    evento.respondWith(pagina(evento));
  } else if (url.pathname.indexOf('/sonidos/') !== -1) {
    evento.respondWith(audio(evento.request));
  } else {
    evento.respondWith(caches.match(evento.request).then(function (r) { return r || fetch(evento.request); }));
  }
});
