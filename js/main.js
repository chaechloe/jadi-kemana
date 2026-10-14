// Boot, hash router and render loop. See docs/ARCHITECTURE.md, "Router".
import { h } from './ui.js';
import { topBar, langToggle, pageHeader, emptyState } from './components.js';
import { getLang, tc } from './i18n.js';
import { decodeList, CodecError } from './codec.js';
import { getList } from './store.js';
import { parseRoute } from './routes.js';

// Explicit loaders keep every import path static.
const VIEWS = {
  welcome: () => import('./views/welcome.js'),
  editor: () => import('./views/editor.js'),
  'place-form': () => import('./views/place-form.js'),
  share: () => import('./views/share.js'),
  friend: () => import('./views/friend.js'),
  compare: () => import('./views/compare.js'),
  random: () => import('./views/random.js'),
};

const app = document.getElementById('app');
let renderCount = 0;

// ---- screen state (ctx.state) ----

// One plain object per route: views keep what the user typed or picked in it, so a re-render of
// the same route (language switch, ctx.rerender()) rebuilds the screen as it was. Any change of
// location.hash starts over with {}.
let screen = { hash: null, state: {} };

function screenState() {
  if (screen.hash !== location.hash) screen = { hash: location.hash, state: {} };
  return screen.state;
}

// ---- decoding (memoized per payload) ----

let decoded = { payload: null, promise: null };

function decodeOnce(payload) {
  if (decoded.payload !== payload) {
    decoded = { payload, promise: decodeList(payload) };
    decoded.promise.catch(() => {}); // handled where it is awaited
  }
  return decoded.promise;
}

// ---- titles ----

function screenName(route, list) {
  switch (route.view) {
    case 'editor':
    case 'share':
      return getList(route.params.id)?.title || tc(`titles.${route.view}`);
    case 'place-form':
      return tc(route.params.pid ? 'titles.editPlace' : 'titles.addPlace');
    case 'friend':
      return list?.title || tc('titles.friend');
    default:
      return tc(`titles.${route.view}`);
  }
}

const setTitle = (name) => {
  document.title = `${name} · ${tc('appName')}`;
};

// ---- error screen ----

const ERRORS = {
  corrupt: ['errBrokenTitle', 'errBrokenBody'],
  version: ['errVersionTitle', 'errVersionBody'],
  unsupported: ['errUnsupportedTitle', 'errUnsupportedBody'],
  load: ['errLoadTitle', 'errLoadBody'],
  generic: ['errGenericTitle', 'errGenericBody'],
};

/** A friendly, bilingual dead end with a way home. */
function errorScreen(kind) {
  const [titleKey, bodyKey] = ERRORS[kind] || ERRORS.generic;
  const home = h('a', { class: 'btn btn--ghost', attrs: { href: '#/' } }, tc('goHome'));
  try {
    return h(
      'div',
      { class: 'screen screen--nobar' },
      topBar({ back: null, end: langToggle() }),
      h('div', { class: 'stack stack--16' }, pageHeader({ title: tc(titleKey) }), emptyState({ icon: 'alert-circle', text: tc(bodyKey), action: home })),
    );
  } catch {
    // Shared components unavailable: plain markup still gets the message across.
    return h(
      'div',
      { class: 'screen screen--nobar' },
      h('h1', { attrs: { tabindex: '-1' } }, tc(titleKey)),
      h('p', {}, tc(bodyKey)),
      home,
    );
  }
}

const errorResult = (kind) => ({ node: errorScreen(kind), title: tc((ERRORS[kind] || ERRORS.generic)[0]) });
const codecKind = (err) => (err instanceof CodecError ? err.code : 'corrupt');

// ---- render loop ----

function focusAfterNavigation() {
  window.scrollTo(0, 0);
  app.querySelector('h1[tabindex="-1"]')?.focus({ preventScroll: true });
}

// After an in-place re-render, put focus back on the "same" control if it still exists.
function focusKey() {
  const el = document.activeElement;
  if (!el || el === document.body || !app.contains(el)) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const label = el.getAttribute('aria-label');
  return label ? `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(label)}"]` : null;
}

async function buildScreen(route, state) {
  const ctx = {
    params: route.params,
    list: null,
    state,
    nav,
    rerender: () => render({ navigated: false }),
  };

  if (route.params.payload !== undefined) {
    try {
      ctx.list = await decodeOnce(route.params.payload);
    } catch (err) {
      return errorResult(codecKind(err));
    }
  }

  let mod;
  try {
    mod = await VIEWS[route.view]();
  } catch {
    return errorResult('load');
  }

  try {
    const node = await mod.render(ctx);
    return { node, title: screenName(route, ctx.list) };
  } catch (err) {
    console.error(err);
    return errorResult('generic');
  }
}

async function render({ navigated }) {
  const ticket = ++renderCount;
  const route = parseRoute(location.hash);
  const refocus = navigated ? null : focusKey();
  const { node, title } = await buildScreen(route, screenState());
  if (ticket !== renderCount) return; // a newer navigation won

  app.replaceChildren(node);
  setTitle(title);
  if (navigated) focusAfterNavigation();
  else if (refocus) app.querySelector(refocus)?.focus({ preventScroll: true });
}

/** Navigates to a hash, or re-renders when it is already current. */
function nav(hash) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (location.hash === target || (target === '#/' && !location.hash)) render({ navigated: true });
  else location.hash = target;
}

// ---- boot ----

document.documentElement.lang = getLang();
window.addEventListener('hashchange', () => render({ navigated: true }));
window.addEventListener('jk:lang', () => render({ navigated: false }));
render({ navigated: false });
