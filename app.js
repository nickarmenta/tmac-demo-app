// Family Meal Planner UI. All state lives in localStorage (and share links). No runtime AI, no backend.
import * as P from './planner.js';
import { $, h, money, money0, num, plural, iconBtn, toast, copyText, fieldError } from './ui.js';
import { initForms, syncSettingsForm, editCustom, deleteCustom } from './forms.js';

const STORE = 'mealplanner.v1';
const TAB_STORE = 'mealplanner.tab';
const TABS = ['plan', 'groceries', 'recipes', 'settings'];

// Newest first. Append an entry every time a feature ships.
const SHIPPED = [
  { date: '2026-09-28', text: 'Weekly meal planner: diet, allergy, calorie and budget settings, an auto-built grocery list, your own recipes, and share links.' },
  { date: '2026-09-28', text: 'App shell deployed.' },
];

let state, index;

// ---- State ---------------------------------------------------------------------------------

function load() {
  let raw;
  try { raw = localStorage.getItem(STORE); } catch { return { state: P.newState(), note: "This browser isn't allowing saved data (private mode?). Your plan lasts until you close the tab." }; }
  if (!raw) return { state: P.newState() };
  try { return { state: P.sanitize(JSON.parse(raw)) }; } catch {
    try { localStorage.setItem(STORE + '.corrupt', raw); } catch { /* best effort */ }
    return { state: P.newState(), note: "Your saved data couldn't be read, so we started a fresh plan." };
  }
}

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { toast("Couldn't save on this device. Storage may be full or blocked."); }
}

const snapshot = () => JSON.stringify(state);
function restore(snap) { state = P.sanitize(JSON.parse(snap)); syncSettingsForm(); commit('Undone'); }

// Rebuild the recipe index (custom recipes may have changed) and refill slots that no longer fit.
function reconcile(opts) { index = P.buildIndex(state); return P.reconcile(state, index, opts); }

// What forms.js needs from the app.
const app = {
  get state() { return state; },
  set state(s) { state = s; },
  snapshot, reconcile, commit, showTab,
};

function commit(msg, undoSnap) {
  index = P.buildIndex(state);
  save();
  render();
  if (msg) toast(msg, undoSnap ? () => restore(undoSnap) : null);
}

// ---- Rendering -----------------------------------------------------------------------------

function render() {
  const fid = document.activeElement?.dataset?.fid; // keep keyboard focus across re-renders
  renderPlan();
  renderGroceries();
  renderRecipes();
  if (fid) document.querySelector(`[data-fid="${CSS.escape(fid)}"]`)?.focus();
}

const fmtPortions = p => (Number.isInteger(p) ? String(p) : p.toFixed(1));
const household = s => [s.adults && plural(s.adults, 'adult'), s.kids && plural(s.kids, 'kid')].filter(Boolean).join(' and ');

function renderPlan() {
  const s = state.settings, g = P.groceries(state, index), days = P.dayTotals(state, index);
  const planned = days.filter(d => d.count);
  const avg = planned.length ? planned.reduce((a, d) => a + d.kcal, 0) / planned.length : 0;
  const over = g.total - s.budget;
  const pct = s.budget > 0 ? Math.min(100, (g.total / s.budget) * 100) : 100;
  const kcal = !avg ? 'No meals planned yet.' : avg <= s.calories
    ? `Planned meals average ${num(avg)} kcal per adult per day, leaving about ${num(s.calories - avg)} of your ${num(s.calories)} kcal goal for snacks and other meals.`
    : `Planned meals average ${num(avg)} kcal per adult per day, ${num(avg - s.calories)} over your ${num(s.calories)} kcal goal. Swap a heavier meal or turn on Low-carb.`;
  $('#summary').replaceChildren(
    h('p', { class: 'big' }, h('strong', {}, money0(g.total)), ` estimated groceries of your ${money0(s.budget)} budget`),
    h('div', { class: 'bar' + (over > 0 ? ' over' : '') }, h('span', { style: `width:${pct}%` })),
    h('p', { class: over > 0 ? 'warn' : 'muted' }, over > 0 ? `${money0(over)} over budget. Tap New plan for cheaper picks, or skip a meal.` : `${money0(-over)} left for extras.`),
    h('p', { class: 'muted small' }, kcal),
    h('p', { class: 'muted small' }, `Cooking for ${household(s)}: ${fmtPortions(P.portions(s))} portions per meal.`));

  const meals = P.MEALS.filter(m => s.meals[m]);
  $('#days').replaceChildren(...P.DAYS.map((name, d) => h('article', { class: 'card day', 'aria-labelledby': `day-${d}` },
    h('h2', { id: `day-${d}`, class: 'h-small' }, name,
      days[d].count ? h('span', { class: 'muted small' }, ` · ${num(days[d].kcal)} kcal · ${num(days[d].protein)} g protein per adult`) : null),
    ...meals.map(m => mealRow(d, m)))));
}

