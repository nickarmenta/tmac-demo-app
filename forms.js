// Forms: your own recipes and the Settings tab. Talks to app.js through the small `app` object.
import * as P from './planner.js';
import { $, h, plural, confirmDialog, fieldError } from './ui.js';

let app;
let editingId = null;

export function initForms(appApi) {
  app = appApi;
  buildSettingsForm();
  syncSettingsForm();
  $('#recipe-form').addEventListener('submit', saveCustom);
  $('#recipe-form').addEventListener('keydown', e => { if (e.key === 'Escape') closeCustomForm(); });
  $('#cr-cancel').addEventListener('click', closeCustomForm);

  const form = $('#settings-form');
  form.addEventListener('change', applySettings);
  form.addEventListener('submit', e => { e.preventDefault(); applySettings(); });
  form.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    const input = $('#' + b.dataset.step);
    input.value = Math.min(20, Math.max(0, (Math.round(+input.value) || 0) + +b.dataset.delta));
    applySettings();
  }));
  $('#reset-all').addEventListener('click', resetAll);
}

// ---- Custom recipes ------------------------------------------------------------------------

const CR = ['name', 'meal', 'serves', 'kcal', 'cost', 'protein', 'carbs', 'minutes', 'ingredients', 'steps'];
const cr = k => $(`#cr-${k}`);

function saveCustom(ev) {
  ev.preventDefault();
  const numField = (k, { min, max, required, label }) => {
    const raw = cr(k).value.trim().replace(/^\$/, '');
    const v = +raw;
    const msg = !raw ? (required ? `Enter ${label}.` : '') : !Number.isFinite(v) || v < min || v > max ? `${label[0].toUpperCase() + label.slice(1)} must be between ${min} and ${max}.` : '';
    return { ok: fieldError(cr(k), msg), value: raw ? v : null };
  };
  const name = cr('name').value.trim();
  const lines = cr('ingredients').value.split('\n').map(l => l.trim()).filter(Boolean);
  const f = {
    name: { ok: fieldError(cr('name'), name ? '' : 'Give the recipe a name.') },
    serves: numField('serves', { min: 1, max: 50, required: true, label: 'how many it serves' }),
    kcal: numField('kcal', { min: 0, max: 3000, required: true, label: 'calories per serving' }),
    cost: numField('cost', { min: 0, max: 1000, label: 'cost' }),
    protein: numField('protein', { min: 0, max: 300, label: 'protein' }),
    carbs: numField('carbs', { min: 0, max: 500, label: 'carbs' }),
    minutes: numField('minutes', { min: 0, max: 1440, label: 'minutes' }),
    ingredients: { ok: fieldError(cr('ingredients'), lines.length ? '' : 'Add at least one ingredient.') },
  };
  const bad = Object.keys(f).find(k => !f[k].ok);
  if (bad) return cr(bad).focus();
  const snap = app.snapshot();
  const recipe = {
    id: editingId || 'c-' + Date.now().toString(36), name, meal: cr('meal').value, servings: Math.round(f.serves.value),
    kcal: Math.round(f.kcal.value), protein: f.protein.value, carbs: f.carbs.value, minutes: f.minutes.value, cost: f.cost.value,
    lines, steps: cr('steps').value.split('\n').map(l => l.trim()).filter(Boolean),
  };
  const i = app.state.custom.findIndex(c => c.id === recipe.id);
  if (i >= 0) app.state.custom[i] = recipe; else app.state.custom.push(recipe);
  app.reconcile();
  const wasEditing = !!editingId;
  closeCustomForm();
  app.commit(wasEditing ? `Updated ${name}` : `Saved ${name}. It can now show up in plans.`, snap);
}

export function editCustom(id) {
  const c = app.state.custom.find(x => x.id === id);
  if (!c) return;
  editingId = id;
  const vals = { name: c.name, meal: c.meal, serves: c.servings, kcal: c.kcal, cost: c.cost, protein: c.protein, carbs: c.carbs, minutes: c.minutes, ingredients: c.lines.join('\n'), steps: c.steps.join('\n') };
  CR.forEach(k => { cr(k).value = vals[k] ?? ''; fieldError(cr(k), ''); });
  $('#cr-submit').textContent = 'Update recipe';
  app.showTab('recipes');
  $('#add-recipe').open = true;
  cr('name').focus();
  $('#add-recipe').scrollIntoView({ block: 'start' });
}

