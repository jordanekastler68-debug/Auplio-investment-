'use strict';
/* Auplio Investment v0.5 — tableau de bord du couple : date d'achat de la maison, salaires, charges,
   dépenses de chacun. Données sur le téléphone (IndexedDB + copie localStorage) et, si la synchro est
   activée, dans un dépôt GitHub privé (un fichier par personne, fusion sans conflit). */

const KEY = 'auplio-investment-v1';
const SYNC_KEY = 'auplio-investment-sync';
const ANDROID = window.AuplioAndroid || null;
const DEFAULT_CATS = ['Courses', 'Carburant', 'Restaurant', 'Loisirs', 'Shopping', 'Santé', 'Maison', 'Divers'];
const PRESETS = [
  ['Loyer', 'Logement', 'loyer'], ['Électricité', 'Énergie & eau'], ['Eau', 'Énergie & eau'], ['Gaz', 'Énergie & eau'],
  ['Internet', 'Internet & téléphone'], ['Téléphone', 'Internet & téléphone'], ['Assurance habitation', 'Assurances'],
  ['Assurance auto', 'Assurances'], ['Mutuelle', 'Santé'], ['Crédit', 'Crédits', 'credit'], ['Impôts', 'Impôts'],
  ['Abonnement', 'Abonnements', 'abonnement'],
].map(([label, cat, kind]) => ({ label, cat, kind: kind || 'charge' }));
const NOTAIRE = { ancien: 0.075, neuf: 0.025 };
const HCSF_MAX = 0.35, HCSF_YEARS = { ancien: 25, neuf: 27 };
const WHO = ['a', 'b'];
const COLOR = { a: '#1D9E75', b: '#7F77DD' };
const CFG_SECTIONS = ['people', 'project', 'done', 'categories'];