function mealRow(d, m) {
  const slot = state.plan[d][m], label = `${P.DAYS[d]} ${m}`;
  const type = h('span', { class: 'meal-type' }, P.MEAL_LABEL[m]);
  if (slot?.skip) {
    return h('div', { class: 'meal' }, h('div', { class: 'meal-info' }, type, h('span', { class: 'muted' }, 'Skipped: eating out or leftovers')),
      h('div', { class: 'meal-actions' }, h('button', { type: 'button', onclick: () => unskip(d, m), 'data-fid': `add-${d}-${m}` }, 'Add meal')));
  }
  const r = slot && index.get(slot.id);
  if (!r) {
    return h('div', { class: 'meal' }, h('div', { class: 'meal-info' }, type,
      h('span', { class: 'warn small' }, `No ${m} recipes fit your settings. Loosen a diet filter or add your own recipe.`)),
      h('div', { class: 'meal-actions' }, h('button', { type: 'button', onclick: () => showTab('settings') }, 'Settings')));
  }
  const why = P.reasonsNot(r, state), p = P.portions(state.settings);
  return h('div', { class: 'meal' + (slot.locked ? ' locked' : '') },
    h('div', { class: 'meal-info' }, type,
      h('button', { type: 'button', class: 'link', onclick: () => openRecipe(r.id), 'data-fid': `open-${d}-${m}` }, r.name),
      h('span', { class: 'muted small' }, `${r.kcal} kcal · ${r.protein ?? '?'} g protein · ${r.hasCost ? money(r.cost * p) : 'no cost set'}`),
      why.length ? h('span', { class: 'warn small' }, `Kept, but: ${why.join('; ')}`) : null),
    h('div', { class: 'meal-actions' },
      iconBtn('swap', `Swap ${label}`, () => swapMeal(d, m), { 'data-fid': `swap-${d}-${m}` }),
      iconBtn(slot.locked ? 'lock' : 'unlock', `Keep ${label} in new plans`, () => toggleLock(d, m), { 'aria-pressed': String(!!slot.locked), 'data-fid': `lock-${d}-${m}` }),
      iconBtn('close', `Skip ${label}`, () => skipMeal(d, m), { 'data-fid': `skip-${d}-${m}` })));
}

function renderGroceries() {
  const g = P.groceries(state, index);
  const rows = [...g.groups.flatMap(x => x.items.map(i => i.key)), ...state.extras.map(e => e.id)];
  const done = rows.filter(k => state.checked[k]).length;
  $('#hide-checked').checked = state.hideChecked;
  $('#grocery-summary').replaceChildren(
    h('p', { class: 'big' }, h('strong', {}, money0(g.total)), ` estimated · ${done} of ${plural(rows.length, 'item')} in the cart`),
    h('p', { class: 'muted small' }, 'Amounts are what your planned meals use, rounded up. Prices are rough US averages; packages and stores vary.' +
      (g.customCost ? ` Includes ${money(g.customCost)} for your own recipes.` : '')));
  const list = $('#grocery-list');
  if (!rows.length) return list.replaceChildren(h('p', { class: 'empty card' }, 'Your list is empty. Plan some meals on the Plan tab, or add an item above.'));
  let n = 0;
  const row = (key, name, detail, onRemove) => {
    const id = `chk-${n++}`, checked = !!state.checked[key];
    return h('li', { class: 'item' + (checked ? ' done' : ''), hidden: state.hideChecked && checked },
      h('input', { type: 'checkbox', id, checked, 'data-fid': `chk-${key}`, onchange: e => toggleItem(key, e.target.checked) }),
      h('label', { for: id }, h('span', { class: 'item-name' }, name), detail ? h('span', { class: 'muted small' }, detail) : null),
      onRemove ? iconBtn('close', `Remove ${name}`, onRemove) : null);
  };
  const section = (title, items) => h('section', { class: 'aisle' }, h('h2', { class: 'h-small' }, title), h('ul', { class: 'plain' }, items));
  const sections = g.groups.map(grp => section(grp.aisle, grp.items.map(i =>
    row(i.key, i.name, [i.qty ? P.formatQty(i.qty, i.unit) : 'as needed', i.cost != null ? money(i.cost) : ''].filter(Boolean).join(' · ')))));
  if (state.extras.length) sections.push(section('Your extras', state.extras.map(e =>
    row(e.id, e.name, [e.qty, e.price != null ? money(e.price) : ''].filter(Boolean).join(' · '), () => removeExtra(e.id)))));
  if (state.hideChecked && done === rows.length) sections.unshift(h('p', { class: 'empty card' }, 'Everything is checked off. Nice shopping!'));
  list.replaceChildren(...sections);
}

