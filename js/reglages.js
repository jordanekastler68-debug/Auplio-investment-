'use strict';
/* Réglages (icône profil en haut) : le couple, les charges fixes, les crédits en cours, les catégories,
   le thème et la sauvegarde. Chaque champ est enregistré dès qu'on le quitte : pas de bouton « Enregistrer ». */

const FIXED_PRESETS = ['Loyer', 'Électricité', 'Eau', 'Internet', 'Assurances', 'Autre'];
const nextMonthKey = () => { const d = new Date(); d.setMonth(d.getMonth() + 12); return d.toISOString().slice(0, 7); };

// Réglages des sauvegardes : rempli à l'étape « sauvegarde » (js/auto.js).
let renderBackup = () => {};

function renderSettings() {
  const active = document.activeElement;
  const keep = active && active.closest && active.closest('#v-settings input, #v-settings select');
  // On ne redessine pas une liste pendant qu'on y tape.
  if (!keep || !keep.closest('#coupleEdit')) {
    $('coupleEdit').innerHTML = WHO.map((w, i) => {
      const p = state.people[i];
      return `<div class="person-edit">
        <h3>${whoDot(w)} ${esc(whoName(w))}</h3>
        <label class="field">Prénom<input type="text" maxlength="20" data-person="${i}" data-k="name" value="${esc(p.name)}"></label>
        <div class="row">
          <label class="field euro">Salaire net avant impôt sur le revenu, par mois<input type="text" inputmode="decimal" data-person="${i}" data-k="salary" value="${p.salary ? numStr(p.salary) : ''}"></label>
          <label class="field" style="flex:0 0 96px">Jour de paie<input type="number" min="1" max="31" inputmode="numeric" data-person="${i}" data-k="payDay" value="${p.payDay}"></label>
        </div>
      </div>`;
    }).join('');
  }
  if (!keep || !keep.closest('#fixedEdit')) {
    $('fixedEdit').innerHTML = state.fixed.length ? state.fixed.map(f => `<li class="er">
        <div class="er-top"><b>${esc(f.label)}</b><button type="button" class="x" data-del-fixed="${f.id}" aria-label="Supprimer ${esc(f.label)}">×</button></div>
        <div class="er-bot">
          <button type="button" class="who-btn" data-who-fixed="${f.id}">${whoDot(f.who)}${esc(whoName(f.who))}</button>
          <label class="euro"><input type="text" inputmode="decimal" data-fixed="${f.id}" data-k="amount" value="${f.amount ? numStr(f.amount) : ''}" placeholder="0" aria-label="Montant de ${esc(f.label)}"></label>
          <label class="er-day">le <input type="number" min="1" max="31" inputmode="numeric" data-fixed="${f.id}" data-k="day" value="${f.day}" aria-label="Jour du mois"></label>
        </div></li>`).join('')
      : '<li class="empty">Aucune charge fixe.</li>';
  }
  $('fixedAdd').innerHTML = FIXED_PRESETS.map(l => `<button type="button" class="chip" data-add-fixed="${esc(l)}">+ ${esc(l)}</button>`).join('');
  if (!keep || !keep.closest('#loansEdit')) {
    $('loansEdit').innerHTML = state.loans.length ? state.loans.map(l => `<li class="er">
        <div class="er-top"><input type="text" maxlength="30" data-loan="${l.id}" data-k="label" value="${esc(l.label)}" aria-label="Nom du crédit"><button type="button" class="x" data-del-loan="${l.id}" aria-label="Supprimer ${esc(l.label)}">×</button></div>
        <div class="er-bot wrap">
          <button type="button" class="who-btn" data-who-loan="${l.id}">${whoDot(l.who)}${esc(whoName(l.who))}</button>
          <label class="euro"><input type="text" inputmode="decimal" data-loan="${l.id}" data-k="monthly" value="${l.monthly ? numStr(l.monthly) : ''}" placeholder="0" aria-label="Mensualité"></label>
          <label class="er-end">Dernière échéance <input type="month" data-loan="${l.id}" data-k="end" value="${l.end}" aria-label="Mois de la dernière échéance"></label>
        </div></li>`).join('')
      : '<li class="empty">Aucun crédit en cours.</li>';
  }
  $('addLoanA').innerHTML = `+ crédit de ${esc(whoName('a'))}`;
  $('addLoanB').innerHTML = `+ crédit de ${esc(whoName('b'))}`;
  $('catEdit').innerHTML = state.categories.map(c => `<span class="chip">${esc(c)}<button type="button" class="x" data-del-cat="${esc(c)}" aria-label="Supprimer ${esc(c)}">×</button></span>`).join('');
  document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.themeSet === state.theme));
  renderBackup();
}

