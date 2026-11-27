'use strict';
/* Onglet Projet : la date d'achat, l'apport, le crédit possible et les « et si… ? ». */

function planNow() {
  const today = todayISO();
  const params = NGCalc.planParams(state, today);
  return { today, params, hh: NGCalc.household(state, today), plan: NGCalc.purchasePlan(params) };
}

// Phrase principale : la date d'achat, ou ce qui manque.
// Tant qu'il n'y a ni salaire reçu ni un mois complet de dépenses, la date reste une estimation provisoire.
function planHeadline(plan, hh) {
  const rough = hh && !hh.goalManual && (hh.receivedEstimated || !hh.usualBasis) ? ' · estimation provisoire' : '';
  if (plan.ok) return { date: plan.months === 0 ? 'Dès maintenant' : `En ${monthName(plan.month)}`, sub: (plan.months === 0 ? 'L\'apport est réuni et la banque peut suivre.' : `dans ${duration(plan.months)}`) + (plan.months ? rough : '') };
  if (plan.reason === 'no-price') return { date: 'Quel prix visez-vous ?', sub: 'Indiquez le prix de la maison dans l\'onglet Projet.', no: true };
  return { date: 'Pas possible pour l\'instant', sub: plan.reason === 'no-saving' ? 'Vous n\'épargnez rien chaque mois.' : 'Pas dans les 30 prochaines années à ce rythme.', no: true };
}

function missingHTML(plan) {
  if (plan.ok || plan.reason === 'no-price') return '';
  const parts = [];
  if (plan.missingApport > 0) parts.push(`Il manque <b>${fmt0(plan.missingApport)}</b> d'apport${plan.reason === 'no-saving' ? ' et rien n\'est épargné chaque mois' : ''}.`);
  if (plan.missingLoan > 0) parts.push(`Il manque <b>${fmt0(plan.missingLoan)}</b> de crédit : la banque peut prêter environ ${fmt0(plan.capacity)}, il faudrait ${fmt0(plan.needAtTarget)}. Une maison d'environ <b>${fmt0(Math.floor(plan.maxPrice / 1000) * 1000)}</b> serait finançable aujourd'hui.`);
  if (!parts.length) parts.push('Augmentez l\'épargne prévue par mois.');
  return `<div class="missing">${parts.join('<br>')}</div>`;
}

