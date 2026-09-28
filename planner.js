// Pure planning logic: state shape, diet filters, weekly plan, grocery totals, share links. No DOM here.
import { CATALOG, RECIPES, AISLES } from './recipes.js';

export const MEALS = ['breakfast', 'lunch', 'dinner'];
export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const KID_PORTION = 0.6;
const OTHER_AISLE = 'From your recipes';

const lacks = c => f => !f.includes(c);
export const DIETS = [
  { id: 'vegetarian', label: 'Vegetarian', ok: f => !/[MFC]/.test(f) },
  { id: 'vegan', label: 'Vegan', ok: f => !/[MFCDEH]/.test(f) },
  { id: 'pescatarian', label: 'Pescatarian', ok: lacks('M') },
  { id: 'glutenfree', label: 'Gluten-free', ok: lacks('G') },
  { id: 'dairyfree', label: 'Dairy-free', ok: lacks('D') },
  { id: 'eggfree', label: 'Egg-free', ok: lacks('E') },
  { id: 'nutfree', label: 'Nut-free', ok: lacks('N') },
  { id: 'shellfishfree', label: 'Shellfish-free', ok: lacks('C') },
  { id: 'lowcarb', label: 'Low-carb (≤ 30 g carbs)', ok: (f, r) => r.carbs != null && r.carbs <= 30, why: r => `Not low-carb (${r.carbs ?? '?'} g carbs)` },
  { id: 'highprotein', label: 'High-protein (≥ 25 g)', ok: (f, r) => r.protein != null && r.protein >= 25, why: r => `Only ${r.protein ?? '?'} g protein` },
];

// Diet flags for user recipes are detected from ingredient words (conservative on purpose).
const KEYWORDS = {
  M: /\b(chicken|beef|pork|turkey|bacon|sausage|ham|lamb|steak|veal|prosciutto|pepperoni|salami|chorizo)\b/,
  F: /\b(salmon|tuna|cod|fish|tilapia|trout|sardines?|anchov\w*|halibut)\b/,
  C: /\b(shrimp|prawns?|crab|lobster|scallops?|clams?|mussels?|oysters?)\b/,
  D: /\b(milk|cheese|yogh?urt|butter|cream|feta|parmesan|mozzarella|cheddar|ricotta|ghee)\b/,
  E: /\beggs?\b/,
  G: /\b(bread|pasta|flour|wheat|noodles?|soy sauce|pita|couscous|barley|buns?|crackers?|tortillas?|spaghetti|macaroni|breadcrumbs)\b/,
  N: /\b(almonds?|peanuts?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamias?|peanut butter)\b/,
  H: /\bhoney\b/,
};

export function defaultSettings() {
  return { adults: 2, kids: 2, budget: 150, calories: 1800, meals: { breakfast: true, lunch: false, dinner: true }, diets: [], avoid: '' };
}
const emptyPlan = () => DAYS.map(() => ({}));
const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

export function newState() {
  return { settings: defaultSettings(), plan: emptyPlan(), checked: {}, extras: [], custom: [], excluded: [], seed: newSeed(), hideChecked: false };
}

