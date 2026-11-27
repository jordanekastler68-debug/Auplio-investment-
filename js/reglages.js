'use strict';
/* Réglages (icône profil en haut à droite). */

function renderSettings() {
  document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.themeSet === state.theme));
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-theme-set]');
  if (!t) return;
  state.theme = t.dataset.themeSet;
  save(); applyTheme(); renderSettings();
});
