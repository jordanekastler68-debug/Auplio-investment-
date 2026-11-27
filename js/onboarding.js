'use strict';
/* Démarrage : 5 écrans, une seule fois, moins de 2 minutes. On peut tout corriger ensuite dans les réglages. */

const SETUP_CHARGES = ['Loyer', 'Électricité', 'Eau', 'Internet', 'Assurances', 'Autres'];
let setupStep = 0;
const SETUP_STEPS = 5;

function setupBody(i) {
  const [A, B] = state.people, h = state.house;
  const nameA = esc(whoName('a')), nameB = esc(whoName('b'));
  if (i === 0) return `
    <h1>Bienvenue dans NestGoal</h1>
    <p class="lead">Une seule question : quand est-ce que vous achetez votre maison ? Commençons par vos prénoms.</p>
    <label class="field big">Ton prénom<input id="suNameA" type="text" maxlength="20" value="${esc(A.name)}" placeholder="Prénom 1" autocapitalize="words" required></label>
    <label class="field big">Le prénom de ton ou ta partenaire<input id="suNameB" type="text" maxlength="20" value="${esc(B.name)}" placeholder="Prénom 2" autocapitalize="words" required></label>`;
  if (i === 1) return `
    <h1>Vos salaires</h1>
    <p class="lead">Le salaire net <b>avant impôt sur le revenu</b>, par mois : c'est la ligne « net à payer avant impôt sur le revenu » de la fiche de paie. C'est ce chiffre que regarde la banque.</p>
    ${[['a', A], ['b', B]].map(([w, p]) => `
      <div class="row">
        <label class="field euro big">${whoDot(w)}${esc(whoName(w))} : salaire net avant impôt sur le revenu<input data-su-salary="${w}" type="text" inputmode="decimal" value="${p.salary ? numStr(p.salary) : ''}" placeholder="0"></label>
        <label class="field big" style="flex:0 0 92px">Payé le<input data-su-payday="${w}" type="number" min="1" max="31" inputmode="numeric" value="${p.payDay}"></label>
      </div>`).join('')}`;
  if (i === 2) return `
    <h1>La maison visée</h1>
    <p class="lead">Un prix approximatif suffit, vous pourrez le changer dans l'onglet Projet.</p>
    <label class="field euro big">Prix de la maison<input id="suPrice" type="text" inputmode="decimal" value="${h.price ? numStr(h.price) : ''}" placeholder="0"></label>
    <p class="field">Ancien ou neuf ?</p>
    <div class="seg" id="suType"><button type="button" data-su-type="ancien" class="${h.type === 'ancien' ? 'on' : ''}">Ancien</button><button type="button" data-su-type="neuf" class="${h.type === 'neuf' ? 'on' : ''}">Neuf</button></div>
    <label class="field euro big" style="margin-top:14px">Apport déjà épargné, à deux<input id="suSaved" type="text" inputmode="decimal" value="${h.saved ? numStr(h.saved) : ''}" placeholder="0"></label>`;
  if (i === 3) return `
    <h1>Les charges fixes</h1>
    <p class="lead">Le montant par mois. Laissez vide ce que vous n'avez pas. Elles seront ajoutées toutes seules chaque mois.</p>
    ${SETUP_CHARGES.map(l => { const f = state.fixed.find(x => x.label === (l === 'Autres' ? 'Autres charges' : l));
      return `<label class="charge-line"><span>${l}</span><span class="euro"><input data-su-charge="${l}" type="text" inputmode="decimal" value="${f ? numStr(f.amount) : ''}" placeholder="0" aria-label="${l}, par mois"></span></label>`; }).join('')}`;
  return `
    <h1>Les crédits en cours</h1>
    <p class="lead">Voiture, travaux, prêt étudiant… La mensualité et le mois de la dernière échéance. Un crédit qui se termine avant l'achat ne sera plus compté.</p>
    ${WHO.map(w => `
      <h3 class="field" style="margin-top:16px">${whoDot(w)}${w === 'a' ? nameA : nameB}</h3>
      ${state.loans.filter(l => l.who === w).map(l => `<div class="loan-line">
        <label class="field euro">Mensualité<input data-su-loan="${l.id}" data-k="monthly" type="text" inputmode="decimal" value="${l.monthly ? numStr(l.monthly) : ''}" placeholder="0"></label>
        <label class="field">Dernière échéance<input data-su-loan="${l.id}" data-k="end" type="month" value="${l.end}"></label>
        <button type="button" class="x" data-su-del-loan="${l.id}" aria-label="Retirer">×</button></div>`).join('') || '<p class="empty">Aucun crédit.</p>'}
      <button type="button" class="chip" data-su-add-loan="${w}">+ Ajouter un crédit</button>`).join('')}`;
}

