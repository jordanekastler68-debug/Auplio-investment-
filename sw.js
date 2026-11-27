// Fonctionnement hors ligne de la version web (GitHub Pages). L'APK n'en a pas besoin.
// Incrémenter VERSION à chaque mise en ligne pour forcer la mise à jour.
const VERSION = 'nestgoal-v1';
const ASSETS = ['./', 'index.html', 'css/styles.css', 'manifest.webmanifest',
  'fonts/PlusJakartaSans-latin.woff2', 'fonts/PlusJakartaSans-latin-ext.woff2',
  'icons/icon-192.png', 'icons/icon-512.png',
  'js/core.js', 'js/calc.js', 'js/reglages.js', 'js/onboarding.js', 'js/projet.js', 'js/accueil.js',
  'js/ajout.js', 'js/mois.js', 'js/auto.js', 'js/main.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord (pour récupérer les mises à jour), copie locale si hors ligne.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