/* ---------- Outils ---------- */
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmt = n => eur.format(Math.round(n * 100) / 100);
const fmt0 = n => eur0.format(Math.round(n) || 0);
const pct = (n, d = 0) => (n * 100).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d }) + ' %';
const parseNum = s => { const n = parseFloat(String(s ?? '').replace(/[\s  €%]/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = id => document.getElementById(id);
const ym = d => d.slice(0, 7);
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const curMonth = () => ym(todayISO());
const monthName = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
const monthShort = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' }); };
const shiftMonth = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = arr => arr.reduce((a, b) => a + b, 0);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const duration = m => m < 12 ? `${m} mois` : (m % 12 ? `${plural(Math.floor(m / 12), 'an')} et ${m % 12} mois` : plural(m / 12, 'an'));
const dot = w => `<span class="dot" style="background:${COLOR[w]}"></span>`;
function stable(v) {   // JSON à clés triées : sert à comparer deux états sans faux écarts
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

/* ---------- Modèle ---------- */
const blankProject = () => ({ price: 0, type: 'ancien', works: 0, saved: 0, apportPct: 10, share: 80, rate: 3.8, years: 25, ins: 0.30 });
const blank = () => ({
  v: 3,
  people: [{ name: 'Moi' }, { name: 'Conjoint(e)' }],
  me: null,           // 'a' ou 'b' : à qui appartient ce téléphone
  expenses: [],       // { id, date, amount, cat, note, who }
  incomes: [],        // ancien format (rentrées exceptionnelles), conservé
  fixed: [],          // charges : { id, label, amount, period (mois), cat, kind, who }
  salaries: {},       // 'AAAA-MM' → { a, b } net payé
  categories: [...DEFAULT_CATS],
  project: blankProject(),
  done: {},           // 'AAAA-MM' → { project: montant mis de côté pour la maison }
  rules: {}, deleted: {}, at: {}, cfgAt: 0, lastMerge: 0, lastImport: null, updatedAt: 0,
});
const valid = d => d && typeof d === 'object' && Array.isArray(d.expenses);
const whoOk = w => (w === 'a' || w === 'b') ? w : 'a';
const presetOf = label => PRESETS.find(p => p.label.toLowerCase() === String(label || '').toLowerCase());
// Catégorie et nature d'une charge d'après son nom (le crédit compte dans l'endettement, le loyer disparaît à l'achat).
function guessCharge(label) {
  const p = presetOf(label); if (p) return { cat: p.cat, kind: p.kind };
  const t = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rules = [[/loyer/, 'Logement', 'loyer'], [/credit|pret|emprunt|leasing|loa\b|lld\b/, 'Crédits', 'credit'],
    [/electric|edf|engie|eau\b|veolia|suez|saur|gaz|fioul|totalenergies|energie/, 'Énergie & eau'],
    [/internet|box|free|orange|sfr|bouygues|sosh|telephone|mobile|forfait/, 'Internet & téléphone'],
    [/assurance|mutuelle|prevoyance/, 'Assurances'], [/impot|taxe/, 'Impôts'],
    [/netflix|spotify|deezer|disney|canal|prime|youtube|icloud|abonnement|salle|sport|fitness/, 'Abonnements', 'abonnement'],
    [/creche|nounou|cantine|ecole|garde/, 'Enfants']];
  for (const [re, cat, kind] of rules) if (re.test(t)) return { cat, kind: kind || 'charge' };
  return { cat: 'Autres charges', kind: 'charge' };
}

function migrate(d) {
  const b = blank();
  if (!valid(d)) return b;
  const num = (x, def = 0) => (x !== null && x !== '' && isFinite(+x) ? +x : def);
  const people = Array.isArray(d.people) && d.people.length === 2
    ? d.people.map((p, i) => ({ name: String(p?.name || b.people[i].name).slice(0, 16) })) : b.people;
  const salaries = {};
  for (const [k, v] of Object.entries(d.salaries || {})) {
    if (!/^\d{4}-\d{2}$/.test(k) || !v) continue;
    const e = {}; for (const w of WHO) if (+v[w] > 0) e[w] = +v[w];
    if (Object.keys(e).length) salaries[k] = e;
  }
  if (!Object.keys(salaries).length && Array.isArray(d.people) && d.people.some(p => +p?.income > 0)) {
    const e = {}; d.people.forEach((p, i) => { if (+p.income > 0) e[i ? 'b' : 'a'] = +p.income; });
    salaries[curMonth()] = e;
  }
  const at = {}; for (const k of CFG_SECTIONS) at[k] = +((d.at || {})[k]) || (d.at ? 0 : (d.cfgAt || 0));
  const pr = { ...blankProject(), ...(d.project || {}) };
  if (d.project && d.project.enabled === false && d.v !== 3) pr.price = 0;
  return {
    v: 3,
    people,
    me: d.me === 'a' || d.me === 'b' ? d.me : null,
    expenses: d.expenses.filter(e => e && e.date && e.amount > 0).map(e => ({ ...e, id: e.id || uid(), amount: +e.amount, cat: e.cat || 'Divers', note: e.note || '', who: whoOk(e.who) })),
    incomes: (Array.isArray(d.incomes) ? d.incomes : []).filter(i => i && i.date && i.amount > 0).map(i => ({ ...i, who: whoOk(i.who) })),
    fixed: (Array.isArray(d.fixed) ? d.fixed : []).filter(f => f && +f.amount > 0).map(f => {
      const g = guessCharge(f.label);
      return { ...f, id: f.id || uid(), label: f.label || '—', amount: +f.amount, period: [1, 2, 3, 6, 12].includes(+f.period) ? +f.period : 1,
        cat: f.cat || g.cat, kind: f.kind && f.kind !== 'charge' ? f.kind : g.kind, who: whoOk(f.who) };
    }),
    salaries,
    categories: Array.isArray(d.categories) && d.categories.length && d.v === 3 ? d.categories : [...DEFAULT_CATS, ...((d.categories || []).filter(c => !DEFAULT_CATS.includes(c) && !['Logement', 'Abonnements'].includes(c)))],
    project: pr,
    done: d.done && typeof d.done === 'object' ? d.done : {},
    rules: d.rules && typeof d.rules === 'object' ? d.rules : {},
    deleted: d.deleted && typeof d.deleted === 'object' ? d.deleted : {},
    at, cfgAt: d.cfgAt || 0, lastMerge: d.lastMerge || 0, lastImport: d.lastImport || null, updatedAt: d.updatedAt || 0,
  };
}

/* ---------- Stockage local ---------- */
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
async function idbGet() { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get('state'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbPut(v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, 'state'); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function load() {
  let a = null, b = null;
  try { a = await idbGet(); } catch (e) { /* indisponible */ }
  try { b = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* rien */ }
  const raw = [a, b].filter(valid).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0))[0];
  return { data: migrate(raw), migrated: !!raw && raw.v !== 3 };
}
let state = blank();
let saveOk = true;
async function save(opts = {}) {
  state.updatedAt = Date.now();
  const json = JSON.stringify(state);
  let ok = false;
  try { await idbPut(JSON.parse(json)); ok = true; } catch (e) { /* copie */ }
  try { localStorage.setItem(KEY, json); ok = true; } catch (e) { /* rien */ }
  saveOk = ok;
  if (!ok) toast('⚠ Échec de la sauvegarde');
  if (!opts.noSync) scheduleSync();
}
function saveCfg(...sections) { const t = Date.now(); sections.forEach(k => state.at[k] = t); state.cfgAt = t; return save(); }
const markDeleted = ids => { const t = Date.now(); ids.forEach(id => state.deleted[id] = t); };

/* ---------- Fusion de deux états (téléphones) ---------- */
function mergeStates(L, R) {
  const deleted = { ...R.deleted, ...L.deleted };
  const uni = (a, b) => { const m = new Map(); [...a, ...b].forEach(x => { if (!deleted[x.id] && !m.has(x.id)) m.set(x.id, x); }); return [...m.values()]; };
  const dedupImp = arr => { const seen = new Set(); return arr.filter(x => !x.imp || (seen.has(x.imp + x.who) ? false : (seen.add(x.imp + x.who), true))); };
  const pick = k => (((R.at || {})[k] || 0) > ((L.at || {})[k] || 0) ? R : L);
  const at = {}; CFG_SECTIONS.forEach(k => at[k] = Math.max((L.at || {})[k] || 0, (R.at || {})[k] || 0));
  // Charges : même identifiant → la version modifiée le plus récemment
  const fixedMap = new Map();
  [...L.fixed, ...R.fixed].forEach(f => { if (deleted[f.id]) return; const o = fixedMap.get(f.id); if (!o || (f.upd || 0) > (o.upd || 0)) fixedMap.set(f.id, f); });
  const salaries = {};
  for (const k of new Set([...Object.keys(L.salaries || {}), ...Object.keys(R.salaries || {})])) {
    const l = (L.salaries || {})[k] || {}, r = (R.salaries || {})[k] || {}, e = {};
    for (const w of WHO) { const v = R.me === w && r[w] ? r[w] : (l[w] || r[w]); if (v) e[w] = v; }   // le téléphone de la personne fait foi
    if (Object.keys(e).length) salaries[k] = e;
  }
  return {
    ...L,
    expenses: dedupImp(uni(L.expenses, R.expenses)),
    incomes: dedupImp(uni(L.incomes, R.incomes)),
    fixed: [...fixedMap.values()],
    salaries,
    rules: { ...R.rules, ...L.rules },
    deleted,
    people: pick('people').people, project: pick('project').project, done: pick('done').done, categories: pick('categories').categories,
    at, cfgAt: Math.max(L.cfgAt || 0, R.cfgAt || 0),
    me: L.me,
  };
}

/* ---------- Calculs ---------- */
const whoName = w => state.people[w === 'b' ? 1 : 0].name;
const other = () => state.me === 'b' ? 'a' : 'b';
const monthExpenses = k => state.expenses.filter(e => ym(e.date) === k);
const monthly = f => f.amount / (f.period || 1);
const chargesOf = w => sum(state.fixed.filter(f => !w || f.who === w).map(monthly));
const salaryOf = (k, w) => (state.salaries[k] && state.salaries[k][w] > 0) ? state.salaries[k][w] : null;
function refSalary(w) {   // moyenne des 3 dernières fiches de paie saisies
  const vals = Object.keys(state.salaries).sort().reverse().map(k => salaryOf(k, w)).filter(v => v !== null).slice(0, 3);
  return vals.length ? sum(vals) / vals.length : 0;
}
const monthSalary = (k, w) => { const v = salaryOf(k, w); return v !== null ? { v, est: false } : { v: refSalary(w), est: true }; };
function monthProgress() { const n = new Date(); return { day: n.getDate(), dim: new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() }; }
const historyMonths = () => [1, 2, 3].map(i => shiftMonth(curMonth(), -i)).filter(k => monthExpenses(k).length);
// Dépenses courantes habituelles d'une personne : moyenne des 3 derniers mois, sinon projection du mois en cours.
function usualSpend(w) {
  const hist = historyMonths();
  if (hist.length) return { v: sum(hist.map(k => sum(monthExpenses(k).filter(e => e.who === w).map(e => e.amount)))) / hist.length, basis: hist.length === 1 ? 'le mois dernier' : `les ${hist.length} derniers mois` };
  const { day, dim } = monthProgress();
  const spent = sum(monthExpenses(curMonth()).filter(e => e.who === w).map(e => e.amount));
  return { v: day >= 7 ? spent / day * dim : spent, basis: 'le mois en cours' };
}
function personMonth(k, w) {
  const sal = monthSalary(k, w), charges = chargesOf(w), spent = sum(monthExpenses(k).filter(e => e.who === w).map(e => e.amount));
  return { sal: sal.v, est: sal.est, charges, spent, left: sal.v - charges - spent };
}
const loanFactor = (rate, years) => { const r = rate / 1200, n = years * 12; return r > 0 ? r / (1 - Math.pow(1 + r, -n)) : 1 / n; };

// Le plan maison : apport, date d'achat, effort du mois, mensualité, endettement.
function housePlan() {
  const p = state.project;
  if (!(p.price > 0)) return null;
  const cur = curMonth(), notRate = NOTAIRE[p.type] ?? NOTAIRE.ancien;
  const notaire = p.price * notRate, total = p.price + notaire + p.works;
  const target = notaire + p.price * p.apportPct / 100;
  const doneNow = (state.done[cur] || {}).project || 0;
  const savedStart = p.saved - doneNow;   // apport au début du mois
  const cap = {}; WHO.forEach(w => { const u = usualSpend(w); cap[w] = refSalary(w) - chargesOf(w) - u.v; });
  const capTotal = Math.max(0, cap.a) + Math.max(0, cap.b);
  const monthlySave = capTotal * p.share / 100;
  const gap = Math.max(0, target - savedStart);
  const months = gap <= 0 ? 0 : monthlySave > 0 ? Math.ceil(gap / monthlySave) : null;
  const thisMonth = Math.min(gap, monthlySave);
  const split = {}; WHO.forEach(w => split[w] = capTotal > 0 ? thisMonth * Math.max(0, cap[w]) / capTotal : 0);
  const loan = Math.max(0, total - Math.max(target, p.saved));
  const a = loanFactor(p.rate, p.years), insM = loan * p.ins / 1200, mens = loan * a + insM;
  const income = refSalary('a') + refSalary('b'), credits = sum(state.fixed.filter(f => f.kind === 'credit').map(monthly));
  const ratio = income > 0 ? (mens + credits) / income : null;
  const maxMens = Math.max(0, HCSF_MAX * income - credits), maxLoan = maxMens / (a + p.ins / 1200);
  const maxPrice = Math.max(0, (maxLoan + Math.max(target, p.saved) - p.works) / (1 + notRate));
  const loyer = sum(state.fixed.filter(f => f.kind === 'loyer').map(monthly));
  return { notRate, notaire, total, target, savedStart, gap, months, monthlySave, thisMonth, split, cap, capTotal, doneNow,
    loan, mens, insM, ratio, maxMens, maxPrice, credits, loyer, yearsMax: HCSF_YEARS[p.type] || 25, cost: mens * p.years * 12 - loan,
    when: months === null ? null : shiftMonth(cur, Math.max(0, months - 1)) };
}

/* ---------- Synchronisation (dépôt GitHub privé) ---------- */
let sync = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } })();
const syncOn = () => !!(sync.repo && sync.token);
const saveSync = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { /* rien */ } };
const b64enc = s => btoa(unescape(encodeURIComponent(s)));
const b64dec = s => decodeURIComponent(escape(atob(String(s).replace(/\s/g, ''))));
const ghHeaders = () => ({ Authorization: `Bearer ${sync.token}`, Accept: 'application/vnd.github+json' });
const ghFile = w => `https://api.github.com/repos/${sync.repo}/contents/foyer/${w}.json`;
async function ghGet(w) {
  const r = await fetch(`${ghFile(w)}?t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
  if (r.status === 404) return { sha: null, data: null };
  if (!r.ok) throw new Error(r.status === 401 ? 'clé d\'accès refusée' : `GitHub ${r.status}`);
  const j = await r.json();
  return { sha: j.sha, data: JSON.parse(b64dec(j.content)) };
}
async function ghPut(w, obj, sha) {
  const body = { message: `${whoName(w)} · ${new Date().toLocaleString('fr-FR')}`, content: b64enc(JSON.stringify(obj)) };
  if (sha) body.sha = sha;
  const r = await fetch(ghFile(w), { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return { conflict: true };
  if (!r.ok) throw new Error(r.status === 403 || r.status === 404 ? 'la clé ne peut pas écrire dans ce dépôt' : `GitHub ${r.status}`);
  return { sha: (await r.json()).content.sha };
}
const canon = s => stable({ ...s, updatedAt: 0, lastMerge: 0, lastImport: null,
  expenses: [...s.expenses].sort((x, y) => x.id.localeCompare(y.id)), incomes: [...s.incomes].sort((x, y) => String(x.id).localeCompare(String(y.id))),
  fixed: [...s.fixed].sort((x, y) => x.id.localeCompare(y.id)) });

let syncing = false, syncAgain = false, syncTimer = null;
function scheduleSync() { if (!syncOn()) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 2000); }
async function syncNow() {
  if (!syncOn() || !state.me) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true; renderSyncDot();
  try {
    const t0 = state.updatedAt;
    const [mine, theirs] = await Promise.all([ghGet(state.me), ghGet(other())]);
    if (state.updatedAt !== t0) { syncAgain = true; return; }   // une saisie a eu lieu pendant l'échange : on recommence
    const before = canon(state);
    let merged = state;
    if (theirs.data && valid(theirs.data)) merged = migrate(mergeStates(merged, migrate(theirs.data)));
    if (mine.data && valid(mine.data)) merged = migrate(mergeStates(merged, migrate({ ...mine.data, me: null })));
    merged.me = state.me;
    merged.lastMerge = theirs.data ? Date.now() : state.lastMerge;
    const changed = canon(merged) !== before;
    state = merged;
    if (!mine.data || canon(migrate(mine.data)) !== canon(state)) {
      const w = await ghPut(state.me, state, mine.sha);
      if (w.conflict) syncAgain = true;
    }
    if (changed) { await save({ noSync: true }); render(); }
    sync.lastOk = Date.now(); sync.err = '';
  } catch (e) {
    sync.err = e.message || 'hors ligne';
  } finally {
    syncing = false; saveSync(); renderSyncDot(); renderSyncCard();
    if (syncAgain) { syncAgain = false; setTimeout(syncNow, 1500); }
  }
}
function inviteCode() {
  return 'AUPLIO1:' + b64enc(JSON.stringify({ repo: sync.repo, token: sync.token, names: state.people.map(p => p.name), for: other() }));
}
function useInvite(code) {
  const m = String(code || '').trim().match(/AUPLIO1:([A-Za-z0-9+/=]+)/);
  if (!m) return false;
  const d = JSON.parse(b64dec(m[1]));
  if (!d.repo || !d.token) return false;
  sync = { repo: d.repo, token: d.token }; saveSync();
  if (Array.isArray(d.names)) d.names.forEach((n, i) => { if (n) state.people[i].name = n; });
  state.me = d.for === 'a' || d.for === 'b' ? d.for : 'b';
  return true;
}

/* ---------- Rendu ---------- */
let selectedCat = DEFAULT_CATS[0], selectedWho = null, histMonth = curMonth(), histFilter = 'all', currentTab = 'dash';

function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }
function showTab(name) {
  currentTab = name;
  document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $('nav').style.display = name === 'welcome' ? 'none' : '';
  window.scrollTo(0, 0);
}
function goTo(target) {
  const [tab, anchor] = String(target).split('#');
  showTab(tab);
  if (anchor && $(anchor)) setTimeout(() => $(anchor).scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function renderSyncDot() {
  const el = $('syncDot');
  if (!syncOn()) { el.className = 'sync-dot'; el.title = 'Synchro non activée'; return; }
  el.className = 'sync-dot ' + (syncing ? 'busy' : sync.err ? 'err' : 'ok');
  el.title = syncing ? 'Synchronisation…' : sync.err ? 'Synchro : ' + sync.err : 'Synchronisé';
}

function renderDash() {
  const cur = curMonth(), p = state.project, me = state.me, ot = other();
  $('monthLabel').textContent = monthShort(cur);

  // Bandeaux
  const bn = [];
  if (me && salaryOf(cur, me) === null) bn.push(`<form class="card banner pay" id="myPay"><b>Ta fiche de paie de ${monthShort(cur)}</b><div class="row"><input id="myPayIn" type="text" inputmode="decimal" placeholder="Net payé €"><button type="submit" class="primary sm">OK</button></div></form>`);
  if (me && salaryOf(cur, ot) === null) bn.push(`<div class="card banner warn">${dot(ot)} ${esc(whoName(ot))} : fiche de paie de ${monthShort(cur)} à saisir</div>`);
  if (!syncOn()) bn.push(`<div class="card banner info"><span>Activez la synchro pour voir les dépenses de ${esc(whoName(ot))}.</span><button type="button" class="ghost sm" data-go="reglages#syncCard">Activer</button></div>`);
  else if (sync.err) bn.push(`<div class="card banner warn">Synchro en échec : ${esc(sync.err)}. <button type="button" class="ghost sm" data-go="reglages#syncCard">Voir</button></div>`);
  $('banners').innerHTML = bn.join('');

  // Maison
  const h = housePlan();
  if (!h) {
    $('houseCard').innerHTML = `<p class="muted small">Votre maison</p><p class="hero-line">Quel prix visez-vous ?</p><p class="muted small">Indiquez le prix de la maison : l'appli calcule l'apport nécessaire et la date à laquelle vous pourrez acheter.</p><button type="button" class="primary" data-go="reglages#houseForm">Indiquer la maison</button>`;
  } else {
    const head = h.gap <= 0 ? 'Apport prêt : vous pouvez acheter' : h.when ? `Achat possible en ${monthName(h.when)}` : 'Pas encore atteignable';
    const sub = h.gap <= 0 ? 'Prenez rendez-vous avec la banque ou un courtier.' : h.months ? `dans ${duration(h.months)}` : 'Aujourd\'hui, rien ne reste en fin de mois : il faut réduire les dépenses.';
    const ok = h.ratio !== null && h.ratio <= HCSF_MAX;
    let todo = '';
    if (h.gap > 0 && (h.thisMonth > 0.5 || h.doneNow)) {
      todo = h.doneNow
        ? `<div class="todo-line done"><span>✓ ${fmt0(h.doneNow)} mis de côté ce mois-ci</span><button type="button" class="ghost sm" data-undone="1">Annuler</button></div>`
        : `<div class="todo-line"><div><b>Ce mois-ci : ${fmt0(h.thisMonth)} à mettre de côté à deux</b><small>${WHO.map(w => `${dot(w)} ${esc(whoName(w))} ${fmt0(h.split[w])}`).join(' · ')}</small></div><button type="button" class="primary sm" data-done="${Math.round(h.thisMonth)}">C'est fait</button></div>`;
    }
    $('houseCard').innerHTML = `
      <p class="muted small">Maison à ${fmt0(p.price)}</p>
      <p class="hero-line">${head}</p>
      <p class="muted small">${sub}</p>
      <div class="progress"><div style="width:${h.target > 0 ? clamp(p.saved / h.target, 0, 1) * 100 : 100}%"></div></div>
      <div class="line small"><span>Apport : ${fmt0(p.saved)}</span><span class="muted">sur ${fmt0(h.target)}</span></div>
      ${todo}
      <p class="small ${ok ? 'pos' : 'neg'}">Mensualité ≈ ${fmt0(h.mens)} · endettement ${h.ratio === null ? '—' : pct(h.ratio)} ${h.ratio === null ? '' : ok ? '(la banque peut suivre)' : `(trop, max 35 % : visez ≈ ${fmt0(h.maxPrice)})`}</p>
      <details><summary>Le calcul</summary><table class="calc">
        <tr><td>Frais de notaire (≈ ${pct(h.notRate, 1)})</td><td>${fmt0(h.notaire)}</td></tr>
        <tr><td>Apport visé (frais + ${p.apportPct} % du prix)</td><td>${fmt0(h.target)}</td></tr>
        <tr><td>Ce qui reste chaque mois à deux</td><td>${fmt0(h.capTotal)}</td></tr>
        <tr><td>Mis de côté pour la maison (${p.share} %)</td><td>${fmt0(h.monthlySave)} / mois</td></tr>
        <tr><td>À emprunter</td><td>${fmt0(h.loan)}</td></tr>
        <tr><td>Mensualité (${p.years} ans à ${String(p.rate).replace('.', ',')} %, assurance comprise)</td><td>${fmt0(h.mens)}</td></tr>
        <tr><td>Coût du crédit</td><td>${fmt0(h.cost)}</td></tr>
      </table><p class="muted small">« Ce qui reste chaque mois » : salaires (moyenne des 3 dernières fiches de paie) − charges − dépenses habituelles. ${h.loyer ? `Le loyer (${fmt0(h.loyer)}) disparaîtra avec l'achat.` : ''} Hors frais de garantie et de dossier (1 à 2 % de l'emprunt). Calcul indicatif.</p></details>`;
  }

  // Les deux colonnes
  const pm = {}; WHO.forEach(w => pm[w] = personMonth(cur, w));
  $('duo').innerHTML = WHO.map(w => { const x = pm[w]; return `<div class="card person">
    <p class="pname">${dot(w)} ${esc(whoName(w))}${w === me ? ' <small class="muted">moi</small>' : ''}</p>
    <div class="line"><span class="muted">Salaire</span><span>${x.est ? '≈ ' : ''}${fmt0(x.sal)}</span></div>
    <div class="line"><span class="muted">Charges</span><span>${fmt0(x.charges)}</span></div>
    <div class="line"><span class="muted">Dépenses</span><span>${fmt0(x.spent)}</span></div>
    <div class="line total"><span>Reste</span><b class="${x.left < 0 ? 'neg' : 'pos'}">${fmt0(x.left)}</b></div></div>`; }).join('');
  const tl = pm.a.left + pm.b.left;
  $('foyerLeft').textContent = 'reste ' + fmt0(tl);
  $('foyerLeft').className = tl < 0 ? 'neg' : 'pos';
  $('foyerSub').textContent = `Salaires ${fmt0(pm.a.sal + pm.b.sal)} · Charges ${fmt0(pm.a.charges + pm.b.charges)} · Dépenses ${fmt0(pm.a.spent + pm.b.spent)}` + (pm.a.est || pm.b.est ? ' · ≈ salaire estimé' : '');

  // Charges du mois
  const ch = [...state.fixed].sort((x, y) => monthly(y) - monthly(x));
  $('chargeList').innerHTML = ch.length ? ch.map(f => `<li><div class="l"><b>${dot(f.who)} ${esc(f.label)}</b>${f.period > 1 ? `<small>${fmt0(f.amount)} ${f.period === 12 ? 'par an' : `tous les ${f.period} mois`}</small>` : ''}</div><div class="r">${fmt0(monthly(f))}</div></li>`).join('') +
    `<li class="tot"><div class="l"><b>Total</b><small>${WHO.map(w => `${esc(whoName(w))} ${fmt0(chargesOf(w))}`).join(' · ')}</small></div><div class="r"><b>${fmt0(chargesOf())}</b></div></li>`
    : '<li class="empty">Ajoutez loyer, eau, électricité, internet, assurances… avec « Gérer ».</li>';

  // Où part l'argent
  const cats = {};
  const addC = (c, w, v) => { cats[c] = cats[c] || { a: 0, b: 0 }; cats[c][w] += v; };
  state.fixed.forEach(f => addC(f.cat, f.who, monthly(f)));
  monthExpenses(cur).forEach(e => addC(e.cat, e.who, e.amount));
  const rows = Object.entries(cats).map(([c, v]) => [c, v, v.a + v.b]).filter(r => r[2] > 0).sort((x, y) => y[2] - x[2]);
  const max = rows.length ? rows[0][2] : 1;
  $('whereList').innerHTML = rows.length ? rows.map(([c, v, t]) => `<li><div class="t"><span>${esc(c)}</span><span>${fmt0(t)}</span></div><div class="b stack"><div style="width:${v.a / max * 100}%;background:${COLOR.a}"></div><div style="width:${v.b / max * 100}%;background:${COLOR.b}"></div></div></li>`).join('')
    : '<li class="empty">Rien encore ce mois-ci.</li>';
  $('legend').innerHTML = WHO.map(w => `${dot(w)} ${esc(whoName(w))}`).join('&nbsp;&nbsp;&nbsp;');
}

function opHTML(e) {
  const d = new Date(e.date + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `<li><div class="l"><b>${dot(e.who)} ${esc(e.cat)}${e.note ? ` <span class="note">· ${esc(e.note)}</span>` : ''}</b><small>${d} · ${esc(whoName(e.who))}</small></div>
    <div class="r">${fmt(e.amount)}<button type="button" class="del" data-del="${e.id}" aria-label="Supprimer">×</button></div></li>`;
}
const byDate = (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

function renderAdd() {
  if (!selectedWho) selectedWho = state.me || 'a';
  $('catChips').innerHTML = state.categories.map(c => `<button type="button" class="chip${c === selectedCat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('whoSeg').innerHTML = WHO.map(w => `<button type="button" data-who="${w}" class="${w === selectedWho ? 'on' : ''}">${dot(w)} ${esc(whoName(w))}</button>`).join('');
  const d = $('date').value || todayISO();
  $('addMeta').textContent = `${d === todayISO() ? 'Aujourd\'hui' : new Date(d + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · payé par ${whoName(selectedWho)}`;
  $('addSync').textContent = syncOn() ? `Visible aussi sur le téléphone de ${whoName(other())}` : 'Synchro non activée : visible seulement sur ce téléphone';
  const recent = [...state.expenses].sort(byDate).slice(0, 8);
  $('recentList').innerHTML = recent.length ? recent.map(opHTML).join('') : '<li class="empty">Aucune dépense pour l\'instant.</li>';
}

