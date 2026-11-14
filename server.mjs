import { serveNameResolve } from './name-resolve.mjs';
import { serveGaiaSource } from './gaia-source.mjs';
import { serveGaiaField } from './gaia-field.mjs';
import { serveChimeEvent } from './chime-event.mjs';
import { serveAiSearch } from './ai-search.mjs';
import { servePreview } from './spherex-preview.mjs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

import { serveObservations } from './spherex-observations.mjs';
import { serveBarnard } from './barnard/proxy.mjs';

import { serveRegion } from './barnard/region-proxy.mjs';

const assets = new Map([
  ['/sieve-demo.js', ['spherex-map/public/sieve-demo.js', 'text/javascript']],
  ['/catalog-discovery.js', ['spherex-map/public/catalog-discovery.js', 'text/javascript']],
  ['/observations.js', ['spherex-map/public/observations.js', 'text/javascript']],
  ['/barnard-timelapse.js', ['spherex-map/public/barnard-timelapse.js', 'text/javascript']],
  ['/', ['index.html', 'text/html']],
  ['/observatory', ['spherex-map/public/index.html', 'text/html']],
  ['/app.js', ['spherex-map/public/app.js', 'text/javascript']],
  ['/ui-state.js', ['spherex-map/public/ui-state.js', 'text/javascript']],
  ['/search.js', ['spherex-map/public/search.js', 'text/javascript']],
  ['/sky-data.js', ['spherex-map/public/sky-data.js', 'text/javascript']],
  ['/style.css', ['spherex-map/public/style.css', 'text/css']],
  ['/irsa.properties', ['spherex-map/public/irsa.properties', 'text/plain']],
  ['/vendor/aladin.js', ['vendor/aladin.js', 'text/javascript']],
  ...['LICENSE', 'COPYING', 'COPYING.LESSER'].map(name => ['/vendor/' + name, ['vendor/' + name, 'text/plain']]),
]);
for (const font of ['audiowide.ttf', 'michroma.ttf', 'space-grotesk-400.ttf']) {
  assets.set('/fonts/' + font, ['fonts/' + font, 'font/ttf']);
}
const properties = await readFile(new URL("./spherex-map/public/irsa.properties", import.meta.url), "utf8");
const irsa = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube";
const port = Number(process.env.PORT ?? 5173);
export default async function handler(request, response) {
  const url = new URL(request.url, "http://localhost");
  const { pathname } = url;
  if (pathname === '/name-resolve' && request.method === 'GET') { await serveNameResolve(url, response); return; }
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
  const asset = assets.get(pathname);
  if (!asset || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const [path, type] = asset;
    const source = path === 'vendor/aladin.js' ? './node_modules/aladin-lite/dist/aladin.js'
      : path.startsWith('vendor/') ? './node_modules/aladin-lite/' + path.slice(7)
      : './' + path;
    const body = await readFile(new URL(source, import.meta.url));
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
