import { createHmac } from 'node:crypto';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import { configuredMapStore } from './map-sessions.mjs';
import { getPublicObject, searchPublicObjects, imageForObject, evidenceForObject, observationsForObject } from './object-data.mjs';

const result = value => ({ content:[{type:'text',text:JSON.stringify(value)}], structuredContent:value });
const missing = () => ({ isError:true, content:[{type:'text',text:'Object not found in the curated SearchX catalog.'}] });
const objectInput = z.object({ object: z.string().min(1).max(80).describe('Curated object slug, catalog ID, or name') });

export function resolvePublicObject(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  const query = value.trim().toLowerCase();
  return searchPublicObjects(query).find(item => [item.slug,item.id,item.name,...item.aliases].some(label => label.toLowerCase() === query)) ?? null;
}

export function createSearchXMcpHandler({store = configuredMapStore(), secret = process.env.MAP_SESSION_SECRET} = {}) {
  const handler = createMcpHandler(() => {
    const server = new McpServer({name:'searchx-astronomy',version:'1.0.0'});
    server.registerTool('search_objects', {description:'Search the small, verified SearchX astronomy catalog. Returns catalog IDs and source-backed page links.',inputSchema:z.object({query:z.string().min(1).max(100)})},
      async ({query}) => result({objects:searchPublicObjects(query).map(item => ({slug:item.slug,id:item.id,name:item.name,type:item.type,url:`https://searchx.earth/object/${item.slug}`})),scope:'curated catalog only'}));
    server.registerTool('get_object', {description:'Get a curated object description, pointing coordinates, and provenance. No inferred measurements.',inputSchema:objectInput},
      async ({object}) => { const item=resolvePublicObject(object); return item ? result({id:item.id,slug:item.slug,name:item.name,type:item.type,aliases:item.aliases,summary:item.summary,detail:item.detail,
        position:{ra:item.ra,dec:item.dec,frame:item.coordinateSystem,uncertainty:item.positionUncertainty,limitation:'Navigation center; positional uncertainty not supplied'},
        sources:[item.catalogSource,item.scienceSource],url:`https://searchx.earth/object/${item.slug}`}) : missing(); });
    server.registerTool('get_observations', {description:'Query actual NASA/IPAC IRSA SPHEREx exposure metadata at a curated object position. A positional match does not identify a source.',inputSchema:objectInput},
      async ({object}) => { const item=resolvePublicObject(object); return item ? result(await observationsForObject(item)) : missing(); });
    server.registerTool('get_image', {description:'Get a genuine NASA-published astronomy image URL and its attribution for a curated object.',inputSchema:objectInput},
      async ({object}) => { const item=resolvePublicObject(object); return item ? result({object_id:item.id,image:imageForObject(item)}) : missing(); });
    server.registerTool('get_evidence', {description:'Get source-linked claims and limits for a curated object. No SIEVE verification claim is made.',inputSchema:objectInput},
      async ({object}) => { const item=resolvePublicObject(object); return item ? result({object_id:item.id,evidence:evidenceForObject(item),sieve_status:'not evaluated here'}) : missing(); });
    return server;
  });
  const nodeHandler = toNodeHandler(handler);
  return async (request, response) => {
    if (!store) { response.writeHead(503, {'Content-Type':'text/plain','Cache-Control':'no-store'}).end('SearchX MCP storage and rate limiting are not configured.'); return; }
    const host = String(request.headers.host ?? '').toLowerCase();
    const production = !!process.env.VERCEL;
    const allowedHosts = production ? ['searchx.earth','www.searchx.earth',process.env.VERCEL_URL].filter(Boolean) : ['127.0.0.1','localhost'];
    if (!allowedHosts.some(value => host === value || (!production && host.startsWith(value + ':')))) { response.writeHead(403).end(); return; }
    const origin = request.headers.origin;
    if (origin && !allowedHosts.some(value => origin === `https://${value}` || (!production && origin.startsWith(`http://${value}:`)))) { response.writeHead(403).end(); return; }
    const ip = String(request.headers['x-forwarded-for'] ?? request.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
    const fingerprint = createHmac('sha256', secret || 'local-development').update(ip).digest('hex').slice(0,24);
    try {
      if (!await store.allowed(`mcp:${fingerprint}`, 30, 60)) { response.writeHead(429, {'Retry-After':'60','Cache-Control':'no-store'}).end('Rate limit exceeded.'); return; }
      await nodeHandler(request, response);
    } catch (error) {
      console.error('SearchX MCP:', error.message);
      if (!response.headersSent) response.writeHead(503, {'Cache-Control':'no-store'}).end('SearchX MCP temporarily unavailable.');
    }
  };
}
