import test from 'node:test';
import assert from 'node:assert/strict';
import { datasetMode, selectMapView, shareDataset, skySurveys } from './spherex-map/public/map-datasets.js';
import { decodeView, encodeView } from './spherex-map/public/sky-data.js';
import handler from './server.mjs';

test('direct links default to All datasets and invites retain the owner’s dataset choices', () => {
  assert.equal(datasetMode(''), 'all');
  assert.equal(datasetMode('?dataset=bad'), 'all');
  assert.equal(datasetMode('?dataset=optical'), 'optical');
  assert.equal(datasetMode('?dataset=infrared'), 'infrared');
  assert.equal(datasetMode('?dataset=infrared', ['optical']), 'optical');
  assert.equal(datasetMode('?dataset=infrared', ['optical', 'infrared']), 'all');
  assert.equal(datasetMode('?dataset=infrared', 'all'), 'all');
  assert.deepEqual(skySurveys('all'), ['optical', 'infrared']);
  assert.deepEqual(skySurveys('optical'), ['optical']);
  assert.deepEqual(skySurveys('infrared'), ['infrared']);
});

test('focused maps retain position, choose an allowed survey, and keep wavelength on shared links', () => {
  const position = { ra: 85, dec: -2, fov: 1 };
  const initial = selectMapView('infrared', { ...position, survey: 'optical' }, 62);
  assert.deepEqual(initial, { ...position, survey: 'infrared', channel: 62 });
  const infrared = { ...position, survey: 'infrared', channel: 22 };
  for (const mode of ['all', 'optical', 'infrared']) {
    const expected = mode === 'optical' ? { ...position, survey: 'optical' } : infrared;
    const chosen = selectMapView(mode, infrared, 62);
    const url = new URL(shareDataset(encodeView('https://searchx.earth/observatory', chosen), mode));
    assert.equal(datasetMode(url.search), mode);
    assert.deepEqual(decodeView(url.search), expected);
  }
});

async function request(url) {
  const result = {};
  await handler({ url, method:'GET' }, {
    writeHead(status, headers) { Object.assign(result, { status, headers }); return this; },
    end(body) { result.body = String(body ?? ''); },
  });
  return result;
}

test('home, ungated chooser, and all three links use the existing Observatory route', async () => {
  const [home, chooser, viewer, module] = await Promise.all(
    ['/', '/sky-maps', '/observatory?dataset=infrared', '/map-datasets.js'].map(request)
  );
  assert.ok([home, chooser, viewer, module].every(result => result.status === 200));
  assert.match(home.body, /class="observatory-link" href="\/sky-maps"/);
  const links = [...chooser.body.matchAll(/href="\/observatory\?dataset=(\w+)"/g)].map(match => match[1]);
  assert.deepEqual(links, ['all', 'optical', 'infrared']);
  assert.match(chooser.body, /Recommended/);
  assert.match(viewer.body, /id="sky"/);
  assert.match(module.headers['Content-Type'], /text\/javascript/);
});
