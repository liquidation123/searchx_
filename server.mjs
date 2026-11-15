import { serveNameResolve } from './name-resolve.mjs';
import { serveAnalyticsConfig } from './analytics-config.mjs';
import { serveGaiaSource } from './gaia-source.mjs';
import { serveGaiaField } from './gaia-field.mjs';
import { serveChimeEvent } from './chime-event.mjs';
import { serveAiSearch } from './ai-search.mjs';
import { servePreview } from './spherex-preview.mjs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { configuredMapStore, createMapSessionHandler } from './map-sessions.mjs';
import { createSearchXMcpHandler } from './mcp-server.mjs';
import { serveObjectPage } from './object-pages.mjs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { serveObservations } from './spherex-observations.mjs';
import { serveBarnard } from './barnard/proxy.mjs';

import { serveRegion } from './barnard/region-proxy.mjs';

const assets = new Map([
  ['/analytics.js', ['analytics.js', 'text/javascript']],
  ['/favicon.svg', ['spherex-map/public/favicon.svg', 'image/svg+xml']],
  ['/vercel-analytics.js', ['spherex-map/public/vercel-analytics.js', 'text/javascript']],
  ['/sieve-demo.js', ['spherex-map/public/sieve-demo.js', 'text/javascript']],
  ['/catalog-discovery.js', ['spherex-map/public/catalog-discovery.js', 'text/javascript']],
  ['/observations.js', ['spherex-map/public/observations.js', 'text/javascript']],
  ['/barnard-timelapse.js', ['spherex-map/public/barnard-timelapse.js', 'text/javascript']],
  ['/', ['index.html', 'text/html']],
  ['/observatory', ['spherex-map/public/index.html', 'text/html']],
  ['/app.js', ['spherex-map/public/app.js', 'text/javascript']],
  ['/ui-state.js', ['spherex-map/public/ui-state.js', 'text/javascript']],
  ['/comparison.js', ['spherex-map/public/comparison.js', 'text/javascript']],
  ['/quiz-data.js', ['spherex-map/public/quiz-data.js', 'text/javascript']],
  ['/search.js', ['spherex-map/public/search.js', 'text/javascript']],
  ['/sky-data.js', ['spherex-map/public/sky-data.js', 'text/javascript']],
  ['/spectral-guide.js', ['spherex-map/public/spectral-guide.js', 'text/javascript']],
  ['/cygnus-x-water-annotated.jpg', ['spherex-map/public/cygnus-x-water-annotated.jpg', 'image/jpeg']],
  ['/style.css', ['spherex-map/public/style.css', 'text/css']],
  ['/irsa.properties', ['spherex-map/public/irsa.properties', 'text/plain']],
  ['/vendor/aladin.js', ['vendor/aladin.js', 'text/javascript']],
  ...['LICENSE', 'COPYING', 'COPYING.LESSER'].map(name => ['/vendor/' + name, ['vendor/' + name, 'text/plain']]),
]);
const mapStore = configuredMapStore();
const mapsEnabled = process.env.SEARCHX_MAPS_ENABLED === '1' && !!mapStore;
const mcpEnabled = process.env.SEARCHX_MCP_ENABLED === '1' && !!mapStore;
const serveMcp = mcpEnabled ? createSearchXMcpHandler({ store: mapStore }) : null;
if (mapsEnabled) {
  assets.set('/maps', ['map-start.html', 'text/html']);
  assets.set('/map-start.js', ['map-start.js', 'text/javascript']);
}
for (const font of ['audiowide.ttf', 'michroma.ttf', 'space-grotesk-400.ttf']) {
  assets.set('/fonts/' + font, ['fonts/' + font, 'font/ttf']);
}
const properties = await readFile(new URL("./spherex-map/public/irsa.properties", import.meta.url), "utf8");
const irsa = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube";
const port = Number(process.env.PORT ?? 5173);
const serveMapSession = createMapSessionHandler({ store: mapStore });
const feedbackPool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }) : null;
async function readJson(request, maxBytes = 6000) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 });
  }
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Send a valid JSON body.'), { status: 400 }); }
}
function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}
export default async function handler(request, response) {
  const url = new URL(request.url, "http://localhost");
  const { pathname } = url;
  if (mcpEnabled && pathname === '/mcp') {
    await serveMcp(request, response);
    return;
  }
  if (mapsEnabled && (pathname === '/map-sessions' || pathname.startsWith('/map-sessions/'))) {
    await serveMapSession(request, response, pathname);
    return;
  }
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/objects' || pathname.startsWith('/object/')) {
    serveObjectPage(request, response, pathname);
    return;
  }
  const feedbackMatch = pathname.match(/^\/community-feedback(?:\/([0-9a-f-]{36}))?$/i);
  if (feedbackMatch) {
    if (!feedbackPool) { sendJson(response, 503, { error: 'Community feedback storage is not configured.' }); return; }
    try {
      if (request.method === 'POST' && !feedbackMatch[1]) {
        const body = await readJson(request);
        const vote = body.vote;
        const note = typeof body.note === 'string' ? body.note.trim() : '';
        const candidateId = typeof body.candidateId === 'string' ? body.candidateId : '';
        const context = body.context;
        if (!['anomaly', 'not_anomaly', 'unsure'].includes(vote)) { sendJson(response, 400, { error: 'Choose whether this seems like an anomaly.' }); return; }
        if (note.length > 2000) { sendJson(response, 400, { error: 'Notes must be 2,000 characters or fewer.' }); return; }
        if (!/^[a-zA-Z0-9._-]{1,100}$/.test(candidateId)) { sendJson(response, 400, { error: 'A valid candidate is required.' }); return; }
        if (!context || !Number.isFinite(context.ra) || context.ra < 0 || context.ra >= 360 || !Number.isFinite(context.dec) || context.dec < -90 || context.dec > 90) { sendJson(response, 400, { error: 'A valid candidate position is required.' }); return; }
        const id = randomUUID();
        const safeContext = {
          ra: context.ra, dec: context.dec,
          candidateName: String(context.candidateName ?? '').slice(0, 160),
          source: String(context.source ?? '').slice(0, 40),
          frames: Array.isArray(context.frames) ? context.frames.slice(0, 20).map(frame => ({ id: String(frame.id ?? '').slice(0, 100), observedAt: String(frame.observedAt ?? '').slice(0, 40) })) : [],
        };
        await feedbackPool.query('INSERT INTO community_feedback (id, candidate_id, vote, note, context) VALUES ($1, $2, $3, $4, $5)', [id, candidateId, vote, note, JSON.stringify(safeContext)]);
        sendJson(response, 201, { id }); return;
      }
      if (request.method === 'GET' && feedbackMatch[1]) {
        const { rows } = await feedbackPool.query('SELECT id, candidate_id, vote, note, context, created_at FROM community_feedback WHERE id = $1', [feedbackMatch[1]]);
        if (!rows[0]) { sendJson(response, 404, { error: 'Shared review not found.' }); return; }
        sendJson(response, 200, rows[0]); return;
      }
      sendJson(response, 405, { error: 'Method not allowed.' }); return;
    } catch (error) {
      sendJson(response, error.status ?? 500, { error: error.status ? error.message : 'Could not save this review.' }); return;
    }
  }
  if (pathname === '/name-resolve' && request.method === 'GET') { await serveNameResolve(url, response); return; }
  if (pathname === '/analytics-config' && request.method === 'GET') { serveAnalyticsConfig(request, response); return; }
  if (pathname === '/gaia-source' && request.method === 'GET') { await serveGaiaSource(url, response); return; }
  if (pathname === '/gaia-field' && request.method === 'GET') { await serveGaiaField(url, response); return; }
  if (pathname === '/chime-event' && request.method === 'GET') { await serveChimeEvent(url, response); return; }
  if (pathname === '/ai-search') {
    await serveAiSearch(request, response);
    return;
  }
  if (pathname === '/spherex-preview' && request.method === 'GET') {
    await servePreview(url, response);
    return;
  }
  if (pathname === '/spherex-observations' && request.method === 'GET') {
    await serveObservations(url, response);
    return;
  }
  if (pathname === '/timelapse/regions' || pathname.startsWith('/timelapse/regions/')) {
    await serveRegion(new URL(request.url, 'http://localhost'), request, response);
    return;
  }
  if (pathname.startsWith('/timelapse/barnard-star/')) {
    await serveBarnard(pathname, request, response);
    return;
  }
  if (pathname.startsWith("/dr1-frame/") && request.method === "GET") {
    await serveFrame(pathname, response);
    return;
  }
  const asset = assets.get(pathname) ?? (request.method === 'GET' && /^\/community-reviews\/[0-9a-f-]{36}$/i.test(pathname) ? assets.get('/observatory') : undefined);
  if (!asset || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const [path, type] = asset;
    const source = path === 'vendor/aladin.js' ? './node_modules/aladin-lite/dist/aladin.js'
      : path.startsWith('vendor/') ? './node_modules/aladin-lite/' + path.slice(7)
      : './' + path;
    let body = await readFile(new URL(source, import.meta.url));
    if (pathname === '/' && mapsEnabled) {
      body = Buffer.from(body.toString().replace(
        'href="/observatory" aria-label="Explore the SearchX Observatory sky map">Explore the sky map',
        'href="/maps" aria-label="Create or join a SearchX sky map">Create / Join Map'
      ));
    }
    response.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error.message);
    response.writeHead(500).end('Unable to read asset.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer(handler).listen(port, '127.0.0.1', () => console.log('Local viewer: http://127.0.0.1:' + port));
}

