import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeView, decodeView, restoreView } from './spherex-map/public/sky-data.js';

test('shared optical and infrared views round trip without stale parameters', () => {
  for (const state of [
    {ra: 10.684708, dec: 41.26875, fov: 4, survey: 'optical'},
    {ra: 359.99999, dec: -90, fov: .015, survey: 'infrared', channel: 62},
    {ra: 1e-7, dec: 0, fov: 1e-7, survey: 'optical'},
  ]) {
    const url = new URL(encodeView('https://example.org/observatory?old=1#section', state));
    assert.equal(url.pathname, '/observatory');
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.has('old'), false);
    assert.deepEqual(decodeView(url.search), state);
  }
});

test('invalid, incomplete, duplicate and unsupported states are rejected', () => {
  const base = '?ra=10&dec=20&fov=1&survey=infrared&channel=62';
  for (const query of ['', '?ra=10', base + '&ra=2', base.replace('ra=10', 'ra=360'),
    base.replace('dec=20', 'dec=-91'), base.replace('fov=1', 'fov=0'),
    base.replace('fov=1', 'fov=Infinity'), base.replace('survey=infrared', 'survey=other'),
    base.replace('channel=62', 'channel=50'), base.replace('channel=62', 'channel=102'),
    base.replace('channel=62', 'channel=1.5'), base.replace('survey=infrared', 'survey=optical')]) {
    assert.equal(decodeView(query), null, query);
  }
  assert.equal(decodeView(base, 62), null);
  assert.throws(() => encodeView('https://example.org/observatory', {ra: 360, dec: 0, fov: 1, survey:'optical'}));
});

test('restoration applies the survey before the exact position and zoom', () => {
  const calls = [];
  const state = decodeView('?ra=10&dec=-20&fov=0.5&survey=infrared&channel=62');
  const actions = {setSurvey: (...args) => calls.push(['survey', ...args]), pointAt: (...args) => calls.push(['point', ...args])};
  restoreView(state, actions);
  restoreView(null, actions);
  assert.deepEqual(calls, [['survey', 'infrared', 62], ['point', 10, -20, .5]]);
});
