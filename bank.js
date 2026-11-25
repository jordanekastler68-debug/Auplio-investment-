'use strict';
/* Import de relevés bancaires CSV — fonctions pures, sans DOM.
   Reconnaît automatiquement les exports des banques françaises (Crédit Agricole, BNP, Société Générale,
   LCL, Banque Populaire, Caisse d'Épargne, Crédit Mutuel, La Banque Postale, Boursorama, Fortuneo…)
   et des néobanques (N26, Revolut) : séparateur, encodage, lignes d'en-tête, colonnes, formats de date et de montant. */

const deaccent = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normHead = s => deaccent(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cleanTxt = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const upper = s => deaccent(s).toUpperCase();

// UTF-8 si valide, sinon Windows-1252 (format historique de beaucoup de banques).
function decodeBytes(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}

function detectDelim(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 60);
  let best = ';', bestScore = -1;
  for (const d of [';', '\t', ',']) {
    const score = lines.filter(l => l.split(d).length >= 3).length;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

// CSV avec champs entre guillemets (y compris retours à la ligne dans un libellé).
function parseCSV(text, d) {
  const rows = []; let row = [], f = '', q = false, started = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"' && !started) { q = true; started = true; }
    else if (c === d) { row.push(f); f = ''; started = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = ''; started = false;
    } else { f += c; if (c.trim()) started = true; }
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x));
}

const isoDate = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100)
  ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
function parseDate(s) {
  s = String(s ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?!\d)/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return isoDate(y, +m[2], +m[1]); }
  return null;
}

// « -1 234,56 », « 1.234,56 », « 1,234.56 », « 12,50- », « (12,50) », « +45 € »…
function parseAmount(s) {
  let t = String(s ?? '').replace(/[\s  €]|EUR/gi, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\d-$/.test(t)) { neg = true; t = t.slice(0, -1); }
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lc >= 0) t = t.replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return neg ? -Math.abs(n) : n;
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i].map(normHead);
    if (h.some(x => /date/.test(x)) && h.some(x => /(montant|debit|credit|amount|somme)/.test(x))) return i;
  }
  return -1;
}
function pickCol(h, tests, used = []) {
  for (const t of tests) { const i = h.findIndex((x, j) => !used.includes(j) && t.test(x)); if (i >= 0) return i; }
  return -1;
}
function mapColumns(h) {
  const date = pickCol(h, [/^date ?op/, /date.*operation/, /^date$/, /completed date/, /date.*comptab/, /^(?!.*valeur).*date/, /date/]);
  const debit = pickCol(h, [/debit/], [date]);
  const credit = pickCol(h, [/credit/], [date, debit]);
  const amount = pickCol(h, [/^montant( de l operation| operation| eur| euros| en euros)?$/, /^amount/, /montant(?!.*devise)/, /somme/], [date, debit, credit]);
  const label = pickCol(h, [/libelle simplifie/, /^libelle/, /libelle/, /^label$/, /description/, /intitule/, /payee|beneficiaire|merchant|marchand|tiers/, /^detail/, /nature/, /motif/, /^operation$/], [date, debit, credit, amount]);
  const detail = pickCol(h, [/libelle operation/, /detail/, /informations? complementaires?/, /payment reference|reference/], [date, debit, credit, amount, label]);
  return { date, debit, credit, amount, label, detail };
}
// Fichier sans ligne d'en-tête (ex. LCL) : on devine les colonnes d'après leur contenu.
function inferColumns(rows) {
  const sample = rows.slice(0, 60); if (!sample.length) return null;
  const n = Math.max(...sample.map(r => r.length));
  const count = (j, fn) => sample.filter(r => r[j] != null && r[j] !== '' && fn(r[j])).length;
  let date = -1, amount = -1, label = -1, bd = 0, ba = 0, bl = 0;
  for (let j = 0; j < n; j++) { const s = count(j, x => !!parseDate(x)); if (s > bd) { bd = s; date = j; } }
  for (let j = 0; j < n; j++) {
    if (j === date) continue;
    const s = count(j, x => parseAmount(x) !== null) + 0.5 * count(j, x => /[.,]\d{1,2}-?$/.test(x));
    if (s > ba) { ba = s; amount = j; }
  }
  for (let j = 0; j < n; j++) {
    if (j === date || j === amount) continue;
    const alpha = count(j, x => /[a-z]{3}/i.test(x));
    const avg = sample.reduce((a, r) => a + (r[j] || '').length, 0) / sample.length;
    if (alpha >= sample.length * 0.5 && avg > bl) { bl = avg; label = j; }
  }
  if (bd < sample.length * 0.5 || ba < sample.length * 0.5) return null;
  return { date, amount, label, debit: -1, credit: -1, detail: -1, start: 0 };
}

