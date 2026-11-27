'use strict';
/* Accueil : les rappels, la date d'achat avec la jauge du logo, le foyer ce mois-ci, et une colonne par personne.
   Tout tient sur un écran, sans défiler. */

// Rappels : salaire à saisir le jour de paie, charges et crédits des 3 prochains jours.
function homeBanners(hh) {
  const today = todayISO(), cur = hh.cur, day = +today.slice(8, 10), dim = NGCalc.daysInMonth(cur);
  const out = [];
  WHO.forEach((w, i) => {
    const pay = Math.min(state.people[i].payDay, dim);
    if (day >= pay && !((state.salaries[cur] || {})[w] > 0)) {
      out.push(`<div class="banner pay"><p>${whoDot(w)}<b>${esc(whoName(w))}</b> : salaire reçu ce mois-ci ?</p>
        <form data-pay-form="${w}"><input type="text" inputmode="decimal" placeholder="Montant €" aria-label="Salaire de ${esc(whoName(w))} arrivé sur le compte"><button type="submit" class="btn sm">OK</button></form></div>`);
    }
  });
  const soon = [
    ...state.fixed.map(f => ({ label: f.label, amount: f.amount, day: Math.min(f.day, dim) })),
    ...NGCalc.runningLoans(state.loans, cur).map(l => ({ label: l.label, amount: l.monthly, day: Math.min(l.day, dim) })),
  ].filter(c => c.day > day && c.day <= day + 3).sort((a, b) => a.day - b.day);
  if (soon.length) {
    const when = d => d === day + 1 ? 'demain' : `le ${d}`;
    out.push(`<div class="banner"><p>À venir : ${soon.map(c => `${esc(c.label)} ${fmt0(c.amount)} ${when(c.day)}`).join(', ')}</p></div>`);
  }
  return out.slice(0, 2).join('');   // deux rappels au plus : l'accueil doit tenir sur un écran
}

function renderHome() {
  const { hh, plan } = planNow(), cur = hh.cur;
  $('homeBanners').innerHTML = homeBanners(hh);

  const head = planHeadline(plan);
  const ratio = plan.target > 0 ? hh.savedNow / plan.target : 0;
  const level = state.house.price > 0 ? NGCalc.gaugeLevel(ratio) : 1;
  const m = hh.month(cur);
  const goal = hh.goal;
  $('homeCard').innerHTML = `<div class="card home-card" data-go="project" role="button" aria-label="Voir le projet">
      <div class="home-top">
        <svg class="logo gauge lv${level}" viewBox="0 0 128 128" role="img" aria-label="${level === 3 ? 'Apport réuni' : level === 2 ? 'Plus d\'un tiers de l\'apport réuni' : 'Moins d\'un tiers de l\'apport réuni'}"><use href="#logo"/></svg>
        <div>
          <p class="kicker">On achète</p>
          <p class="date${head.no ? ' no' : ''}">${esc(head.date)}</p>
          <p class="sub">${esc(head.sub)}</p>
        </div>
      </div>
      ${state.house.price > 0 ? `${progressBar(ratio, ratio >= 1 ? 'ok' : '')}
      <div class="home-apport"><span>Apport : <b>${fmt0(hh.savedNow)}</b> sur ${fmt0(plan.target)}</span><b>${Math.floor(clamp(ratio, 0, 1) * 100)} %</b></div>` : ''}
      <div class="foyer">
        <div class="t"><span>Épargne de ${monthShort(cur)}</span><span><b class="${m.saved < 0 ? 'neg' : ''}">${fmt0(m.saved)}</b> <span class="muted">/ ${fmt0(goal)}</span></span></div>
        ${progressBar(goal > 0 ? m.saved / goal : 0, goal > 0 && m.saved >= goal ? 'ok' : '')}
      </div>
    </div>`;

  $('homeDuo').innerHTML = `<p class="month-title">Ce mois-ci</p><div class="duo">${WHO.map(w => {
    const p = m[w];
    return `<div class="card">
      <h3>${whoDot(w)}${esc(whoName(w))}</h3>
      <div class="l"><span>Salaire</span><b>${p.entered ? fmt0(p.salary) : `<span class="est">≈ ${fmt0(p.salary)}</span>`}</b></div>
      <div class="l"><span>Dépensé</span><b>${fmt0(p.spent)}</b></div>
      <div class="l tot"><span>Épargné</span><b class="${p.saved < 0 ? 'neg' : 'pos'}">${fmt0(p.saved)}</b></div>
    </div>`; }).join('')}</div>`;
}

// Saisie du salaire depuis le bandeau.
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-pay-form]'); if (!f) return;
  e.preventDefault();
  const v = parseNum(f.querySelector('input').value);
  if (v <= 0) return toast('Indiquez le montant arrivé sur le compte');
  const w = f.dataset.payForm, k = curMonth();
  state.salaries[k] = { ...(state.salaries[k] || {}), [w]: v };
  save(); render(); toast(`Salaire de ${whoName(w)} enregistré`);
});