// Accepts anything (localStorage, share links) and returns a valid state.
export function sanitize(raw) {
  const d = newState();
  if (!raw || typeof raw !== 'object') return d;
  const n = (v, min, max, def) => (v === '' || v == null || !Number.isFinite(+v) ? def : Math.min(max, Math.max(min, +v)));
  const s = raw.settings || {};
  const out = d.settings;
  out.adults = Math.round(n(s.adults, 0, 20, out.adults));
  out.kids = Math.round(n(s.kids, 0, 20, out.kids));
  if (out.adults + out.kids === 0) out.adults = 1;
  out.budget = n(s.budget, 0, 5000, out.budget);
  out.calories = Math.round(n(s.calories, 800, 5000, out.calories));
  for (const m of MEALS) if (typeof s.meals?.[m] === 'boolean') out.meals[m] = s.meals[m];
  if (!MEALS.some(m => out.meals[m])) out.meals.dinner = true;
  if (Array.isArray(s.diets)) out.diets = s.diets.filter(id => DIETS.some(x => x.id === id));
  out.avoid = String(s.avoid ?? '').slice(0, 300);
  if (Array.isArray(raw.plan) && raw.plan.length === 7) {
    d.plan = raw.plan.map(day => {
      const o = {};
      for (const m of MEALS) {
        const slot = day?.[m];
        if (slot?.skip) o[m] = { skip: true };
        else if (typeof slot?.id === 'string') o[m] = { id: slot.id, locked: !!slot.locked };
      }
      return o;
    });
  }
  if (raw.checked && typeof raw.checked === 'object') for (const k of Object.keys(raw.checked)) if (raw.checked[k] === true) d.checked[k] = true;
  if (Array.isArray(raw.extras)) d.extras = raw.extras.filter(e => e && typeof e.name === 'string' && e.name.trim()).slice(0, 200).map(e => ({
    id: String(e.id || 'x-' + Math.random().toString(36).slice(2)), name: e.name.slice(0, 80), qty: String(e.qty ?? '').slice(0, 30),
    price: e.price == null || e.price === '' || !Number.isFinite(+e.price) ? null : Math.max(0, +e.price),
  }));
  if (Array.isArray(raw.custom)) d.custom = raw.custom.map(sanitizeCustom).filter(Boolean).slice(0, 200);
  if (Array.isArray(raw.excluded)) d.excluded = raw.excluded.filter(x => typeof x === 'string');
  if (Number.isFinite(raw.seed)) d.seed = raw.seed >>> 0;
  d.hideChecked = raw.hideChecked === true;
  return d;
}

function sanitizeCustom(c) {
  if (!c || typeof c.name !== 'string' || !c.name.trim() || !MEALS.includes(c.meal) || !Array.isArray(c.lines)) return null;
  const opt = (v, max) => (v == null || v === '' || !Number.isFinite(+v) ? null : Math.min(max, Math.max(0, +v)));
  return {
    id: typeof c.id === 'string' && c.id.startsWith('c-') ? c.id : 'c-' + Math.random().toString(36).slice(2),
    name: c.name.trim().slice(0, 80), meal: c.meal, servings: Math.max(1, Math.min(50, Math.round(+c.servings || 1))),
    kcal: Math.round(opt(c.kcal, 3000) ?? 0), protein: opt(c.protein, 300), carbs: opt(c.carbs, 500), minutes: opt(c.minutes, 1440),
    cost: opt(c.cost, 1000), lines: c.lines.map(String).map(l => l.trim()).filter(Boolean).slice(0, 60),
    steps: (Array.isArray(c.steps) ? c.steps : []).map(String).map(l => l.trim()).filter(Boolean).slice(0, 40),
  };
}

// ---- Parsing & formatting quantities -------------------------------------------------------

const UNIT_WORDS = {
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', oz: 'oz', ounce: 'oz', ounces: 'oz', cup: 'cup', cups: 'cup', c: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', can: 'can', cans: 'can',
  clove: 'clove', cloves: 'clove', g: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', liter: 'l', liters: 'l',
  slice: 'slice', slices: 'slice', head: 'head', heads: 'head', bunch: 'bunch', bunches: 'bunch', package: 'package',
  packages: 'package', pkg: 'package', jar: 'jar', jars: 'jar', bag: 'bag', bags: 'bag', pinch: 'pinch', dozen: 'dozen',
};
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

// "1 1/2 cups brown rice" → { qty: 1.5, unit: 'cup', name: 'Brown rice' }
export function parseLine(line) {
  const s = line.trim().replace(/(\d)?\s*([½¼¾⅓⅔])/g, (_, d, f) => String(+(d || 0) + FRACTIONS[f]));
  const m = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+)\s*(.*)$/);
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  if (!m) return { qty: null, unit: '', name: cap(s) };
  const qty = m[1].split(/\s+/).reduce((sum, part) => { const [a, b] = part.split('/'); return sum + (b ? +a / +b : +a); }, 0);
  const [first = '', ...rest] = m[2].split(/\s+/);
  const unit = UNIT_WORDS[first.toLowerCase().replace(/\.$/, '')];
  const name = (unit ? rest.join(' ') : m[2]).replace(/^of\s+/i, '').trim();
  return { qty: qty || null, unit: unit || '', name: cap(name || m[2] || s) };
}