// Libellé lisible : retire « PAIEMENT PAR CARTE », « CB*1234 », dates, etc. pour montrer le commerçant.
const PREFIX_RE = /^(PAIEMENT PAR CARTE|PAIEMENT CB|PAIEMENT CARTE|PAIEMENT|ACHAT CB|ACHAT|FACTURE CARTE|CARTE|CB|PRLV SEPA|PRELEVEMENT SEPA|PRELEVEMENT|PRELEV|VIREMENT SEPA EMIS|VIREMENT EMIS|VIREMENT|VIR SEPA|VIR INST|VIR|EMIS|VERS|X\d{3,}|\d{2}\/\d{2}(\/\d{2,4})?|DU \d{2}\/\d{2}(\/\d{2,4})?)\b[\s:*-]*/i;
function prettyLabel(label) {
  let t = cleanTxt(label), prev;
  do { prev = t; t = t.replace(PREFIX_RE, '').trim(); } while (t && t !== prev);
  t = t.replace(/\s*\bCB\*?\d+\b/gi, '').replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?\s*$/, '').trim();
  return t.length >= 2 ? t : cleanTxt(label);
}

function parseStatement(text) {
  const delim = detectDelim(text);
  const rows = parseCSV(text, delim);
  const hi = findHeader(rows);
  let cols;
  if (hi >= 0) { cols = mapColumns(rows[hi].map(normHead)); cols.start = hi + 1; }
  else cols = inferColumns(rows);
  if (!cols || cols.date < 0 || (cols.amount < 0 && cols.debit < 0 && cols.credit < 0)) {
    return { error: 'Colonnes « date » et « montant » introuvables dans ce fichier.', rows: [] };
  }
  const out = [];
  for (const r of rows.slice(cols.start)) {
    const date = parseDate(r[cols.date]); if (!date) continue;
    let amt = null;
    if (cols.amount >= 0) amt = parseAmount(r[cols.amount]);
    if (amt === null && (cols.debit >= 0 || cols.credit >= 0)) {
      const db = cols.debit >= 0 ? parseAmount(r[cols.debit]) : null, cr = cols.credit >= 0 ? parseAmount(r[cols.credit]) : null;
      if (db !== null || cr !== null) amt = Math.abs(cr || 0) - Math.abs(db || 0);
    }
    if (amt === null || !isFinite(amt) || Math.abs(amt) < 0.005) continue;
    const label = cleanTxt(cols.label >= 0 ? r[cols.label] : ''), detail = cleanTxt(cols.detail >= 0 ? r[cols.detail] : '');
    out.push({ date, amount: Math.round(amt * 100) / 100, label: prettyLabel(label || detail) || '(sans libellé)', raw: cleanTxt(label + ' ' + (detail !== label ? detail : '')) });
  }
  return { rows: out, delim, header: hi };
}

