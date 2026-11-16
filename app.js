'use strict';
/* Auplio Investment — suivi des dépenses et capacité d'investissement.
   Données 100 % locales (localStorage), aucune connexion requise. */

const KEY = 'auplio-investment-v1';
const DEFAULT_CATS = ['Courses', 'Carburant', 'Restaurant', 'Logement', 'Santé', 'Loisirs', 'Shopping', 'Abonnements', 'Divers'];

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmt = n => eur.format(Math.round(n * 100) / 100);
const parseNum = s => { const n = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = id => document.getElementById(id);
const ym = d => d.slice(0, 7);                       // 'YYYY-MM-DD' -> 'YYYY-MM'
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const monthName = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
const shiftMonth = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- État ---------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.expenses)) return d;
  } catch (e) { /* données absentes ou illisibles */ }
  return { expenses: [], fixed: [], categories: [...DEFAULT_CATS], settings: { income: 0, savings: 0, months: 3, margin: 10 } };
}
let state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Impossible d\'enregistrer'); } };

let selectedCat = state.categories[0];
let viewMonth = ym(todayISO());

/* ---------- Calculs ---------- */
const sum = arr => arr.reduce((a, b) => a + b, 0);
const monthExpenses = k => state.expenses.filter(e => ym(e.date) === k);
const fixedTotal = () => sum(state.fixed.map(f => f.amount));

function avgVariable() {
  // Moyenne des 3 derniers mois complets ayant des dépenses ; sinon projection du mois en cours.
  const cur = ym(todayISO());
  const totals = [1, 2, 3].map(i => shiftMonth(cur, -i)).map(k => monthExpenses(k)).filter(a => a.length).map(a => sum(a.map(e => e.amount)));
  if (totals.length) return { value: sum(totals) / totals.length, basis: `moyenne sur ${totals.length} mois` };
  const spent = sum(monthExpenses(cur).map(e => e.amount));
  const now = new Date(); const day = now.getDate(); const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { value: day ? spent / day * dim : spent, basis: 'projection du mois en cours' };
}

function investCalc() {
  const s = state.settings;
  const income = s.income, fixed = fixedTotal();
  const v = avgVariable();
  const surplus = income - fixed - v.value;
  const target = s.months * (fixed + v.value);
  const gap = Math.max(0, target - s.savings);
  const toCushion = Math.min(Math.max(0, surplus), gap);
  const afterCushion = Math.max(0, surplus - toCushion);
  const marginAmt = afterCushion * s.margin / 100;
  const investable = afterCushion - marginAmt;
  return { income, fixed, variable: v.value, basis: v.basis, surplus, target, gap, toCushion, marginAmt, investable };
}

/* ---------- Rendu ---------- */
function renderChips() {
  $('catChips').innerHTML = state.categories.map(c => `<button type="button" class="chip${c === selectedCat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('catEdit').innerHTML = state.categories.map(c => `<span class="chip">${esc(c)}<a class="x" data-delcat="${esc(c)}">×</a></span>`).join('');
}

function itemHTML(e) {
  const d = new Date(e.date + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `<li><div class="l"><b>${esc(e.cat)}</b><small>${d}${e.note ? ' · ' + esc(e.note) : ''}</small></div>
    <div class="r">${fmt(e.amount)}<button class="del" data-del="${e.id}" aria-label="Supprimer">×</button></div></li>`;
}

function renderSaisie() {
  const cur = ym(todayISO());
  $('monthLabel').textContent = monthName(cur);
  const recent = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 8);
  $('recentList').innerHTML = recent.length ? recent.map(itemHTML).join('') : '<li class="empty">Aucune dépense pour l\'instant.</li>';
  $('monthTotal').textContent = 'Ce mois : ' + fmt(sum(monthExpenses(cur).map(e => e.amount)));
}

function renderMois() {
  const list = monthExpenses(viewMonth).sort((a, b) => b.date.localeCompare(a.date));
  const v = sum(list.map(e => e.amount)), f = fixedTotal(), inc = state.settings.income, left = inc - f - v;
  $('viewMonthLabel').textContent = monthName(viewMonth);
  $('kIncome').textContent = fmt(inc); $('kFixed').textContent = fmt(f); $('kVar').textContent = fmt(v);
  $('kLeft').textContent = fmt(left); $('kLeft').className = left < 0 ? 'neg' : 'pos';
  const byCat = {};
  list.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amount);
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;
  $('catBreakdown').innerHTML = rows.length ? rows.map(([c, a]) =>
    `<li><div class="t"><span>${esc(c)}</span><span>${fmt(a)} · ${Math.round(a / v * 100)} %</span></div><div class="b"><div style="width:${a / max * 100}%"></div></div></li>`).join('')
    : '<li class="empty">Rien sur ce mois.</li>';
  $('monthList').innerHTML = list.length ? list.map(itemHTML).join('') : '<li class="empty">Aucune dépense.</li>';
}

function renderInvestir() {
  const c = investCalc(), s = state.settings;
  $('investable').textContent = fmt(c.investable);
  let msg;
  if (!s.income) msg = 'Renseigne tes revenus dans Réglages pour lancer le calcul.';
  else if (c.surplus <= 0) msg = 'Tes dépenses dépassent tes revenus : rien à investir ce mois-ci.';
  else if (c.gap > 0 && c.investable === 0) msg = `Priorité au matelas de sécurité : ${fmt(c.toCushion)} à mettre de côté ce mois-ci.`;
  else if (c.gap > 0) msg = `Après ${fmt(c.toCushion)} versés au matelas de sécurité.`;
  else msg = 'Matelas de sécurité complet : le surplus peut être investi.';
  $('investMsg').textContent = msg;
  const pct = c.target > 0 ? Math.min(100, s.savings / c.target * 100) : 0;
  $('cushionBar').style.width = pct + '%';
  $('cushionTxt').textContent = `${fmt(s.savings)} sur ${fmt(c.target)} (${s.months} mois de dépenses) · ${Math.round(pct)} %` +
    (c.gap > 0 && c.surplus > 0 ? ` · complet dans ~${Math.ceil(c.gap / c.surplus)} mois` : '');
  const r = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="${v < 0 ? 'neg' : ''}">${fmt(v)}</td></tr>`;
  $('calcTable').innerHTML =
    r('Revenus nets', c.income) + r('− Charges fixes', -c.fixed) + r(`− Dépenses variables (${c.basis})`, -c.variable) +
    r('= Surplus mensuel', c.surplus) + r('− Vers épargne de précaution', -c.toCushion) +
    r(`− Marge de sécurité (${s.margin} %)`, -c.marginAmt) + r('Investissable', c.investable, 'total');
}

function renderReglages() {
  const s = state.settings;
  $('sIncome').value = s.income || ''; $('sSavings').value = s.savings || ''; $('sMonths').value = s.months; $('sMargin').value = s.margin;
  $('fixedList').innerHTML = state.fixed.length ? state.fixed.map(f =>
    `<li><div class="l"><b>${esc(f.label)}</b></div><div class="r">${fmt(f.amount)}<button class="del" data-delfixed="${f.id}" aria-label="Supprimer">×</button></div></li>`).join('') +
    `<li><div class="l"><b>Total</b></div><div class="r"><b>${fmt(fixedTotal())}</b></div></li>`
    : '<li class="empty">Aucune charge fixe.</li>';
}

function render() { renderChips(); renderSaisie(); renderMois(); renderInvestir(); renderReglages(); }

function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); }

