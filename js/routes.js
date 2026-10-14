// Hash routes: the builders every view links with, and the parser main.js routes by.
// See docs/ARCHITECTURE.md, "Router". No DOM here, so it runs under node --test.

const FRIEND_VIEWS = { compare: 'compare', random: 'random' };

export const home = () => '#/';
export const list = (id) => `#/list/${encodeURIComponent(id)}`;
/** `pid` is a place id, or 'new' for the add form. */
export const place = (id, pid) => `${list(id)}/place/${encodeURIComponent(pid)}`;
export const share = (id) => `${list(id)}/share`;

/**
 * A shared list: '#d=<payload>', then `from` (the coordinator's preview), `v` ('compare' | 'random')
 * and `i` (the card index), each only when set. 'd=' stays first: that is how parseRoute() knows it.
 */
export function friend(payload, { v, from, i } = {}) {
  const query = new URLSearchParams({ d: payload });
  for (const [key, value] of Object.entries({ from, v, i })) {
    if (value != null && value !== '') query.set(key, String(value));
  }
  return `#${query}`;
}

function safeDecode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** location.hash → { view, params }. Unknown hashes go to the welcome screen. */
export function parseRoute(hash) {
  const raw = hash.replace(/^#/, '');

  if (raw.startsWith('d=')) {
    const query = new URLSearchParams(raw);
    const v = query.get('v') || '';
    return {
      view: FRIEND_VIEWS[v] || 'friend',
      params: { payload: query.get('d') || '', v, from: query.get('from') || '', i: query.get('i') || '' },
    };
  }

  const [section, id, sub, pid, ...rest] = raw.split('/').filter(Boolean).map(safeDecode);
  if (section === 'list' && id && !rest.length) {
    if (!sub) return { view: 'editor', params: { id } };
    if (sub === 'share' && !pid) return { view: 'share', params: { id } };
    if (sub === 'place' && pid) return { view: 'place-form', params: { id, pid: pid === 'new' ? null : pid } };
  }
  return { view: 'welcome', params: {} };
}