/* ---------- Catégorisation ---------- */
const KEYWORDS = [
  ['Carburant', ['CARBU', 'CARBURANT', 'CARBURANTS', 'STATION', 'STATIONS', 'ESSENCE', 'GAZOLE', 'TOTAL', 'TOTALENERGIES', 'ESSO', 'BP', 'SHELL', 'AVIA', 'AGIP', 'DYNEFF', 'ELAN', 'ENI', 'PEAGE', 'APRR', 'SANEF', 'VINCI AUTOROUTES', 'ASF']],
  ['Abonnements', ['NETFLIX', 'SPOTIFY', 'DEEZER', 'DISNEY', 'DISNEYPLUS', 'PRIME VIDEO', 'AMAZON PRIME', 'CANAL', 'FREE MOBILE', 'FREEBOX', 'FREE TELECOM', 'ORANGE', 'SOSH', 'SFR', 'RED BY SFR', 'BOUYGUES', 'B AND YOU', 'APPLE COM', 'ITUNES', 'ICLOUD', 'GOOGLE', 'YOUTUBE', 'OPENAI', 'CHATGPT', 'ANTHROPIC', 'CLAUDE AI', 'BASIC FIT', 'BASICFIT', 'FITNESS PARK', 'KEEP COOL', 'ADOBE', 'MICROSOFT', 'DAZN', 'BEIN', 'AUDIBLE', 'MOLOTOV']],
  ['Restaurant', ['RESTAU', 'RESTAURANT', 'MCDO', 'MC DO', 'MCDONALD', 'MCDONALDS', 'MC DONALD', 'MC DONALDS', 'BURGER', 'BURGER KING', 'KFC', 'QUICK', 'UBER EATS', 'UBEREATS', 'DELIVEROO', 'JUST EAT', 'PIZZA', 'PIZZERIA', 'SUSHI', 'KEBAB', 'TACOS', 'BRASSERIE', 'BISTRO', 'BISTROT', 'CAFE', 'BAR', 'STARBUCKS', 'BOULANGERIE', 'BRIOCHE DOREE', 'TRAITEUR', 'CREPERIE', 'FIVE GUYS', 'O TACOS', 'COURTEPAILLE', 'BUFFALO GRILL', 'HIPPOPOTAMUS', 'DEL ARTE', 'LA CROISSANTERIE', 'SUBWAY', 'DOMINOS']],
  ['Courses', ['CARREFOUR', 'CARREFOUR MARKET', 'LECLERC', 'E LECLERC', 'AUCHAN', 'INTERMARCHE', 'INTERMARCH', 'LIDL', 'ALDI', 'CASINO', 'GEANT', 'MONOPRIX', 'SUPER U', 'HYPER U', 'U EXPRESS', 'SUPERU', 'HYPERU', 'SYSTEME U', 'FRANPRIX', 'NETTO', 'GRAND FRAIS', 'BIOCOOP', 'SPAR', 'CORA', 'MATCH', 'LEADER PRICE', 'PICARD', 'NATURALIA', 'BOUCHERIE', 'PRIMEUR', 'PROXI', 'VIVAL', 'COCCINELLE', 'G20', 'SIMPLY', 'MARCHE', 'LA VIE CLAIRE', 'ECOMARCHE', 'COLRUYT', 'SUPERMARCHE', 'HYPERMARCHE']],
  ['Santé', ['PHARMACIE', 'PHARMA', 'MEDECIN', 'DOCTEUR', 'DOCTOLIB', 'DENTISTE', 'DENTAIRE', 'OPTIC', 'OPTIQUE', 'OPTICIEN', 'LABO', 'LABORATOIRE', 'KINE', 'KINESITHERAPEUTE', 'OSTEO', 'OSTEOPATHE', 'HOPITAL', 'CLINIQUE', 'CENTRE HOSPITALIER', 'MUTUELLE', 'RADIOLOGIE']],
  ['Logement', ['EDF', 'ENGIE', 'VEOLIA', 'SUEZ', 'SAUR', 'ELECTRICITE', 'LOYER', 'FONCIA', 'NEXITY', 'CITYA', 'ASSURANCE HABITATION', 'LEROY MERLIN', 'CASTORAMA', 'BRICO', 'BRICOMARCHE', 'BRICO DEPOT', 'MR BRICOLAGE', 'IKEA', 'CONFORAMA', 'MAISONS DU MONDE', 'GAZ DE BORDEAUX', 'ENERCOOP', 'EKWATEUR', 'OHM ENERGIE', 'MINT ENERGIE']],
  ['Shopping', ['AMAZON', 'AMZN', 'ZALANDO', 'DECATHLON', 'FNAC', 'DARTY', 'BOULANGER', 'ACTION', 'KIABI', 'SHEIN', 'H M', 'HM', 'ZARA', 'PRIMARK', 'CDISCOUNT', 'VINTED', 'LEBONCOIN', 'SEPHORA', 'NOCIBE', 'GIFI', 'LA HALLE', 'CELIO', 'JULES', 'TEMU', 'ALIEXPRESS', 'INTERSPORT', 'GO SPORT', 'SPORT 2000', 'NIKE', 'ADIDAS', 'UNIQLO', 'BERSHKA', 'PULL AND BEAR', 'CULTURA', 'NORAUTO', 'FEU VERT', 'MIDAS', 'SPEEDY']],
  ['Loisirs', ['CINEMA', 'PATHE', 'GAUMONT', 'CGR', 'KINEPOLIS', 'MEGARAMA', 'STEAM', 'PLAYSTATION', 'NINTENDO', 'XBOX', 'TICKETMASTER', 'FNAC SPECTACLES', 'BILLETTERIE', 'MUSEE', 'BOWLING', 'AIRBNB', 'BOOKING', 'SNCF', 'SNCF CONNECT', 'OUIGO', 'RYANAIR', 'EASYJET', 'TRANSAVIA', 'AIR FRANCE', 'HOTEL', 'CAMPING', 'BLABLACAR', 'PARC', 'PISCINE', 'SKI']],
].map(([cat, words]) => [cat, new RegExp('\\b(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b')]);

