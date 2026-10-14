import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as routes from '../js/routes.js';

const { parseRoute } = routes;
const PAYLOAD = '1zLY4_TsMwHEavYn0D0w-abc'; // base64url, as encodeList() makes it

test('coordinator hashes keep their exact format', () => {
  assert.equal(routes.home(), '#/');
  assert.equal(routes.list('abc123'), '#/list/abc123');
  assert.equal(routes.place('abc123', 'new'), '#/list/abc123/place/new');
  assert.equal(routes.place('abc123', 'p1'), '#/list/abc123/place/p1');
  assert.equal(routes.share('abc123'), '#/list/abc123/share');
});

test('coordinator hashes round-trip through parseRoute', () => {
  assert.deepEqual(parseRoute(routes.home()), { view: 'welcome', params: {} });
  assert.deepEqual(parseRoute(routes.list('abc123')), { view: 'editor', params: { id: 'abc123' } });
  assert.deepEqual(parseRoute(routes.place('abc123', 'new')), { view: 'place-form', params: { id: 'abc123', pid: null } });
  assert.deepEqual(parseRoute(routes.place('abc123', 'p1')), { view: 'place-form', params: { id: 'abc123', pid: 'p1' } });
  assert.deepEqual(parseRoute(routes.share('abc123')), { view: 'share', params: { id: 'abc123' } });
});

test('ids are encoded on the way out and decoded on the way in', () => {
  const hash = routes.place('a/b c', 'x y');
  assert.equal(hash, '#/list/a%2Fb%20c/place/x%20y');
  assert.deepEqual(parseRoute(hash), { view: 'place-form', params: { id: 'a/b c', pid: 'x y' } });
});

test('friend hashes: d first, then from, v and i only when set', () => {
  assert.equal(routes.friend(PAYLOAD), `#d=${PAYLOAD}`);
  assert.equal(routes.friend(PAYLOAD, { from: 'abc123' }), `#d=${PAYLOAD}&from=abc123`);
  assert.equal(routes.friend(PAYLOAD, { v: 'compare', from: 'abc123' }), `#d=${PAYLOAD}&from=abc123&v=compare`);
  assert.equal(routes.friend(PAYLOAD, { from: '', i: 0 }), `#d=${PAYLOAD}&i=0`);
  assert.equal(routes.friend(PAYLOAD, { from: 'abc123', i: null }), `#d=${PAYLOAD}&from=abc123`);
});

test('friend hashes round-trip through parseRoute, with &v=, &from= and &i=', () => {
  assert.deepEqual(parseRoute(routes.friend(PAYLOAD)), {
    view: 'friend',
    params: { payload: PAYLOAD, v: '', from: '', i: '' },
  });
  assert.deepEqual(parseRoute(routes.friend(PAYLOAD, { v: 'compare', from: 'abc123' })), {
    view: 'compare',
    params: { payload: PAYLOAD, v: 'compare', from: 'abc123', i: '' },
  });
  assert.deepEqual(parseRoute(routes.friend(PAYLOAD, { v: 'random' })), {
    view: 'random',
    params: { payload: PAYLOAD, v: 'random', from: '', i: '' },
  });
  assert.deepEqual(parseRoute(routes.friend(PAYLOAD, { from: 'abc123', i: 3 })), {
    view: 'friend',
    params: { payload: PAYLOAD, v: '', from: 'abc123', i: '3' },
  });
});

test('an unknown v= still opens the friend view', () => {
  assert.equal(parseRoute(`#d=${PAYLOAD}&v=nope`).view, 'friend');
});

test('unknown or malformed hashes go to the welcome screen', () => {
  for (const hash of ['', '#', '#/', '#/nope', '#/list', '#/list/', '#/list/abc/place', '#/list/abc/share/x',
    '#/list/abc/place/p1/extra', '#/list/abc/other', '#d', '#x=1&d=abc']) {
    assert.deepEqual(parseRoute(hash), { view: 'welcome', params: {} }, hash);
  }
});

test('a bad percent-escape does not throw', () => {
  assert.deepEqual(parseRoute('#/list/%E0%A4%A'), { view: 'editor', params: { id: '%E0%A4%A' } });
});
