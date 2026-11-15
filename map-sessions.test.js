import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuredMapStore, createMapSessionHandler, fileMapStore, newInviteCode, normalizeMapConfig } from './map-sessions.mjs';

function request(body, method = 'POST') {
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  stream.method = method;
  stream.headers = {'content-type':'application/json', 'x-forwarded-for':'192.0.2.1'};
  return stream;
}
async function call(handler, pathname, body, method = 'POST') {
  const result = { status: null, headers: null, body: null };
  const response = { writeHead(status, headers) { result.status = status; result.headers = headers; return this; }, end(value) { result.body = JSON.parse(value); return this; } };
  await handler(request(body, method), response, pathname);
  return result;
}

test('only supported, complete map configurations are accepted', () => {
  assert.deepEqual(normalizeMapConfig({datasets:'all'}).view, {ra:85.24583,dec:-2.45833,fov:1.25,survey:'optical'});
  assert.equal(normalizeMapConfig({datasets:['optical','unknown']}), null);
  assert.equal(normalizeMapConfig({datasets:['optical','optical']}), null);
  assert.equal(normalizeMapConfig({datasets:['infrared'], view:{ra:83,dec:-5,fov:2,survey:'optical'}}), null);
  assert.equal(normalizeMapConfig({datasets:['infrared'], view:{ra:83,dec:-5,fov:2,survey:'infrared',channel:50}}), null);
  assert.deepEqual(normalizeMapConfig({datasets:['infrared'], view:{ra:83,dec:-5,fov:2,survey:'infrared',channel:62}})?.datasets, ['infrared']);
  assert.match(newInviteCode(Buffer.alloc(10)), /^[A-HJ-NP-Z2-9]{10}$/);
});

test('invite codes persist to disk locally, validate, expire and rate limit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'searchx-map-test-'));
  let time = 1000;
  try {
    const store = fileMapStore(directory, () => time);
    const handler = createMapSessionHandler({store, secret:'test', now:() => time});
    const created = await call(handler, '/map-sessions', {datasets:['optical'], view:{ra:10,dec:20,fov:2,survey:'optical'}});
    assert.equal(created.status, 201);
    assert.match(created.body.code, /^[A-HJ-NP-Z2-9]{10}$/);
    assert.equal(created.body.path, `/observatory?map=${created.body.code}`);
    const joined = await call(handler, '/map-sessions/' + created.body.code.toLowerCase(), undefined, 'GET');
    assert.equal(joined.status, 200);
    assert.deepEqual(joined.body.view, {ra:10,dec:20,fov:2,survey:'optical'});
    assert.equal((await call(handler, '/map-sessions/NOT-A-CODE', undefined, 'GET')).status, 400);
    assert.equal((await call(handler, '/map-sessions/AAAAAAAAAA', undefined, 'GET')).status, 404);
    for (let index = 1; index < 10; index++) assert.equal((await call(handler, '/map-sessions', {datasets:'all'})).status, 201);
    assert.equal((await call(handler, '/map-sessions', {datasets:'all'})).status, 429);
    time += 31 * 24 * 60 * 60 * 1000;
    assert.equal((await call(handler, '/map-sessions/' + created.body.code, undefined, 'GET')).status, 404);
  } finally { await rm(directory, {recursive:true, force:true}); }
});

test('production without configured shared storage fails closed', async () => {
  const handler = createMapSessionHandler({store:null});
  const result = await call(handler, '/map-sessions', {datasets:'all'});
  assert.equal(result.status, 503);
});

test('Redis adapter uses expiring atomic writes and shared rate counters', async () => {
  const original = globalThis.fetch, commands = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://example.upstash.io');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    const command = JSON.parse(options.body); commands.push(command);
    return new Response(JSON.stringify({result:command[0] === 'GET' ? '{"expiresAt":999999}' : command[0] === 'EVAL' ? 1 : 'OK'}));
  };
  try {
    const store = configuredMapStore({UPSTASH_REDIS_REST_URL:'https://example.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test-token',MAP_SESSION_SECRET:'test-secret',VERCEL:'1'});
    assert.equal(await store.put('AAAAAAAAAA', {datasets:'all'}), true);
    assert.deepEqual(await store.get('AAAAAAAAAA'), {expiresAt:999999});
    assert.equal(await store.allowed('client', 10, 60), true);
    assert.deepEqual(commands[0].slice(0,3), ['SET','searchx:map:AAAAAAAAAA','{"datasets":"all"}']);
    assert.deepEqual(commands[0].slice(3), ['EX',2592000,'NX']);
    assert.equal(commands[2][0], 'EVAL');
  } finally { globalThis.fetch = original; }
});