function addFixed(label, amount = 0, who = 'ab') {
  const f = { id: uid(), label: label === 'Autre' ? 'Autre charge' : label, amount, cat: chargeCat(label), who, day: 5, from: curMonth() };
  state.fixed.push(f);
  return f;
}
function addLoan(who) {
  const l = { id: uid(), label: 'Crédit', who, monthly: 0, end: nextMonthKey(), day: 5, from: curMonth() };
  state.loans.push(l);
  return l;
}

// Champs modifiés (enregistrés à la sortie du champ).
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.person !== undefined) {
    const p = state.people[+d.person];
    if (d.k === 'name') p.name = t.value.trim().slice(0, 20);
    if (d.k === 'salary') p.salary = Math.max(0, parseNum(t.value));
    if (d.k === 'payDay') p.payDay = clamp(Math.round(parseNum(t.value)) || 1, 1, 31);
  } else if (d.fixed) {
    const f = state.fixed.find(x => x.id === d.fixed); if (!f) return;
    if (d.k === 'amount') f.amount = Math.max(0, parseNum(t.value));
    if (d.k === 'day') f.day = clamp(Math.round(parseNum(t.value)) || 1, 1, 31);
  } else if (d.loan) {
    const l = state.loans.find(x => x.id === d.loan); if (!l) return;
    if (d.k === 'label') l.label = t.value.trim() || 'Crédit';
    if (d.k === 'monthly') l.monthly = Math.max(0, parseNum(t.value));
    if (d.k === 'end' && /^\d{4}-\d{2}$/.test(t.value)) l.end = t.value;
  } else return;
  save();
  // On ne redessine qu'en cas de changement de prénom : redessiner pendant qu'on passe d'un champ
  // à l'autre ferait perdre le toucher en cours.
  if (d.k === 'name') render();
});

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t || !t.closest('#v-settings')) return;
  const d = t.dataset;
  if (d.themeSet) { state.theme = d.themeSet; applyTheme(); }
  else if (d.whoFixed) { const f = state.fixed.find(x => x.id === d.whoFixed); if (f) f.who = nextWho(f.who); }
  else if (d.whoLoan) { const l = state.loans.find(x => x.id === d.whoLoan); if (l) l.who = nextWho(l.who, false); }
  else if (d.addFixed) { const f = addFixed(d.addFixed); save(); render(); const i = document.querySelector(`[data-fixed="${f.id}"][data-k="amount"]`); if (i) i.focus(); return; }
  else if (d.addLoan) { const l = addLoan(d.addLoan); save(); render(); const i = document.querySelector(`[data-loan="${l.id}"][data-k="monthly"]`); if (i) i.focus(); return; }
  else if (d.delFixed) {
    const f = state.fixed.find(x => x.id === d.delFixed);
    if (!f || !confirm(`Supprimer la charge « ${f.label} » ? Les mois déjà passés restent dans l'historique.`)) return;
    state.fixed = state.fixed.filter(x => x !== f);
  } else if (d.delLoan) {
    const l = state.loans.find(x => x.id === d.delLoan);
    if (!l || !confirm(`Supprimer « ${l.label} » ? Les mois déjà passés restent dans l'historique.`)) return;
    state.loans = state.loans.filter(x => x !== l);
  } else if (d.delCat) {
    if (state.categories.length <= 1) return toast('Il faut garder au moins une catégorie');
    state.categories = state.categories.filter(c => c !== d.delCat);
  } else return;
  save(); render();
});

$('catForm').addEventListener('submit', e => {
  e.preventDefault();
  const n = $('catName').value.trim();
  if (n && !state.categories.includes(n)) { state.categories.push(n); save(); render(); }
  $('catName').value = '';
});
