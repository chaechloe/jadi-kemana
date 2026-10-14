# Architecture

Jadi Kemana? is a static web app: plain HTML, CSS and JavaScript ES modules. There is no framework, no build step and no runtime dependencies. It runs on any static host; GitHub Pages is the reference host.

```
index.html              app shell (meta, CSP, fonts, #app, #toast)
css/tokens.css          design tokens (:root custom properties)
css/app.css             every component class (the only stylesheet views rely on)
assets/fonts/*.woff2    self-hosted Fredoka + Plus Jakarta Sans (OFL)
assets/icons/logo.svg   favicon / brand mark
js/main.js              boot, hash router, render loop
js/ui.js                DOM helpers: h(), icon(), toast(), sheets, clipboard, share
js/components.js        shared visual components (tile, ticket, cover, lang toggle, top bar…)
js/icons.js             Tabler icon paths (MIT), static strings only
js/i18n.js              language state, COMMON strings, formatting helpers
js/data.js              perk vocabulary, colours, emoji, limits, sample list, ids
js/store.js             lists in localStorage
js/codec.js             list <-> URL fragment payload
js/links.js             WhatsApp/LINE/Telegram links, message templates, Maps parsing
js/geo.js               approximate address from OpenStreetMap Nominatim
js/views/*.js           one module per screen
tests/*.test.mjs        `node --test "tests/*.test.mjs"` (pure modules only)
tools/serve.mjs         zero-dependency local server: `node tools/serve.mjs 8080`
```

## Rules every module follows

1. **No HTML strings with data.** Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`. Build DOM with `h()`. Text always goes in as text nodes. The one exception is `icon()`, which parses the static strings in `icons.js`.
2. **No inline style strings.** `h()` takes `style` as an object and applies it with `el.style.setProperty` (CSP-safe). Views use classes from `app.css`. Inline style is only for the per-place colour (`{'--place': hex}`) and truly dynamic values such as a meter width.
3. **Treat every decoded or stored list as untrusted.** It goes through `codec.sanitizeList()`. External links must pass `links.isSafeMapsUrl()` and open with `target="_blank" rel="noopener"`.
4. **All visible copy is bilingual.** Each view declares `const S = { id: {…}, en: {…} }` with identical keys, and reads strings through `t(S, key, vars)`. Shared labels live in `i18n.COMMON`. User-typed content (names, notes, custom perks, list titles) is never translated.
5. **Accessibility.**
   - Use real `<button type="button">`, `<a href>`, and `<label for>` + `<input id>`.
   - Icon-only controls get an `aria-label`. Toggles get `aria-pressed`, and the current item gets `aria-current`.
   - Touch targets are at least 44px.
   - After navigation, focus moves to the screen's `h1` (`tabindex="-1"`).
   - Respect `prefers-reduced-motion`.
6. **Storage can fail** (private mode, quota, iOS eviction). Wrap every `localStorage` access in try/catch. The app must still work, read-only, from a shared link.
7. **Errors are friendly and never block.** Example: a bad link shows "Link-nya rusak atau kepotong" (the link is broken or cut off) with a way back.

## Data model

```js
List  = { id, title, from, places: Place[], createdAt, updatedAt, sharedAt /* number|null */ }
Place = {
  id,            // 8-char id, stable
  name,          // ≤ 80
  emoji,         // one of data.EMOJIS (or any single emoji from a link)
  color,         // key from data.COLORS: orange purple red brown indigo olive teal plum
  address,       // ≤ 160, may be ''
  hours,         // '' | 'open24' | free text ≤ 40 (e.g. '09.00–22.00')
  rating,        // number 0.1–5 with 1 decimal, or null (0 can't be encoded: ratingX10 0 = none)
  ratingCount,   // '' or digits as typed, e.g. '1146'
  perks,         // array of data.PERKS codes
  custom,        // ≤ 5 free-text perks, each ≤ 30
  note,          // ≤ 200, may be ''
  maps,          // '' or a URL that passes isSafeMapsUrl()
}
```

"Changed since shared" means `sharedAt !== null && updatedAt > sharedAt`.

## Link payload (codec v1)

- **Shared link:** `<base>#d=<payload>`. The fragment is never sent to the server.
- **Payload** = `'1'` (version) + mode + data. Mode is either:
  - `'z'`: base64url(deflate-raw(UTF-8 JSON)), which needs `CompressionStream`; or
  - `'j'`: base64url(UTF-8 JSON), the fallback.