function renderSetup() {
  $('setupDots').innerHTML = Array.from({ length: SETUP_STEPS }, (_, i) => `<i class="${i <= setupStep ? 'on' : ''}"></i>`).join('');
  $('setupForm').className = 'setup';
  $('setupForm').innerHTML = setupBody(setupStep) + `
    <div class="setup-nav">
      ${setupStep ? '<button type="button" class="link" id="suBack">Retour</button>' : ''}
      <button type="submit" class="btn">${setupStep === SETUP_STEPS - 1 ? 'C\'est parti' : 'Suivant'}</button>
    </div>`;
  const first = $('setupForm').querySelector('input');
  if (first && !first.value && setupStep < 4) setTimeout(() => first.focus(), 50);
}

// Lit les champs de l'écran en cours et les range dans les données.
function readSetup() {
  const q = sel => [...$('setupForm').querySelectorAll(sel)];
  if (setupStep === 0) {
    state.people[0].name = $('suNameA').value.trim().slice(0, 20);
    state.people[1].name = $('suNameB').value.trim().slice(0, 20);
  } else if (setupStep === 1) {
    q('[data-su-salary]').forEach(i => { state.people[i.dataset.suSalary === 'b' ? 1 : 0].salary = Math.max(0, parseNum(i.value)); });
    q('[data-su-payday]').forEach(i => { state.people[i.dataset.suPayday === 'b' ? 1 : 0].payDay = clamp(Math.round(parseNum(i.value)) || 1, 1, 31); });
  } else if (setupStep === 2) {
    state.house.price = Math.max(0, parseNum($('suPrice').value));
    state.house.saved = Math.max(0, parseNum($('suSaved').value));
    state.house.savedAt = curMonth();
  } else if (setupStep === 3) {
    q('[data-su-charge]').forEach(i => {
      const label = i.dataset.suCharge === 'Autres' ? 'Autres charges' : i.dataset.suCharge, v = Math.max(0, parseNum(i.value));
      const f = state.fixed.find(x => x.label === label);
      if (v > 0 && f) f.amount = v;
      else if (v > 0) addFixed(label, v, 'ab');
      else if (f) state.fixed = state.fixed.filter(x => x !== f);
    });
  } else {
    q('[data-su-loan]').forEach(i => {
      const l = state.loans.find(x => x.id === i.dataset.suLoan); if (!l) return;
      if (i.dataset.k === 'monthly') l.monthly = Math.max(0, parseNum(i.value));
      if (i.dataset.k === 'end' && /^\d{4}-\d{2}$/.test(i.value)) l.end = i.value;
    });
  }
}

$('setupForm').addEventListener('submit', e => {
  e.preventDefault();
  readSetup();
  if (setupStep === 0 && (!state.people[0].name || !state.people[1].name)) return toast('Indiquez vos deux prénoms');
  if (setupStep === 1 && !state.people.some(p => p.salary > 0)) return toast('Indiquez au moins un salaire');
  if (setupStep < SETUP_STEPS - 1) { setupStep++; save(); renderSetup(); window.scrollTo(0, 0); return; }
  state.loans = state.loans.filter(l => l.monthly > 0);
  state.house.rateAt = state.house.rateAt || todayISO();
  state.setupDone = todayISO();
  save(); show('home');
  toast('C\'est prêt !');
});

$('setupForm').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (t.id === 'suBack') { readSetup(); setupStep = Math.max(0, setupStep - 1); renderSetup(); }
  else if (d.suType) { state.house.type = d.suType; readSetup(); renderSetup(); }
  else if (d.suAddLoan) { readSetup(); const l = addLoan(d.suAddLoan); renderSetup(); const i = document.querySelector(`[data-su-loan="${l.id}"]`); if (i) i.focus(); }
  else if (d.suDelLoan) { readSetup(); state.loans = state.loans.filter(l => l.id !== d.suDelLoan); renderSetup(); }
});
