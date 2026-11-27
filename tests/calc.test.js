'use strict';
/* Tests des calculs de NestGoal (chiffres d'exemple uniquement). Lancer : node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg} : ${Math.round(actual)} au lieu d'environ ${expected}`);
const P = { rate: 3.8, years: 25, ins: 0.30 };

test('capacité d\'emprunt : 3 000 € de revenus, crédit en cours de 150 € → environ 166 000 €', () => {
  near(C.borrowable({ income: 3000, loansMonthly: 150, ...P }), 166000, 1000, 'avec le crédit');
});

test('capacité d\'emprunt : 3 000 € de revenus sans crédit en cours → environ 194 000 €', () => {
  near(C.borrowable({ income: 3000, loansMonthly: 0, ...P }), 194000, 1000, 'sans crédit');
});

test('mensualité maximale = 35 % des revenus moins les crédits en cours, jamais négative', () => {
  assert.equal(C.maxMonthly(3000, 150), 900);
  assert.equal(C.maxMonthly(1000, 500), 0);
});

test('durée plafonnée à 25 ans', () => {
  assert.equal(C.loanFactor(3.8, 30), C.loanFactor(3.8, 25));
});

test('frais de notaire : 7,5 % dans l\'ancien, 2,5 % dans le neuf', () => {
  assert.equal(C.notaryFees(200000, 'ancien'), 15000);
  assert.equal(C.notaryFees(200000, 'neuf'), 5000);
});

test('apport visé : frais de notaire seuls, ou frais + 10 % du prix', () => {
  assert.equal(C.apportTarget({ price: 200000, type: 'ancien', apportMode: 'notaire' }), 15000);
  assert.equal(C.apportTarget({ price: 200000, type: 'ancien', apportMode: 'notaire10' }), 35000);
});

const base = { start: '2027-01', price: 180000, type: 'ancien', apportMode: 'notaire', saved: 5000, monthlySaving: 1000, income: 3000, loans: [], ...P };

test('date d\'achat : premier mois où l\'apport visé est réuni', () => {
  // Apport visé 13 500 € ; 5 000 € déjà réunis + 1 000 €/mois → réuni après 9 mois.
  const r = C.purchasePlan(base);
  assert.ok(r.ok);
  assert.equal(r.month, '2027-10');
  assert.ok(r.need <= r.capacity);
});

test('date d\'achat : achat immédiat si tout est déjà réuni', () => {
  const r = C.purchasePlan({ ...base, saved: 20000 });
  assert.equal(r.months, 0);
});

test('un crédit qui se termine avant la date d\'achat n\'est plus compté', () => {
  // Avec un crédit de 400 €/mois jusqu'en décembre 2027, la capacité ne suffit qu'une fois le crédit terminé.
  const loans = [{ id: 'x', label: 'Voiture', monthly: 400, end: '2027-12' }];
  const p = { ...base, price: 185000, saved: 20000, loans };
  const withLoan = C.borrowable({ income: 3000, loansMonthly: 400, ...P });
  assert.ok(withLoan < 185000, 'capacité insuffisante tant que le crédit court');
  const r = C.purchasePlan(p);
  assert.ok(r.ok);
  assert.equal(r.month, '2028-01');
  assert.equal(r.loansCounted.length, 0);
});

test('un crédit encore en cours à la date d\'achat reste compté', () => {
  const loans = [{ id: 'x', label: 'Voiture', monthly: 150, end: '2030-06' }];
  const r = C.purchasePlan({ ...base, loans });
  assert.ok(r.ok);
  assert.equal(r.loansCounted.length, 1);
  assert.equal(Math.round(r.maxMonthly), 900);
});

test('l\'épargne libérée par un crédit terminé s\'ajoute à l\'épargne', () => {
  const loans = [{ id: 'x', label: 'Voiture', monthly: 500, end: '2027-01' }];
  // Sans épargne prévue, seule la mensualité libérée (500 €/mois à partir de février) remplit l'apport.
  const r = C.purchasePlan({ ...base, saved: 0, monthlySaving: 0, loans });
  assert.ok(r.ok);
  assert.equal(r.month, C.addMonths('2027-02', 27));   // 13 500 € / 500 € = 27 mois d'épargne
});

test('impossible : on le dit et on indique ce qui manque', () => {
  const r = C.purchasePlan({ ...base, monthlySaving: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-saving');
  assert.equal(r.missingApport, 8500);
  const big = C.purchasePlan({ ...base, price: 900000, income: 1500, monthlySaving: 50 });
  assert.equal(big.ok, false);
  assert.ok(big.missingLoan > 0);
  assert.ok(big.maxPrice > 0 && big.maxPrice < 900000);
});

test('scénarios « et si… ? »', () => {
  const loans = [{ id: 'x', label: 'Voiture', monthly: 300, end: '2032-01' }];
  const s = C.scenarios({ ...base, loans });
  const keys = s.list.map(x => x.key);
  assert.deepEqual(keys, ['save100', 'cheaper', 'loan:x']);
  s.list.forEach(x => assert.ok(x.plan.ok && x.gain >= 0, x.key));
  assert.ok(s.list[0].gain > 0, '100 € de plus par mois fait gagner du temps');
});

test('jauge du logo : nid, toit, deux oiseaux', () => {
  assert.equal(C.gaugeLevel(0), 1);
  assert.equal(C.gaugeLevel(0.32), 1);
  assert.equal(C.gaugeLevel(1 / 3), 2);
  assert.equal(C.gaugeLevel(0.99), 2);
  assert.equal(C.gaugeLevel(1), 3);
});

const sample = () => ({
  setupDone: '2027-01-10',
  people: [{ name: 'A', salary: 1800, payDay: 28 }, { name: 'B', salary: 1500, payDay: 1 }],
  house: { price: 200000, type: 'ancien', saved: 4000, savedAt: '2027-01', apportMode: 'notaire', rate: 3.8, years: 25, ins: 0.3, goal: null },
  fixed: [{ id: 'f1', label: 'Loyer', amount: 700, who: 'ab' }],
  loans: [{ id: 'l1', label: 'Voiture', who: 'a', monthly: 150, end: '2029-01' }],
  expenses: [
    { id: 'e1', date: '2027-02-03', amount: 400, cat: 'Courses', who: 'ab' },
    { id: 'e2', date: '2027-02-05', amount: 700, cat: 'Logement', who: 'ab', auto: 'f:f1:2027-02' },
    { id: 'e3', date: '2027-02-05', amount: 150, cat: 'Crédits', who: 'a', auto: 'l:l1:2027-02' },
  ],
  salaries: { '2027-02': { a: 1650, b: 1400 } },
});

test('budget du foyer : revenus avant impôt pour la banque, salaires reçus pour l\'épargne', () => {
  const h = C.household(sample(), '2027-03-15');
  assert.equal(h.income, 3300);
  assert.equal(h.received, 3050);
  assert.equal(h.fixedMonthly, 700);
  assert.equal(h.loansNow, 150);
  assert.equal(h.usual, 400);           // février seulement : le mois du démarrage (janvier) est incomplet
});

test('budget du foyer : « nous deux » est partagé moitié-moitié, épargne réunie', () => {
  const h = C.household(sample(), '2027-03-15');
  const feb = h.month('2027-02');
  assert.equal(feb.a.spent, 200 + 350 + 150);
  assert.equal(feb.b.spent, 200 + 350);
  assert.equal(feb.saved, 3050 - 1250);
  // 4 000 € indiqués en janvier + l'épargne de février.
  assert.equal(h.savedNow, 4000 + 1800);
});

test('charges fixes et crédits ajoutés automatiquement chaque mois, une seule fois', () => {
  const s = sample();
  s.expenses = [];
  s.fixed = [{ id: 'f1', label: 'Loyer', amount: 700, cat: 'Logement', who: 'ab', day: 5, from: '2027-01' }];
  s.loans = [{ id: 'l1', label: 'Voiture', who: 'a', monthly: 150, end: '2027-02', day: 31, from: '2027-01' }];
  const due = C.dueAutoEntries(s, '2027-03-04');
  // Loyer : janvier, février (mars pas encore : le 5) ; crédit : janvier et février (fin en février), jour 31 → fin du mois.
  assert.deepEqual(due.map(e => e.auto).sort(), ['f:f1:2027-01', 'f:f1:2027-02', 'l:l1:2027-01', 'l:l1:2027-02']);
  assert.equal(due.find(e => e.auto === 'l:l1:2027-02').date, '2027-02-28');
  // Déjà créées ou supprimées à la main : pas recréées.
  s.expenses = due.map((e, i) => ({ ...e, id: 'x' + i })).filter(e => e.auto !== 'f:f1:2027-01');
  s.skipAuto = { 'f:f1:2027-01': 1 };
  assert.deepEqual(C.dueAutoEntries(s, '2027-03-04'), []);
  assert.deepEqual(C.dueAutoEntries(s, '2027-03-05').map(e => e.auto), ['f:f1:2027-03']);
});
