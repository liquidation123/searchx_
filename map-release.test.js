import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function request(handler, path) {
  const response = {
    writeHead(status) { this.status = status; return this; },
    end(body) { this.body = body?.toString() ?? ''; return this; },
  };
  await handler({ url: path, method: 'GET' }, response);
  return response;
}

test('map release gate preserves the existing homepage until storage and flag are ready', async () => {
  const previousFlag = process.env.SEARCHX_MAPS_ENABLED;
  const previousStore = process.env.MAP_SESSION_STORE_DIR;
  const previousVercel = process.env.VERCEL;
  const directory = await mkdtemp(join(tmpdir(), 'searchx-map-gate-'));
  try {
    delete process.env.SEARCHX_MAPS_ENABLED;
    process.env.MAP_SESSION_STORE_DIR = directory;
    const disabled = (await import('./server.mjs?maps-disabled')).default;
    assert.match((await request(disabled, '/')).body, /href="\/observatory" aria-label="Explore the SearchX Observatory sky map"/);
    assert.equal((await request(disabled, '/maps')).status, 404);
    assert.equal((await request(disabled, '/map-sessions/ABCDEFGHIJ')).status, 404);

    process.env.SEARCHX_MAPS_ENABLED = '1';
    process.env.VERCEL = '1';
    const withoutSharedStore = (await import('./server.mjs?maps-no-redis')).default;
    assert.equal((await request(withoutSharedStore, '/maps')).status, 404);
    delete process.env.VERCEL;
    const enabled = (await import('./server.mjs?maps-enabled')).default;
    assert.match((await request(enabled, '/')).body, /href="\/maps" aria-label="Create or join a SearchX sky map"/);
    assert.equal((await request(enabled, '/maps')).status, 200);
    assert.equal((await request(enabled, '/map-start.js')).status, 200);
  } finally {
    if (previousFlag === undefined) delete process.env.SEARCHX_MAPS_ENABLED;
    else process.env.SEARCHX_MAPS_ENABLED = previousFlag;
    if (previousStore === undefined) delete process.env.MAP_SESSION_STORE_DIR;
    else process.env.MAP_SESSION_STORE_DIR = previousStore;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    await rm(directory, { recursive: true, force: true });
  }
});