function renderRecipes() {
  const meal = $('#recipe-meal').value, q = $('#recipe-search').value.trim().toLowerCase(), fits = $('#recipe-fits').checked;
  const all = [...index.values()];
  const shown = all
    .filter(r => (meal === 'all' || r.meal === meal) && (!q || r.search.includes(q)) && (!fits || P.eligible(r, state)))
    .sort((a, b) => (b.custom ? 1 : 0) - (a.custom ? 1 : 0) || P.MEALS.indexOf(a.meal) - P.MEALS.indexOf(b.meal) || a.name.localeCompare(b.name));
  $('#recipe-count').textContent = `Showing ${shown.length} of ${plural(all.length, 'recipe')}`;
  $('#recipe-list').replaceChildren(...(shown.length ? shown.map(recipeCard)
    : [h('li', { class: 'empty card' }, fits ? 'No recipes match. Clear the search, untick “Only recipes that fit my settings”, or loosen diet filters in Settings.' : 'No recipes match that search.')]));
  const hidden = state.excluded.map(id => index.get(id)).filter(Boolean);
  $('#hidden-recipes').replaceChildren(...(hidden.length ? [h('section', { class: 'card' },
    h('h2', { class: 'h-small' }, `Hidden recipes (${hidden.length})`),
    h('ul', { class: 'plain' }, hidden.map(r => h('li', { class: 'row between' }, h('span', {}, r.name),
      h('button', { type: 'button', onclick: () => toggleHidden(r.id) }, 'Allow again')))))] : []));
}

function recipeCard(r) {
  const why = P.reasonsNot(r, state);
  return h('li', {}, h('button', { type: 'button', class: 'recipe-card', onclick: () => openRecipe(r.id), 'data-fid': `card-${r.id}` },
    h('span', { class: 'recipe-name' }, r.name, r.custom ? h('span', { class: 'badge accent' }, 'Yours') : null),
    h('span', { class: 'muted small' }, [P.MEAL_LABEL[r.meal], `${r.kcal} kcal`, r.protein != null && `${r.protein} g protein`,
      r.hasCost ? `${money(r.cost)}/serving` : 'no cost set', r.minutes && `${r.minutes} min`].filter(Boolean).join(' · ')),
    h('span', { class: 'tags' }, P.tagsFor(r).map(t => h('span', { class: 'badge' }, t))),
    why.length ? h('span', { class: 'warn small' }, why.join('; ')) : null));
}