const PLURAL = { can: 'cans', clove: 'cloves', slice: 'slices', head: 'heads', bunch: 'bunches', package: 'packages', jar: 'jars', bag: 'bags', pinch: 'pinches', cup: 'cups' };
const nice = q => {
  if (q >= 10) return String(Math.round(q));
  let whole = Math.floor(q), quarters = Math.round((q - whole) * 4);
  if (quarters === 4) { whole++; quarters = 0; }
  if (!whole && !quarters) return '¼';
  return (whole ? String(whole) : '') + ['', '¼', '½', '¾'][quarters];
};
const one = q => String(Math.round(q * 10) / 10);
const withUnit = (v, unit, q) => `${v} ${q > 1 && PLURAL[unit] ? PLURAL[unit] : unit}`;

// mode 'shop' rounds up to buyable amounts; 'cook' rounds to kitchen-friendly fractions.
export function formatQty(q, unit, mode = 'shop') {
  if (q == null || !(q > 0)) return '';
  const shop = mode === 'shop';
  switch (unit) {
    case 'lb': return q < 1 ? `${Math.max(1, shop ? Math.ceil(q * 16 - 0.2) : Math.round(q * 16))} oz` : `${one(q)} lb`;
    case 'oz': return q >= 32 ? `${one(q / 16)} lb` : `${shop ? Math.max(1, Math.ceil(q - 0.2)) : nice(q)} oz`;
    case 'tbsp': return q >= 8 ? withUnit(nice(q / 16), 'cup', q / 16) : !shop && q < 1 ? `${nice(q * 3)} tsp` : `${nice(q)} tbsp`;
    case 'tsp': return q >= 6 ? `${nice(q / 3)} tbsp` : `${nice(q)} tsp`;
    case 'cup': return !shop && q < 0.25 ? `${nice(q * 16)} tbsp` : withUnit(nice(q), 'cup', q);
    case 'g': case 'ml': return `${Math.round(q)} ${unit}`;
    case 'kg': case 'l': return `${one(q)} ${unit}`;
    default: {
      const v = shop ? String(Math.max(1, Math.ceil(q - 0.15))) : nice(q);
      return unit && unit !== 'each' ? withUnit(v, unit, +v || q) : v;
    }
  }
}

// ---- Recipes & eligibility -----------------------------------------------------------------

function fromCustom(c) {
  const text = (c.name + ' ' + c.lines.join(' ')).toLowerCase();
  return {
    ...c, custom: true, flags: Object.keys(KEYWORDS).filter(k => KEYWORDS[k].test(text)).join(''),
    cost: c.cost == null ? 0 : c.cost / c.servings, hasCost: c.cost != null,
    ingredients: c.lines.map(parseLine).map(i => ({ ...i, qty: i.qty == null ? null : i.qty / c.servings })),
    search: text,
  };
}
RECIPES.forEach(r => { r.hasCost = true; r.search = (r.name + ' ' + r.ingredients.map(i => CATALOG[i.key][0]).join(' ')).toLowerCase(); });

export function buildIndex(state) {
  return new Map([...RECIPES, ...state.custom.map(fromCustom)].map(r => [r.id, r]));
}

const FLAG_NAMES = { M: 'meat', F: 'fish', C: 'shellfish', D: 'dairy', E: 'eggs', G: 'gluten', N: 'nuts', H: 'honey' };
const avoidTerms = s => s.avoid.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