function renderHist() {
  $('hMonth').textContent = monthName(histMonth);
  $('hNext').disabled = histMonth >= curMonth();
  $('hFilter').innerHTML = [['all', 'Tout'], ['a', whoName('a')], ['b', whoName('b')]]
    .map(([k, l]) => `<button type="button" data-hf="${k}" class="${k === histFilter ? 'on' : ''}">${k !== 'all' ? dot(k) + ' ' : ''}${esc(l)}</button>`).join('');
  const ae = document.activeElement && document.activeElement.closest && document.activeElement.closest('#paySet');
  if (!ae) $('paySet').innerHTML = WHO.map(w => `<label class="field">${dot(w)} Fiche de paie ${esc(whoName(w))}<input data-pay="${w}" type="text" inputmode="decimal" placeholder="Net payé €" value="${salaryOf(histMonth, w) ?? ''}"></label>`).join('') + '<button type="submit" class="ghost">OK</button>';
  const list = monthExpenses(histMonth).filter(e => histFilter === 'all' || e.who === histFilter).sort(byDate);
  const ws = histFilter === 'all' ? WHO : [histFilter];
  const sal = sum(ws.map(w => monthSalary(histMonth, w).v)), ch = sum(ws.map(chargesOf)), sp = sum(list.map(e => e.amount));
  $('hTotals').textContent = `Salaires ${fmt0(sal)} · Charges ${fmt0(ch)} · Dépenses ${fmt0(sp)} · Reste ${fmt0(sal - ch - sp)}`;
  $('hList').innerHTML = list.length ? list.map(opHTML).join('') : '<li class="empty">Aucune dépense ce mois-là.</li>';
}

