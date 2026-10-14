// DOM helpers shared by every view: h(), icon(), toast(), openSheet(), copyText(), shareText(),
// and the copy/share flows built on them: copyWithToast(), shareOrCopy().
// No HTML strings with data: text always goes in as text nodes. icon() is the one parser, and it
// only ever parses the static strings in icons.js.
import { ICONS } from './icons.js';
import { tc } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOAST_MS = 2400;

// ---- h() ----

const isChild = (value) =>
  value instanceof Node || Array.isArray(value) || typeof value === 'string' || typeof value === 'number';

const classNames = (value) => (Array.isArray(value) ? value.flat(Infinity).filter(Boolean).join(' ') : value || '');

// Values that could run script never reach the DOM, even if a caller forgets to validate a URL.
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const SCRIPT_URL = /^\s*(javascript|vbscript):/i;

function setAttr(el, name, value) {
  if (/^on/i.test(name)) return; // listeners go through `on`
  if (name.startsWith('aria-') && typeof value === 'boolean') value = String(value);
  if (value === true) el.setAttribute(name, '');
  else if (value != null && value !== false) {
    const text = String(value);
    if (URL_ATTRS.has(name) && SCRIPT_URL.test(text)) return;
    el.setAttribute(name, text);
  }
}

function setStyle(el, style) {
  for (const [name, value] of Object.entries(style)) {
    if (value == null || value === false) continue;
    const prop = name.startsWith('--') ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    el.style.setProperty(prop, String(value));
  }
}

