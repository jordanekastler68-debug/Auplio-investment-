'use strict';
/* Auplio Investment v0.2 — budget du couple, économies, projet immobilier, montant investissable.
   Données 100 % locales (IndexedDB + copie localStorage), aucune connexion requise. */

const KEY = 'auplio-investment-v1';           // clé conservée : les données v0.1 sont reprises
const DEFAULT_CATS = ['Courses', 'Carburant', 'Restaurant', 'Logement', 'Santé', 'Loisirs', 'Shopping', 'Abonnements', 'Divers'];
const KINDS = { charge: 'Charge', loyer: 'Loyer', credit: 'Crédit', abonnement: 'Abonnement' };
const NOTAIRE = { ancien: 0.075, neuf: 0.025 };
const HCSF_MAX = 0.35;                          // taux d'endettement maximum, assurance comprise
const HCSF_YEARS = { ancien: 25, neuf: 27 };    // durée max (27 ans en VEFA / construction)
const WHO = ['a', 'b', 'c'];
const ANDROID = window.AuplioAndroid || null;   // présent quand l'appli tourne dans l'APK Android

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmt = n => eur.format(Math.round(n * 100) / 100);
const fmt0 = n => eur0.format(Math.round(n) || 0);   // évite « -0 € »
const pct = (n, d = 0) => (n * 100).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d }) + ' %';
const parseNum = s => { const n = parseFloat(String(s ?? '').replace(/[\s €%]/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = id => document.getElementById(id);
const ym = d => d.slice(0, 7);
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const monthName = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
const shiftMonth = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = arr => arr.reduce((a, b) => a + b, 0);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const duration = m => m < 12 ? `${m} mois` : (m % 12 ? `${plural(Math.floor(m / 12), 'an')} et ${m % 12} mois` : plural(m / 12, 'an'));

/* ---------- Modèle ---------- */
const blankProject = () => ({ enabled: false, price: 200000, type: 'ancien', works: 0, saved: 0, apportPct: 10, rate: 3.8, years: 25, ins: 0.30, share: 80 });
const blank = () => ({
  v: 2,
  people: [{ name: 'Moi', income: 0 }, { name: 'Conjoint(e)', income: 0 }],
  expenses: [], incomes: [], fixed: [], budgets: {},
  categories: [...DEFAULT_CATS],
  settings: { savings: 0, months: 3, margin: 10 },
  project: blankProject(),
  rules: {},          // commerçant → catégorie, appris lors des imports
  deleted: {},        // id supprimé → date (pour propager les suppressions entre téléphones)
  cfgAt: 0,           // date de la dernière modif. des réglages (le plus récent gagne à la fusion)
  lastImport: null,
  updatedAt: 0,
});
const valid = d => d && typeof d === 'object' && Array.isArray(d.expenses);

// Accepte une sauvegarde v0.1 (une personne) ou v0.2 et renvoie un état v0.2 complet.
function migrate(d) {
  const b = blank();
  if (!valid(d)) return b;
  const s = d.settings || {};
  const num = (x, def = 0) => (isFinite(+x) && x !== null && x !== '' ? +x : def);
  const people = Array.isArray(d.people) && d.people.length === 2
    ? d.people.map((p, i) => ({ name: String(p?.name || b.people[i].name).slice(0, 16), income: num(p?.income) }))
    : [{ name: 'Moi', income: num(s.income) }, { ...b.people[1] }];
  return {
    v: 2,
    people,
    expenses: d.expenses.filter(e => e && e.date && e.amount > 0).map(e => ({ ...e, id: e.id || uid(), amount: +e.amount, cat: e.cat || 'Divers', note: e.note || '', who: WHO.includes(e.who) ? e.who : 'a' })),
    incomes: (Array.isArray(d.incomes) ? d.incomes : []).filter(i => i && i.date && i.amount > 0).map(i => ({ ...i, id: i.id || uid(), amount: +i.amount, note: i.note || '', who: WHO.includes(i.who) ? i.who : 'a' })),
    fixed: (Array.isArray(d.fixed) ? d.fixed : []).map(f => ({ id: f.id || uid(), label: f.label || '—', amount: num(f.amount), kind: KINDS[f.kind] ? f.kind : 'charge', who: WHO.includes(f.who) ? f.who : 'c' })),
    budgets: d.budgets && typeof d.budgets === 'object' ? d.budgets : {},
    categories: Array.isArray(d.categories) && d.categories.length ? d.categories : [...DEFAULT_CATS],
    settings: { savings: num(s.savings), months: num(s.months, 3) || 3, margin: num(s.margin, 10) },
    project: { ...blankProject(), ...(d.project || {}) },
    rules: d.rules && typeof d.rules === 'object' ? d.rules : {},
    deleted: d.deleted && typeof d.deleted === 'object' ? d.deleted : {},
    cfgAt: d.cfgAt || 0,
    lastImport: d.lastImport || null,
    updatedAt: d.updatedAt || 0,
  };
}

/* ---------- Stockage ----------
   Sauvegarde automatique à chaque action, en double :
   1) IndexedDB (stockage principal)  2) localStorage (copie de secours)
   + demande de stockage « persistant » : Chrome ne l'efface plus de lui-même. */
const DB_NAME = 'auplio-investment', STORE = 'data';
function idb() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no idb'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet() {
  const db = await idb();
  return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get('state'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbPut(v) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, 'state'); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
async function load() {
  let a = null, b = null;
  try { a = await idbGet(); } catch (e) { /* IndexedDB indisponible */ }
  try { b = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* rien */ }
  const cands = [a, b].filter(valid).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
  const raw = cands[0];
  return { data: migrate(raw), migrated: !!raw && raw.v !== 2 };
}
let state = blank();
let saveOk = true;
async function save() {
  state.updatedAt = Date.now();
  const json = JSON.stringify(state);
  let ok = false;
  try { await idbPut(JSON.parse(json)); ok = true; } catch (e) { /* on tente la copie */ }
  try { localStorage.setItem(KEY, json); ok = true; } catch (e) { /* rien */ }
  saveOk = ok;
  if (!ok) toast('⚠ Échec de la sauvegarde');
  renderStorage();
}
function saveCfg() { state.cfgAt = Date.now(); return save(); }
const markDeleted = ids => { const t = Date.now(); ids.forEach(id => state.deleted[id] = t); };

let persisted = null;
async function ensurePersistent() {
  if (ANDROID) { persisted = 'app'; renderStorage(); return; }
  try {
    if (navigator.storage && navigator.storage.persist) persisted = await navigator.storage.persisted() || await navigator.storage.persist();
  } catch (e) { persisted = false; }
  renderStorage();
}
function renderStorage() {
  const el = $('storageStatus'); if (!el) return;
  const last = state.updatedAt ? new Date(state.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const prot = persisted === 'app' ? `✓ Données gardées dans l'appli Android${ANDROID.version ? ' ' + ANDROID.version() : ''} (effacées seulement si tu la désinstalles)`
    : persisted === true ? '✓ Stockage protégé (Chrome ne l\'efface pas)'
    : persisted === false ? '⚠ Stockage non protégé : installe l\'appli sur l\'écran d\'accueil puis rouvre-la'
    : 'Vérification du stockage…';
  el.innerHTML = `${saveOk ? '✓ Sauvegarde automatique active' : '⚠ Dernière sauvegarde échouée'}<br>${prot}<br>` +
    `${state.expenses.length} dépense(s), ${state.incomes.length} revenu(s) exceptionnel(s) · dernière modif. ${last}`;
  const li = state.lastImport, ub = $('undoImport');
  if (ub) {
    const n = li ? state.expenses.filter(e => e.bat === li.id).length + state.incomes.filter(i => i.bat === li.id).length : 0;
    ub.style.display = n ? '' : 'none';
    ub.textContent = n ? `Annuler le dernier import (${n} opération${n > 1 ? 's' : ''}, ${new Date(li.at).toLocaleDateString('fr-FR')})` : '';
  }
}

/* ---------- Calculs ---------- */
const whoName = w => w === 'a' ? state.people[0].name : w === 'b' ? state.people[1].name : 'Commun';
const baseIncome = () => sum(state.people.map(p => p.income));
const monthExpenses = k => state.expenses.filter(e => ym(e.date) === k);
const monthIncomes = k => state.incomes.filter(i => ym(i.date) === k);
const fixedTotal = kind => sum(state.fixed.filter(f => !kind || f.kind === kind).map(f => f.amount));
const curMonth = () => ym(todayISO());
function monthProgress() { const n = new Date(); return { day: n.getDate(), dim: new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() }; }
// Les 3 derniers mois complets qui contiennent des dépenses.
const historyMonths = () => [1, 2, 3].map(i => shiftMonth(curMonth(), -i)).filter(k => monthExpenses(k).length);

function avgVariable() {
  const hist = historyMonths();
  if (hist.length) return { value: sum(hist.map(k => sum(monthExpenses(k).map(e => e.amount)))) / hist.length, basis: hist.length === 1 ? 'moyenne du dernier mois complet' : `moyenne des ${hist.length} derniers mois complets` };
  const spent = sum(monthExpenses(curMonth()).map(e => e.amount));
  const { day, dim } = monthProgress();
  return { value: spent / day * dim, basis: 'projection du mois en cours (pas encore d\'historique)' };
}

// Analyse par catégorie : dépensé ce mois, projection fin de mois, moyenne habituelle, budget.
function catAnalysis() {
  const cur = curMonth(), hist = historyMonths(), { day, dim } = monthProgress();
  const curList = monthExpenses(cur);
  const cats = [...new Set([...state.categories, ...state.expenses.map(e => e.cat)])];
  return cats.map(c => {
    const spent = sum(curList.filter(e => e.cat === c).map(e => e.amount));
    const avg = hist.length ? sum(hist.map(k => sum(monthExpenses(k).filter(e => e.cat === c).map(e => e.amount)))) / hist.length : null;
    const proj = day >= 10 ? spent / day * dim : null;
    const usual = avg !== null ? avg : (proj !== null ? proj : spent / day * dim);
    return { cat: c, spent, avg, proj, usual, budget: +state.budgets[c] || 0 };
  });
}

const loanFactor = (rate, years) => { const r = rate / 1200, n = years * 12; return r > 0 ? r / (1 - Math.pow(1 + r, -n)) : 1 / n; };

function project() {
  const p = state.project;
  if (!p.enabled || !(p.price > 0)) return null;
  const notRate = NOTAIRE[p.type] ?? NOTAIRE.ancien;
  const notaire = p.price * notRate;
  const total = p.price + notaire + p.works;
  const apportTarget = notaire + p.price * p.apportPct / 100;
  const loan = Math.max(0, total - Math.max(apportTarget, p.saved));
  const a = loanFactor(p.rate, p.years);
  const insM = loan * p.ins / 1200;
  const mens = loan * a + insM;
  const income = baseIncome(), credits = fixedTotal('credit'), loyer = fixedTotal('loyer');
  const ratio = income > 0 ? (mens + credits) / income : null;
  const maxMens = Math.max(0, HCSF_MAX * income - credits);
  const maxLoan = maxMens / (a + p.ins / 1200);
  const priceFor = A => Math.max(0, (maxLoan + A - p.works) / (1 + notRate));
  return {
    notRate, notaire, total, apportTarget, loan, mens, insM, ratio, maxMens, maxLoan,
    priceNow: priceFor(p.saved), priceTarget: priceFor(Math.max(apportTarget, p.saved)),
    cost: mens * p.years * 12 - loan, credits, loyer,
    resteApres: income - (fixedTotal() - loyer) - avgVariable().value - mens,
    yearsMax: HCSF_YEARS[p.type] || 25,
  };
}

// Répartition d'un surplus mensuel : précaution → marge → apport → investissable.
function split(surplus, cushionGap, apportGap) {
  const s = state.settings, p = state.project;
  const toCushion = Math.min(Math.max(0, surplus), cushionGap);
  const after = Math.max(0, surplus - toCushion);
  const marginAmt = after * s.margin / 100;
  const dist = after - marginAmt;
  const toProject = p.enabled ? Math.min(dist * p.share / 100, apportGap) : 0;
  return { toCushion, marginAmt, toProject, investable: dist - toProject };
}

// extra = euros/mois en plus (économies simulées). Simule mois par mois pour dater les objectifs.
function plan(extra = 0) {
  const income = baseIncome(), fixed = fixedTotal(), v = avgVariable();
  const surplus = income - fixed - v.value + extra;
  const target = state.settings.months * (fixed + v.value);
  const cushionGap = Math.max(0, target - state.settings.savings);
  const proj = project();
  const apportGap = proj ? Math.max(0, proj.apportTarget - state.project.saved) : 0;
  const now = split(surplus, cushionGap, apportGap);
  let cg = cushionGap, ag = apportGap;
  let mCushion = cg > 0 ? null : 0, mApport = proj ? (ag > 0 ? null : 0) : undefined;
  for (let m = 1; m <= 600 && (mCushion === null || mApport === null); m++) {
    const r = split(surplus, cg, ag);
    if ((cg > 0 && r.toCushion <= 0) || (cg <= 0 && ag > 0 && r.toProject <= 0)) break; // aucune progression possible
    cg -= r.toCushion; ag -= r.toProject;
    if (mCushion === null && cg <= 0.01) mCushion = m;
    if (mApport === null && ag <= 0.01) mApport = m;
  }
  return { income, fixed, variable: v.value, basis: v.basis, surplus, target, cushionGap, apportGap, ...now, mCushion, mApport, proj };
}
const monthsLabel = m => { const k = shiftMonth(curMonth(), m); return monthName(k); };

/* ---------- Rendu ---------- */
let opType = 'dep';
let selectedCat = DEFAULT_CATS[0];
let selectedWho = 'c';
let viewMonth = curMonth();

function renderSaisieForm() {
  document.querySelectorAll('#typeSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === opType));
  $('catBlock').style.display = opType === 'dep' ? '' : 'none';
  $('opSubmit').textContent = opType === 'dep' ? 'Ajouter la dépense' : 'Ajouter le revenu';
  $('note').placeholder = opType === 'dep' ? 'Note (facultatif)' : 'Prime, commission, remboursement…';
  $('whoSeg').innerHTML = WHO.map(w => `<button type="button" data-who="${w}" class="${w === selectedWho ? 'on' : ''}">${esc(whoName(w))}</button>`).join('');
  $('catChips').innerHTML = state.categories.map(c => `<button type="button" class="chip${c === selectedCat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('catEdit').innerHTML = state.categories.map(c => `<span class="chip">${esc(c)}<a class="x" data-delcat="${esc(c)}">×</a></span>`).join('');
  $('fWho').innerHTML = WHO.map(w => `<option value="${w}"${w === 'c' ? ' selected' : ''}>${w === 'c' ? 'Commun' : 'Payé par ' + esc(whoName(w))}</option>`).join('');
}

function opHTML(o) {
  const d = new Date(o.date + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const inc = o.kind === 'inc';
  return `<li><div class="l"><b>${inc ? 'Revenu' : esc(o.cat)}</b><small>${d} · ${esc(whoName(o.who))}${o.note ? ' · ' + esc(o.note) : ''}</small></div>
    <div class="r"><span class="${inc ? 'pos' : ''}">${inc ? '+' : ''}${fmt(o.amount)}</span><button class="del" data-del="${o.id}" data-k="${inc ? 'inc' : 'exp'}" aria-label="Supprimer">×</button></div></li>`;
}
const opsOf = (exp, inc) => [...exp.map(e => ({ ...e, kind: 'exp' })), ...inc.map(i => ({ ...i, kind: 'inc' }))]
  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

function renderSaisie() {
  const cur = curMonth();
  $('monthLabel').textContent = monthName(cur);
  const recent = opsOf(state.expenses, state.incomes).slice(0, 10);
  $('recentList').innerHTML = recent.length ? recent.map(opHTML).join('') : '<li class="empty">Aucune opération pour l\'instant. Commence par Réglages : salaires et charges fixes.</li>';
  $('monthTotal').textContent = 'Dépensé ce mois : ' + fmt(sum(monthExpenses(cur).map(e => e.amount)));
}

function renderMois() {
  const exp = monthExpenses(viewMonth), inc = monthIncomes(viewMonth);
  const v = sum(exp.map(e => e.amount)), f = fixedTotal(), extra = sum(inc.map(i => i.amount));
  const income = baseIncome() + extra, left = income - f - v;
  $('viewMonthLabel').textContent = monthName(viewMonth);
  $('kIncome').textContent = fmt(income); $('kFixed').textContent = fmt(f); $('kVar').textContent = fmt(v);
  $('kLeft').textContent = fmt(left); $('kLeft').className = left < 0 ? 'neg' : 'pos';

  const rows = WHO.map(w => {
    const rev = (w === 'c' ? 0 : state.people[w === 'a' ? 0 : 1].income) + sum(inc.filter(i => i.who === w).map(i => i.amount));
    const dep = sum(exp.filter(e => e.who === w).map(e => e.amount)) + sum(state.fixed.filter(x => x.who === w).map(x => x.amount));
    return `<tr><td>${esc(whoName(w))}</td><td>${rev ? fmt(rev) : '—'}</td><td>${fmt(dep)}</td></tr>`;
  });
  $('whoTable').innerHTML = '<tr class="head"><td></td><td>Revenus</td><td>Payé (fixes + dépenses)</td></tr>' + rows.join('');

  const byCat = {};
  exp.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amount);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;
  $('catBreakdown').innerHTML = cats.length ? cats.map(([c, a]) => {
    const bud = +state.budgets[c] || 0, over = bud && a > bud;
    return `<li><div class="t"><span>${esc(c)}</span><span class="${over ? 'neg' : ''}">${fmt(a)}${bud ? ' / ' + fmt0(bud) : ''} · ${Math.round(a / v * 100)} %</span></div><div class="b"><div class="${over ? 'over' : ''}" style="width:${a / max * 100}%"></div></div></li>`;
  }).join('') : '<li class="empty">Rien sur ce mois.</li>';
  const ops = opsOf(exp, inc);
  $('monthList').innerHTML = ops.length ? ops.map(opHTML).join('') : '<li class="empty">Aucune opération.</li>';
}

function renderEco() {
  const pl = plan();
  const rate = pl.income > 0 ? pl.surplus / pl.income : null;
  $('saveRate').textContent = rate === null ? '—' : pct(rate);
  $('saveRate').className = 'big' + (rate !== null && rate < 0 ? ' negbig' : '');
  $('saveRateMsg').textContent = rate === null ? 'Renseigne les salaires dans Réglages.'
    : rate < 0 ? `Vous dépensez ${fmt0(-pl.surplus)} de plus que vous ne gagnez chaque mois : c'est la priorité n°1.`
    : rate < 0.1 ? `${fmt0(pl.surplus)} mis de côté par mois. Sous 10 %, l'apport immobilier prendra très longtemps : il faut trouver des leviers ci-dessous.`
    : rate < 0.2 ? `${fmt0(pl.surplus)} mis de côté par mois. Correct ; viser 20 % accélère nettement l'apport.`
    : `${fmt0(pl.surplus)} mis de côté par mois. Très bon rythme.`;

  // Leviers : catégories variables les plus lourdes + abonnements.
  const p = +$('ecoPct').value / 100;
  $('ecoPctLbl').textContent = pct(p);
  const ca = catAnalysis().filter(c => c.usual > 0).sort((a, b) => b.usual - a.usual).slice(0, 5);
  const subs = fixedTotal('abonnement');
  const levers = ca.map(c => ({ label: c.cat, base: c.usual, gain: c.usual * p, hint: c.avg !== null ? 'moyenne habituelle' : 'estimation du mois' }));
  if (subs > 0) levers.push({ label: 'Abonnements', base: subs, gain: subs * p, hint: 'charges fixes' });
  levers.sort((a, b) => b.gain - a.gain);
  const totalGain = sum(levers.map(l => l.gain));
  $('leverList').innerHTML = levers.length ? levers.map(l =>
    `<li><div class="l"><b>${esc(l.label)}</b><small>${fmt0(l.base)}/mois · ${l.hint}</small></div><div class="r"><span class="pos">+${fmt0(l.gain)}/mois<br><small>${fmt0(l.gain * 12)}/an</small></span></div></li>`).join('') +
    `<li><div class="l"><b>Total si tout est réduit de ${pct(p)}</b></div><div class="r"><b class="pos">+${fmt0(totalGain)}/mois · ${fmt0(totalGain * 12)}/an</b></div></li>`
    : '<li class="empty">Saisis quelques dépenses pour voir où agir.</li>';
  let msg = '';
  if (levers.length && pl.proj && pl.mApport) {
    const pl2 = plan(totalGain);
    if (pl2.mApport !== null && pl2.mApport < pl.mApport) msg = `➜ Apport immobilier atteint ${duration(pl.mApport - pl2.mApport)} plus tôt (${monthsLabel(pl2.mApport)} au lieu de ${monthsLabel(pl.mApport)}).`;
  } else if (levers.length && pl.proj && pl.mApport === null && pl.apportGap > 0) {
    const pl2 = plan(totalGain);
    if (pl2.mApport) msg = `➜ Avec ces économies, l'apport devient atteignable : ${monthsLabel(pl2.mApport)}.`;
  }
  $('leverMsg').textContent = msg;

  // Budgets
  const all = catAnalysis();
  const withB = all.filter(c => c.budget > 0);
  $('budgetList').innerHTML = withB.length ? withB.map(c => {
    const r = c.spent / c.budget, over = c.spent > c.budget, risk = !over && c.proj !== null && c.proj > c.budget;
    return `<li><div class="t"><span>${esc(c.cat)}</span><span class="${over ? 'neg' : risk ? 'warn' : ''}">${fmt0(c.spent)} / ${fmt0(c.budget)}${c.proj !== null ? ` · fin de mois ≈ ${fmt0(c.proj)}` : ''}</span></div>` +
      `<div class="b"><div class="${over ? 'over' : risk ? 'risk' : 'okb'}" style="width:${clamp(r, 0, 1) * 100}%"></div></div></li>`;
  }).join('') : '<li class="empty">Aucun budget. Fixe un plafond sur les catégories qui pèsent le plus (courses, restaurant, shopping…).</li>';
  const sel = $('bCat').value;
  $('bCat').innerHTML = state.categories.map(c => {
    const a = all.find(x => x.cat === c), sug = a && a.avg ? ` (habituel ${fmt0(a.avg)})` : '';
    return `<option value="${esc(c)}">${esc(c)}${sug}</option>`;
  }).join('');
  if (sel && state.categories.includes(sel)) $('bCat').value = sel;

  // Dérives
  const { day } = monthProgress();
  const drifts = all.filter(c => c.avg !== null && c.proj !== null && c.proj > c.avg * 1.15 && c.proj - c.avg >= 20).sort((a, b) => (b.proj - b.avg) - (a.proj - a.avg));
  $('driftList').innerHTML = drifts.length ? drifts.map(c =>
    `<li><div class="l"><b>${esc(c.cat)}</b><small>habituel ${fmt0(c.avg)} · fin de mois ≈ ${fmt0(c.proj)}</small></div><div class="r neg">+${fmt0(c.proj - c.avg)}</div></li>`).join('')
    : `<li class="empty">${!historyMonths().length ? 'Il faut au moins un mois complet de dépenses pour comparer.' : day < 10 ? 'Analyse disponible à partir du 10 du mois.' : 'Rien d\'anormal ce mois-ci.'}</li>`;

  // Abonnements
  const sl = state.fixed.filter(f => f.kind === 'abonnement').sort((a, b) => b.amount - a.amount);
  $('subList').innerHTML = sl.length ? sl.map(f => `<li><div class="l"><b>${esc(f.label)}</b><small>${esc(whoName(f.who))}</small></div><div class="r"><span>${fmt(f.amount)}<small>${fmt0(f.amount * 12)}/an</small></span></div></li>`).join('') +
    `<li><div class="l"><b>Total</b></div><div class="r"><b>${fmt(subs)}/mois · ${fmt0(subs * 12)}/an</b></div></li>`
    : '<li class="empty">Aucun abonnement déclaré. Ajoute-les dans Réglages → Charges fixes (type « Abonnement ») : c\'est souvent le premier gisement.</li>';
}

function renderPlan() {
  const c = plan(), s = state.settings, p = state.project, pr = c.proj;
  $('investable').textContent = fmt0(c.investable);
  let msg;
  if (!c.income) msg = 'Renseigne les salaires dans Réglages pour lancer le calcul.';
  else if (c.surplus <= 0) msg = 'Les dépenses dépassent les revenus : rien à investir. Va voir l\'onglet Économies.';
  else if (c.cushionGap > 0 && c.investable <= 0 && c.toProject <= 0) msg = `Priorité au matelas de sécurité : ${fmt0(c.toCushion)} à mettre de côté ce mois-ci.`;
  else if (pr && c.apportGap > 0) msg = `Après ${c.toCushion > 0 ? fmt0(c.toCushion) + ' vers la précaution et ' : ''}${fmt0(c.toProject)} vers l'apport immobilier.`;
  else if (c.cushionGap > 0) msg = `Après ${fmt0(c.toCushion)} versés au matelas de sécurité.`;
  else msg = 'Sécurité en place' + (pr ? ' et apport constitué' : '') + ' : ce montant peut aller sur les placements suivis par Vigie.';
  $('investMsg').textContent = msg;

  const r = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="${v < 0 ? 'neg' : ''}">${fmt0(v)}</td></tr>`;
  $('calcTable').innerHTML =
    r('Salaires nets du foyer', c.income) + r('− Charges fixes', -c.fixed) + r('− Dépenses variables', -c.variable) +
    r('= Surplus mensuel', c.surplus, 'sub') + r('→ Épargne de précaution', -c.toCushion) +
    r(`→ Marge gardée sur le compte (${s.margin} %)`, -c.marginAmt) +
    (pr ? r(`→ Apport immobilier (${p.share} % du reste)`, -c.toProject) : '') +
    r('= Investissable', c.investable, 'total');
  $('calcBasis').textContent = `Dépenses variables : ${c.basis}.`;

  const cp = c.target > 0 ? Math.min(100, s.savings / c.target * 100) : 0;
  $('cushionBar').style.width = cp + '%';
  $('cushionTxt').textContent = `${fmt0(s.savings)} sur ${fmt0(c.target)} (${s.months} mois de dépenses) · ${Math.round(cp)} %` +
    (c.cushionGap > 0 ? (c.mCushion ? ` · complet en ${monthsLabel(c.mCushion)}` : ' · aucun surplus pour le remplir') : ' · ✓ complet');

  // Projet immobilier
  $('projectOff').style.display = p.enabled ? 'none' : '';
  if (!pr) { $('projectRes').innerHTML = p.enabled ? '<p class="muted small">Indique le prix du bien dans les paramètres.</p>' : ''; }
  else {
    const ap = pr.apportTarget > 0 ? clamp(p.saved / pr.apportTarget, 0, 1) : 1;
    const ok = pr.ratio !== null && pr.ratio <= HCSF_MAX;
    const yearsKo = p.years > pr.yearsMax;
    const when = c.apportGap <= 0 ? '✓ Apport visé atteint' : c.mApport ? `Apport atteint en <b>${monthsLabel(c.mApport)}</b> (dans ${duration(c.mApport)})` : '⚠ Au rythme actuel, l\'apport n\'est jamais atteint : il faut dégager du surplus.';
    const row = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td>${v}</td></tr>`;
    $('projectRes').innerHTML = `
      <p class="small">Apport : ${fmt0(p.saved)} sur ${fmt0(pr.apportTarget)}</p>
      <div class="progress"><div style="width:${ap * 100}%"></div></div>
      <p class="small">${when}</p>
      <div class="${ok && !yearsKo ? 'okbox' : 'warnbox'}">
        Endettement : <b>${pr.ratio === null ? '—' : pct(pr.ratio, 1)}</b> (max 35 %)${pr.credits ? ` dont crédits en cours ${fmt0(pr.credits)}` : ''}<br>
        ${pr.ratio === null ? 'Renseigne les salaires.' : ok ? 'La banque peut suivre sur ce critère.' : `Trop élevé : mensualité max ${fmt0(pr.maxMens)}, soit un bien jusqu'à ≈ ${fmt0(pr.priceTarget)} avec l'apport visé.`}
        ${yearsKo ? `<br>⚠ Durée limitée à ${pr.yearsMax} ans par les règles bancaires.` : ''}
      </div>
      <table class="calc">
        ${row('Prix du bien', fmt0(p.price))}
        ${row(`Frais de notaire (≈ ${pct(pr.notRate, 1)})`, fmt0(pr.notaire))}
        ${p.works ? row('Travaux', fmt0(p.works)) : ''}
        ${row('Coût total', fmt0(pr.total), 'sub')}
        ${row(`Apport visé (frais + ${p.apportPct} %)`, fmt0(pr.apportTarget))}
        ${row('Montant à emprunter', fmt0(pr.loan))}
        ${row(`Mensualité (${p.years} ans à ${p.rate.toLocaleString('fr-FR')} %)`, fmt0(pr.mens), 'total')}
        ${row('dont assurance', fmt0(pr.insM))}
        ${row('Coût du crédit (intérêts + assurance)', fmt0(pr.cost))}
        ${row('Reste à vivre après achat', `<span class="${pr.resteApres < 0 ? 'neg' : ''}">${fmt0(pr.resteApres)}/mois</span>`)}
      </table>
      <p class="muted small">Capacité max (35 %) : emprunt ≈ ${fmt0(pr.maxLoan)} · bien jusqu'à ≈ ${fmt0(pr.priceNow)} avec l'apport actuel, ≈ ${fmt0(pr.priceTarget)} avec l'apport visé. ${pr.loyer ? `Le loyer actuel (${fmt0(pr.loyer)}) est remplacé par la mensualité dans le reste à vivre.` : 'Déclare ton loyer (type « Loyer ») pour un reste à vivre juste.'} Hors frais de garantie et de dossier (≈ 1 à 2 % de l'emprunt).</p>`;
  }
  $('investTxt').textContent = c.investable > 0
    ? `${fmt0(c.investable)} par mois disponibles pour investir, soit ${fmt0(c.investable * 12)} par an. C'est ce montant (et lui seul) qui part vers les placements suivis par Vigie.`
    : pr && c.apportGap > 0 && p.share >= 100 ? 'Tout le surplus va à l\'apport (réglage 100 %). Baisse la part vers l\'apport si tu veux investir un peu en parallèle.'
    : 'Rien à investir tant que la précaution' + (pr ? ' et l\'apport ne sont pas' : ' n\'est pas') + ' assurés.';
}

function fillProjectForm() {
  const p = state.project;
  $('pEnabled').checked = p.enabled; $('pPrice').value = p.price || ''; $('pType').value = p.type; $('pWorks').value = p.works || '';
  $('pSaved').value = p.saved || ''; $('pApportPct').value = p.apportPct; $('pShare').value = p.share;
  $('pRate').value = String(p.rate).replace('.', ','); $('pYears').value = p.years; $('pIns').value = String(p.ins).replace('.', ',');
}

function renderReglages() {
  const s = state.settings, [A, B] = state.people;
  $('sNameA').value = A.name; $('sIncA').value = A.income || ''; $('sNameB').value = B.name; $('sIncB').value = B.income || '';
  $('sSavings').value = s.savings || ''; $('sMonths').value = s.months; $('sMargin').value = s.margin;
  const fl = [...state.fixed].sort((a, b) => b.amount - a.amount);
  $('fixedList').innerHTML = fl.length ? fl.map(f =>
    `<li><div class="l"><b>${esc(f.label)}</b><small><span class="badge ${f.kind}">${KINDS[f.kind]}</span> ${esc(whoName(f.who))}</small></div><div class="r">${fmt(f.amount)}<button class="del" data-delfixed="${f.id}" aria-label="Supprimer">×</button></div></li>`).join('') +
    `<li><div class="l"><b>Total</b></div><div class="r"><b>${fmt(fixedTotal())}</b></div></li>`
    : '<li class="empty">Aucune charge fixe. Loyer, énergie, assurances, téléphone, abonnements, crédits…</li>';
  fillProjectForm();
}

function render() { renderSaisieForm(); renderSaisie(); renderMois(); renderEco(); renderPlan(); renderReglages(); renderStorage(); }

function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); }

/* ---------- Événements ---------- */
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  window.scrollTo(0, 0);
}
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab);
});

