import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

async function status(handler, path) {
  const response = { writeHead(code) { this.status = code; return this; }, end() { return this; } };
  await handler({ url: path, method: 'GET' }, response);
  return response.status;
}

test('MCP stays hidden without its release flag or shared production storage', async () => {
  const oldFlag = process.env.SEARCHX_MCP_ENABLED;
  const oldStore = process.env.MAP_SESSION_STORE_DIR;
  const oldVercel = process.env.VERCEL;
  const directory = await mkdtemp(join(tmpdir(), 'searchx-mcp-gate-'));
  let server;
  let client;
  try {
    process.env.MAP_SESSION_STORE_DIR = directory;
    delete process.env.SEARCHX_MCP_ENABLED;
    const disabled = (await import('./server.mjs?mcp-disabled')).default;
    assert.equal(await status(disabled, '/mcp'), 404);

    process.env.SEARCHX_MCP_ENABLED = '1';
    process.env.VERCEL = '1';
    const withoutSharedStore = (await import('./server.mjs?mcp-no-redis')).default;
    assert.equal(await status(withoutSharedStore, '/mcp'), 404);

    delete process.env.VERCEL;
    const enabled = (await import('./server.mjs?mcp-enabled')).default;
    server = createServer((request, response) => { void enabled(request, response); });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    client = new Client({ name: 'searchx-release-gate-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`)));
    assert.equal((await client.listTools()).tools.length, 5);
  } finally {
    await client?.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
    if (oldFlag === undefined) delete process.env.SEARCHX_MCP_ENABLED;
    else process.env.SEARCHX_MCP_ENABLED = oldFlag;
    if (oldStore === undefined) delete process.env.MAP_SESSION_STORE_DIR;
    else process.env.MAP_SESSION_STORE_DIR = oldStore;
    if (oldVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = oldVercel;
    await rm(directory, { recursive: true, force: true });
  }
});