function appendChildren(el, children) {
  for (const child of children) {
    if (child == null || typeof child === 'boolean') continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

/**
 * Builds an element. h('a', { class: ['btn', on && 'is-on'], attrs: { href }, on: { click } }, 'Label')
 * props (all optional): class (string, or array with falsy entries skipped), id, text,
 *   style {} (applied with setProperty, e.g. { '--place': hex }), attrs {}, on { event: fn }, dataset {}.
 * attrs: true sets an empty attribute, false/null/undefined skips it; on aria-* a boolean becomes "true"/"false".
 * children: Node | string | number | array; null, undefined and booleans are skipped.
 * props may be left out: h('p', 'Hello').
 */
export function h(tag, props, ...children) {
  if (isChild(props)) {
    children.unshift(props);
    props = null;
  }
  const { class: cls, id, text, style, attrs, on, dataset } = props || {};
  const el = document.createElement(tag);

  const className = classNames(cls);
  if (className) el.className = className;
  if (id) el.id = id;
  if (style) setStyle(el, style);
  if (attrs) for (const [name, value] of Object.entries(attrs)) setAttr(el, name, value);
  if (dataset) {
    for (const [key, value] of Object.entries(dataset)) if (value != null) el.dataset[key] = String(value);
  }
  if (on) for (const [type, fn] of Object.entries(on)) if (typeof fn === 'function') el.addEventListener(type, fn);
  if (text != null) el.textContent = String(text);
  appendChildren(el, children);
  return el;
}

let idCount = 0;

/** A document-unique id for label/for and aria-* pairs: uid('name') → 'jk-name-3'. */
export const uid = (prefix = 'id') => `jk-${prefix}-${++idCount}`;

// ---- icon() ----

const templates = new Map();

// Parses an icon's static markup once; later calls clone the parsed node.
function iconTemplate(name) {
  if (!templates.has(name)) {
    let svg = null;
    const markup = ICONS[name];
    if (markup) {
      const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, 'image/svg+xml');
      if (!doc.querySelector('parsererror')) svg = doc.documentElement;
    }
    if (!svg) console.warn(`icon(): unknown icon "${name}"`);
    templates.set(name, svg);
  }
  return templates.get(name);
}

// Stroke width by size: 2 up to 20px, 1.75 up to 31px, 1.5 from 32px.
const strokeFor = (size) => (size <= 20 ? 2 : size < 32 ? 1.75 : 1.5);

/** A decorative (aria-hidden) Tabler icon. Names ending in "-filled" are solid. `class` adds classes. */
export function icon(name, { size = 20, stroke, class: extra } = {}) {
  const template = iconTemplate(name);
  const svg = template ? document.importNode(template, true) : document.createElementNS(SVG_NS, 'svg');
  const filled = name.endsWith('-filled');
  const attrs = {
    class: classNames(['icon', ...[extra].flat()]),
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: filled ? 'currentColor' : 'none',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  if (!filled) {
    Object.assign(attrs, {
      stroke: 'currentColor',
      'stroke-width': stroke ?? strokeFor(size),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
  }
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, String(value));
  return svg;
}

// ---- toast() ----

let toastTimer = 0;

/**
 * Shows a short message in the polite live region (#toast) for 2.4 s, 24px above any bottom bar.
 * `icon` names the leading glyph: 'check' (default) for success, 'alert-circle' for failures.
 */
export function toast(message, { icon: iconName = 'check' } = {}) {
  const region = document.getElementById('toast');
  if (!region) return;

  const bar = document.querySelector('.bottom-bar');
  if (bar) region.style.setProperty('--toast-offset', `${bar.getBoundingClientRect().height}px`);
  else region.style.removeProperty('--toast-offset');

  region.replaceChildren(h('div', { class: 'toast' }, icon(iconName, { size: 18 }), h('span', {}, message)));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => region.replaceChildren(), TOAST_MS);
}

// ---- openSheet() ----

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusablesIn = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);

// Keeps Tab and Shift+Tab cycling inside the sheet.
function trapTab(event, root) {
  const items = focusablesIn(root);
  if (!items.length) {
    event.preventDefault();
    root.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

let activeSheet = null;

/**
 * Opens a bottom sheet over a scrim with `label` as its h2 title and a close button.
 * Focus is trapped inside; Esc, the scrim, the close button and any navigation close it,
 * and focus returns to where it was. Returns close().
 */
export function openSheet(content, { label = '', onClose } = {}) {
  activeSheet?.close();

  const app = document.getElementById('app');
  const returnFocus = document.activeElement;
  const titleId = uid('sheet-title');

  const closeButton = h(
    'button',
    { class: 'iconbtn iconbtn--tonal', attrs: { type: 'button', 'aria-label': tc('close') } },
    icon('x', { size: 18 }),
  );
  const body = h('div', { class: 'sheet__body' }, content);
  const sheet = h(
    'div',
    { class: 'sheet', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' } },
    h('div', { class: 'sheet__grabber', attrs: { 'aria-hidden': 'true' } }),
    h('div', { class: 'sheet__head' }, h('h2', { class: 'sheet__title', id: titleId }, label), closeButton),
    body,
  );
  const scrim = h('div', { class: 'scrim', attrs: { 'aria-hidden': 'true' } });

  let closed = false;

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      trapTab(event, sheet);
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    scrim.remove();
    sheet.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', close);
    document.body.classList.remove('has-sheet');
    if (app) app.inert = false;
    if (activeSheet?.close === close) activeSheet = null;
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    onClose?.();
  }

  closeButton.addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);

  document.body.append(scrim, sheet);
  document.body.classList.add('has-sheet');
  if (app) app.inert = true;
  (focusablesIn(body)[0] || closeButton).focus({ preventScroll: true });

  activeSheet = { close };
  return close;
}

// ---- clipboard and share ----

// Fallback for browsers without the async clipboard API (or when it is refused).
function legacyCopy(text) {
  const previous = document.activeElement;
  const area = h('textarea', { class: 'clipboard-proxy', attrs: { readonly: true, 'aria-hidden': 'true', tabindex: '-1' } });
  area.value = text;
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  return ok;
}

/** Copies text to the clipboard. Resolves true on success. */
export async function copyText(text) {
  const value = String(text ?? '');
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Refused or unfocused: try the legacy path.
  }
  return legacyCopy(value);
}

/**
 * Opens the system share sheet with `text`. Call it synchronously inside the click handler
 * (before any await) so the browser still sees the user's tap.
 */
export function shareText(text) {
  const data = { text: String(text ?? '') };
  if (typeof navigator.share !== 'function' || (navigator.canShare && !navigator.canShare(data))) {
    return Promise.resolve('unsupported');
  }
  let pending;
  try {
    pending = navigator.share(data);
  } catch {
    return Promise.resolve('unsupported');
  }
  return Promise.resolve(pending).then(
    () => 'shared',
    (err) => (err?.name === 'AbortError' ? 'cancelled' : 'unsupported'),
  );
}

/**
 * Copies text and confirms with the toast `done`. When copying fails: `failed` as an alert toast,
 * or, when `failed` is a function, a call to it instead (e.g. a copy-by-hand sheet).
 * Resolves true when the text was copied.
 */
export async function copyWithToast(text, { done, failed }) {
  const copied = await copyText(text);
  if (copied) toast(done);
  else if (typeof failed === 'function') failed();
  else toast(failed, { icon: 'alert-circle' });
  return copied;
}

/**
 * The share sheet with `text`; where there is none, copyWithToast(text, messages) instead.
 * Call it synchronously inside the click. Resolves true when the text was shared or copied.
 */
export function shareOrCopy(text, messages) {
  return shareText(text).then((result) =>
    result === 'unsupported' ? copyWithToast(text, messages) : result === 'shared',
  );
}
