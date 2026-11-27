'use strict';
/* Onglet Mois : où part l'argent, salaires et charges du mois, et la liste des dépenses par jour,
   avec des filtres par personne et par catégorie. */

let mMonth = curMonth(), mWho = 'all', mCat = 'all';
const catColor = i => `var(--c${i % 8 + 1})`;

function renderMonth() {
  const k = mMonth, hh = NGCalc.household(state, todayISO()), m = hh.month(k);
  $('mTitle').textContent = monthName(k);
  $('mNext').disabled = k >= curMonth();
  const all = state.expenses.filter(e => ym(e.date) === k);
  const byWho = all.filter(e => mWho === 'all' || e.who === mWho);

  // Où part l'argent (selon le filtre de personne)
  const cats = {};
  byWho.forEach(e => { cats[e.cat] = (cats[e.cat] || 0) + e.amount; });
  const rows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const total = sum(rows.map(r => r[1]));
  $('mWhere').innerHTML = `<div class="card-head"><h2>Où part l'argent</h2><b class="num">${fmt0(total)}</b></div>` + (rows.length
    ? `<div class="stack">${rows.map(([c, v], i) => `<i style="width:${v / total * 100}%;background:${catColor(i)}" title="${esc(c)}"></i>`).join('')}</div>
       <ul class="legend">${rows.map(([c, v], i) => `<li data-m-cat="${esc(c)}"><i class="sw" style="background:${catColor(i)}"></i><span>${esc(c)}</span><b>${fmt0(v)}</b></li>`).join('')}</ul>`
    : '<p class="empty">Aucune dépense ce mois-là.</p>');

  // Salaires et charges du mois
  const charges = [
    ...state.fixed.map(f => ({ label: f.label, amount: f.amount, day: f.day, who: f.who })),
    ...state.loans.filter(l => l.end >= k && (l.from || k) <= k).map(l => ({ label: l.label, amount: l.monthly, day: l.day, who: l.who })),
  ].sort((a, b) => a.day - b.day);
  const keep = document.activeElement && document.activeElement.closest && document.activeElement.closest('#mBudget');
  if (!keep) $('mBudget').innerHTML = `<h2>Salaires et charges</h2>
    ${WHO.map(w => `<label class="sal-row"><span>${whoDot(w)}Salaire de ${esc(whoName(w))} reçu</span>
      <span class="euro"><input type="text" inputmode="decimal" data-m-sal="${w}" value="${(state.salaries[k] || {})[w] ? numStr(state.salaries[k][w]) : ''}" placeholder="${fmt0(m[w].salary).replace(/\s?€/, '')}"></span></label>`).join('')}
    <ul class="lines" style="margin-top:6px">
      ${charges.map(c => `<li><span>${whoDot(c.who)}${esc(c.label)} <small class="muted">le ${c.day}</small></span><span>${fmt0(c.amount)}</span></li>`).join('') || '<li class="empty">Aucune charge fixe.</li>'}
      <li><span>Salaires du mois</span><span>${fmt0(m.a.salary + m.b.salary)}</span></li>
      <li><span>Dépensé (charges comprises)</span><span>− ${fmt0(m.spent)}</span></li>
      <li class="strong"><span>Épargné</span><span class="${m.saved < 0 ? 'neg' : 'pos'}">${fmt0(m.saved)}</span></li>
    </ul>
    <p class="hint">Les charges et les crédits sont ajoutés tout seuls aux dépenses le jour indiqué.${!m.a.entered || !m.b.entered ? ' Salaire non saisi : estimé.' : ''}</p>`;

  // Filtres
  $('mWho').innerHTML = [['all', 'Tous'], ['a', whoName('a')], ['b', whoName('b')], ['ab', 'Nous deux']]
    .map(([w, l]) => `<button type="button" data-m-who="${w}" class="${w === mWho ? 'on' : ''}">${esc(l)}</button>`).join('');
  const present = [...new Set(all.map(e => e.cat))];
  if (mCat !== 'all' && !present.includes(mCat)) present.unshift(mCat);
  $('mCats').innerHTML = ['all', ...present].map(c => `<button type="button" class="chip${c === mCat ? ' on' : ''}" data-m-cat="${esc(c)}">${c === 'all' ? 'Toutes' : esc(c)}</button>`).join('');

  // Liste par jour
  const list = byWho.filter(e => mCat === 'all' || e.cat === mCat).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const days = [...new Set(list.map(e => e.date))];
  $('mList').innerHTML = days.length ? days.map(d => {
    const items = list.filter(e => e.date === d);
    return `<div class="day-head"><span>${dayLabel(d).replace(/^./, c => c.toUpperCase())}</span><span>${fmt(sum(items.map(e => e.amount)))}</span></div>
      <ul class="ops">${items.map(e => `<li>${whoDot(e.who)}
        <div class="grow"><b>${esc(e.cat)}${e.auto ? '<span class="tag">auto</span>' : ''}</b><small>${esc(whoName(e.who))}${e.note ? ' · ' + esc(e.note) : ''}</small></div>
        <span class="amt">${fmt(e.amount)}</span><button type="button" class="x" data-m-del="${e.id}" aria-label="Supprimer">×</button></li>`).join('')}</ul>`;
  }).join('') : '<p class="empty center" style="padding:20px 0">Rien à afficher.</p>';
}

$('mPrev').onclick = () => { mMonth = NGCalc.addMonths(mMonth, -1); renderMonth(); };
$('mNext').onclick = () => { if (mMonth < curMonth()) { mMonth = NGCalc.addMonths(mMonth, 1); renderMonth(); } };
$('v-month').addEventListener('click', e => {
  const t = e.target.closest('[data-m-who],[data-m-cat],[data-m-del]'); if (!t) return;
  const d = t.dataset;
  if (d.mWho) mWho = d.mWho;
  else if (d.mCat) mCat = (d.mCat === mCat && t.tagName === 'LI') ? 'all' : d.mCat;
  else if (d.mDel) {
    const x = state.expenses.find(e => e.id === d.mDel); if (!x) return;
    if (!confirm(`Supprimer ${fmt(x.amount)} (${x.cat}) ?`)) return;
    if (x.auto) state.skipAuto[x.auto] = 1;   // une ligne automatique supprimée n'est pas recréée
    state.expenses = state.expenses.filter(e => e !== x);
    save();
  }
  render();
});
$('mBudget').addEventListener('change', e => {
  const w = e.target.dataset.mSal; if (!w) return;
  const v = parseNum(e.target.value), k = mMonth;
  const entry = { ...(state.salaries[k] || {}) };
  if (v > 0) entry[w] = v; else delete entry[w];
  state.salaries[k] = entry;
  save(); e.target.blur(); render();
});