/* ---------- Événements ---------- */
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  window.scrollTo(0, 0);
});

$('catChips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { selectedCat = b.dataset.cat; renderChips(); } });

$('expenseForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseNum($('amount').value);
  if (amount <= 0) return toast('Montant invalide');
  state.expenses.push({ id: uid(), date: $('date').value || todayISO(), amount, cat: selectedCat, note: $('note').value.trim() });
  save(); $('amount').value = ''; $('note').value = ''; render(); toast(`${fmt(amount)} · ${selectedCat}`);
});

document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.del) {
    if (!confirm('Supprimer cette dépense ?')) return;
    state.expenses = state.expenses.filter(x => x.id !== t.dataset.del); save(); render();
  } else if (t.dataset.delfixed) {
    state.fixed = state.fixed.filter(x => x.id !== t.dataset.delfixed); save(); render();
  } else if (t.dataset.delcat) {
    if (state.categories.length <= 1) return toast('Il faut au moins une catégorie');
    state.categories = state.categories.filter(c => c !== t.dataset.delcat);
    if (selectedCat === t.dataset.delcat) selectedCat = state.categories[0];
    save(); render();
  }
});

$('prevMonth').onclick = () => { viewMonth = shiftMonth(viewMonth, -1); renderMois(); };
$('nextMonth').onclick = () => { viewMonth = shiftMonth(viewMonth, 1); renderMois(); };

$('settingsForm').addEventListener('submit', e => {
  e.preventDefault();
  state.settings = {
    income: Math.max(0, parseNum($('sIncome').value)),
    savings: Math.max(0, parseNum($('sSavings').value)),
    months: Math.min(24, Math.max(1, Math.round(parseNum($('sMonths').value)) || 3)),
    margin: Math.min(80, Math.max(0, parseNum($('sMargin').value))),
  };
  save(); render(); toast('Réglages enregistrés');
});

$('fixedForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseNum($('fAmount').value);
  if (amount <= 0) return toast('Montant invalide');
  state.fixed.push({ id: uid(), label: $('fLabel').value.trim(), amount });
  save(); $('fLabel').value = ''; $('fAmount').value = ''; render();
});

$('catForm').addEventListener('submit', e => {
  e.preventDefault();
  const n = $('cName').value.trim();
  if (n && !state.categories.includes(n)) { state.categories.push(n); save(); render(); }
  $('cName').value = '';
});

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('exportBtn').onclick = () => download(`auplio-investment-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
$('exportCsvBtn').onclick = () => {
  const lines = ['date;categorie;montant;note', ...[...state.expenses].sort((a, b) => a.date.localeCompare(b.date))
    .map(e => [e.date, e.cat, String(e.amount).replace('.', ','), `"${(e.note || '').replace(/"/g, '""')}"`].join(';'))];
  download(`depenses-${todayISO()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
};
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.expenses) || !d.settings) throw new Error();
    if (!confirm('Remplacer les données actuelles par cette sauvegarde ?')) return;
    state = { categories: DEFAULT_CATS, fixed: [], ...d }; selectedCat = state.categories[0];
    save(); render(); toast('Sauvegarde importée');
  } catch { toast('Fichier invalide'); }
  e.target.value = '';
});

/* ---------- Démarrage ---------- */
$('date').value = todayISO();
render();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