async function serveFrame(pathname, response) {
  const match = pathname.match(/^\/dr1-frame\/(\d{1,3})\/(properties|Norder[0-5]\/Dir\d{1,5}\/Npix\d{1,5}\.png|Norder3\/Allsky\.png|Moc\.fits)$/);
  if (!match || Number(match[1]) > 101 || [50, 51].includes(Number(match[1]))) {
    response.writeHead(404).end();
    return;
  }
  const frame = Number(match[1]);
  if (match[2] === 'properties') {
    const ordinaryHiPS = properties.split('\n').filter(line =>
      !/^(creator_did|hips_service_url|obs_title|dataproduct_type|hips_cube_|data_cube_|custom_tile_|em_min|em_max)\b|^(hips_cube_|data_cube_|custom_tile_)/.test(line)
    ).join('\n');
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(
      ordinaryHiPS + '\ncreator_did = ivo://IPAC/P/SPHEREx/DR1/frame' + frame +
      '\nobs_title = SPHEREx DR1 · frame ' + frame + '\ndataproduct_type = image\n'
    );
    return;
  }
  const upstream = frame === 0 ? match[2] : match[2].replace(/\.png$/, '_' + frame + '.png');
  try {
    const reply = await fetch(irsa + '/' + upstream, { signal: AbortSignal.timeout(10000) });
    if (!reply.ok) {
      await reply.body?.cancel();
      response.writeHead(reply.status).end();
      return;
    }
    const body = Buffer.from(await reply.arrayBuffer());
    response.writeHead(200, {
      'Content-Type': match[2].endsWith('.png') ? 'image/png' : 'application/fits',
      'Cache-Control': 'public, max-age=86400',
      'X-SPHEREx-Tile': upstream,
    }).end(body);
  } catch (error) {
    console.warn('IRSA tile unavailable:', upstream, error.cause?.code ?? error.message);
    response.writeHead(502).end();
  }
}
