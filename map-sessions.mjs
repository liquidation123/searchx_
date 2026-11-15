import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const lifetimeSeconds = 30 * 24 * 60 * 60;
const codePattern = /^[A-HJ-NP-Z2-9]{10}$/;
const home = { ra: 85.24583, dec: -2.45833, fov: 1.25, survey: 'optical' };

export function normalizeMapConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const datasets = input.datasets === 'all' ? 'all' :
    Array.isArray(input.datasets) && input.datasets.length > 0 && input.datasets.length <= 2 &&
    new Set(input.datasets).size === input.datasets.length &&
    input.datasets.every(item => ['optical', 'infrared'].includes(item)) ? input.datasets : null;
  if (!datasets) return null;
  const view = input.view ?? home;
  if (!view || typeof view !== 'object' || Array.isArray(view)) return null;
  const { ra, dec, fov, survey, channel } = view;
  if (![ra, dec, fov].every(Number.isFinite) || ra < 0 || ra >= 360 || Math.abs(dec) > 90 || fov <= 0 || fov > 180 ||
      !['optical', 'infrared'].includes(survey) || (datasets !== 'all' && !datasets.includes(survey))) return null;
  if (survey === 'optical' && channel !== undefined) return null;
  if (survey === 'infrared' && (!Number.isInteger(channel) || channel < 0 || channel > 101 || [50, 51].includes(channel))) return null;
  return { datasets, view: survey === 'infrared' ? {ra, dec, fov, survey, channel} : {ra, dec, fov, survey} };
}

export function newInviteCode(bytes = randomBytes(10)) {
  return [...bytes].map(byte => alphabet[byte & 31]).join('');
}

function redisStore(url, token) {
  if (!/^https:\/\//.test(url) || !token) throw new Error('Invalid map store configuration');
  const command = async args => {
    const reply = await fetch(url.replace(/\/$/, ''), {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(4000),
    });
    if (!reply.ok) throw new Error('Map store unavailable');
    const result = await reply.json();
    if (result.error) throw new Error('Map store unavailable');
    return result.result;
  };
  return {
    async put(code, value) { return await command(['SET', `searchx:map:${code}`, JSON.stringify(value), 'EX', lifetimeSeconds, 'NX']) === 'OK'; },
    async get(code) { const result = await command(['GET', `searchx:map:${code}`]); return result ? JSON.parse(result) : null; },
    async allowed(key, limit, windowSeconds) {
      const script = "local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return count";
      return Number(await command(['EVAL', script, 1, `searchx:limit:${key}`, windowSeconds])) <= limit;
    },
  };
}

// Explicit local development store. Vercel never writes sessions to its ephemeral filesystem.
export function fileMapStore(directory, now = Date.now) {
  const limits = new Map();
  return {
    async put(code, value) {
      await mkdir(directory, { recursive: true });
      try { const handle = await open(join(directory, code + '.json'), 'wx', 0o600); try { await handle.writeFile(JSON.stringify(value)); } finally { await handle.close(); } return true; }
      catch (error) { if (error.code === 'EEXIST') return false; throw error; }
    },
    async get(code) {
      try { const value = JSON.parse(await readFile(join(directory, code + '.json'), 'utf8')); return value.expiresAt > now() ? value : null; }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async allowed(key, limit, windowSeconds) {
      const current = now(), prior = limits.get(key);
      const value = !prior || prior.until <= current ? { count: 1, until: current + windowSeconds * 1000 } : { count: prior.count + 1, until: prior.until };
      limits.set(key, value);
      return value.count <= limit;
    },
  };
}

export function configuredMapStore(env = process.env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN && env.MAP_SESSION_SECRET) {
    return redisStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  }
  if (!env.VERCEL && env.MAP_SESSION_STORE_DIR) return fileMapStore(env.MAP_SESSION_STORE_DIR);
  return null;
}

function respond(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}

async function bodyJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error('Request too large');
  }
  return JSON.parse(body);
}

export function createMapSessionHandler({ store = configuredMapStore(), secret = process.env.MAP_SESSION_SECRET, now = Date.now } = {}) {
  return async (request, response, pathname) => {
    if (!store) { respond(response, 503, { error: 'Map sharing is not configured yet.' }); return; }
    const ip = String(request.headers['x-forwarded-for'] ?? request.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
    const fingerprint = createHmac('sha256', secret || 'local-development').update(ip).digest('hex').slice(0, 24);
    try {
      if (pathname === '/map-sessions' && request.method === 'POST') {
        if (!await store.allowed(`create:${fingerprint}`, 10, 3600)) { respond(response, 429, { error: 'Too many maps created. Try again later.' }); return; }
        if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) { respond(response, 415, { error: 'Send JSON.' }); return; }
        let input;
        try { input = await bodyJson(request); } catch { respond(response, 400, { error: 'Invalid map configuration.' }); return; }
        const config = normalizeMapConfig(input);
        if (!config) { respond(response, 400, { error: 'Choose supported datasets and a valid sky position.' }); return; }
        const createdAt = now(), value = { ...config, createdAt, expiresAt: createdAt + lifetimeSeconds * 1000 };
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = newInviteCode();
          if (await store.put(code, value)) { respond(response, 201, { code, path: `/observatory?map=${code}`, ...value }); return; }
        }
        respond(response, 503, { error: 'Could not reserve an invite code. Try again.' });
        return;
      }
      const match = pathname.match(/^\/map-sessions\/([^/]+)$/);
      if (match && request.method === 'GET') {
        if (!await store.allowed(`join:${fingerprint}`, 60, 60)) { respond(response, 429, { error: 'Too many code checks. Try again later.' }); return; }
        const code = match[1].toUpperCase();
        if (!codePattern.test(code)) { respond(response, 400, { error: 'Enter a valid 10-character invite code.' }); return; }
        const value = await store.get(code);
        if (!value || value.expiresAt <= now()) { respond(response, 404, { error: 'Map not found or invite expired.' }); return; }
        respond(response, 200, { code, ...value });
        return;
      }
      respond(response, 405, { error: 'Method not allowed.' });
    } catch (error) {
      console.error('Map session service:', error.message);
      respond(response, 503, { error: 'Map sharing is temporarily unavailable.' });
    }
  };
}