function openRecipe(id) {
  const r = index.get(id);
  if (!r) return;
  const dlg = $('#recipe-dialog'), p = P.portions(state.settings), why = P.reasonsNot(r, state);
  const daySel = h('select', { id: 'use-day' }, P.DAYS.map((d, i) => h('option', { value: i }, d)));
  const nutrition = [`${r.kcal} kcal`, r.protein != null && `${r.protein} g protein`, r.carbs != null && `${r.carbs} g carbs`].filter(Boolean).join(' · ');
  dlg.replaceChildren(h('div', { class: 'dialog-body' },
    h('h2', {}, r.name),
    h('p', { class: 'muted' }, `${P.MEAL_LABEL[r.meal]}${r.minutes ? ` · ${r.minutes} min` : ''} · per serving: ${nutrition}`),
    h('p', { class: 'muted' }, r.hasCost ? `About ${money(r.cost)} per serving, ${money(r.cost * p)} for your household.` : 'No cost set for this recipe.'),
    h('p', { class: 'tags' }, P.tagsFor(r).map(t => h('span', { class: 'badge' }, t))),
    why.length ? h('p', { class: 'warn' }, `Doesn't fit your settings: ${why.join('; ')}.`) : null,
    h('h3', {}, `Ingredients for ${fmtPortions(p)} portions`),
    h('ul', {}, P.scaledIngredients(r, p).map(t => h('li', {}, t))),
    r.steps.length ? [h('h3', {}, 'Steps'), h('ol', {}, r.steps.map(s => h('li', {}, s)))] : null,
    state.settings.meals[r.meal]
      ? h('div', { class: 'use-row' }, h('label', { for: 'use-day' }, `Use for ${r.meal} on`), daySel,
        h('button', { type: 'button', class: 'primary', onclick: () => { dlg.close(); useRecipe(r.id, +daySel.value); } }, 'Add to plan'))
      : h('p', { class: 'muted small' }, `Turn on ${r.meal} in Settings to add this to your plan.`),
    h('div', { class: 'row' },
      h('button', { type: 'button', onclick: () => { dlg.close(); toggleHidden(r.id); } }, state.excluded.includes(r.id) ? 'Allow in plans again' : 'Never suggest this'),
      r.custom ? h('button', { type: 'button', onclick: () => { dlg.close(); editCustom(r.id); } }, 'Edit') : null,
      r.custom ? h('button', { type: 'button', class: 'danger', onclick: () => { dlg.close(); deleteCustom(r.id); } }, 'Delete') : null,
      h('button', { type: 'button', onclick: () => dlg.close() }, 'Close'))));
  dlg.showModal();
  dlg.scrollTop = 0;
}

// ---- Plan actions --------------------------------------------------------------------------

function newPlan() {
  const snap = snapshot();
  state.seed = (Math.random() * 2 ** 32) >>> 0;
  const n = reconcile({ rebuild: true });
  commit(n ? `New plan: ${plural(n, 'meal')} changed` : 'No other recipes fit your settings right now', n ? snap : null);
}
function swapMeal(d, m) {
  const snap = snapshot(), r = P.swap(state, index, d, m);
  if (!r) return toast(`No other ${m} recipes fit your settings.`);
  commit(`Swapped in ${r.name}`, snap);
}
function toggleLock(d, m) {
  const slot = state.plan[d][m];
  slot.locked = !slot.locked;
  commit(slot.locked ? 'Locked: New plan will keep this meal' : 'Unlocked');
}
function skipMeal(d, m) {
  const snap = snapshot();
  state.plan[d][m] = { skip: true };
  commit(`Skipped ${P.DAYS[d]} ${m}`, snap);
}
function unskip(d, m) {
  delete state.plan[d][m];
  reconcile();
  commit();
}
function useRecipe(id, d) {
  const r = index.get(id), snap = snapshot();
  state.plan[d][r.meal] = { id, locked: true };
  commit(`${r.name} added to ${P.DAYS[d]} ${r.meal} and locked`, snap);
  showTab('plan');
}
function toggleHidden(id) {
  const snap = snapshot(), r = index.get(id), hiding = !state.excluded.includes(id);
  state.excluded = hiding ? [...state.excluded, id] : state.excluded.filter(x => x !== id);
  const n = reconcile();
  commit(hiding ? `Won't suggest ${r.name}${n ? ` (${plural(n, 'meal')} replaced)` : ''}` : `${r.name} can show up in plans again`, snap);
}

async function sharePlan() {
  const url = `${location.origin}${location.pathname}#plan=${P.encodeShare(state, index)}`;
  if (navigator.share) {
    try { return void (await navigator.share({ title: 'Our meal plan', url })); } catch (e) { if (e.name === 'AbortError') return; }
  }
  toast((await copyText(url)) ? 'Link copied. Anyone who opens it gets this plan and settings.' : "Couldn't copy the link on this browser.");
}