// Why a recipe doesn't fit the current settings; empty array means it fits.
export function reasonsNot(r, state) {
  const out = [];
  if (state.excluded.includes(r.id)) out.push('Hidden by you');
  for (const id of state.settings.diets) {
    const diet = DIETS.find(x => x.id === id);
    if (!diet || diet.ok(r.flags, r)) continue;
    const hit = [...r.flags].filter(f => !diet.ok(f, r)).map(f => FLAG_NAMES[f]);
    out.push(diet.why ? diet.why(r) : `Not ${diet.label.toLowerCase()} (${hit.join(', ')})`);
  }
  for (const t of avoidTerms(state.settings)) if (r.search.includes(t)) out.push(`Contains “${t}”`);
  return out;
}
export const eligible = (r, state) => reasonsNot(r, state).length === 0;

export function tagsFor(r) {
  const tags = [];
  const has = id => DIETS.find(x => x.id === id).ok(r.flags, r);
  if (has('vegan')) tags.push('Vegan'); else if (has('vegetarian')) tags.push('Vegetarian');
  if (has('glutenfree')) tags.push('Gluten-free');
  if (has('dairyfree')) tags.push('Dairy-free');
  if (has('lowcarb')) tags.push('Low-carb');
  if (has('highprotein')) tags.push('High-protein');
  return tags;
}

export function scaledIngredients(r, portions) {
  return r.ingredients.map(i => {
    if (!r.custom) {
      const [name, unit] = CATALOG[i.key];
      return `${formatQty(i.qty * portions, unit, 'cook')} ${name.toLowerCase()}`;
    }
    return i.qty == null ? i.name : `${formatQty(i.qty * portions, i.unit, 'cook')} ${i.name.toLowerCase()}`;
  });
}

// ---- Planning ------------------------------------------------------------------------------

export const portions = s => s.adults + s.kids * KID_PORTION;

function mulberry32(a) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// used: Map of recipe id → times already in the week. Prefer the least-repeated recipes, then ones under target cost.
function pick(pool, used, target, rng) {
  if (!pool.length) return null;
  const fewest = Math.min(...pool.map(r => used.get(r.id) || 0));
  const base = pool.filter(r => (used.get(r.id) || 0) === fewest);
  const affordable = base.filter(r => r.cost <= target);
  const choices = affordable.length ? affordable : [...base].sort((a, b) => a.cost - b.cost).slice(0, 3);
  return choices[Math.floor(rng() * choices.length)];
}

const extrasCost = state => state.extras.reduce((sum, e) => sum + (e.price || 0), 0);

// Fill empty or no-longer-fitting slots, keeping locked and skipped ones. rebuild: re-pick every unlocked slot.
// Picks aim to keep the week under budget. Returns how many slots changed.
export function reconcile(state, index, { rebuild = false } = {}) {
  const s = state.settings, p = portions(s), rng = mulberry32(state.seed);
  const all = [...index.values()];
  const pools = Object.fromEntries(MEALS.map(m => [m, all.filter(r => r.meal === m && eligible(r, state))]));
  const avg = Object.fromEntries(MEALS.map(m => [m, pools[m].length ? pools[m].reduce((a, r) => a + r.cost, 0) / pools[m].length : 0]));
  const used = Object.fromEntries(MEALS.map(m => [m, new Map()]));
  const use = (m, id) => used[m].set(id, (used[m].get(id) || 0) + 1);
  let committed = extrasCost(state);
  const todo = [];
  state.plan.forEach((day, d) => MEALS.forEach(m => {
    if (!s.meals[m] || day[m]?.skip) return;
    const r = day[m] && index.get(day[m].id);
    const keep = r && r.meal === m && (day[m].locked || (!rebuild && eligible(r, state)));
    if (keep) { use(m, r.id); committed += r.cost * p; } else todo.push([d, m]);
  }));
  todo.sort((a, b) => MEALS.indexOf(b[1]) - MEALS.indexOf(a[1])); // dinners first: priciest, most flexible
  let changed = 0;
  todo.forEach(([d, m], i) => {
    const weight = todo.slice(i).reduce((a, [, mm]) => a + avg[mm], 0) || 1;
    const target = (Math.max(0, s.budget - committed) * (avg[m] / weight)) / p;
    const r = pick(pools[m], used[m], target, rng);
    const prev = state.plan[d][m]?.id;
    if (r) { state.plan[d][m] = { id: r.id, locked: false }; use(m, r.id); committed += r.cost * p; } else delete state.plan[d][m];
    if (prev !== r?.id) changed++;
  });
  return changed;
}