function renderSyncCard() {
  const on = syncOn();
  $('syncSetup').style.display = on ? 'none' : '';
  $('syncActive').style.display = on ? '' : 'none';
  $('syncState').innerHTML = !on ? 'Non activée sur ce téléphone.'
    : sync.err ? `<span class="neg">⚠ ${esc(sync.err)}</span>`
    : `<span class="pos">✓ Activée</span> · dépôt ${esc(sync.repo)}${sync.lastOk ? ` · dernière synchro ${new Date(sync.lastOk).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`;
  if (!on && document.activeElement !== $('syRepo') && !$('syRepo').value) $('syRepo').value = sync.repo || 'jordanekastler68-debug/auplio-foyer';
}

function renderReglages() {
  renderSyncCard();
  const p = state.project;
  const setv = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
  setv('pPrice', p.price || ''); setv('pType', p.type); setv('pSaved', p.saved || ''); setv('pWorks', p.works || '');
  setv('pApportPct', p.apportPct); setv('pShare', p.share); setv('pRate', String(p.rate).replace('.', ',')); setv('pYears', p.years); setv('pIns', String(p.ins).replace('.', ','));
  const ch = [...state.fixed].sort((x, y) => monthly(y) - monthly(x));
  $('chargeEdit').innerHTML = ch.length ? ch.map(f => `<li><div class="l"><b>${dot(f.who)} ${esc(f.label)}</b><small>${esc(whoName(f.who))} · ${f.period === 1 ? 'chaque mois' : f.period === 12 ? 'une fois par an' : `tous les ${f.period} mois`}</small></div>
    <div class="r"><button type="button" class="ghost sm" data-editcharge="${f.id}">${fmt(f.amount)}</button><button type="button" class="del" data-delcharge="${f.id}" aria-label="Supprimer">×</button></div></li>`).join('')
    : '<li class="empty">Aucune charge pour l\'instant.</li>';
  const used = new Set(state.fixed.map(f => f.label.toLowerCase()));
  $('presetChips').innerHTML = PRESETS.filter(x => !used.has(x.label.toLowerCase()) || x.label === 'Crédit' || x.label === 'Abonnement')
    .map(x => `<button type="button" class="chip" data-preset="${esc(x.label)}">${esc(x.label)}</button>`).join('');
  const cw = $('cWho').value || state.me || 'a';
  $('cWho').innerHTML = WHO.map(w => `<option value="${w}">payé par ${esc(whoName(w))}</option>`).join('');
  $('cWho').value = cw;
  setv('sNameA', state.people[0].name); setv('sNameB', state.people[1].name);
  $('sMe').innerHTML = WHO.map(w => `<option value="${w}">${esc(whoName(w))}</option>`).join('');
  $('sMe').value = state.me || 'a';
  $('catEdit').innerHTML = state.categories.map(c => `<span class="chip">${esc(c)}<a class="x" data-delcat="${esc(c)}">×</a></span>`).join('');
  renderStorage();
}

function renderStorage() {
  const last = state.updatedAt ? new Date(state.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  $('storageStatus').innerHTML = `${saveOk ? '✓ Enregistré sur ce téléphone' : '⚠ Dernier enregistrement échoué'}${syncOn() ? ' et dans votre dépôt GitHub privé' : ''}.<br>${state.expenses.length} dépense(s) · dernière modif. ${last}${ANDROID && ANDROID.version ? ` · appli ${ANDROID.version()}` : ''}`;
  const li = state.lastImport, ub = $('undoImport');
  const n = li ? state.expenses.filter(e => e.bat === li.id).length : 0;
  ub.style.display = n ? '' : 'none';
  ub.textContent = n ? `Annuler le dernier import (${n} dépense${n > 1 ? 's' : ''})` : '';
}

function renderWelcome() {
  $('wMeA').textContent = $('wNameA').value.trim() || 'Prénom 1';
  $('wMeB').textContent = $('wNameB').value.trim() || 'Prénom 2';
}

function render() {
  renderSyncDot();
  if (!state.me) { renderWelcome(); if (currentTab !== 'welcome') showTab('welcome'); return; }
  if (currentTab === 'welcome') showTab('dash');
  renderDash(); renderAdd(); renderHist(); renderReglages();
}

/* ---------- Événements ---------- */
$('nav').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) { showTab(b.dataset.tab); render(); } });
$('gear').onclick = () => { if (state.me) { showTab('reglages'); render(); } };
['wNameA', 'wNameB'].forEach(id => $(id).addEventListener('input', renderWelcome));
$('wCodeBtn').onclick = () => {
  try {
    if (!useInvite($('wCode').value)) return toast('Code non reconnu');
    saveCfg('people'); render(); showTab('dash'); toast(`Bienvenue ${whoName(state.me)} : synchronisation…`); syncNow();
  } catch (e) { toast('Code non reconnu'); }
};

document.addEventListener('submit', e => {
  if (e.target.id === 'myPay') {
    e.preventDefault();
    const v = parseNum($('myPayIn').value);
    if (v <= 0) return toast('Montant invalide');
    const k = curMonth(); state.salaries[k] = { ...(state.salaries[k] || {}), [state.me]: v };
    save(); render(); toast('Fiche de paie enregistrée');
  }
});

document.addEventListener('click', e => {
  const t = e.target.closest('button, a');
  if (!t) return;
  const d = t.dataset, cur = curMonth();
  if (d.setme) {
    const nA = $('wNameA').value.trim(), nB = $('wNameB').value.trim();
    if (!nA || !nB) return toast('Indiquez vos deux prénoms');
    state.people = [{ name: nA }, { name: nB }]; state.me = d.setme; selectedWho = d.setme;
    saveCfg('people'); showTab('dash'); render();
  } else if (d.go) {
    goTo(d.go); render();
  } else if (d.done) {
    const amt = Math.max(0, +d.done || 0);
    state.done[cur] = { ...(state.done[cur] || {}), project: amt };
    state.project.saved += amt;
    saveCfg('done', 'project'); render(); toast(`${fmt0(amt)} de plus pour la maison`);
  } else if (d.undone) {
    const amt = (state.done[cur] || {}).project || 0;
    state.project.saved = Math.max(0, state.project.saved - amt);
    delete state.done[cur];
    saveCfg('done', 'project'); render();
  } else if (d.del) {
    if (!confirm('Supprimer cette dépense ?')) return;
    markDeleted([d.del]); state.expenses = state.expenses.filter(x => x.id !== d.del);
    save(); render();
  } else if (d.delcharge) {
    const f = state.fixed.find(x => x.id === d.delcharge);
    if (!f || !confirm(`Supprimer la charge « ${f.label} » ?`)) return;
    markDeleted([f.id]); state.fixed = state.fixed.filter(x => x.id !== f.id);
    save(); render();
  } else if (d.editcharge) {
    const f = state.fixed.find(x => x.id === d.editcharge); if (!f) return;
    const v = prompt(`Nouveau montant pour « ${f.label} » (€)`, String(f.amount).replace('.', ','));
    if (v === null) return;
    const n = parseNum(v); if (n <= 0) return toast('Montant invalide');
    f.amount = n; f.upd = Date.now(); save(); render(); toast('Charge mise à jour');
  } else if (d.preset) {
    const p = presetOf(d.preset); $('cLabel').value = p.label; $('cPeriod').value = p.label === 'Eau' ? '3' : p.label === 'Impôts' ? '1' : '1';
    $('cAmount').focus();
  } else if (d.delcat) {
    if (state.categories.length <= 1) return toast('Il faut au moins une catégorie');
    state.categories = state.categories.filter(c => c !== d.delcat);
    if (selectedCat === d.delcat) selectedCat = state.categories[0];
    saveCfg('categories'); render();
  } else if (d.cat) {
    selectedCat = d.cat; renderAdd();
  } else if (d.who) {
    selectedWho = d.who; renderAdd();
  } else if (d.hf) {
    histFilter = d.hf; renderHist();
  }
});

// Ajouter
$('date').value = todayISO();
$('date').addEventListener('change', renderAdd);
$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseNum($('amount').value);
  if (amount <= 0) { toast('Indiquez un montant'); $('amount').focus(); return; }
  state.expenses.push({ id: uid(), date: $('date').value || todayISO(), amount, cat: selectedCat, note: $('note').value.trim(), who: selectedWho });
  save(); $('amount').value = ''; $('note').value = ''; render();
  toast(`${fmt(amount)} · ${selectedCat} · ${whoName(selectedWho)}`);
});

// Historique
$('hPrev').onclick = () => { histMonth = shiftMonth(histMonth, -1); renderHist(); };
$('hNext').onclick = () => { if (histMonth < curMonth()) { histMonth = shiftMonth(histMonth, 1); renderHist(); } };
$('paySet').addEventListener('submit', e => {
  e.preventDefault();
  const entry = {};
  document.querySelectorAll('#paySet [data-pay]').forEach(i => { const v = parseNum(i.value); if (v > 0) entry[i.dataset.pay] = v; });
  if (Object.keys(entry).length) state.salaries[histMonth] = entry; else delete state.salaries[histMonth];
  document.activeElement && document.activeElement.blur();
  save(); render(); toast(`Fiches de paie de ${monthShort(histMonth)} enregistrées`);
});

// Réglages
$('syTest').onclick = async () => {
  const repo = $('syRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''), token = $('syToken').value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return toast('Indiquez le dépôt et la clé');
  $('syTest').disabled = true; $('syTest').textContent = 'Vérification…';
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (r.status === 401) throw new Error('Clé refusée par GitHub');
    if (r.status === 404) throw new Error('Dépôt introuvable avec cette clé');
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const j = await r.json();
    if (!j.private) throw new Error('Ce dépôt est public : vos données seraient visibles. Rendez-le privé.');
    sync = { repo, token }; saveSync();
    await syncNow();
    if (sync.err) throw new Error(sync.err);
    toast('Synchro activée'); render();
  } catch (err) {
    toast(err.message);
  } finally { $('syTest').disabled = false; $('syTest').textContent = 'Tester et activer'; }
};
$('syNow').onclick = async () => { await syncNow(); toast(sync.err ? '⚠ ' + sync.err : 'Synchronisé'); };
$('syOff').onclick = () => { if (!confirm('Désactiver la synchro sur ce téléphone ? Vos données restent sur le téléphone.')) return; sync = {}; saveSync(); render(); };
$('syInvite').onclick = async () => {
  const code = inviteCode(), name = whoName(other());
  const text = `${name}, voici le code pour Auplio Investment. Ouvre l'appli, colle ce code dans « On vous a envoyé un code ? » :\n\n${code}`;
  if (ANDROID && ANDROID.shareText) { ANDROID.shareText(text); return; }
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Code copié : collez-le dans un message'); } catch (err) { prompt('Copiez ce code et envoyez-le :', code); }
};

$('houseForm').addEventListener('submit', e => {
  e.preventDefault();
  state.project = {
    ...state.project,
    price: Math.max(0, parseNum($('pPrice').value)),
    type: $('pType').value === 'neuf' ? 'neuf' : 'ancien',
    saved: Math.max(0, parseNum($('pSaved').value)),
    works: Math.max(0, parseNum($('pWorks').value)),
    apportPct: clamp(parseNum($('pApportPct').value), 0, 100),
    share: clamp(parseNum($('pShare').value) || 80, 10, 100),
    rate: clamp(parseNum($('pRate').value), 0, 15),
    years: clamp(Math.round(parseNum($('pYears').value)) || 25, 5, 30),
    ins: clamp(parseNum($('pIns').value), 0, 3),
  };
  document.activeElement && document.activeElement.blur();
  saveCfg('project'); render(); toast('Maison enregistrée'); showTab('dash');
});

$('chargeForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseNum($('cAmount').value), label = $('cLabel').value.trim();
  if (amount <= 0 || !label) return toast('Nom et montant');
  const g = guessCharge(label);
  state.fixed.push({ id: uid(), label, amount, period: +$('cPeriod').value || 1, cat: g.cat, kind: g.kind, who: $('cWho').value, upd: Date.now() });
  save(); $('cLabel').value = ''; $('cAmount').value = ''; $('cPeriod').value = '1'; render(); toast(`${label} ajouté`);
});