function checkSharedLink() {
  const m = location.hash.match(/^#plan=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const shared = P.decodeShare(m[1]);
  if (!shared) return toast('That shared plan link is incomplete or broken.');
  const banner = $('#shared-banner');
  banner.hidden = false;
  $('#shared-load').onclick = () => {
    const snap = snapshot();
    P.applyShare(state, shared);
    reconcile();
    syncSettingsForm();
    banner.hidden = true;
    showTab('plan');
    commit('Loaded the shared plan', snap);
  };
  $('#shared-dismiss').onclick = () => { banner.hidden = true; };
}

// ---- Grocery actions -----------------------------------------------------------------------

function toggleItem(key, on) {
  if (on) state.checked[key] = true; else delete state.checked[key];
  commit();
}
function removeExtra(id) {
  const snap = snapshot(), e = state.extras.find(x => x.id === id);
  state.extras = state.extras.filter(x => x.id !== id);
  delete state.checked[id];
  commit(`Removed ${e.name}`, snap);
}
function addExtra(ev) {
  ev.preventDefault();
  const name = $('#extra-name'), qty = $('#extra-qty'), price = $('#extra-price');
  const priceText = price.value.trim().replace(/^\$/, '');
  const okName = fieldError(name, name.value.trim() ? '' : 'Type an item name.');
  const okPrice = fieldError(price, !priceText || (Number.isFinite(+priceText) && +priceText >= 0) ? '' : 'Price must be a number, like 3.49.');
  if (!okName || !okPrice) return (okName ? price : name).focus();
  state.extras.push({ id: 'x-' + Date.now().toString(36), name: name.value.trim().slice(0, 80), qty: qty.value.trim().slice(0, 30), price: priceText ? +priceText : null });
  ev.target.reset();
  name.focus();
  commit('Added to your list');
}
function listText() {
  const g = P.groceries(state, index);
  const lines = [], needed = k => !state.checked[k];
  const anyLeft = [...g.groups.flatMap(x => x.items.map(i => i.key)), ...state.extras.map(e => e.id)].some(needed);
  const keep = k => !anyLeft || needed(k);
  for (const grp of g.groups) {
    const items = grp.items.filter(i => keep(i.key));
    if (items.length) lines.push('', grp.aisle.toUpperCase(), ...items.map(i => `- ${i.name}: ${i.qty ? P.formatQty(i.qty, i.unit) : 'as needed'}`));
  }
  const extras = state.extras.filter(e => keep(e.id));
  if (extras.length) lines.push('', 'EXTRAS', ...extras.map(e => `- ${e.name}${e.qty ? `: ${e.qty}` : ''}`));
  const count = lines.filter(l => l.startsWith('- ')).length;
  return { text: `Grocery list (est. ${money0(g.total)})\n${lines.join('\n')}`, count };
}

// ---- Tabs & wiring -------------------------------------------------------------------------

function showTab(name) {
  TABS.forEach(t => {
    const on = t === name, tab = $('#tab-' + t);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $('#panel-' + t).hidden = !on;
  });
  try { localStorage.setItem(TAB_STORE, name); } catch { /* not critical */ }
}

function wire() {
  TABS.forEach((t, i) => {
    const tab = $('#tab-' + t);
    tab.addEventListener('click', () => showTab(t));
    tab.addEventListener('keydown', e => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = TABS[(i + step + TABS.length) % TABS.length];
      showTab(next);
      $('#tab-' + next).focus();
    });
  });
  $('#new-plan').addEventListener('click', newPlan);
  $('#share-plan').addEventListener('click', sharePlan);

  $('#extra-form').addEventListener('submit', addExtra);
  $('#extra-form').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.form?.reset(); ['extra-name', 'extra-price'].forEach(id => fieldError($('#' + id), '')); } });
  $('#copy-list').addEventListener('click', async () => {
    const { text, count } = listText();
    if (!count) return toast('Nothing to copy yet. Plan some meals first.');
    toast((await copyText(text)) ? `Copied ${plural(count, 'item')}. Paste into your notes or a text.` : "Couldn't copy on this browser.");
  });
  $('#uncheck-all').addEventListener('click', () => {
    if (!Object.keys(state.checked).length) return toast('Nothing is checked.');
    const snap = snapshot();
    state.checked = {};
    commit('Unchecked everything', snap);
  });
  $('#hide-checked').addEventListener('change', e => { state.hideChecked = e.target.checked; commit(); });

  $('#recipe-search').addEventListener('input', renderRecipes);
  $('#recipe-meal').addEventListener('change', renderRecipes);
  $('#recipe-fits').addEventListener('change', renderRecipes);

  const dlg = $('#recipe-dialog');
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); // tap outside to close

  $('#shipped').replaceChildren(...SHIPPED.map(s => h('li', {}, h('time', { datetime: s.date }, s.date), ' ', s.text)));
}

function init() {
  const loaded = load();
  state = loaded.state;
  initForms(app);
  wire();
  reconcile(); // fill a fresh plan, or repair one saved by an older version
  let tab = 'plan';
  try { tab = localStorage.getItem(TAB_STORE) || 'plan'; } catch { /* default */ }
  showTab(TABS.includes(tab) ? tab : 'plan');
  $('#loading').remove();
  commit(loaded.note);
  checkSharedLink();
}

init();
