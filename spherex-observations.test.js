import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exposureRows, exposureStart, selectFrames } from './spherex-observations.mjs';
import { setupObservations } from './spherex-map/public/observations.js';

test('converts fractional archive MJD to UTC and rejects invalid times', () => {
  assert.equal(exposureStart(60924.165780), '2025-09-06T03:58:43.392Z');
  assert.equal(exposureStart(NaN), null);
  assert.equal(exposureStart(0), null);
});

test('region selection keeps the last decoded image and metadata when a preview fails', async t => {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const target = new EventTarget();
      const attrs = new Map();
      Object.assign(target, {
        hidden: true, style: {}, dataset: {}, classList: { toggle() {} },
        getAttribute: key => attrs.get(key),
        setAttribute: (key, value) => attrs.set(key, value),
        removeAttribute: key => attrs.delete(key),
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
        closest: () => null,
        replaceChildren() {}, append() {},
        querySelector: () => element('observation-heading-span'),
        click: () => target.dispatchEvent(new Event('click')),
      });
      elements.set(id, target);
    }
    return elements.get(id);
  }
  let empty = false;
  const previewRequests = [];
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).startsWith('/spherex-preview') && !String(url).includes('view=difference')) previewRequests.push(String(url));
    return String(url).includes('view=difference')
    ? Response.json({images: ['<svg/>', null, '<svg/>']})
    : String(url).startsWith('/spherex-preview')
    ? new Response('preview', { headers: { 'X-SPHEREx-Stretch': '0,1' } })
    : Response.json({ frames: (empty ? [] : [1, 2, 3]).map(i => ({
      observedAt: '2025-09-0' + i + 'T01:02:03Z', mjd: 60919 + i, detector: 'SPHEREx-D2', release: 'DR1',
      sourceUrl: 'https://irsa.ipac.caltech.edu/frame' + i,
      cutoutUrl: 'https://irsa.ipac.caltech.edu/frame' + i + '?center=85,-2',
    })) });
  });
  const oldDocument = globalThis.document;
  const oldImage = globalThis.Image;
  globalThis.document = { getElementById: element, createElement: () => Object.assign(new EventTarget(), { append() {} }) };
  globalThis.Image = class {
    async decode() { if (this.src.includes('frame2')) throw Error('broken image'); }
  };
  t.after(() => { globalThis.document = oldDocument; globalThis.Image = oldImage; });
  const overlay = { add() {}, removeAll() {} };
  const select = setupObservations({ addOverlay() {}, pix2world: () => [85, -2] },
    { graphicOverlay: () => overlay, circle() {} }, () => {});
  element('barnard-select').dispatchEvent(new Event('click'));
  for (const type of ['pointerdown', 'pointerup']) {
    element('sky').dispatchEvent(Object.assign(new Event(type), {
      isPrimary: true, button: 0, clientX: 10, clientY: 10, pointerId: 1,
    }));
  }
  await new Promise(resolve => setImmediate(resolve));
  const image = element('observation-image');
  const first = image.src;
  assert.match(first, /^blob:/);
  assert.equal(previewRequests.filter(url => url.includes('frame1')).length, 1);
  const toggle = element('observation-difference');
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, false);
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(image.src, /^data:image\/svg/);
  assert.equal(element('observation-difference-status').textContent, 'Changes relative to early frames');
  assert.equal(element('observation-date').textContent, '2025-09-01 01:02:03 UTC · SPHEREx-D2 · DR1');
  assert.equal(element('observation-source').href, 'https://irsa.ipac.caltech.edu/frame1');
  toggle.checked = false;
  toggle.dispatchEvent(new Event('change'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(image.src, first);
  assert.equal(element('observation-date').textContent, '2025-09-01 01:02:03 UTC · SPHEREx-D2 · DR1');
  const slider = element('observation-frame');
  slider.value = 1;
  slider.dispatchEvent(new Event('input'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(image.src, first);
  assert.equal(element('observation-date').textContent, '2025-09-01 01:02:03 UTC · SPHEREx-D2 · DR1');
  assert.equal(element('observation-source').href, 'https://irsa.ipac.caltech.edu/frame1');
  assert.equal(element('observation-retry').hidden, false);
  empty = true;
  await select(0, 0);
  assert.match(element('observation-status').textContent, /No matching SPHEREx/);
  assert.equal(element('observation-player').hidden, true);
  assert.equal(element('observation-date').textContent, '');
});

test('accepts verified release paths and orders unique exposures by start time', () => {
  const row = (id, mjd, release) => [
    id, 'SPHEREx-D2', mjd,
    'https://irsa.ipac.caltech.edu/ibe/data/spherex/' + release +
      '/level2/2026W39_2A/l2b-v27-2026-271/2/level2_example.fits',
  ].join(',');
  const csv = [
    'obs_id,energy_bandpassname,t_min,access_url',
    row('B', 61308.920681, 'qr3'),
    row('A', 60924.165780, 'dr1'),
    row('A', 60924.165780, 'qr3'),
    row('invalid', '', 'dr1'),
  ].join('\n');
  const { frames } = exposureRows(csv, 85.013835, -2.463945);
  assert.equal(frames.length, 3);
  assert.deepEqual(selectFrames(frames).map(f => [f.id, f.release, f.mjd]),
    [['A', 'DR1', 60924.165780], ['B', 'QR3', 61308.920681]]);
});
