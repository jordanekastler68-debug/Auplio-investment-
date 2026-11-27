'use strict';
/* NestGoal — calculs, sans affichage (testés dans tests/calc.test.js).
   Règles :
   - Mensualité maximale = 35 % des revenus nets avant impôt du couple, assurance comprise,
     moins les mensualités des crédits encore en cours à la date d'achat.
   - Frais de notaire : 7,5 % du prix dans l'ancien, 2,5 % dans le neuf.
   - Apport visé : frais de notaire seuls, ou frais de notaire + 10 % du prix.
   - Date d'achat : premier mois où l'épargne réunie atteint l'apport visé ET où le reste à financer
     (prix + frais de notaire − apport) ne dépasse pas le crédit possible. */
(function () {

const NOTAIRE = { ancien: 0.075, neuf: 0.025 };
const DEBT_MAX = 0.35;
const MAX_YEARS = 25;
const HORIZON = 360;   // on cherche une date d'achat sur 30 ans au plus

/* ---------- Mois ('AAAA-MM') ---------- */
function addMonths(k, n) {
  const [y, m] = k.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`;
}
const monthDiff = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + (bm - am); };
const daysInMonth = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };

/* ---------- Crédit immobilier ---------- */
// Mensualité (hors assurance) pour 1 € emprunté.
function loanFactor(rate, years) {
  const r = rate / 1200, n = Math.min(MAX_YEARS, years) * 12;
  return r > 0 ? r / (1 - Math.pow(1 + r, -n)) : 1 / n;
}
// Mensualité assurance comprise pour 1 € emprunté (assurance = ins % du capital par an).
const perEuro = (rate, years, ins) => loanFactor(rate, years) + ins / 1200;
const maxMonthly = (income, loansMonthly = 0) => Math.max(0, DEBT_MAX * income - loansMonthly);
function borrowable({ income, loansMonthly = 0, rate, years, ins }) {
  return maxMonthly(income, loansMonthly) / perEuro(rate, years, ins);
}
const notaryRate = type => NOTAIRE[type] ?? NOTAIRE.ancien;
const notaryFees = (price, type) => price * notaryRate(type);
// Part du prix à apporter en plus des frais de notaire.
const extraShare = apportMode => apportMode === 'notaire10' ? 0.10 : 0;
const apportTarget = ({ price, type, apportMode }) => notaryFees(price, type) + price * extraShare(apportMode);
// Crédits encore remboursés pendant le mois k (un crédit dont la dernière échéance est avant k n'est plus compté).
const runningLoans = (loans, k) => loans.filter(l => l.end >= k);

/* ---------- Date d'achat ----------
   p = { start, price, type, apportMode, saved, monthlySaving, income, loans, rate, years, ins }
   - saved : épargne déjà réunie au début du mois « start »
   - monthlySaving : épargne prévue par mois, crédits actuels déduits ; quand un crédit se termine,
     sa mensualité s'ajoute à l'épargne. */
function purchasePlan(p) {
  const loans = (p.loans || []).filter(l => l.monthly > 0 && l.end >= p.start);
  const fees = notaryFees(p.price, p.type), target = apportTarget(p), total = p.price + fees;
  const pe = perEuro(p.rate, p.years, p.ins);
  const base = { fees, target, total, perEuro: pe };
  if (!(p.price > 0)) return { ok: false, reason: 'no-price', ...base };
  let cumul = p.saved;
  for (let m = 0; m <= HORIZON; m++) {
    const k = addMonths(p.start, m);
    const counted = runningLoans(loans, k);
    const capacity = borrowable({ income: p.income, loansMonthly: sum(counted.map(l => l.monthly)), rate: p.rate, years: p.years, ins: p.ins });
    const need = Math.max(0, total - cumul);
    if (cumul >= target && need <= capacity + 0.5) {
      return { ok: true, month: k, months: m, apport: Math.min(cumul, total), need, capacity, monthly: need * pe,
        loansCounted: counted, maxMonthly: maxMonthly(p.income, sum(counted.map(l => l.monthly))), ...base };
    }
    // Épargne du mois k : l'épargne prévue + les mensualités des crédits terminés.
    const freed = sum(loans.filter(l => l.end < k).map(l => l.monthly));
    cumul += p.monthlySaving + freed;
  }
  // Pas possible dans les 30 ans : on dit ce qui manque, aujourd'hui.
  const countedNow = runningLoans(loans, p.start);
  const capacityNow = borrowable({ income: p.income, loansMonthly: sum(countedNow.map(l => l.monthly)), rate: p.rate, years: p.years, ins: p.ins });
  const needAtTarget = total - target;
  return { ok: false, reason: p.monthlySaving <= 0 ? 'no-saving' : 'too-far', ...base,
    capacity: capacityNow, needAtTarget,
    missingApport: Math.max(0, target - p.saved),
    missingLoan: Math.max(0, needAtTarget - capacityNow),
    // Prix maximal finançable avec l'apport visé et le crédit possible aujourd'hui.
    maxPrice: capacityNow / (1 - extraShare(p.apportMode)) };
}

// Les « et si… ? » : +100 €/mois, une maison 20 000 € moins chère, un crédit soldé.
function scenarios(p) {
  const ref = purchasePlan(p);
  const out = [
    { key: 'save100', label: 'On épargne 100 € de plus par mois', plan: purchasePlan({ ...p, monthlySaving: p.monthlySaving + 100 }) },
    { key: 'cheaper', label: 'On vise une maison 20 000 € moins chère', plan: purchasePlan({ ...p, price: Math.max(0, p.price - 20000) }) },
  ];
  for (const l of (p.loans || []).filter(x => x.monthly > 0 && x.end >= p.start)) {
    out.push({ key: 'loan:' + l.id, loan: l, label: `${l.label || 'Le crédit'} est soldé`,
      plan: purchasePlan({ ...p, loans: p.loans.filter(x => x !== l), monthlySaving: p.monthlySaving + l.monthly }) });
  }
  out.forEach(s => { s.gain = ref.ok && s.plan.ok ? ref.months - s.plan.months : null; });
  return { ref, list: out };
}

/* ---------- Le budget du foyer ----------
   À partir des données de l'appli : revenus, charges, dépenses habituelles, épargne réunie. */
const sum = arr => arr.reduce((a, b) => a + b, 0);
const share = (e, w) => e.who === w ? e.amount : e.who === 'ab' ? e.amount / 2 : 0;

function household(s, today) {
  const cur = today.slice(0, 7);
  const setupMonth = (s.setupDone || today).slice(0, 7);
  const monthExp = k => s.expenses.filter(e => e.date.slice(0, 7) === k);
  // Salaire reçu de référence : moyenne des 3 derniers salaires saisis, sinon le salaire avant impôt.
  const refReceived = w => {
    const vals = Object.keys(s.salaries).sort().reverse().map(k => s.salaries[k][w]).filter(v => v > 0).slice(0, 3);
    const i = w === 'b' ? 1 : 0;
    return vals.length ? { v: sum(vals) / vals.length, est: false } : { v: s.people[i].salary, est: true };
  };
  const salaryFor = (k, w) => { const v = (s.salaries[k] || {})[w]; return v > 0 ? { v, entered: true } : { v: refReceived(w).v, entered: false }; };
  const person = (k, w) => {
    const sal = salaryFor(k, w), spent = sum(monthExp(k).map(e => share(e, w)));
    return { salary: sal.v, entered: sal.entered, spent, saved: sal.v - spent };
  };
  const month = k => { const a = person(k, 'a'), b = person(k, 'b'); return { a, b, saved: a.saved + b.saved, spent: a.spent + b.spent }; };

  const income = sum(s.people.map(p => p.salary));                    // avant impôt : pour la banque
  const received = refReceived('a').v + refReceived('b').v;            // ce qui arrive sur les comptes
  const receivedEstimated = refReceived('a').est || refReceived('b').est;
  const fixedMonthly = sum(s.fixed.map(f => f.amount));
  const loansNow = sum(runningLoans(s.loans, cur).map(l => l.monthly));
  // Dépenses courantes habituelles (hors charges et crédits) : moyenne des 3 derniers mois complets.
  // Le mois du démarrage est incomplet : on ne le compte pas.
  const past = [1, 2, 3].map(i => addMonths(cur, -i)).filter(k => k > setupMonth);
  const variable = k => sum(monthExp(k).filter(e => !e.auto).map(e => e.amount));
  let usual, usualBasis;
  if (past.length) { usual = sum(past.map(variable)) / past.length; usualBasis = past.length === 1 ? 'le mois dernier' : `les ${past.length} derniers mois`; }
  else {
    const day = +today.slice(8, 10), dim = daysInMonth(cur);
    usual = day >= 10 ? variable(cur) / day * dim : 0;
    usualBasis = day >= 10 ? 'le début du mois' : null;
  }
  const computed = received - fixedMonthly - loansNow - usual;
  const goal = s.house.goal !== null && s.house.goal !== undefined ? s.house.goal : Math.max(0, Math.round(computed));
  // Épargne réunie : l'apport indiqué + l'épargne réelle de chaque mois terminé depuis.
  const from = s.house.savedAt || setupMonth;
  let savedNow = s.house.saved;
  for (let k = addMonths(from, 1); k < cur; k = addMonths(k, 1)) savedNow += month(k).saved;
  savedNow = Math.max(0, savedNow);

  return { cur, income, received, receivedEstimated, fixedMonthly, loansNow, usual, usualBasis, computed, goal,
    goalManual: s.house.goal !== null && s.house.goal !== undefined, savedNow, month, person, salaryFor };
}

// Paramètres de la date d'achat à partir des données de l'appli.
function planParams(s, today) {
  const h = household(s, today), house = s.house;
  return { start: h.cur, price: house.price, type: house.type, apportMode: house.apportMode, saved: h.savedNow,
    monthlySaving: h.goal, income: h.income, loans: s.loans, rate: house.rate, years: house.years, ins: house.ins };
}

// Jauge du logo : 1 = nid (moins d'un tiers de l'apport), 2 = toit (jusqu'à 100 %), 3 = deux oiseaux (apport réuni).
const gaugeLevel = ratio => ratio >= 1 ? 3 : ratio >= 1 / 3 ? 2 : 1;

const NGCalc = { NOTAIRE, DEBT_MAX, MAX_YEARS, addMonths, monthDiff, daysInMonth, loanFactor, perEuro, maxMonthly, borrowable,
  notaryRate, notaryFees, apportTarget, runningLoans, purchasePlan, scenarios, household, planParams, gaugeLevel, share };
if (typeof module !== 'undefined') module.exports = NGCalc; else window.NGCalc = NGCalc;
})();