$('typeSeg').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) { opType = b.dataset.type; renderSaisieForm(); } });
$('whoSeg').addEventListener('click', e => { const b = e.target.closest('[data-who]'); if (b) { selectedWho = b.dataset.who; renderSaisieForm(); } });
$('catChips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { selectedCat = b.dataset.cat; renderSaisieForm(); } });

$('opForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseNum($('amount').value);
  if (amount <= 0) return toast('Montant invalide');
  const base = { id: uid(), date: $('date').value || todayISO(), amount, note: $('note').value.trim(), who: selectedWho };
  if (opType === 'dep') state.expenses.push({ ...base, cat: selectedCat });
  else state.incomes.push(base);
  save(); $('amount').value = ''; $('note').value = ''; render();
  toast(opType === 'dep' ? `${fmt(amount)} · ${selectedCat}` : `+${fmt(amount)} · revenu`);
});

document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.del) {
    if (!confirm('Supprimer cette opération ?')) return;
    markDeleted([t.dataset.del]);
    if (t.dataset.k === 'inc') state.incomes = state.incomes.filter(x => x.id !== t.dataset.del);
    else state.expenses = state.expenses.filter(x => x.id !== t.dataset.del);
    save(); render();
  } else if (t.dataset.delfixed) {
    markDeleted([t.dataset.delfixed]);
    state.fixed = state.fixed.filter(x => x.id !== t.dataset.delfixed); save(); render();
  } else if (t.dataset.delcat) {
    if (state.categories.length <= 1) return toast('Il faut au moins une catégorie');
    state.categories = state.categories.filter(c => c !== t.dataset.delcat);
    delete state.budgets[t.dataset.delcat];
    if (selectedCat === t.dataset.delcat) selectedCat = state.categories[0];
    save(); render();
  }
});