$('foyerForm').addEventListener('submit', e => {
  e.preventDefault();
  state.people = [{ name: $('sNameA').value.trim() || state.people[0].name }, { name: $('sNameB').value.trim() || state.people[1].name }];
  state.me = $('sMe').value === 'b' ? 'b' : 'a';
  saveCfg('people'); render(); toast('Enregistré');
});

$('catForm').addEventListener('submit', e => {
  e.preventDefault();
  const n = $('catName').value.trim();
  if (n && !state.categories.includes(n)) { state.categories.push(n); saveCfg('categories'); render(); }
  $('catName').value = '';
});

function download(name, content, type) {
  if (ANDROID) { const ok = ANDROID.save(name, content, type); toast(ok ? 'Enregistré dans Téléchargements › Auplio Investment' : '⚠ Enregistrement impossible'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('exportBtn').onclick = () => download(`auplio-investment-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
$('exportCsvBtn').onclick = () => {
  const q = s => `"${String(s || '').replace(/"/g, '""')}"`;
  const lines = ['date;categorie;montant;qui;note', ...[...state.expenses].sort((a, b) => a.date.localeCompare(b.date))
    .map(e => [e.date, q(e.cat), String(e.amount).replace('.', ','), q(whoName(e.who)), q(e.note)].join(';'))];
  download(`depenses-${todayISO()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
};
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!valid(d)) throw new Error();
    if (!confirm('Remplacer les données de ce téléphone par cette sauvegarde ?')) return;
    const me = state.me; state = migrate(d); state.me = me || state.me;
    save(); render(); toast('Sauvegarde restaurée');
  } catch (err) { toast('Fichier invalide'); }
});

/* ---------- Import de relevé bancaire (CSV) ---------- */
let imp = null;
$('csvFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const p = parseStatement(decodeBytes(await f.arrayBuffer()));
    if (p.error || !p.rows.length) return toast(p.error || 'Aucune opération trouvée');
    const existing = new Set(state.expenses.map(x => x.imp).filter(Boolean));
    const rows = classify(p.rows, { categories: state.categories, rules: state.rules, fixed: state.fixed.map(x => ({ ...x, amount: x.amount })), existing })
      .map(r => r.amount > 0 ? { ...r, on: false, reason: r.reason || 'Rentrée d\'argent' } : r)
      .sort((a, b) => b.date.localeCompare(a.date));
    imp = { rows, file: f.name };
    $('impWho').innerHTML = WHO.map(w => `<option value="${w}">${esc(whoName(w))}</option>`).join('');
    $('impWho').value = state.me || 'a';
    renderImport(); showTab('import');
  } catch (err) { toast('Fichier illisible'); }
});
function renderImport() {
  const rows = imp.rows, on = rows.filter(r => r.on && r.amount < 0);
  const dates = rows.map(r => r.date).sort();
  $('impSummary').innerHTML = `<b>${rows.length}</b> opérations du ${dates[0]} au ${dates[dates.length - 1]} · <b>${on.length}</b> dépenses cochées (${fmt(sum(on.map(r => -r.amount)))}).`;
  const opts = state.categories.map(c => `<option>${esc(c)}</option>`).join('');
  $('impList').innerHTML = rows.map((r, i) => `<li class="${r.on && r.amount < 0 ? '' : 'off'}">
    <input type="checkbox" data-ii="${i}"${r.on && r.amount < 0 ? ' checked' : ''}${r.amount > 0 ? ' disabled' : ''} aria-label="Importer">
    <div class="l"><b>${esc(r.label)}</b><small>${r.date}${r.reason ? ' · ' + esc(r.reason) : ''}</small></div>
    <div class="r2"><span class="${r.amount > 0 ? 'pos' : ''}">${r.amount > 0 ? '+' : ''}${fmt(Math.abs(r.amount))}</span>
    ${r.amount < 0 ? `<select data-ic="${i}">${opts.replace(`<option>${esc(r.cat)}</option>`, `<option selected>${esc(r.cat)}</option>`)}</select>` : ''}</div></li>`).join('');
  $('impGo').textContent = on.length ? `Importer ${on.length} dépense${on.length > 1 ? 's' : ''}` : 'Rien à importer';
  $('impGo').disabled = !on.length;
}
$('impList').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.ii !== undefined) { imp.rows[+t.dataset.ii].on = t.checked; renderImport(); }
  else if (t.dataset.ic !== undefined) {
    const r = imp.rows[+t.dataset.ic]; r.cat = t.value; r.manual = true;
    imp.rows.forEach(x => { if (x !== r && !x.manual && x.key === r.key) x.cat = t.value; });
    renderImport();
  }
});
$('impCancel').onclick = () => { imp = null; showTab('reglages'); };
$('impGo').onclick = () => {
  if (!imp) return;
  const who = $('impWho').value, bat = uid();
  let n = 0;
  for (const r of imp.rows.filter(x => x.on && x.amount < 0)) {
    state.expenses.push({ id: uid(), date: r.date, amount: -r.amount, cat: r.cat, note: r.label.slice(0, 60), who, imp: r.imp, bat, src: 'csv' });
    if (r.cat !== r.auto || r.manual) state.rules[r.key] = r.cat;
    n++;
  }
  state.lastImport = { id: bat, at: Date.now() };
  imp = null; save(); showTab('hist'); render(); toast(`${n} dépense${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}`);
};
$('undoImport').onclick = () => {
  const li = state.lastImport; if (!li || !confirm('Retirer toutes les dépenses du dernier import ?')) return;
  const ids = state.expenses.filter(x => x.bat === li.id).map(x => x.id);
  markDeleted(ids); state.expenses = state.expenses.filter(x => x.bat !== li.id); state.lastImport = null;
  save(); render(); toast(`${ids.length} dépenses retirées`);
};

/* ---------- Démarrage ---------- */
load().then(({ data, migrated }) => {
  state = data;
  selectedCat = state.categories[0];
  // Lien d'invitation : …/#AUPLIO1:… (pratique sur Android)
  if (!state.me && location.hash.includes('AUPLIO1:')) { try { if (useInvite(decodeURIComponent(location.hash))) saveCfg('people'); } catch (e) { /* code invalide */ } history.replaceState(null, '', location.pathname); }
  showTab(state.me ? 'dash' : 'welcome');
  render();
  if (!state.updatedAt || migrated) save({ noSync: true });
  if (!ANDROID && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  syncNow();
});
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncNow();
  else if (state.updatedAt) save({ noSync: true });
});
if (!ANDROID && 'serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
