import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sieveDemo } from './spherex-map/public/sieve-demo.js';
import { spectralProduct } from './spherex-observations.mjs';

test('SIEVE demo pins its two evidence products and exposure-start timestamps', () => {
  assert.deepEqual(sieveDemo.frames.map(frame => [frame.id, frame.observedAt]), [
    ['2026W30_1B_0001_1', '2026-07-20T00:06:53.370Z'],
    ['2026W30_1B_0001_2', '2026-07-20T00:09:02.301Z'],
  ]);
  for (const frame of sieveDemo.frames) {
    const cutout = new URL(frame.cutoutUrl);
    assert.match(cutout.pathname, spectralProduct);
    assert.ok(cutout.pathname.endsWith(new URL(frame.sourceUrl).pathname));
    assert.equal(cutout.searchParams.get('center'), sieveDemo.ra + ',' + sieveDemo.dec);
    assert.match(frame.cutoutSha256, /^[0-9a-f]{64}$/);
  }
});