$('prevMonth').onclick = () => { viewMonth = shiftMonth(viewMonth, -1); renderMois(); };
$('nextMonth').onclick = () => { viewMonth = shiftMonth(viewMonth, 1); renderMois(); };
$('ecoPct').addEventListener('input', renderEco);

$('settingsForm').addEventListener('submit', e => {
  e.preventDefault();
  state.people = [
    { name: $('sNameA').value.trim() || 'Moi', income: Math.max(0, parseNum($('sIncA').value)) },
    { name: $('sNameB').value.trim() || 'Conjoint(e)', income: Math.max(0, parseNum($('sIncB').value)) },
  ];
  state.settings = {
    savings: Math.max(0, parseNum($('sSavings').value)),
    months: clamp(Math.round(parseNum($('sMonths').value)) || 3, 1, 24),
    margin: clamp(parseNum($('sMargin').value), 0, 80),
  };
  saveCfg(); render(); toast('Réglages enregistrés');
});

$('fixedForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseNum($('fAmount').value);
  if (amount <= 0) return toast('Montant invalide');
  state.fixed.push({ id: uid(), label: $('fLabel').value.trim(), amount, kind: $('fKind').value, who: $('fWho').value });
  save(); $('fLabel').value = ''; $('fAmount').value = ''; render(); toast('Charge ajoutée');
});

