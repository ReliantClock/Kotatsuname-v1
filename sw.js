const CACHE_NAME = 'kotatsuname-v1';
const OFFLINE_URL = '/offline.html'; // Definimos la ruta offline

const ASSETS = [
  '/',
  '/index.html',
  '/escritos_capitulos.html',
  '/libro_capitulo.html',
  '/registrarse.html',
  '/panel_autor.html',
  '/gestion_capítulos.html',
  '/nueva_obra.html',
  '/escritos_buscador.js',
  '/escritos_data.js',
  '/staff_auth.js',
  '/perfil_autor.html',
  '/panel_owner.html',
  '/panel_mod.html',
  '/panel_autor.html',
  '/panel_admin.html',
  '/manifest.json',
  '/buscador.css',
  '/ICONO_192.png',
  '/ICONO_512.png',
  OFFLINE_URL // ¡Simplemente usa la variable aquí!
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intenta cachear todos los archivos definidos
      return cache.addAll(ASSETS);
    })
  );
});

// Lógica mejorada para detectar fallos de red
self.addEventListener('fetch', (evt) => {
  // Solo interceptamos navegaciones de páginas (HTML)
  if (evt.request.mode === 'navigate') {
    evt.respondWith(
      fetch(evt.request).catch(() => {
        // Si el fetch falla (no hay internet), devolvemos la página offline
        return caches.match(OFFLINE_URL);
      })
    );
  } else {
    // Para imágenes/CSS/JS usamos la estrategia normal
    evt.respondWith(
      caches.match(evt.request).then((response) => {
        return response || fetch(evt.request);
      })
    );
  }
});
