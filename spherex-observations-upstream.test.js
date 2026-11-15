import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { queryObservations, serveObservations } from './spherex-observations.mjs';
import { sieveDemo } from './spherex-map/public/sieve-demo.js';

const header = 'obs_id,energy_bandpassname,t_min,access_url\n';
const source = 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W38_1A/l2b-v27-2026-237/3/level2_example.fits';
const row = 'example,SPHEREx-D3,60924.125,' + source + '\n';

async function request(mock, fetch) {
  mock.method(globalThis, 'fetch', fetch);
  const response = Object.assign(new EventEmitter(), {
    writeHead(status) { this.status = status; return this; },
    end(body) { this.json = JSON.parse(body); },
  });
  await serveObservations(new URL('https://searchx.earth/spherex-observations?ra=85.8103&dec=-67.8409'), response);
  return response;
}

test('a failed collection retains the successful collection with partial coverage', async ({ mock }) => {
  const r = await request(mock, async url => url.searchParams.get('COLLECTION') === 'spherex_dr1'
    ? new Response(header + row) : new Response(null, { status: 502 }));
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ready');
  assert.equal(r.json.truncated, true);
  assert.equal(r.json.frames[0].sourceUrl, source);
  assert.equal(r.json.frames[0].observedAt, '2025-09-06T03:00:00.000Z');
});

test('a failed time window retains verified exposures from the capped response', async ({ mock }) => {
  const r = await request(mock, async url => {
    if (url.searchParams.get('COLLECTION') === 'spherex_qr3') return new Response(header);
    if (!url.searchParams.has('TIME')) return new Response(header + row.repeat(1000));
    return url.searchParams.get('TIME').startsWith('60745 ')
      ? new Response(null, { status: 502 }) : new Response(header);
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.truncated, true);
  assert.equal(r.json.frames.length, 1);
});

test('total upstream failure is retryable and distinct from an empty archive result', async ({ mock }) => {
  let calls = 0;
  const r = await request(mock, async () => {
    calls++;
    return new Response(null, { status: 502 });
  });
  assert.equal(calls, 4);
  assert.equal(r.status, 502);
  assert.deepEqual(r.json, { status: 'archive_unavailable', frames: [] });
});

test('two successful empty collections return a true empty result', async ({ mock }) => {
  const r = await request(mock, async () => new Response(header));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { status: 'empty', frames: [], truncated: false });
});

test('a total failure serves the exact field’s last verified timeline', async ({ mock }) => {
  let fail = false;
  mock.method(globalThis, 'fetch', async () => fail
    ? new Response(null, {status: 503, headers: {'Retry-After': '60'}})
    : new Response(header + row));
  const fresh = await queryObservations(10.123456, -4.321);
  fail = true;
  const cached = await queryObservations(10.123456, -4.321);
  assert.equal(cached.coverage, 'cached');
  assert.equal(cached.truncated, true);
  assert.ok(Number.isFinite(Date.parse(cached.refreshedAt)));
  assert.deepEqual(cached.frames, fresh.frames);
  assert.equal((await queryObservations(10.123457, -4.321)).status, 'archive_unavailable');
});

test('cold curated coverage keeps the pinned QR3 products and provenance', async ({ mock }) => {
  mock.method(globalThis, 'fetch', async () => new Response(null, {status: 502}));
  const result = await queryObservations(Number(sieveDemo.ra.toFixed(6)), Number(sieveDemo.dec.toFixed(6)));
  assert.equal(result.coverage, 'curated');
  assert.deepEqual(result.frames, sieveDemo.frames);
});
