// Small DOM helpers shared by the app: element builder, icons, toast, dialogs, clipboard, formatting.

export const $ = sel => document.querySelector(sel);
export const money = n => '$' + n.toFixed(2);
export const money0 = n => '$' + Math.round(n).toLocaleString();
export const num = n => Math.round(n).toLocaleString();
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// h('button', { class: 'x', onclick }, 'Label', child, [more]) — null/false attrs and children are skipped.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter(c => c != null && c !== false));
  return el;
}

const ICONS = {
  swap: '<path d="M4 7h14l-3-3M20 17H6l3 3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};
export function iconBtn(name, label, onclick, attrs = {}) {
  const b = h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick, ...attrs });
  b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return b;
}

let toastTimer;
// Brief status message; pass onUndo to offer an Undo button.
export function toast(msg, onUndo) {
  const t = $('#toast');
  clearTimeout(toastTimer);
  t.replaceChildren(h('span', {}, msg));
  if (onUndo) t.append(h('button', { type: 'button', onclick: () => { t.hidden = true; onUndo(); } }, 'Undo'));
  t.hidden = false;
  toastTimer = setTimeout(() => (t.hidden = true), onUndo ? 8000 : 4000);
}

export function confirmDialog(title, message, okLabel) {
  const d = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-msg').textContent = message;
  $('#confirm-ok').textContent = okLabel;
  d.returnValue = '';
  return new Promise(resolve => {
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
    d.showModal();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { readonly: true, style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// Mark a field invalid with a message in its linked error element (id = field id + '-error').
export function fieldError(el, msg) {
  el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  const err = document.getElementById(el.id + '-error');
  if (err) err.textContent = msg || '';
  return !msg;
}
