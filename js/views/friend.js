// Friend view (#d=<payload>): what the group sees after opening a shared link.
// Phones: one place card at a time, with ‹ › buttons and dots, swipe and arrow keys. The card's
// head (cover, address, hours) sticks under the top bar while the rest scrolls, and a one-time
// hint says there's more below.
// Wide screens: every card in a column you scroll through (one card per stop, from anywhere on
// the page), with the places listed on the left and ˄ 2 / 5 ˅ above; both follow the scrolling.
// The current card lives in the hash as '&i=' (replaceState), so a reload or Back returns to it.
import { h, icon, toast, copyWithToast, shareOrCopy } from '../ui.js';
import {
  topBar,
  iconButton,
  cover,
  placeMetaLines,
  facilitiesList,
  noteBlock,
  menuButton,
  sendButton,
  ghostRow,
  emptyState,
  bottomBar,
  placesLabel,
  listRow,
  placeTile,
  placeRowMeta,
} from '../components.js';
import { getLang, t, tc } from '../i18n.js';
import { SAMPLE_ID, colorHex } from '../data.js';
import { getList, importList, storageOk, savedToDevice } from '../store.js';
import { waLink, placeMessage, isSafeMapsUrl } from '../links.js';
import * as routes from '../routes.js';

const S = {
  id: {
    cards: 'Kartu tempat',
    places: 'Daftar tempat',
    card: '{name}, {i} dari {n}',
    next: 'Tempat berikutnya',
    previous: 'Tempat sebelumnya',
    scrollHint: 'Scroll ke bawah buat lihat fasilitas & catatan',
    scrollPlaces: 'Scroll buat pindah tempat',
    dots: 'Pilih tempat',
    dot: 'Tempat {i}: {name}',
    random: 'Terserah!',
    compare: 'Bandingin',
    toastCopied: 'Teks disalin, tinggal tempel di grup',
    toastCopyFailed: 'Teksnya gagal disalin, coba lagi ya',
    preview: 'Ini tampilan teman',
    backToEdit: 'Balik ngedit',
    save: 'Simpan ke HP ini',
    toastSaved: 'Daftar disimpan di HP ini',
    onPhone: 'Daftar ini udah ada di HP ini.',
    open: 'Buka',
    empty: 'Daftar ini belum ada tempatnya. Coba tanya yang ngirim link-nya ya.',
    emptyOwn: 'Daftar ini belum ada tempatnya. Tambahin dulu, baru bagikan ya.',
    madeWith: 'Dibuat pakai {app}',
  },
  en: {
    cards: 'Place cards',
    places: 'Places',
    card: '{name}, {i} of {n}',
    next: 'Next place',
    previous: 'Previous place',
    scrollHint: 'Scroll down for perks & notes',
    scrollPlaces: 'Scroll to browse places',
    dots: 'Choose a place',
    dot: 'Place {i}: {name}',
    random: 'Surprise me',
    compare: 'Compare',
    toastCopied: 'Text copied. Paste it in the group chat.',
    toastCopyFailed: "Couldn't copy the text. Try again.",
    preview: 'This is what friends see',
    backToEdit: 'Back to editing',
    save: 'Save to this phone',
    toastSaved: 'List saved on this phone',
    onPhone: 'This list is saved on this phone.',
    open: 'Open',
    empty: "This list doesn't have any places yet. Try asking whoever sent the link.",
    emptyOwn: "This list doesn't have any places yet. Add some before you share it.",
    madeWith: 'Made with {app}',
  },
};

const SWIPE_PX = 40;
const ARROW_STEPS = { ArrowLeft: -1, ArrowRight: 1 };
const COMPACT_SHRINK = 88; // px the cover loses when the head is stuck (176 → 88, see .placecard__head)
const HINT_KEY = 'jk.hint.scroll';
const HINT_DELAY_MS = 700;
const HINT_SHOW_MS = 6000;
const WHEEL_STEP_PX = 30; // how far a wheel must turn beside the cards before it moves one place
const WHEEL_QUIET_MS = 180; // a pause this long ends one wheel or touchpad gesture

// ---- card index in the hash ----

/** The card index saved in the hash ('&i='), or 0 when missing or out of range. */
function savedIndex(params, total) {
  const n = Number(params.i);
  return Number.isInteger(n) && n >= 0 && n < total ? n : 0;
}

