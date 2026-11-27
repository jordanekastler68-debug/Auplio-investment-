'use strict';
/* Automatismes et sauvegarde.
   - Charges fixes et mensualités des crédits ajoutées automatiquement chaque mois, le jour indiqué.
   - Sauvegarde : toutes les données dans un fichier, pour ne rien perdre en changeant de téléphone. */

function runAuto() {
  if (!state.setupDone) return false;
  const due = NGCalc.dueAutoEntries(state, todayISO());
  if (!due.length) return false;
  due.forEach(e => state.expenses.push({ id: uid(), ...e }));
  save();
  return true;
}

/* ---------- Sauvegarde dans un fichier ---------- */
const BACKUP_DAYS = 30;
const backupLate = () => state.setupDone && Date.now() - (state.lastExport || Date.parse(state.setupDone)) > BACKUP_DAYS * 864e5;

function download(name, content, type) {
  if (ANDROID && ANDROID.save) return ANDROID.save(name, content, type);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

function exportData() {
  state.lastExport = Date.now();
  const file = { app: 'NestGoal', format: 1, exportedAt: new Date().toISOString(), data: state };
  const ok = download(`nestgoal-sauvegarde-${todayISO()}.json`, JSON.stringify(file, null, 1), 'application/json');
  if (!ok) { state.lastExport = 0; return toast('Enregistrement du fichier impossible'); }
  save(); render();
  toast(ANDROID ? 'Fichier enregistré dans Téléchargements › NestGoal' : 'Fichier de sauvegarde téléchargé');
}

async function importData(f) {
  try {
    const j = JSON.parse(await f.text());
    const d = j && j.app === 'NestGoal' ? j.data : j;
    if (!valid(d)) throw new Error('format');
    const n = d.expenses.length;
    if (!confirm(`Remplacer toutes les données de ce téléphone par cette sauvegarde (${n} dépense${n > 1 ? 's' : ''}${j.exportedAt ? `, du ${dateLabel(j.exportedAt.slice(0, 10))}` : ''}) ?`)) return;
    state = normalize(d);
    await save(); runAuto(); show('home');
    toast('Sauvegarde importée');
  } catch (e) { toast('Ce fichier n\'est pas une sauvegarde NestGoal'); }
}

renderBackup = () => {
  $('backupBox').innerHTML = `
    <p class="small">${state.lastExport ? `Dernière sauvegarde le ${dateLabel(new Date(state.lastExport).toISOString().slice(0, 10))}.` : 'Aucune sauvegarde pour l\'instant.'}
      Les données ne sont que sur ce téléphone : gardez le fichier en lieu sûr (mail, Drive…) pour les retrouver sur un nouveau téléphone.</p>
    <button type="button" class="btn" id="exportBtn" style="margin-top:10px">Exporter toutes les données</button>
    <label class="btn ghost" style="margin-top:8px">Importer une sauvegarde<input type="file" id="importFile" accept="application/json,.json" hidden></label>
    <p class="hint">${saveOk ? 'Enregistré sur ce téléphone' : 'Le dernier enregistrement a échoué'}${ANDROID && ANDROID.version ? ` · NestGoal ${esc(ANDROID.version())}` : ''}</p>`;
};
document.addEventListener('click', e => { if (e.target.closest('#exportBtn')) exportData(); });
document.addEventListener('change', e => {
  if (e.target.id !== 'importFile') return;
  const f = e.target.files[0]; e.target.value = '';
  if (f) importData(f);
});

// Les lignes automatiques sont créées à l'ouverture, au retour dans l'appli et chaque heure.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && runAuto()) render(); });
setInterval(() => { if (document.visibilityState === 'visible' && runAuto()) render(); }, 3600e3);