$('catForm').addEventListener('submit', e => {
  e.preventDefault();
  const n = $('cName').value.trim();
  if (n && !state.categories.includes(n)) { state.categories.push(n); save(); render(); }
  $('cName').value = '';
});

$('budgetForm').addEventListener('submit', e => {
  e.preventDefault();
  const c = $('bCat').value, a = parseNum($('bAmount').value);
  if (!c) return;
  if (a > 0) state.budgets[c] = a; else delete state.budgets[c];
  saveCfg(); $('bAmount').value = ''; render(); toast(a > 0 ? `Budget ${c} : ${fmt0(a)}` : `Budget ${c} retiré`);
});

$('projectOn').onclick = () => { state.project.enabled = true; saveCfg(); render(); $('projectDetails').open = true; $('pPrice').focus(); };

$('projectForm').addEventListener('submit', e => {
  e.preventDefault();
  state.project = {
    enabled: $('pEnabled').checked,
    price: Math.max(0, parseNum($('pPrice').value)),
    type: $('pType').value === 'neuf' ? 'neuf' : 'ancien',
    works: Math.max(0, parseNum($('pWorks').value)),
    saved: Math.max(0, parseNum($('pSaved').value)),
    apportPct: clamp(parseNum($('pApportPct').value), 0, 100),
    share: clamp(parseNum($('pShare').value), 0, 100),
    rate: clamp(parseNum($('pRate').value), 0, 15),
    years: clamp(Math.round(parseNum($('pYears').value)) || 25, 5, 30),
    ins: clamp(parseNum($('pIns').value), 0, 3),
  };
  saveCfg(); render(); toast('Projet enregistré'); $('projectDetails').open = false;
  $('projectCard').scrollIntoView({ behavior: 'smooth' });
});