- **JSON is positional, to keep links short:**
  ```
  [1, listId, title, from, [ place, … ]]
  place = [name, emoji, colorIndex, address, hours, ratingX10 /*0 = none*/, ratingCount,
           perksBitmask /*bit i = PERKS[i]*/, custom[], note, maps]
  ```
  `maps` is compacted: `https://maps.app.goo.gl/<id>` → `~<id>`.
- **Order is part of the format.** The order of `data.PERKS` and `data.COLORS` must never change; only append.
- **Decoding** validates types, truncates to `data.LIMITS`, drops unsafe URLs, caps places at `LIMITS.places`, and gives places fresh ids.

## Router (`main.js`)

| hash | view |
|---|---|
| `''` or `#/` | `views/welcome.js` |
| `#/list/<id>` | `views/editor.js` |
| `#/list/<id>/place/new` | `views/place-form.js` (add) |
| `#/list/<id>/place/<pid>` | `views/place-form.js` (edit) |
| `#/list/<id>/share` | `views/share.js` |
| `#d=<payload>` | `views/friend.js` |
| `#d=<payload>&v=compare` | `views/compare.js` |
| `#d=<payload>&v=random` | `views/random.js` |

`&from=<listId>` may be appended to a `#d=` hash when the coordinator opens "Preview as a friend". The friend views then show a "Back to editing" link.

**View contract:**

```js
// js/views/<name>.js
export async function render(ctx) { /* return an HTMLElement */ }
// ctx = {
//   params,        // route params: { id, pid, payload, v, from }
//   list,          // friend/compare/random: the decoded list (memoized per payload)
//   nav(hash),     // set location.hash
//   rerender(),    // re-run render() for the current route (e.g. after a store change)
// }
```

**Re-rendering:**
- `main.js` replaces `#app`'s child on `hashchange` and on the `jk:lang` event.
- Views must not re-render on every keystroke. While typing, they update the model and patch the specific nodes that change (e.g. the live preview).

## Module APIs

### `ui.js`

```js
h(tag, props?, ...children)
  // props: { class, id, style:{}, attrs:{}, on:{event: fn}, text, dataset:{} }
  // children: Node | string | number | null | false | array (null/false are skipped)
icon(name, { size = 20, stroke } = {}) → SVGElement   // aria-hidden, from icons.js
toast(message)                       // polite live region, 2.4 s
openSheet(content, { label, onClose }) → close()   // bottom sheet + scrim, focus trap, Esc, restores focus
copyText(text) → Promise<boolean>    // clipboard API, falls back to a hidden textarea + execCommand
shareText(text) → Promise<'shared'|'cancelled'|'unsupported'>  // navigator.share({ text }), synchronous call in the click
```

### `components.js` (visual building blocks shared across views)

```js
langToggle({ band = false })                  // ID/EN segmented control, calls setLang()
topBar({ back /*hash|null*/, backLabel, start /*node*/, end /*node*/, band = false })
pageHeader({ title, meta /*string|node*/, metaIcon, action /*node*/ })  // h1 tabindex=-1
placeTile(place, { size = 40 })               // rounded-square tile, place colour + emoji
cover(place)                                  // Friend card cover band
ticket(place, { size: 's'|'m'|'l', notchBg }) // signature ticket
placeMetaLines(place)                         // address + hours lines (icons, missing-hours link)
facilitiesList(place)                         // 2-col icon + label list (perks + custom)
ratingChip(place)                             // star + value + (count)
noteBlock(place, from)                        // brand-soft note with initial avatar
sendButton({ href, label, size: 'lg'|'md' })  // green Send pill <a>
ghostRow(items /*[{icon,label,onClick|href,ariaLabel}]*/) // equal ghost buttons with dividers
emptyState({ icon, text, action })
```

### `i18n.js`

