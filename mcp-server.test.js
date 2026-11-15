import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createSearchXMcpHandler } from './mcp-server.mjs';

test('official MCP client can discover and call all read-only tools over HTTP', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (String(input).startsWith('https://irsa.ipac.caltech.edu/SIA')) return Promise.resolve(new Response('obs_id,energy_bandpassname,t_min,access_url\n'));
    return originalFetch(input, init);
  };
  const store = { allowed:async () => true };
  const handler = createSearchXMcpHandler({store,secret:'test'});
  const server = createServer((request,response) => { void handler(request,response); });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const client = new Client({name:'searchx-integration-test',version:'1.0.0'});
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`)));
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['get_evidence','get_image','get_object','get_observations','search_objects']);
    const call = async (name,args) => JSON.parse((await client.callTool({name,arguments:args})).content[0].text);
    assert.equal((await call('search_objects',{query:'Orion'})).objects[0].id,'M 42');
    assert.equal((await call('get_object',{object:'M42'})).position.frame,'ICRS');
    assert.match((await call('get_image',{object:'m42'})).image.url,/science\.nasa\.gov/);
    assert.equal((await call('get_evidence',{object:'m42'})).sieve_status,'not evaluated here');
    assert.equal((await call('get_observations',{object:'m42'})).status,'empty');
    assert.equal((await client.callTool({name:'get_object',arguments:{object:'not-curated'}})).isError,true);
  } finally {
    await client.close().catch(()=>{});
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});
