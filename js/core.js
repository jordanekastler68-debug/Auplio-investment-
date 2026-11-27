'use strict';
/* NestGoal — cœur de l'appli : outils, modèle de données, stockage sur le téléphone, thème.
   Toutes les données restent sur le téléphone (IndexedDB + copie dans localStorage). Aucun serveur. */

const KEY = 'nestgoal-v1';
const THEME_KEY = 'nestgoal-theme';
const ANDROID = window.NestGoalAndroid || null;
const WHO = ['a', 'b'];
// Catégories proposées au bouton + (modifiables dans les réglages).
const DEFAULT_CATS = ['Courses', 'Carburant', 'Restaurant', 'Loisirs', 'Shopping', 'Santé', 'Maison', 'Divers'];
// Catégories réservées aux charges fixes et aux crédits (ajoutées automatiquement chaque mois).
const CHARGE_CATS = ['Logement', 'Énergie & eau', 'Internet & téléphone', 'Assurances', 'Autres charges'];
const LOAN_CAT = 'Crédits';

/* ---------- Outils ---------- */
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmt = n => eur.format(Math.round((n || 0) * 100) / 100);
const fmt0 = n => eur0.format(Math.round(n || 0));
const parseNum = s => { const n = parseFloat(String(s ?? '').replace(/[\s  €%]/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const numStr = n => (n === null || n === undefined || n === '') ? '' : String(n).replace('.', ',');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = arr => arr.reduce((a, b) => a + b, 0);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const ym = d => String(d).slice(0, 7);
const curMonth = () => ym(todayISO());
const monthName = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
const monthShort = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' }); };
const dayLabel = d => new Date(d + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dateLabel = d => new Date(d + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/* ---------- Modèle ---------- */
const blankHouse = () => ({
  price: 0, type: 'ancien',
  saved: 0, savedAt: null,       // apport déjà épargné, et mois où il a été indiqué
  apportMode: 'notaire',         // 'notaire' (frais de notaire seuls) ou 'notaire10' (frais + 10 % du prix)
  rate: 3.8, rateAt: null,       // taux du crédit (%) et date de sa dernière mise à jour
  years: 25, ins: 0.30,          // durée (25 ans max) et assurance (% du capital par an)
  goal: null,                    // épargne prévue par mois (null = calculée par l'appli)
});
const blank = () => ({
  v: 1,
  setupDone: null,               // date de fin du démarrage
  people: [{ name: '', salary: 0, payDay: 1 }, { name: '', salary: 0, payDay: 1 }],  // salaire net AVANT impôt sur le revenu
  house: blankHouse(),
  fixed: [],                     // charges fixes : { id, label, amount, cat, who: 'a'|'b'|'ab', day, from: 'AAAA-MM' }
  loans: [],                     // crédits en cours : { id, label, who: 'a'|'b', monthly, end: 'AAAA-MM', day, from }
  expenses: [],                  // { id, date, amount, cat, who: 'a'|'b'|'ab', note, auto }
  salaries: {},                  // 'AAAA-MM' → { a, b } : salaire reçu sur le compte
  categories: [...DEFAULT_CATS],
  skipAuto: {},                  // lignes automatiques supprimées à la main (pour ne pas les recréer)
  theme: 'auto',                 // 'auto' | 'light' | 'dark'
  lastExport: 0,
  updatedAt: 0,
});
const valid = d => d && typeof d === 'object' && d.v === 1 && Array.isArray(d.expenses);

// Remet en forme des données lues (téléphone ou sauvegarde) : champs manquants, valeurs hors limites.
function normalize(d) {
  const b = blank();
  if (!valid(d)) return b;
  const num = (x, def = 0) => (x !== null && x !== '' && isFinite(+x) ? +x : def);
  const whoAB = w => (w === 'a' || w === 'b' || w === 'ab') ? w : 'a';
  const people = WHO.map((_, i) => {
    const p = (Array.isArray(d.people) && d.people[i]) || {};
    return { name: String(p.name || '').slice(0, 20), salary: Math.max(0, num(p.salary)), payDay: clamp(Math.round(num(p.payDay, 1)), 1, 31) };
  });
  const h = { ...blankHouse(), ...(d.house || {}) };
  h.price = Math.max(0, num(h.price)); h.saved = Math.max(0, num(h.saved));
  h.type = h.type === 'neuf' ? 'neuf' : 'ancien';
  h.apportMode = h.apportMode === 'notaire10' ? 'notaire10' : 'notaire';
  h.rate = clamp(num(h.rate, 3.8), 0, 15); h.years = clamp(Math.round(num(h.years, 25)), 5, 25); h.ins = clamp(num(h.ins, 0.3), 0, 3);
  h.goal = h.goal === null || h.goal === undefined || h.goal === '' ? null : Math.max(0, num(h.goal));
  return {
    ...b,
    setupDone: d.setupDone || null,
    people, house: h,
    fixed: (Array.isArray(d.fixed) ? d.fixed : []).filter(f => f && num(f.amount) > 0).map(f => ({
      id: f.id || uid(), label: String(f.label || 'Charge'), amount: num(f.amount), cat: f.cat || 'Autres charges',
      who: whoAB(f.who), day: clamp(Math.round(num(f.day, 5)), 1, 31), from: f.from || curMonth() })),
    loans: (Array.isArray(d.loans) ? d.loans : []).filter(l => l && num(l.monthly) > 0).map(l => ({
      id: l.id || uid(), label: String(l.label || 'Crédit'), who: l.who === 'b' ? 'b' : 'a', monthly: num(l.monthly),
      end: /^\d{4}-\d{2}$/.test(l.end) ? l.end : curMonth(), day: clamp(Math.round(num(l.day, 5)), 1, 31), from: l.from || curMonth() })),
    expenses: d.expenses.filter(e => e && e.date && num(e.amount) > 0).map(e => ({
      id: e.id || uid(), date: e.date, amount: num(e.amount), cat: e.cat || 'Divers', who: whoAB(e.who), note: e.note || '', ...(e.auto ? { auto: e.auto } : {}) })),
    salaries: Object.fromEntries(Object.entries(d.salaries || {}).filter(([k]) => /^\d{4}-\d{2}$/.test(k))
      .map(([k, v]) => [k, Object.fromEntries(WHO.filter(w => num((v || {})[w]) > 0).map(w => [w, num(v[w])]))])),
    categories: Array.isArray(d.categories) && d.categories.length ? d.categories.map(String) : [...DEFAULT_CATS],
    skipAuto: d.skipAuto && typeof d.skipAuto === 'object' ? d.skipAuto : {},
    theme: ['auto', 'light', 'dark'].includes(d.theme) ? d.theme : 'auto',
    lastExport: num(d.lastExport), updatedAt: num(d.updatedAt),
  };
}

/* ---------- Stockage sur le téléphone ---------- */
const DB_NAME = 'nestgoal', STORE = 'data';
function idb() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('indisponible'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet() { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get('state'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbPut(v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, 'state'); t.oncomplete = res; t.onerror = () => rej(t.error); }); }

let state = blank();
let saveOk = true;
async function load() {
  let a = null, b = null;
  try { a = await idbGet(); } catch (e) { /* indisponible */ }
  try { b = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* rien */ }
  const raw = [a, b].filter(valid).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0))[0];
  return normalize(raw);
}
async function save() {
  state.updatedAt = Date.now();
  const json = JSON.stringify(state);
  let ok = false;
  try { await idbPut(JSON.parse(json)); ok = true; } catch (e) { /* on garde la copie */ }
  try { localStorage.setItem(KEY, json); ok = true; } catch (e) { /* rien */ }
  saveOk = ok;
  if (!ok) toast('Enregistrement impossible sur ce téléphone');
}

/* ---------- Thème clair / sombre ---------- */
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const t = state.theme || 'auto';
  const dark = t === 'dark' || (t === 'auto' && darkQuery && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta && bg) meta.content = bg;
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* rien */ }
  if (ANDROID && ANDROID.setDark) { try { ANDROID.setDark(dark, bg); } catch (e) { /* ancienne version */ } }
}
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

/* ---------- Petits éléments d'interface ---------- */
function toast(text, action) {
  const el = $('toast');
  el.innerHTML = `<span>${esc(text)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.run(); };
  el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), action ? 4500 : 2400);
}
const logoSVG = (cls = '') => `<svg class="logo ${cls}" viewBox="0 0 128 128" aria-hidden="true"><use href="#logo"/></svg>`;

/* ---------- Le couple ---------- */
const whoName = w => w === 'ab' ? 'Nous deux' : (state.people[w === 'b' ? 1 : 0].name || (w === 'b' ? 'Personne 2' : 'Personne 1'));
const whoDot = w => `<span class="dot dot-${w}"></span>`;
const nextWho = (w, withBoth = true) => w === 'a' ? 'b' : (w === 'b' && withBoth ? 'ab' : 'a');

// Catégorie d'une charge fixe d'après son nom.
function chargeCat(label) {
  const t = String(label || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/loyer|logement|copro/.test(t)) return 'Logement';
  if (/electric|eau\b|gaz|energie|chauffage|fioul/.test(t)) return 'Énergie & eau';
  if (/internet|box|telephone|mobile|forfait/.test(t)) return 'Internet & téléphone';
  if (/assurance|mutuelle|prevoyance/.test(t)) return 'Assurances';
  return 'Autres charges';
}