function download(name, content, type) {
  if (ANDROID) {
    const ok = ANDROID.save(name, content, type);
    toast(ok ? 'Enregistré dans Téléchargements › Auplio Investment' : '⚠ Enregistrement impossible');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('exportBtn').onclick = () => download(`auplio-investment-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
$('exportCsvBtn').onclick = () => {
  const q = s => `"${String(s || '').replace(/"/g, '""')}"`;
  const lines = ['date;type;categorie;montant;qui;note', ...opsOf(state.expenses, state.incomes).reverse()
    .map(o => [o.date, o.kind === 'inc' ? 'revenu' : 'depense', q(o.kind === 'inc' ? '' : o.cat), String(o.amount).replace('.', ','), q(whoName(o.who)), q(o.note)].join(';'))];
  download(`operations-${todayISO()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
};
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!valid(d)) throw new Error();
    if (!confirm('Remplacer les données actuelles par cette sauvegarde ?')) return;
    state = migrate(d); selectedCat = state.categories[0];
    save(); render(); toast('Sauvegarde importée');
  } catch { toast('Fichier invalide'); }
  e.target.value = '';
});

/* ---------- Import de relevé bancaire (CSV) ---------- */
let imp = null;   // { rows, file }

$('csvFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const p = parseStatement(decodeBytes(await f.arrayBuffer()));
    if (p.error || !p.rows.length) return toast(p.error || 'Aucune opération trouvée dans ce fichier');
    const existing = new Set([...state.expenses, ...state.incomes].map(x => x.imp).filter(Boolean));
    const rows = classify(p.rows, { categories: state.categories, rules: state.rules, fixed: state.fixed, existing })
      .sort((a, b) => b.date.localeCompare(a.date));
    imp = { rows, file: f.name };
    $('impWho').innerHTML = WHO.map(w => `<option value="${w}"${w === 'c' ? ' selected' : ''}>${w === 'c' ? 'Compte commun' : esc(whoName(w))}</option>`).join('');
    renderImport(); showTab('import');
  } catch (err) { toast('Fichier illisible'); }
});

function renderImport() {
  if (!imp) return;
  const rows = imp.rows, on = rows.filter(r => r.on);
  const dates = rows.map(r => r.date).sort();
  const d = x => new Date(x + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const dep = sum(on.filter(r => r.amount < 0).map(r => -r.amount)), rev = sum(on.filter(r => r.amount > 0).map(r => r.amount));
  $('impSummary').innerHTML = `<b>${rows.length}</b> opérations du ${d(dates[0])} au ${d(dates[dates.length - 1])}.<br>` +
    `<b>${on.length}</b> cochées : ${fmt(dep)} de dépenses${rev ? ` et ${fmt(rev)} de revenus` : ''}.`;
  const opts = state.categories.map(c => `<option>${esc(c)}</option>`).join('');
  $('impList').innerHTML = rows.map((r, i) => `<li class="${r.on ? '' : 'off'}">
    <input type="checkbox" data-ii="${i}"${r.on ? ' checked' : ''} aria-label="Importer cette ligne">
    <div class="l"><b>${esc(r.label)}</b><small>${new Date(r.date + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}${r.reason ? ' · ' + esc(r.reason) : ''}</small></div>
    <div class="r2"><span class="${r.amount > 0 ? 'pos' : ''}">${r.amount > 0 ? '+' : ''}${fmt(Math.abs(r.amount))}</span>
    ${r.amount < 0 ? `<select data-ic="${i}">${opts.replace(`<option>${esc(r.cat)}</option>`, `<option selected>${esc(r.cat)}</option>`)}</select>` : ''}</div></li>`).join('');
  $('impGo').textContent = on.length ? `Importer ${on.length} opération${on.length > 1 ? 's' : ''}` : 'Rien à importer';
  $('impGo').disabled = !on.length;
}

$('impList').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.ii !== undefined) { imp.rows[+t.dataset.ii].on = t.checked; renderImport(); }
  else if (t.dataset.ic !== undefined) {
    const r = imp.rows[+t.dataset.ic];
    r.cat = t.value; r.manual = true;
    // même commerçant → même catégorie, sauf lignes déjà corrigées à la main
    imp.rows.forEach(x => { if (x !== r && !x.manual && x.key === r.key) x.cat = t.value; });
    renderImport();
  }
});
$('impCancel').onclick = () => { imp = null; showTab('saisie'); };
$('impGo').onclick = () => {
  if (!imp) return;
  const who = $('impWho').value, bat = uid(), rows = imp.rows.filter(r => r.on);
  let n = 0, last = null;
  for (const r of rows) {
    const base = { id: uid(), date: r.date, amount: Math.abs(r.amount), note: r.label.slice(0, 60), who, imp: r.imp, bat, src: 'csv' };
    if (r.amount < 0) {
      state.expenses.push({ ...base, cat: r.cat });
      if (r.cat !== r.auto || r.manual) state.rules[r.key] = r.cat;
    } else state.incomes.push(base);
    n++; if (!last || r.date > last) last = r.date;
  }
  state.lastImport = { id: bat, at: Date.now(), file: imp.file };
  imp = null;
  save(); if (last) viewMonth = ym(last);
  render(); showTab('mois');
  toast(`${n} opération${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}`);
};
$('undoImport').onclick = () => {
  const li = state.lastImport; if (!li) return;
  if (!confirm('Supprimer toutes les opérations du dernier import ?')) return;
  const ids = [...state.expenses, ...state.incomes].filter(x => x.bat === li.id).map(x => x.id);
  markDeleted(ids);
  state.expenses = state.expenses.filter(e => e.bat !== li.id);
  state.incomes = state.incomes.filter(i => i.bat !== li.id);
  state.lastImport = null;
  save(); render(); toast(`${ids.length} opérations retirées`);
};

/* ---------- Partage entre les deux téléphones ---------- */
// Fusion : union des opérations par identifiant, suppressions propagées,
// doublons d'import éliminés, réglages = version la plus récemment modifiée.
function mergeStates(L, R) {
  const deleted = { ...R.deleted, ...L.deleted };
  const uni = (a, b) => { const m = new Map(); [...a, ...b].forEach(x => { if (!deleted[x.id] && !m.has(x.id)) m.set(x.id, x); }); return [...m.values()]; };
  const dedupImp = arr => { const seen = new Set(); return arr.filter(x => !x.imp || (seen.has(x.imp + x.who) ? false : (seen.add(x.imp + x.who), true))); };
  const cfg = (R.cfgAt || 0) > (L.cfgAt || 0) ? R : L;
  return {
    ...L,
    expenses: dedupImp(uni(L.expenses, R.expenses)),
    incomes: dedupImp(uni(L.incomes, R.incomes)),
    fixed: uni(L.fixed, R.fixed),
    categories: [...new Set([...L.categories, ...R.categories])],
    rules: { ...R.rules, ...L.rules },
    deleted,
    people: cfg.people, settings: cfg.settings, project: cfg.project, budgets: cfg.budgets, cfgAt: cfg.cfgAt || 0,
  };
}

$('shareBtn').onclick = async () => {
  const name = `auplio-partage-${todayISO()}.txt`;   // .txt : format accepté par le partage Android
  const json = JSON.stringify(state);
  if (ANDROID) { ANDROID.share(name, json, 'Mes données Auplio Investment : ouvre l\'appli → Réglages → « Recevoir et fusionner ».'); return; }
  try {
    const file = new File([json], name, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Auplio Investment', text: 'Mes données Auplio Investment : ouvre l\'appli → Réglages → « Recevoir et fusionner ».' });
      return;
    }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  download(name, json, 'text/plain');
  toast('Fichier enregistré dans Téléchargements : envoie-le à l\'autre téléphone');
};

$('mergeFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!valid(d)) throw new Error();
    const before = new Set([...state.expenses, ...state.incomes, ...state.fixed].map(x => x.id));
    const merged = migrate(mergeStates(state, migrate(d)));
    const after = new Set([...merged.expenses, ...merged.incomes, ...merged.fixed].map(x => x.id));
    const added = [...after].filter(id => !before.has(id)).length, removed = [...before].filter(id => !after.has(id)).length;
    state = merged; selectedCat = state.categories.includes(selectedCat) ? selectedCat : state.categories[0];
    save(); render();
    toast(`Fusion faite : ${added} reçue${added > 1 ? 's' : ''}${removed ? `, ${removed} supprimée${removed > 1 ? 's' : ''}` : ''}`);
  } catch (err) { toast('Fichier invalide'); }
});

/* ---------- Démarrage ---------- */
$('date').value = todayISO();
render();
load().then(({ data, migrated }) => {
  state = data; selectedCat = state.categories[0];
  render();
  if (!state.updatedAt || migrated) save();   // premier lancement ou reprise des données v0.1
  ensurePersistent();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && state.updatedAt) save(); });
if (!ANDROID && 'serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