```js
getLang() → 'id'|'en'        // saved choice > navigator language ('en*' → en) > 'id'
setLang(lang)                // persists, sets <html lang>, dispatches window 'jk:lang'
t(dict, key, vars?)          // dict[lang][key] ?? dict.id[key]; replaces {var}
tc(key, vars?)               // t(COMMON, …)
COMMON                       // fixed labels, perk labels, colour names, list/place words
formatHours(hours, lang)     // '' → null; 'open24' → label; '09.00–22.00' (id) ↔ '09:00–22:00' (en)
formatRating(rating, count, lang) → '4.9 (1.146)' | '4.9' | null
relativeTime(ts, lang)       // 'diubah hari ini' / 'edited 2 days ago'
```

### `data.js`

```js
PERKS   // [{ code, icon }] in fixed order: wifi plug ac outdoor prayer parking open24 smoking meeting cheap
COLORS  // [{ key, hex }] in fixed order: orange purple red brown indigo olive teal plum
EMOJIS  // ['🛋️','☕','🍩','🫖','🍜','🍰','📚','🌿']
LIMITS  // { places: 20, title: 60, from: 30, name: 80, address: 160, hours: 40, note: 200, custom: 5, customLen: 30 }
newId() → 8-char base36 id
colorHex(key) → hex
sampleList(lang) → List    // the 5 Bandung cafes ("See an example")
```

### `store.js`

```js
getLists() → List[]   // newest first
getList(id) → List|null
createList({ title, from }) → List
saveList(list, { touch = true })   // touch=false keeps updatedAt
deleteList(id)
upsertPlace(listId, place)  removePlace(listId, placeId)  movePlace(listId, fromIndex, toIndex)
markShared(listId)
importList(list) → { list, existed }   // same id → replace
storageOk() → boolean
```

### `codec.js`

```js
encodeList(list) → Promise<string>      // payload
decodeList(payload) → Promise<List>     // throws CodecError(code: 'version'|'corrupt'|'unsupported')
sanitizeList(obj) → List
listUrl(payload, base = location.origin + location.pathname) → string
```

### `links.js`

```js
waLink(text)                       // 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text). Never wa.me.
lineLink(text)  telegramLink(url, text)
placeMessage(place, lang)  randomMessage(place, lang)  compareMessage(a, b, lang)  listMessage(list, url, lang)
isSafeMapsUrl(url) → boolean       // https only; google.com/maps, maps.google.*, maps.app.goo.gl, goo.gl/maps
parseMapsInput(text) → null | { url, short, name, lat, lng, address }
  // full URL: name from /maps/place/<name>/, coords from !3d<lat>!4d<lng> (never @lat,lng)
  // share text: first non-URL line = name, second = address (if present)
  // maps.app.goo.gl link alone: { url, short: true }
```

Message templates (exact):

| message | ID | EN |
|---|---|---|
| place | `*{name}*\n📍 {address}\nKayaknya oke nih, gimana menurut kalian?\n{maps}` | `*{name}*\n📍 {address}\nLooks good, what do you think?\n{maps}` |
| random | `Pada jawab "terserah", yaudah aku yang pilihin: *{name}*!\n📍 {address}\nGas nggak nih?\n{maps}` | `Everyone said "whatever", so I picked: *{name}*!\n📍 {address}\nShall we go?\n{maps}` |
| compare | `*{A}* atau *{B}*? 🤔\n\nA: {addrA}\n{mapsA}\n\nB: {addrB}\n{mapsB}\n\nPilih yang mana nih?` | `*{A}* or *{B}*? 🤔\n\nA: {addrA}\n{mapsA}\n\nB: {addrB}\n{mapsB}\n\nWhich one?` |
| list | `Jadi kemana? 👀 Aku udah kumpulin {n} tempat buat "{title}":\n{link}\nBuka, terus bahas yang kalian suka ya!` | `So, where are we going? 👀 I put together {n} places for "{title}":\n{link}\nOpen it and bring up the ones you like!` |

- Leave out a line whose value is empty (no address, no maps).
- The Maps link must be the first URL in a place message.

### `geo.js`