function closeCustomForm() {
  editingId = null;
  $('#recipe-form').reset();
  CR.forEach(k => fieldError(cr(k), ''));
  $('#cr-submit').textContent = 'Save recipe';
  $('#add-recipe').open = false;
}

export function deleteCustom(id) {
  const snap = app.snapshot(), c = app.state.custom.find(x => x.id === id);
  app.state.custom = app.state.custom.filter(x => x.id !== id);
  app.state.excluded = app.state.excluded.filter(x => x !== id);
  app.reconcile();
  app.commit(`Deleted ${c.name}`, snap);
}

// ---- Settings ------------------------------------------------------------------------------

function buildSettingsForm() {
  $('#s-meals').replaceChildren(...P.MEALS.map(m => h('label', { class: 'chip' }, h('input', { type: 'checkbox', name: 'meal', value: m }), P.MEAL_LABEL[m])));
  $('#s-diets').replaceChildren(...P.DIETS.map(d => h('label', { class: 'chip' }, h('input', { type: 'checkbox', name: 'diet', value: d.id }), d.label)));
}

export function syncSettingsForm() {
  const s = app.state.settings;
  $('#s-adults').value = s.adults;
  $('#s-kids').value = s.kids;
  $('#s-budget').value = s.budget;
  $('#s-calories').value = s.calories;
  $('#s-avoid').value = s.avoid;
  document.querySelectorAll('[name=meal]').forEach(el => (el.checked = s.meals[el.value]));
  document.querySelectorAll('[name=diet]').forEach(el => (el.checked = s.diets.includes(el.value)));
  ['s-adults', 's-budget', 's-calories', 's-meals'].forEach(id => fieldError($('#' + id), ''));
}

function applySettings() {
  const int = id => { const v = $('#' + id).value.trim(); return v === '' ? NaN : +v; };
  const adults = int('s-adults'), kids = int('s-kids'), budget = int('s-budget'), calories = int('s-calories');
  const meals = Object.fromEntries(P.MEALS.map(m => [m, document.querySelector(`[name=meal][value=${m}]`).checked]));
  const people = [adults, kids].every(v => Number.isInteger(v) && v >= 0 && v <= 20);
  const ok = [
    fieldError($('#s-adults'), !people ? 'Use whole numbers from 0 to 20.' : adults + kids < 1 ? 'Plan for at least one person.' : ''),
    fieldError($('#s-budget'), Number.isFinite(budget) && budget >= 0 && budget <= 5000 ? '' : 'Enter a budget from 0 to 5,000.'),
    fieldError($('#s-calories'), Number.isFinite(calories) && calories >= 800 && calories <= 5000 ? '' : 'Enter a goal from 800 to 5,000 kcal.'),
    fieldError($('#s-meals'), Object.values(meals).some(Boolean) ? '' : 'Pick at least one meal to plan.'),
  ].every(Boolean);
  if (!ok) return;
  const snap = app.snapshot();
  app.state.settings = {
    adults, kids, budget, calories: Math.round(calories), meals,
    diets: [...document.querySelectorAll('[name=diet]:checked')].map(el => el.value),
    avoid: $('#s-avoid').value.slice(0, 300),
  };
  const n = app.reconcile();
  app.commit(n ? `Saved. ${plural(n, 'meal')} updated to fit.` : 'Settings saved', n ? snap : null);
}

async function resetAll() {
  if (!(await confirmDialog('Reset everything?', 'This clears your plan, settings, grocery checks, extras and your own recipes on this device. You can undo right after.', 'Reset'))) return;
  const snap = app.snapshot();
  app.state = P.newState();
  app.reconcile();
  syncSettingsForm();
  closeCustomForm();
  app.commit('Everything reset to defaults', snap);
}
