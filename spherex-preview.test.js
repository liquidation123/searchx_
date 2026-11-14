import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import handler from './server.mjs';

function header(cards) {
  const block = Buffer.alloc(2880, 32);
  for (const [index, card] of [...cards, 'END'].entries()) block.write(card, index * 80, 'ascii');
  return block;
}

test('observatory includes required player elements and renders a streamed FITS preview', async t => {
  const request = globalThis.fetch;
  const fits = Buffer.concat([
    header(['SIMPLE  = T', 'BITPIX  = 8', 'NAXIS   = 0']),
    header(["XTENSION= 'IMAGE'", 'BITPIX  = -32', 'NAXIS   = 2',
      'NAXIS1  = 2', 'NAXIS2  = 2', 'PCOUNT  = 0', 'GCOUNT  = 1', "EXTNAME = 'IMAGE'"]),
    Buffer.alloc(2880),
  ]);
  fits.writeFloatBE(1, 5760);
  fits.writeFloatBE(2, 5764);
  globalThis.fetch = async url => {
    assert.equal(new URL(url).hostname, 'irsa.ipac.caltech.edu');
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(fits.subarray(0, 2900));
        controller.enqueue(fits.subarray(2900));
        controller.close();
      },
    }));
  };
  const server = createServer(handler).listen(0, '127.0.0.1');
  t.after(() => { globalThis.fetch = request; server.close(); });
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const html = await (await request(base + '/observatory')).text();
  for (const id of ['observation-image', 'barnard-heading', 'barnard-position']) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  const product = '/ibe/data/spherex/dr1/level2/2025W38_1A/l2b-v27-2026-237/3/level2_example.fits';
  const query = new URLSearchParams({product, ra: '85.01', dec: '-2.46'});
  const preview = await request(base + '/spherex-preview?' + query);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('content-type'), 'image/svg+xml');
  assert.match(await preview.text(), /<svg.*<path/);
  globalThis.fetch = async () => new Response(null, {status: 503});
  const unavailable = await request(base + '/spherex-preview?' + query);
  assert.equal(unavailable.status, 502);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  query.set('view', 'difference');
  query.append('product', product.replace('example', 'missing'));
  query.append('product', product.replace('example', 'healthy'));
  const attempts = new Map();
  globalThis.fetch = async url => {
    const path = new URL(url).pathname;
    const count = (attempts.get(path) ?? 0) + 1;
    attempts.set(path, count);
    if (path.includes('missing')) return new Response(null, {status: 404});
    if (path === product && count === 1) return new Response(null, {status: 503});
    return new Response(fits);
  };
  const recovered = await (await request(base + '/spherex-preview?' + query)).json();
  assert.deepEqual([...attempts.values()], [2, 1, 1]);
  assert.equal(recovered.retryable, undefined);
  assert.deepEqual(recovered.diagnostics.map(item => item.stage),
    ['FITS or calibration parsing', 'cutout unavailable', 'FITS or calibration parsing']);
  query.delete('view');
  query.set('product', 'https://example.com/not-fits');
  assert.equal((await request(base + '/spherex-preview?' + query)).status, 400);
});