/** Keeps the current card in this history entry without a hashchange (so no re-render). */
function rememberIndex({ payload, from }, index) {
  // A late call (a scroll that ends after the user left) must not rewrite another screen's address.
  const { view, params } = routes.parseRoute(location.hash);
  if (view !== 'friend' || params.payload !== payload) return;
  try {
    history.replaceState(history.state, '', routes.friend(payload, { from, i: index || null }));
  } catch {
    // History is locked down in some embedded browsers; the card still changes.
  }
}

// ---- pieces ----

/** List name (the screen h1, styled for the bar) and "dari Rani · 5 tempat". */
function listHeading(list) {
  const count = placesLabel(list.places.length);
  const caption = list.from ? `${tc('fromName', { name: list.from })} · ${count}` : count;
  return h(
    'div',
    { class: 'topbar__heading' },
    h('h1', { class: 'topbar__name', attrs: { tabindex: '-1' } }, list.title || tc('untitled')),
    h('p', { class: 'topbar__caption' }, caption),
  );
}

/** Shown when the coordinator previews their own list: a way back to the editor. */
function previewNote(listId) {
  return h(
    'div',
    { class: 'note mt-8' },
    icon('eye', { size: 16 }),
    h(
      'p',
      { class: 'note__body split' },
      h('span', {}, t(S, 'preview')),
      h('a', { class: 'link link--hit', attrs: { href: routes.list(listId) } }, t(S, 'backToEdit')),
    ),
  );
}

function placeCard(place, { index, total, from }) {
  const message = placeMessage(place, getLang());
  const meta = placeMetaLines(place);
  const facilities = facilitiesList(place);
  const maps = isSafeMapsUrl(place.maps) ? place.maps : '';
  const toasts = { done: t(S, 'toastCopied'), failed: t(S, 'toastCopyFailed') };

  return h(
    'article',
    {
      class: 'placecard',
      attrs: { tabindex: '-1', 'aria-label': t(S, 'card', { name: place.name, i: index + 1, n: total }) },
    },
    h('div', { class: 'placecard__sentinel', attrs: { 'aria-hidden': 'true' } }),
    h('div', { class: 'placecard__head' }, cover(place), meta && h('div', { class: 'placecard__meta' }, meta)),
    h(
      'div',
      { class: 'placecard__body' },
      facilities && [h('h3', { class: 'placecard__heading' }, tc('perksTitle')), facilities],
      noteBlock(place, from),
      menuButton(place.menu),
      sendButton({ href: waLink(message), label: tc('discuss'), size: 'md' }),
      ghostRow([
        maps && { icon: 'map-pin', label: tc('mapsShort'), ariaLabel: tc('openMaps'), href: maps },
        {
          icon: 'copy',
          label: tc('copyShort'),
          ariaLabel: tc('copyText'),
          onClick: () => copyWithToast(message, toasts),
        },
        { icon: 'share', label: tc('share'), onClick: () => shareOrCopy(message, toasts) },
      ]),
    ),
  );
}

