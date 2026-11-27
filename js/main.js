'use strict';
/* Démarrage et navigation : 3 onglets (Accueil, Mois, Projet), le bouton + au centre,
   et les réglages derrière l'icône profil. */

const VIEWS = {
  home: renderHome,
  month: () => {},
  project: renderProject,
  settings: renderSettings,
  setup: renderSetup,
};
const TABS = ['home', 'month', 'project'];
let current = 'home', lastTab = 'home';

function show(name) {
  current = name;
  if (TABS.includes(name)) lastTab = name;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + name));
  document.querySelectorAll('#tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  document.body.classList.toggle('no-nav', name === 'setup');
  window.scrollTo(0, 0);
  render();
}
function render() {
  applyTheme();
  if (!state.setupDone && current !== 'setup') { show('setup'); return; }
  (VIEWS[current] || (() => {}))();
}
/* Les réglages (et la fenêtre d'ajout) prennent une entrée dans l'historique : le bouton « retour »
   d'Android les referme au lieu de quitter l'appli. */
let pendingView = null;
function openSettings(anchor) {
  if (current !== 'settings') { history.pushState({ ng: 'settings' }, ''); show('settings'); }
  if (anchor && $(anchor)) setTimeout(() => $(anchor).scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
}
function goView(name) {
  if (current === 'settings') { pendingView = name; history.back(); } else show(name);
}
window.addEventListener('popstate', () => {
  for (const h of backHandlers) if (h()) return;
  if (current === 'settings') { show(pendingView || lastTab); pendingView = null; }
});

$('tabbar').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) goView(b.dataset.view); });
$('profileBtn').onclick = () => openSettings();
document.addEventListener('click', e => {
  if (e.target.closest('[data-back]')) return history.back();
  const go = e.target.closest('[data-go]');
  if (go) { const [v, anchor] = go.dataset.go.split('#'); v === 'settings' ? openSettings(anchor) : goView(v); }
});

load().then(data => {
  state = data;
  show(state.setupDone ? 'home' : 'setup');
  setTimeout(() => $('splash').classList.add('gone'), 350);
  if (!ANDROID && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
});
if (!ANDROID && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