```js
approxAddress(lat, lng, lang) → Promise<string|null>
// Nominatim /reverse (format=jsonv2, zoom=17, accept-language), 8 s timeout,
// at most 1 request per second, cached in localStorage by rounded coords.
// Data © OpenStreetMap contributors (ODbL); views show the credit when it is used.
```

## CSS class catalogue

Every class lives in `css/app.css`; tokens (`--ink`, `--sp-16`, `--r-24`, `--e1`…) live in `css/tokens.css`. Views never add CSS.

- Naming is `block__element--modifier`. State comes from attributes, not classes: `aria-pressed` (chips, emoji, swatches, ID/EN), `aria-current` (dots, rows), `aria-invalid` (inputs), `disabled`/`aria-disabled` (buttons).
- Place colour: `style: { '--place': colorHex(place.color) }` on `.tile`, `.cover`, `.ticket`, `.cmp-head`, `.swatch`, `.peek__card`, `.bubble`. Ticket notches take `--notch` (set by `ticket()`'s `notchBg`).
- `components.js` also exports `iconButton()`, `listRow()`, `placeOverline()` and `squiggleWord()`; `ui.js` also exports `uid()`, and `icon()` accepts a `class` option.

**Base and layout**
- `.icon`: set on every `icon()` SVG; never shrinks in flex rows.
- `.screen`: the centred 480px column with the 20px gutter and bottom padding for a fixed bar; clips the card peek.
- `.screen--nobar`: smaller bottom padding for screens without a bottom bar.
- `.topbar`: 56px sticky bar on the ground; gets a hairline once the page scrolls (`.is-scrolled`, set by `topBar()`).
- `.topbar--band`: the bar on the brand band: not sticky, white text.
- `.topbar__start`: left group (back button, title or wordmark); a leading `.iconbtn` is pulled to 8px from the edge.
- `.topbar__end`: right group (language toggle).
- `.topbar__title`: inline h2 title in the bar (AddPlace "Tambah tempat").
- `.topbar__heading`: two-line heading block in the bar (Friend).
- `.topbar__name`: list name in the bar (h1 at 16/22).
- `.topbar__caption`: caption under it ("dari Rani · 5 tempat").
- `.wordmark`: "Jadi Kemana?" in Fredoka, orange on ground, white on the band.
- `.page-header`: block under the top bar (8px above).
- `.page-header__row`: h1 plus the trailing 36px tonal action.
- `.page-header__title`: the screen h1 (Fredoka 24/28, `tabindex="-1"`).
- `.page-header__meta`: small ink-2 meta line with a 14px icon.
- `.title-switch`: button inside the Editor h1 that opens the list switcher.
- `.title-switch__text`: its wrapping title text.
- `.section`: a section 24px below the previous block.
- `.section__head`: heading row with an optional action on the right.
- `.section__title`: h2 section heading (18/24).
- `.bottom-bar`: fixed surface bar at the bottom, centred to 480px, safe-area aware.
- `.bottom-bar__row`: two equal buttons side by side in the bar.

**Buttons**
- `.btn`: pill button base (48px, Jakarta 600 15/20, 8px icon gap); add a variant.
- `.btn--primary`: orange fill, white text.
- `.btn--go`: green fill, white text: send/discuss only.
- `.btn--secondary`: `--fill-strong` on ground, `--fill` inside cards, sheets and bars.
- `.btn--ghost`: 44px transparent, orange text, `--fill` on hover.
- `.btn--danger`: danger-soft fill with danger text (confirm sheets).
- `.btn--danger-link`: in-form destructive text link ("Hapus tempat" with `trash` 16).
- `.btn--lg`: 56px hero CTA, Fredoka 18; key edge on primary/go.
- `.btn--md`: 52px send button inside a card, Fredoka 18; key edge on go.
- `.btn--sm`: 40px visual with a 44px hit area ("Ambil info").
- `.btn--block`: full width.
- `.iconbtn`: 44×44 icon-only button (always give it an `aria-label`).
- `.iconbtn--tonal`: 36px filled circle inside the 44px hit area (sheet close, rename).
- `.iconbtn--glass`: 36px light circle for use on covers.
- `.iconbtn--on-color`: white glyph on a place colour or the band.
- `.iconbtn--drag`: ink-3 drag handle (`grip-vertical`).
- `.ghost-row`: row of equal ghost buttons ("Maps · Salin · Bagikan").
- `.ghost-row__btn`: one ghost button in it (14/18, may wrap to two lines).
- `.ghost-row__divider`: 1×20 hairline between them.
- `.link`: inline orange text link, underlined.
- `.link--hit`: grows an inline link to a 44px tall hit area without moving the text.
- `.link--plain`: no underline.
- `.link--on-color`: white link on a place colour.

**Language toggle**
- `.seg`: the ID/EN track (32px, `--fill-strong`).
- `.seg--band`: translucent track on the brand band.
- `.seg__btn`: one 44×44 segment button (`aria-pressed`).
- `.seg__pill`: the visible 26px pill inside it.

**Surfaces and lists**
- `.card`: surface card, r-24, e1, 20px padding.
- `.card--flush`: no padding; sections bring their own.
- `.card__section`: 20px padded section; consecutive sections get a full-bleed hairline.
- `.card__title`: h3 inside a card (16/22).
- `.list-surface`: surface card holding rows with hairlines inset 72px (`ul` with `role="list"`).
- `.list-surface--flat`: the same rows straight on a sheet, full-bleed, hairlines inset 76px.
- `.row`: 64px row (tile, text, trailing control) on `li`, `a` or `button`.
- `.row--add`: 56px "Tambah tempat" / "Daftar baru" row with orange label.
- `.row__main`: the title + meta column.
- `.row__link`: makes `.row__main` a stretched link/button covering the whole row.
- `.row__title`: h3-sized title, one line, truncated.
- `.row__meta`: small ink-2 meta line, truncated; inline icons allowed.
- `.row__trail`: trailing chevron or icon (ink-3).
- `.row__trail--check`: orange check for the current list.
- `.tile`: 40px rounded-square tile in `--place` with the emoji (22px).
- `.tile--32`: 32px tile.
- `.tile--48`: 48px tile.
- `.tile--56`: 56px tile (r-16).
- `.tile--glass`: translucent white tile on a place colour.
- `.tile--fill`: neutral `--fill` tile holding an ink-2 icon.
- `.tile--dashed`: dashed "add" tile with an orange plus.
- `.placeholder-row`: dashed 64px placeholder row for an empty list.
- `.note`: brand-soft note, r-12, leading 16px icon, small text.
- `.note--danger`: danger-soft variant.
- `.note__body`: the note's text column.
- `.note__actions`: ghost buttons under a note's text.
- `.divider`: 1px hairline with 16px above and below (`hr` or `li`).
- `.divider--flush`: no margin.
- `.divider--8`: 8px margin.
- `.hint`: small ink-2 line with a leading 14px icon ("Tersimpan di HP ini…").
- `.hint--center`: centred hint.
- `.empty`: empty state column (32px icon, one line, optional ghost button).
- `.empty__text`: the empty-state line.

**Forms**
- `.field`: one form field; consecutive fields are 20px apart.
- `.field-pair`: two fields side by side (128px + rest: rating + hours).
- `.label`: form label (14/18 600), 8px above the control.
- `.label-row`: label plus a tag or inline hint on one line.
- `.label-row__hint`: inline ink-2 hint after a label ("Pilih yang ada").
- `.tag-maps`: "dari Maps" tag next to a label (remove it once the field is edited).
- `.input-wrap`: positioning wrapper for an input with an icon.
- `.input-wrap--icon`: leading 18px icon 16px from the left (link, star).
- `.input-wrap--select`: trailing `chevron-down` for a `.select`.
- `.input`: 48px filled pill input (16/24) with a focus halo; `--surface` on ground, `--fill` in cards and sheets.
- `.input--num`: tabular numbers (rating, hours).
- `.select`: native select with the input look.
- `.textarea`: textarea with the input look, r-18, min 96px.
- `.helper`: helper text 6px under a control.
- `.helper--error`: danger helper with a leading `alert-circle` 14.
- `.helper-row`: helper text plus a counter on the right.
- `.counter`: character counter.
- `.counter--over`: counter over the limit.
- `.chips`: wrapping chip group (`role="group"` + `aria-labelledby`).
- `.chip`: 40px toggle chip with a 44px hit area; `aria-pressed="true"` shows the selected look.
- `.chip__icon`: the chip's own icon (hidden while pressed).
- `.chip__check`: the check icon (shown while pressed).
- `.chip--dashed`: dashed "+ Lainnya" chip.
- `.chip--sm`: 36px hours-preset chip.
- `.chip--custom`: a custom perk (always shown selected) with a remove button.
- `.chip__remove`: 44px remove button inside `.chip--custom`.
- `.chip-input`: inline input that replaces "+ Lainnya" while typing.
- `.emoji-grid`: 4-column grid of emoji options.
- `.emoji-opt`: 44px emoji button (`aria-pressed`).
- `.swatch-grid`: 4-column grid of colour swatches.
- `.swatch`: 44px button with a 36px `--place` circle; pressed shows an ink ring and its check icon child.

**Place components**
- `.cover`: 176px cover band in `--place` with dots.
- `.cover__emoji`: the 56px emoji tile, top-left.
- `.cover__text`: overline + name block, bottom-left.
- `.cover__overline`: "Lengkong · Bandung".
- `.cover__name`: place name, Fredoka 24, two lines max.
- `.placecard`: the Friend place card (surface, r-24, e1).
- `.placecard__body`: 20px padded body; spaces the note, send button and ghost row.
- `.placecard__heading`: "Fasilitas" h3.
- `.carousel`: the card plus a 12px peek of the next card.
- `.peek`: button showing the next card's edge.
- `.peek__card`: the peeking card; its cover takes `--place`.
- `.meta-lines`: stack of meta lines, 8px apart.
- `.meta-line`: small ink line with a 14px ink-3 icon.
- `.meta-line--ground`: ink-2 icon for use on the ground.
- `.meta-line__text`: the line's text.
- `.meta-line__text--clamp`: two lines max.
- `.facilities`: 2-column icon + label list.
- `.facilities__item`: one facility (18px ink-2 icon, 14/20 text).
- `.rating-chip`: star + value + count pill on a cover.
- `.rating-chip__value`: the value (Jakarta 700, tabular).
- `.rating-chip__count`: the "(1.146)" count.
- `.tag`: 24px static tag ("Buka 24 jam").
- `.tag--on-color`: translucent tag on a place colour.
- `.badge`: 20px neutral pill badge.
- `.badge--brand`: brand-soft badge.
- `.badge--danger`: danger-soft badge.
- `.ticket`: place ticket base (`--place`, dots, notches at 65%).
- `.ticket--s`: 72px live-preview ticket, no perforation.
- `.ticket--m`: 300×112 ticket (Main stack).
- `.ticket--l`: 350×320 ticket (Random).
- `.ticket--tilt`: resting -2° tilt.
- `.ticket--deal`: 280ms deal-in animation (skipped under reduced motion).
- `.ticket__top`: upper part (text and emoji tile).
- `.ticket__text`: overline + name column.
- `.ticket__overline`: "Lengkong · Bandung" at 85% opacity.
- `.ticket__name`: place name in Fredoka (18, 20 or 30 by size).
- `.ticket__bottom`: the part below the perforation.
- `.ticket__facts`: rating and hours group.
- `.ticket__fact`: one fact with a 14px icon.
- `.ticket__value`: rating value (700).
- `.ticket__count`: rating count (500, 85%).
- `.ticket-stack`: Main's fanned stack of three M tickets over the band edge.
- `.go-pill`: 28px green "Bahas tempat ini!" pill for the front ticket.
- `.dots`: pager dots row.
- `.dot`: 44px dot button; `aria-current="true"` makes it the 20×8 brand dot.
- `.note-block`: the coordinator's brand-soft note on a card.
- `.note-block__head`: avatar + "Catatan dari Rani" row.
- `.note-block__from`: the "Catatan dari Rani" caption.
- `.note-block__text`: the note text.
- `.avatar`: 24px brand circle with a white initial.

**Compare**
- `.cmp-pickers`: the two place selects side by side.
- `.cmp-heads`: the two place headers side by side.
- `.cmp-head`: 72px place header in `--place`, r-16.
- `.cmp-head__badge`: "A"/"B" badge on the tile corner (use with `.badge`).
- `.cmp-head__name`: white place name, two lines max.
- `.cmp-table`: surface card holding the comparison rows.
- `.cmp-row`: one 52px row with a hairline above.
- `.cmp-row--top`: top-aligned row (address, note).
- `.cmp-row--compact`: 44px facility row.
- `.cmp-row__label`: 88px label column.
- `.cmp-row__cell`: value cell (ink-2 400).
- `.cmp-row__cell--better`: the better value (ink 600, with `arrow-up` 14).
- `.cmp-row__cell--plain`: neutral ink content (address, note, a check).
- `.cmp-dash`: the "–" for a missing facility.

**Overlays**
- `.scrim`: dimmed backdrop behind a sheet (made by `openSheet()`).
- `.sheet`: bottom sheet (made by `openSheet()`).
- `.sheet__grabber`: 36×4 grabber.
- `.sheet__head`: title + close row.
- `.sheet__title`: the sheet h2.
- `.sheet__body`: the sheet content wrapper.
- `.sheet__actions`: stacked full-width actions with 8px between.
- `.has-sheet`: on `body` while a sheet is open (locks scrolling).
- `.toast-region`: the fixed `#toast` live region; sits 24px above any bottom bar.
- `.toast`: the dark toast pill (made by `toast()`).

**Chat preview**
- `.chat-wall`: chat-coloured panel holding bubbles.
- `.bubble`: incoming white bubble (system font 15/20).
- `.bubble--out`: outgoing green-soft bubble, right-aligned.
- `.bubble__name`: sender name in `--place`.
- `.bubble__text`: message text (keeps line breaks).
- `.bubble__link`: underlined link inside a bubble.
- `.bubble__time`: 11/14 timestamp, bottom-right.
- `.preview-card`: link preview inside a bubble.
- `.preview-card__thumb`: 64px brand thumbnail with a map pin.
- `.preview-card__mini`: tiny ticket shape in the thumbnail.
- `.preview-card__mini--a`: the upper-left one.
- `.preview-card__mini--b`: the lower-right one.
- `.preview-card__text`: title, description and domain column.
- `.preview-card__title`: two-line title.
- `.preview-card__desc`: two-line description.
- `.preview-card__domain`: the domain line.

**Welcome**
- `.band`: full-bleed brand band with dots; leaves room for the ticket stack to overlap.
- `.band__title`: white display headline (Fredoka 34/38).
- `.band__lead`: white body line under it.
- `.squiggle`: wrapper for the headline's last word (from `squiggleWord()`).
- `.squiggle__line`: the hand-drawn brand-soft underline SVG.

**Utilities**
- `.visually-hidden`: hidden visually, still read by screen readers.
- `.stack`: vertical flex stack with a 12px gap.
- `.stack--4`, `.stack--8`, `.stack--16`, `.stack--20`, `.stack--24`: other stack gaps.
- `.cluster`: horizontal wrapping group with an 8px gap.
- `.split`: two ends of one line.
- `.grow`: takes the remaining space in a flex row.
- `.center`: centred text.
- `.center-row`: centres its children horizontally.
- `.truncate`: one line with an ellipsis.
- `.clamp-2`, `.clamp-3`: two or three lines max.
- `.mt-0`, `.mt-4`, `.mt-8`, `.mt-12`, `.mt-16`, `.mt-20`, `.mt-24`, `.mt-32`: top margin on the spacing scale.
- `.text-display`, `.text-h1`, `.text-h2`, `.text-h3`, `.text-body`, `.text-small`, `.text-caption`: type tokens for one-off text.
- `.muted`: ink-2 text (safe on the ground).
- `.num`: tabular numbers.
- `.star`: the star colour for a rating glyph.
- `.spin`: spinning icon (`loader-2`) while loading.
- `.clipboard-proxy`: off-screen textarea used by `copyText()`.
- `.noscript`: the no-JavaScript message in `index.html`.