function renderProject() {
  const { params, hh, plan } = planNow(), h = state.house;
  const head = planHeadline(plan, hh);
  const ratio = plan.target > 0 ? hh.savedNow / plan.target : 0;
  let html = `<div class="card hero">
      <p class="kicker">Achat de la maison</p>
      <p class="date${head.no ? ' no' : ''}">${esc(head.date)}</p>
      <p class="sub">${esc(head.sub)}${h.price ? ` · maison à ${fmt0(h.price)}, ${h.type}` : ''}</p>
      ${missingHTML(plan)}
    </div>`;
  if (h.price > 0) {
    html += `<div class="card">
      <h2>L'apport</h2>
      <div class="seg" id="pjMode">
        <button type="button" data-pj-mode="notaire" class="${h.apportMode === 'notaire' ? 'on' : ''}">Notaire seul</button>
        <button type="button" data-pj-mode="notaire10" class="${h.apportMode === 'notaire10' ? 'on' : ''}">Notaire + 10 %</button>
      </div>
      ${progressBar(ratio, ratio >= 1 ? 'ok' : '')}
      <ul class="lines">
        <li><span>Épargne réunie</span><span>${fmt0(hh.savedNow)}</span></li>
        <li><span>Apport visé${h.apportMode === 'notaire10' ? ' (frais + 10 % du prix)' : ' (frais de notaire)'}</span><span>${fmt0(plan.target)}</span></li>
        <li><span class="muted">dont frais de notaire (${pctStr(NGCalc.notaryRate(h.type))})</span><span class="muted">${fmt0(plan.fees)}</span></li>
        <li><span>Épargne prévue par mois</span><span>${fmt0(hh.goal)}</span></li>
      </ul>
    </div>`;
    const at = plan.ok ? plan : null;
    const counted = at ? at.loansCounted : NGCalc.runningLoans(state.loans, hh.cur);
    const capacity = at ? at.capacity : plan.capacity;
    const maxM = NGCalc.maxMonthly(hh.income, sum(counted.map(l => l.monthly)));
    html += `<div class="card">
      <h2>Le crédit${at && at.months ? ` en ${monthName(at.month)}` : ''}</h2>
      <ul class="lines">
        <li><span>Revenus nets avant impôt du couple</span><span>${fmt0(hh.income)}</span></li>
        <li><span>Mensualité maximale (35 %, assurance comprise)</span><span>${fmt0(maxM)}</span></li>
        ${counted.length ? `<li><span class="muted">dont crédits en cours déduits</span><span class="muted">− ${fmt0(sum(counted.map(l => l.monthly)))}</span></li>` : ''}
        <li class="strong"><span>Crédit possible</span><span>${fmt0(capacity)}</span></li>
        ${at ? `<li><span>À emprunter (prix + notaire − apport)</span><span>${fmt0(at.need)}</span></li>
        <li><span>Mensualité estimée</span><span>${fmt0(at.monthly)}</span></li>` : ''}
      </ul>
      ${state.loans.some(l => l.end < (at ? at.month : hh.cur) && l.end >= hh.cur) ? '<p class="hint">Les crédits terminés avant l\'achat ne sont plus comptés.</p>' : ''}
      <p class="hint">${h.years} ans à ${numStr(h.rate)} %, assurance ${numStr(h.ins)} % par an. Hors frais de garantie et de dossier. Calcul indicatif.</p>
    </div>`;
    const sc = NGCalc.scenarios(params);
    const line = s => {
      const label = s.loan ? `Le crédit « ${esc(s.loan.label)} » de ${esc(whoName(s.loan.who))} est soldé` : esc(s.label);
      const res = s.plan.ok ? (s.plan.months === 0 ? 'Dès maintenant' : monthName(s.plan.month)) : 'Toujours pas possible';
      const gain = s.gain > 0 ? `<small class="gain">${duration(s.gain)} plus tôt</small>` : s.gain === 0 ? '<small>pas plus tôt</small>' : (!plan.ok && s.plan.ok ? '<small class="gain">devient possible</small>' : '');
      return `<li><span>${label}</span><span class="center">${res}${gain}</span></li>`;
    };
    // Quand la date d'achat suit la fin d'un crédit, on le dit : c'est lui qui fixe la date.
    const blocking = plan.ok && plan.months > 0 ? state.loans.find(l => NGCalc.addMonths(l.end, 1) === plan.month) : null;
    html += `<div class="card"><h2>Et si… ?</h2><ul class="lines whatif">${sc.list.map(line).join('')}</ul>
      ${blocking ? `<p class="hint">La date dépend surtout de la fin du crédit « ${esc(blocking.label)} » (${monthName(blocking.end)}) : avant, la banque ne peut pas prêter assez.</p>` : ''}</div>`;
  }
  $('projResult').innerHTML = html;

  // Formulaire : on ne touche pas au champ en cours de saisie.
  const setv = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
  setv('pjPrice', h.price ? numStr(h.price) : '');
  setv('pjSaved', numStr(Math.round(hh.savedNow)));
  setv('pjGoal', hh.goalManual ? numStr(h.goal) : '');
  setv('pjRate', numStr(h.rate)); setv('pjYears', h.years); setv('pjIns', numStr(h.ins));
  document.querySelectorAll('[data-pj-type]').forEach(b => b.classList.toggle('on', b.dataset.pjType === h.type));
  $('pjGoalHint').textContent = hh.goalManual
    ? `Vous l'avez fixée. Laissez vide pour revenir au calcul de l'appli (${fmt0(Math.max(0, hh.computed))}).`
    : `Calculée : salaires reçus${hh.receivedEstimated ? ' (estimés)' : ''} ${fmt0(hh.received)} − charges ${fmt0(hh.fixedMonthly)} − crédits ${fmt0(hh.loansNow)} − dépenses habituelles ${fmt0(hh.usual)}${hh.usualBasis ? ` (${hh.usualBasis})` : ' (pas encore d\'historique)'}.`;
  $('pjRateAt').textContent = `Taux mis à jour le ${dateLabel(h.rateAt || state.setupDone || todayISO())}. Pensez à le vérifier auprès de votre banque.`;
}

$('projForm').addEventListener('change', e => {
  const t = e.target, h = state.house, v = parseNum(t.value);
  if (t.id === 'pjPrice') h.price = Math.max(0, v);
  else if (t.id === 'pjSaved') { h.saved = Math.max(0, v); h.savedAt = curMonth(); }
  else if (t.id === 'pjGoal') h.goal = t.value.trim() === '' ? null : Math.max(0, v);
  else if (t.id === 'pjRate') { h.rate = clamp(v, 0, 15); h.rateAt = todayISO(); }
  else if (t.id === 'pjYears') h.years = clamp(Math.round(v) || 25, 5, 25);
  else if (t.id === 'pjIns') h.ins = clamp(v, 0, 3);
  else return;
  save(); render();
});
$('projForm').addEventListener('submit', e => { e.preventDefault(); document.activeElement && document.activeElement.blur(); });
$('v-project').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.pjType) state.house.type = t.dataset.pjType;
  else if (t.dataset.pjMode) state.house.apportMode = t.dataset.pjMode;
  else return;
  save(); render();
});