export function swap(state, index, d, m) {
  const current = state.plan[d][m]?.id;
  const inWeek = new Set(state.plan.map(day => day[m]?.id));
  const pool = [...index.values()].filter(r => r.meal === m && r.id !== current && eligible(r, state));
  if (!pool.length) return null;
  const fresh = pool.filter(r => !inWeek.has(r.id));
  const choices = fresh.length ? fresh : pool;
  const r = choices[Math.floor(Math.random() * choices.length)];
  state.plan[d][m] = { id: r.id, locked: false };
  return r;
}

export function planned(state, index) {
  const out = [];
  state.plan.forEach((day, d) => MEALS.forEach(m => {
    const r = state.settings.meals[m] && !day[m]?.skip && day[m] && index.get(day[m].id);
    if (r) out.push({ d, m, r });
  }));
  return out;
}

export function dayTotals(state, index) {
  const days = DAYS.map(() => ({ kcal: 0, protein: 0, count: 0 }));
  for (const { d, r } of planned(state, index)) { days[d].kcal += r.kcal; days[d].protein += r.protein || 0; days[d].count++; }
  return days;
}

export function groceries(state, index) {
  const p = portions(state.settings), map = new Map();
  let customCost = 0;
  for (const { r } of planned(state, index)) {
    if (r.custom) {
      customCost += r.cost * p;
      for (const i of r.ingredients) {
        const key = `c:${i.name.toLowerCase()}|${i.unit}`;
        const e = map.get(key) ?? { key, name: i.name, unit: i.unit, aisle: OTHER_AISLE, qty: 0, price: null, asNeeded: false };
        if (i.qty == null) e.asNeeded = true; else e.qty += i.qty * p;
        map.set(key, e);
      }
    } else {
      for (const { key, qty } of r.ingredients) {
        const [name, unit, price, aisle] = CATALOG[key];
        const e = map.get(key) ?? { key, name, unit, aisle, qty: 0, price };
        e.qty += qty * p;
        map.set(key, e);
      }
    }
  }
  const items = [...map.values()].map(e => ({ ...e, cost: e.price == null ? null : e.qty * e.price }));
  const total = items.reduce((a, i) => a + (i.cost || 0), 0) + customCost + extrasCost(state);
  const groups = [...AISLES, OTHER_AISLE]
    .map(aisle => ({ aisle, items: items.filter(i => i.aisle === aisle).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter(g => g.items.length);
  return { groups, total, customCost };
}

// ---- Share links ---------------------------------------------------------------------------

export function encodeShare(state, index) {
  const used = new Set(planned(state, index).map(x => x.r.id));
  const payload = { s: state.settings, p: state.plan, c: state.custom.filter(c => used.has(c.id)), x: state.extras };
  let bin = '';
  new TextEncoder().encode(JSON.stringify(payload)).forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(code) {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
    if (!raw || !raw.s || !Array.isArray(raw.p)) return null;
    return sanitize({ settings: raw.s, plan: raw.p, custom: raw.c, extras: raw.x });
  } catch {
    return null;
  }
}

// Replace settings, plan and extras with a shared plan; merge in any recipes it brought along.
export function applyShare(state, shared) {
  state.settings = shared.settings;
  state.plan = shared.plan;
  state.extras = shared.extras;
  state.checked = {};
  for (const c of shared.custom) {
    const i = state.custom.findIndex(x => x.id === c.id);
    if (i >= 0) state.custom[i] = c; else state.custom.push(c);
  }
}
