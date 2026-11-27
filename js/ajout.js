'use strict';
/* Ajout d'une dépense (bouton +) en 3 gestes : le montant, la catégorie, valider.
   « Pour » est réglé sur la première personne ; un toucher passe à la seconde, puis à « nous deux ». */

let addCat = null, addWho = 'a';

function renderSheet() {
  $('addCats').innerHTML = state.categories.map(c => `<button type="button" class="chip${c === addCat ? ' on' : ''}" data-add-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('addCats').classList.remove('need');
  $('addWho').innerHTML = `Pour : ${whoDot(addWho)}${esc(whoName(addWho))}`;
  const d = $('addDate').value || todayISO();
  $('addDateBtn').textContent = d === todayISO() ? 'Aujourd\'hui' : dateLabel(d);
}
function openSheet() {
  addCat = null; addWho = 'a';
  $('addAmount').value = ''; $('addDate').value = todayISO(); $('addDate').hidden = true;
  renderSheet();
  document.body.classList.add('sheet-open');
  history.pushState({ ng: 'sheet' }, '');
  $('addAmount').focus();
}
function closeSheet(fromHistory) {
  if (!document.body.classList.contains('sheet-open')) return false;
  document.body.classList.remove('sheet-open');
  document.activeElement && document.activeElement.blur();
  if (!fromHistory) history.back();
  return true;
}
backHandlers.push(() => closeSheet(true));

$('plusBtn').onclick = openSheet;
$('sheetBg').onclick = () => closeSheet();
$('sheet').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.addCat) { addCat = t.dataset.addCat; renderSheet(); }
  else if (t.id === 'addWho') { addWho = nextWho(addWho); renderSheet(); }
  else if (t.id === 'addDateBtn') { $('addDate').hidden = false; $('addDateBtn').hidden = true; $('addDate').focus(); try { $('addDate').showPicker(); } catch (err) { /* ancien navigateur */ } }
});
$('addDate').addEventListener('change', () => { $('addDate').hidden = true; $('addDateBtn').hidden = false; renderSheet(); });
$('sheet').addEventListener('submit', e => {
  e.preventDefault();
  const amount = Math.round(parseNum($('addAmount').value) * 100) / 100;
  if (amount <= 0) { toast('Indiquez un montant'); return $('addAmount').focus(); }
  if (!addCat) { $('addCats').classList.add('need'); return toast('Choisissez une catégorie'); }
  const exp = { id: uid(), date: $('addDate').value || todayISO(), amount, cat: addCat, who: addWho, note: '' };
  state.expenses.push(exp);
  save(); closeSheet(); render();
  toast(`${fmt(amount)} · ${addCat} · ${whoName(addWho)}`, { label: 'Annuler', run: () => {
    state.expenses = state.expenses.filter(x => x.id !== exp.id); save(); render();
  } });
});
