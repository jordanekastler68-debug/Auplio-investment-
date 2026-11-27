'use strict';
/* Démarrage et navigation entre les écrans. */

const VIEWS = {
  home: () => {},
  settings: renderSettings,
};
let current = 'home', previous = 'home';

function show(name) {
  if (name !== current) { previous = current; current = name; }
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + name));
  window.scrollTo(0, 0);
  render();
}
function render() {
  applyTheme();
  (VIEWS[current] || (() => {}))();
}

$('profileBtn').onclick = () => show('settings');
document.addEventListener('click', e => { if (e.target.closest('[data-back]')) show(previous === 'settings' ? 'home' : previous); });

load().then(data => {
  state = data;
  show('home');
  setTimeout(() => $('splash').classList.add('gone'), 350);
  if (!ANDROID && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
});
if (!ANDROID && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