/** Calls onSwipe(1) on a left swipe and onSwipe(-1) on a right one. Vertical drags stay page scrolls. */
function onHorizontalSwipe(el, onSwipe) {
  let start = null;
  el.addEventListener('pointerdown', (event) => {
    // A second finger (pinch) or a non-primary mouse button cancels the gesture.
    start = event.isPrimary && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  el.addEventListener('pointercancel', () => {
    start = null;
  });
  el.addEventListener('pointerup', (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    if (event.pointerType === 'mouse') swallowNextClick(el);
    onSwipe(dx < 0 ? 1 : -1);
  });
}

// A mouse drag that ends on a control inside the card would also click it.
function swallowNextClick(el) {
  const swallow = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  el.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0);
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** After a card change, scrolls back up to the new cover if the page was scrolled past it. */
function revealCard(carousel) {
  const bar = document.querySelector('.topbar');
  const top = carousel.getBoundingClientRect().top - (bar ? bar.getBoundingClientRect().height : 0);
  if (top < 0) window.scrollBy({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

// ---- sticky head ----

let stickWatch = null; // the IntersectionObserver of the card on screen

/**
 * Marks the card's head .is-stuck (compact cover) once it sticks under the top bar. Compacting
 * shortens the page, so it only happens when there's enough scroll room left to stay stuck;
 * otherwise a short card would bounce between the two sizes.
 */
function watchStick(card) {
  stickWatch?.disconnect();
  stickWatch = null;
  const sentinel = card.querySelector('.placecard__sentinel');
  const head = card.querySelector('.placecard__head');
  if (!sentinel || !head || !('IntersectionObserver' in window)) return;

  const bar = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 56;
  stickWatch = new IntersectionObserver(
    ([entry]) => {
      const passed = !entry.isIntersecting && entry.boundingClientRect.top < bar;
      if (!passed) {
        head.classList.remove('is-stuck');
        return;
      }
      // Only a head that really sticks shrinks: wide and very short screens keep it in the flow.
      if (head.classList.contains('is-stuck') || getComputedStyle(head).position !== 'sticky') return;
      const page = document.documentElement;
      const room = page.scrollHeight - COMPACT_SHRINK - innerHeight - (scrollY + entry.boundingClientRect.top - bar);
      if (room > 24) head.classList.add('is-stuck');
    },
    { rootMargin: `-${bar}px 0px 0px 0px`, threshold: 0 },
  );
  stickWatch.observe(sentinel);
}

// ---- "scroll for more" hint ----

let hintShown = false; // per page load, for browsers without sessionStorage

function hintSeen() {
  try {
    return hintShown || sessionStorage.getItem(HINT_KEY) === '1';
  } catch {
    return hintShown;
  }
}

function markHintSeen() {
  hintShown = true;
  try {
    sessionStorage.setItem(HINT_KEY, '1');
  } catch {
    // Not remembering is fine: it shows once per page load instead.
  }
}

/**
 * Once per visit, when the card's actions are below the screen and the page hasn't been scrolled,
 * a small pill says there's more below. It fades on the first scroll or after a few seconds.
 * Purely visual (aria-hidden): screen readers reach the content anyway.
 */
function scrollHint(card) {
  const hint = h(
    'div',
    { class: 'scroll-hint', attrs: { 'aria-hidden': 'true' } },
    icon('arrow-down', { size: 16 }),
    h('span', {}, t(S, 'scrollHint')),
  );
  if (hintSeen()) return hint;

  const hide = () => {
    hint.classList.remove('is-visible');
    removeEventListener('scroll', onScroll);
  };
  const onScroll = () => {
    if (scrollY > 24) hide();
  };
  setTimeout(() => {
    if (!hint.isConnected || hintSeen() || scrollY > 24) return;
    const actions = card.isConnected ? card.querySelector('.ghost-row') : null;
    const bar = document.querySelector('.bottom-bar')?.getBoundingClientRect().height ?? 0;
    if (!actions || actions.getBoundingClientRect().bottom <= innerHeight - bar) return; // all visible
    markHintSeen();
    hint.classList.add('is-visible');
    addEventListener('scroll', onScroll, { passive: true });
    setTimeout(hide, HINT_SHOW_MS);
  }, HINT_DELAY_MS);
  return hint;
}

/** The card carousel, its dots and a polite status line. Returns the nodes to place in the screen. */
function placeBrowser(list, params) {
  const { places, from } = list;
  const total = places.length;
  let index = savedIndex(params, total);
  let card = placeCard(places[index], { index, total, from });
  const carousel = h('section', { class: 'carousel carousel--swipe', attrs: { 'aria-label': t(S, 'cards') } }, card);

  const dots = places.map((place, i) =>
    h('button', {
      class: 'dot',
      attrs: { type: 'button', 'aria-label': t(S, 'dot', { i: i + 1, name: place.name }), 'aria-current': i === index },
      on: { click: () => go(i) },
    }),
  );
  const status = h('p', { class: 'visually-hidden', attrs: { role: 'status' } });

  function go(next) {
    const focusWasInCard = card.contains(document.activeElement);
    index = ((next % total) + total) % total;

    const fresh = placeCard(places[index], { index, total, from });
    card.replaceWith(fresh);
    card = fresh;
    watchStick(card);
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));

    rememberIndex(params, index);
    revealCard(carousel);
    // Focus follows a card that was in use (arrow keys); otherwise announce the change.
    if (focusWasInCard) card.focus({ preventScroll: true });
    else status.textContent = fresh.getAttribute('aria-label');
  }

  if (total > 1) {
    onHorizontalSwipe(carousel, (step) => go(index + step));
    carousel.addEventListener('keydown', (event) => {
      const step = ARROW_STEPS[event.key];
      if (!step || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      go(index + step);
    });
  }

  // The head can only be watched once the card is in the page.
  requestAnimationFrame(() => card.isConnected && watchStick(card));

  const prev = () => iconButton({ icon: 'chevron-left', label: t(S, 'previous'), onClick: () => go(index - 1) });
  const next = () => iconButton({ icon: 'chevron-right', label: t(S, 'next'), onClick: () => go(index + 1) });

  // ‹ dots › under the card.
  const nav =
    total > 1 &&
    h('div', { class: 'dots-nav' }, prev(), h('div', { class: 'dots', attrs: { role: 'group', 'aria-label': t(S, 'dots') } }, dots), next());

  return { main: [carousel, nav, status, scrollHint(card)], list: null, pager: null };
}

// ---- wide screens: scroll through the cards ----

/** The places as rows (little ticket stubs) beside the cards. */
function placePicks(places, index, onPick) {
  const rows = places.map((place, i) =>
    listRow({ tile: placeTile(place), title: place.name, meta: placeRowMeta(place), current: i === index, onClick: () => onPick(i) }),
  );
  const buttons = rows.map((row) => row.querySelector('.row__main'));
  const node = h(
    'nav',
    { class: 'place-picks', attrs: { 'aria-label': t(S, 'places') } },
    h('ul', { class: 'list-surface', attrs: { role: 'list' } }, rows),
  );
  const setCurrent = (current) =>
    buttons.forEach((button, i) => {
      if (i === current) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  return { node, setCurrent };
}

/** True when something under the pointer (or the page itself) can still scroll that way. */
function scrollsItself(target, dy) {
  const canMove = (el, height) => (dy < 0 ? el.scrollTop > 0 : el.scrollTop + height < el.scrollHeight - 1);
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1 && canMove(el, el.clientHeight)) {
      return true;
    }
  }
  return canMove(document.scrollingElement, innerHeight);
}

/**
 * Every card in one scrolling column; each card fills it and snaps into place, so a scroll is
 * "next place". A wheel or touchpad scroll over the space around the column moves it too, and a
 * soft glow in the current place's colour follows along. The list on the left, ˄ 2 / 5 ˅ and
 * '&i=' follow whichever card is in view.
 */
function placeStack(list, params) {
  const { places, from } = list;
  const total = places.length;
  let index = savedIndex(params, total);
  let shown = -1;
  let heading = null; // the card a ˄ ˅ or list click is scrolling to; the cards passed on the way don't count
  let headingTimer = 0;

  const cards = places.map((place, i) => placeCard(place, { index: i, total, from }));
  // Each card sits in a slot that does the snapping, so the card itself is free to animate.
  const slots = cards.map((card) => h('div', { class: 'card-slot' }, card));
  const stack = h('section', { class: 'card-stack', attrs: { 'aria-label': t(S, 'cards') } }, slots);
  const glow = h('div', { class: 'place-glow', attrs: { 'aria-hidden': 'true' } });
  const picks = placePicks(places, index, (i) => show(i));
  const counter = h('span', { class: 'pager__count', attrs: { 'aria-hidden': 'true' } });
  const status = h('p', { class: 'visually-hidden', attrs: { role: 'status' } });

  function setCurrent(i, announce) {
    if (i === shown) return;
    shown = i;
    index = i;
    counter.textContent = `${index + 1} / ${total}`;
    picks.setCurrent(index);
    glow.style.setProperty('--glow', colorHex(places[index].color));
    rememberIndex(params, index);
    if (announce) status.textContent = cards[index].getAttribute('aria-label');
  }

  /** The card nearest the top of the column. */
  function cardInView() {
    const top = stack.scrollTop + stack.clientHeight / 3;
    let nearest = 0;
    slots.forEach((slot, i) => {
      if (slot.offsetTop <= top) nearest = i;
    });
    return nearest;
  }

  /** Once a scroll is over (or cut short), the list and counter follow wherever the column stopped. */
  function settle() {
    heading = null;
    clearTimeout(headingTimer);
    if (!stack.isConnected) return; // the screen was left mid-scroll
    setCurrent(cardInView(), false);
  }

  /** Scrolls card i into place (wrapping around at either end). */
  function show(i) {
    const next = ((i % total) + total) % total;
    heading = next;
    clearTimeout(headingTimer);
    headingTimer = setTimeout(settle, 1500); // browsers without 'scrollend'
    stack.scrollTo({ top: slots[next].offsetTop, behavior: reducedMotion() ? 'auto' : 'smooth' });
    setCurrent(next, true);
  }

  // A wheel turned over the space around the column: one place per turn. A touchpad keeps
  // sending (smaller) events after the flick, so the next step waits for a short quiet spell.
  let wheelBusy = false;
  let wheelSum = 0;
  let wheelQuiet = 0;
  function onWheel(event) {
    if (!stack.isConnected) {
      removeEventListener('wheel', onWheel);
      return;
    }
    if (event.ctrlKey || stack.contains(event.target) || document.body.classList.contains('has-sheet')) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    const dy = event.deltaY * unit;
    if (Math.abs(dy) <= Math.abs(event.deltaX * unit) || scrollsItself(event.target, dy)) return;

    event.preventDefault();
    clearTimeout(wheelQuiet);
    wheelQuiet = setTimeout(() => {
      wheelBusy = false;
      wheelSum = 0;
    }, WHEEL_QUIET_MS);
    if (wheelBusy) return;
    wheelSum += dy;
    if (Math.abs(wheelSum) < WHEEL_STEP_PX) return;
    wheelBusy = true;
    const next = index + Math.sign(wheelSum);
    if (next >= 0 && next < total) show(next);
  }
  addEventListener('wheel', onWheel, { passive: false });
  // Leaving for another screen: let go of the page-wide wheel listener and any pending settle.
  addEventListener(
    'hashchange',
    () => {
      removeEventListener('wheel', onWheel);
      clearTimeout(headingTimer);
      clearTimeout(wheelQuiet);
    },
    { once: true },
  );

  let ticking = false;
  stack.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const nearest = cardInView();
        if (heading === null) setCurrent(nearest, false);
        else if (nearest === heading) settle();
      });
    },
    { passive: true },
  );
  stack.addEventListener('scrollend', settle);
  stack.addEventListener('keydown', (event) => {
    const step = ARROW_STEPS[event.key];
    if (!step || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    show(index + step);
  });

  const pager =
    total > 1 &&
    h(
      'div',
      { class: 'pager' },
      iconButton({ icon: 'chevron-up', label: t(S, 'previous'), onClick: () => show(index - 1) }),
      counter,
      iconButton({ icon: 'chevron-down', label: t(S, 'next'), onClick: () => show(index + 1) }),
    );

  setCurrent(index, false);
  // Start on the remembered card once the column is in the page.
  requestAnimationFrame(() => stack.isConnected && stack.scrollTo({ top: slots[index].offsetTop }));

  return { main: [glow, stack, status], list: picks.node, pager };
}

// Crossing the wide-screen breakpoint (window resized) re-renders the view in the other mode.
const WIDE = '(min-width: 960px)';
let breakpointWatch = null;

function watchBreakpoint(ctx) {
  const query = matchMedia(WIDE);
  if (breakpointWatch) breakpointWatch.query.removeEventListener('change', breakpointWatch.onChange);
  const onChange = () => {
    if (document.querySelector('.screen--friend')) ctx.rerender();
    else query.removeEventListener('change', onChange);
  };
  query.addEventListener('change', onChange);
  breakpointWatch = { query, onChange };
}

/** "Simpan ke HP ini" for a list this phone doesn't have yet; afterwards (or if it has it) a link to open it. */
function saveArea(list) {
  const area = h('div', { class: 'center-row mt-8' });

  const showOpen = (id) => {
    const open = h('a', { class: 'link link--hit', attrs: { href: routes.list(id) } }, t(S, 'open'));
    area.replaceChildren(
      h('p', { class: 'hint hint--center' }, icon('check', { size: 14 }), h('span', {}, t(S, 'onPhone')), open),
    );
    return open;
  };

  const save = () => {
    if (!storageOk()) {
      toast(tc('errStorage'), { icon: 'alert-circle' });
      return;
    }
    // importList gives the example a fresh id: its fixed id is the same on every device.
    const { list: saved } = importList(list);
    if (!savedToDevice()) return; // the "not saved" banner says why
    toast(t(S, 'toastSaved'));
    showOpen(saved.id).focus();
  };

  // A list already on this phone may be newer than the link (the coordinator's own), so never overwrite it here.
  // The example is never "already on this phone": each saved copy has its own id (an old 'sample01' copy is ignored).
  if (list.id !== SAMPLE_ID && getList(list.id)) showOpen(list.id);
  else {
    area.append(
      h(
        'button',
        { class: 'btn btn--ghost', attrs: { type: 'button' }, on: { click: save } },
        icon('device-mobile', { size: 16 }),
        h('span', {}, t(S, 'save')),
      ),
    );
  }
  return area;
}

function emptyView(ownList) {
  const action =
    ownList &&
    h(
      'a',
      { class: 'btn btn--ghost', attrs: { href: routes.place(ownList.id, 'new') } },
      icon('plus', { size: 16 }),
      h('span', {}, tc('addPlace')),
    );
  return emptyState({ icon: 'map-pin', text: t(S, ownList ? 'emptyOwn' : 'empty'), action });
}

/** "Dibuat pakai Jadi Kemana?": the page without the hash, i.e. a fresh start of the app. */
function credit() {
  return h(
    'footer',
    { class: 'center text-small mt-24' },
    h('a', { class: 'link link--hit', attrs: { href: location.pathname } }, t(S, 'madeWith', { app: tc('appName') })),
  );
}

/** "Terserah!" and "Bandingin" (from 2 places). */
function friendActions({ payload, from }, total) {
  const action = (v, name, key) =>
    h(
      'a',
      { class: 'btn btn--secondary', attrs: { href: routes.friend(payload, { from, v }) } },
      icon(name, { size: 16 }),
      h('span', {}, t(S, key)),
    );
  return [action('random', 'arrows-shuffle', 'random'), total >= 2 && action('compare', 'columns-2', 'compare')];
}

/** Phones: the actions in the bottom bar. */
const friendBar = (params, total) => bottomBar(h('div', { class: 'bottom-bar__row' }, friendActions(params, total)));

/** Wide screens: ˄ 2 / 5 ˅, a scroll hint and the actions in one row above the cards. */
const friendToolbar = (pager, params, total) =>
  h(
    'div',
    { class: 'friend-toolbar' },
    h(
      'div',
      { class: 'friend-toolbar__nav' },
      pager,
      total > 1 && h('span', { class: 'friend-toolbar__hint' }, icon('arrow-down', { size: 14 }), t(S, 'scrollPlaces')),
    ),
    h('div', { class: 'friend-toolbar__actions' }, friendActions(params, total)),
  );

// ---- view ----

export async function render(ctx) {
  const { list, params } = ctx;
  const ownList = params.from ? getList(params.from) : null;
  const total = list.places.length;

  if (!total) {
    return h(
      'div',
      { class: 'screen screen--friend screen--nobar' },
      topBar({ start: listHeading(list) }),
      ownList && previewNote(ownList.id),
      emptyView(ownList),
      credit(),
    );
  }

  // Phones: one column in this order, one card at a time, actions in the bottom bar. Wide screens:
  // the aside (the place list) sits left of a toolbar (˄ 2 / 5 ˅, actions) over a column of cards
  // you scroll through.
  const wide = matchMedia(WIDE).matches;
  const browser = wide ? placeStack(list, params) : placeBrowser(list, params);
  watchBreakpoint(ctx);
  return h(
    'div',
    { class: 'screen screen--friend layout layout--aside-start' },
    topBar({ start: listHeading(list) }),
    h(
      'div',
      { class: 'l-main' },
      ownList && previewNote(ownList.id),
      wide && friendToolbar(browser.pager, params, total),
      browser.main,
    ),
    h(
      'div',
      { class: 'l-aside' },
      browser.list,
      !wide && friendBar(params, total),
      !ownList && storageOk() && saveArea(list),
      credit(),
    ),
  );
}