const SAVINGS_RE = /\b(LIVRET|LIVRET A|LDDS?|LEP|PEL|CEL|EPARGNE|PEA|ETORO|E TORO|ASSURANCE VIE|TRADE REPUBLIC|BOURSE DIRECT|DEGIRO|BITSTACK|COINBASE|BINANCE|KRAKEN|YOMONI|NALO|LINXEA|PLACEMENT)\b/;
const INTERNAL_RE = /\b(VIR(EMENT)?S? (INTERNE|DE COMPTE A COMPTE|ENTRE COMPTES|EMIS VERS (MON|NOTRE) COMPTE))\b/;
const SALARY_RE = /\b(SALAIRE|SALAIRES|PAIE|PAYE|REMUNERATION|POLE EMPLOI|FRANCE TRAVAIL|CAF|PRIME D ACTIVITE)\b/;
const DEBIT_ORDER_RE = /\b(PRLV|PRELEVEMENT|PRELEV|ECHEANCE|ECH|LOYER|SEPA|PRET)\b/;
const NOISE = new Set(['PAIEMENT', 'PAIEMT', 'PAIE', 'CARTE', 'CB', 'PAR', 'PRLV', 'PRELEVEMENT', 'PRELEV', 'SEPA', 'VIR', 'VIREMENT', 'ACHAT', 'FACTURE', 'FACT', 'DU', 'LE', 'LA', 'LES', 'DE', 'DES', 'EUR', 'FR', 'FRA', 'FRANCE', 'COMMERCE', 'ELECTRONIQUE', 'INST', 'INSTANTANE', 'EMIS', 'RECU', 'SAS', 'SARL', 'SA', 'WWW', 'COM', 'PAYPAL', 'SUMUP', 'ZETTLE', 'MANDAT', 'REF', 'EN', 'VOTRE', 'FAVEUR', 'VERS', 'POUR', 'AU', 'AUX']);

const normFull = raw => upper(raw).replace(/[^A-Z0-9]+/g, ' ').trim();
// Clé « commerçant » stable d'une opération à l'autre (sert aux règles apprises).
function merchantKey(raw) {
  const words = upper(raw).replace(/\bX\d+\b/g, ' ').replace(/[^A-Z ]+/g, ' ').split(' ').filter(w => w.length > 1 && !NOISE.has(w));
  return words.slice(0, 2).join(' ') || normFull(raw).slice(0, 20);
}
function guessCategory(U, key, categories, rules) {
  if (rules[key] && categories.includes(rules[key])) return rules[key];
  for (const [cat, re] of KEYWORDS) if (re.test(U) && categories.includes(cat)) return cat;
  return categories.includes('Divers') ? 'Divers' : categories[categories.length - 1];
}
const overlap = (U, label) => upper(label).split(/[^A-Z0-9]+/).filter(w => w.length >= 4).some(w => U.includes(w));

// Prépare chaque ligne : catégorie proposée, cochée ou non, et pourquoi.
function classify(rows, { categories, rules, fixed, existing }) {
  const occ = {};
  return rows.map(r => {
    const U = ' ' + normFull(r.raw) + ' ';
    const key = merchantKey(r.raw);
    const base = `${r.date}|${r.amount.toFixed(2)}|${normFull(r.raw)}`;
    occ[base] = (occ[base] || 0) + 1;
    const imp = `${base}#${occ[base]}`;
    const auto = guessCategory(U, key, categories, rules);
    let on = true, reason = '';
    if (existing.has(imp)) { on = false; reason = 'Déjà importé'; }
    else if (r.amount > 0) { on = false; reason = SALARY_RE.test(U) ? 'Salaire, déjà compté' : 'Crédit (coche pour le compter en revenu)'; }
    else if (SAVINGS_RE.test(U)) { on = false; reason = 'Épargne / placement'; }
    else if (INTERNAL_RE.test(U)) { on = false; reason = 'Virement interne'; }
    else {
      const f = fixed.find(x => Math.abs(-r.amount - x.amount) <= Math.max(1, x.amount * 0.02) && (overlap(U, x.label) || DEBIT_ORDER_RE.test(U)));
      if (f) { on = false; reason = `Charge fixe déjà déclarée (${f.label})`; }
    }
    return { ...r, key, imp, auto, cat: auto, on, reason, manual: false };
  });
}

if (typeof module !== 'undefined') module.exports = { prettyLabel, decodeBytes, detectDelim, parseCSV, parseDate, parseAmount, parseStatement, merchantKey, classify, guessCategory };
