import { sieveDemo } from './spherex-map/public/sieve-demo.js';

const archive = 'https://irsa.ipac.caltech.edu';
const lastGood = new Map();
const demoKey = [sieveDemo.ra, sieveDemo.dec].map(value => Number(value.toFixed(6))).join(',');
const maxRecords = 1000;
const collections = ['spherex_dr1', 'spherex_qr3'];
const requestTimeoutMs = 8000;
const overallTimeoutMs = 24000;
const retryDelayMs = 250;
export const spectralProduct = /^\/ibe\/data\/spherex\/(dr1|qr3)\/level2\/\d{4}W\d{2}_[A-Z0-9]+\/l2b-v\d+-\d{4}-\d+\/([1-6])\/level2_[A-Za-z0-9_-]+\.fits$/;

export function exposureStart(mjd) {
  if (!Number.isFinite(mjd) || mjd < 60745 || mjd >= 70000) return null;
  return new Date(Math.round((mjd - 40587) * 86400000)).toISOString();
}

// IRSA CSV quotes fields that contain commas, including product metadata.
function csvRows(csv) {
  return csv.trim().replace(/^\uFEFF/, '').split(/\r?\n/).map(line =>
    Array.from(line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^",]*))/g),
      ([, quoted, plain]) => quoted?.replaceAll('""', '"') ?? plain));
}

export function exposureRows(csv, ra, dec) {
  const [header, ...rows] = csvRows(csv);
  const columns = ['obs_id', 'energy_bandpassname', 't_min', 'access_url'];
  const indexes = columns.map(name => header.indexOf(name));
  if (indexes.some(index => index < 0)) throw new Error('Unexpected IRSA response');
  const frames = [];
  for (const row of rows) {
    const [id, detector, time, url] = indexes.map(index => row[index]);
    if (!id || !/^SPHEREx-D[1-6]$/.test(detector) || !time || !Number.isFinite(Number(time)) ||
        !url?.startsWith(archive + '/')) continue;
    const source = new URL(url);
    const product = source.pathname.match(spectralProduct);
    const mjd = Number(time);
    const observedAt = exposureStart(mjd);
    if (!product || product[2] !== detector.at(-1) || !observedAt) continue;
    const sourceUrl = source.origin + source.pathname;
    source.searchParams.set('center', ra + ',' + dec);
    source.searchParams.set('size', '0.1');
    frames.push({ id, detector, mjd, observedAt, release: product[1].toUpperCase(),
      sourceUrl, cutoutUrl: source.href });
  }
  return { rowCount: rows.length, frames };
}

export function selectFrames(exposures) {
  const frames = new Map();
  for (const frame of exposures) {
    const key = frame.detector + ':' + frame.id;
    if (!frames.has(key) || frame.release === 'DR1') frames.set(key, frame);
  }
  const groups = new Map();
  for (const frame of frames.values()) {
    if (!groups.has(frame.detector)) groups.set(frame.detector, []);
    groups.get(frame.detector).push(frame);
  }
  const [group = []] = Array.from(groups.values()).sort((a, b) =>
    new Set(b.map(frame => Math.floor(frame.mjd))).size - new Set(a.map(frame => Math.floor(frame.mjd))).size ||
    b.length - a.length);
  const byDay = new Map();
  for (const frame of group.sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.mjd - b.mjd)) {
    const day = Math.floor(frame.mjd);
    if (!byDay.has(day)) byDay.set(day, frame);
  }
  const dated = [...byDay.values()];
  return dated.length <= 8 ? dated : Array.from({length: 8}, (_, index) =>
    dated[Math.round(index * (dated.length - 1) / 7)]);
}

export function observationFrames(csv, ra, dec) {
  return selectFrames(exposureRows(csv, ra, dec).frames);
}

export async function serveObservations(url, response) {
  function send(status, body) {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
    }).end(JSON.stringify(body));
  }
  const coords = ['ra', 'dec'].map(name => url.searchParams.get(name));
  const [ra, dec] = coords.map(Number);
  if (coords.some(value => !value?.trim()) || !Number.isFinite(ra) || !Number.isFinite(dec) ||
      ra < 0 || ra >= 360 || dec < -90 || dec > 90) {
    send(400, { status: 'invalid_position' });
    return;
  }
  const controller = new AbortController();
  const onClose = () => { if (!response.writableEnded) controller.abort(); };
  response.once('close', onClose);
  try {
    const result = await queryObservations(ra, dec, { signal: controller.signal });
    if (!response.destroyed) send(result.status === 'archive_unavailable' ? 502 : 200, result);
  } finally {
    response.removeListener('close', onClose);
    controller.abort();
  }
}

export async function queryObservations(ra, dec, { signal } = {}) {
  const key = ra + ',' + dec;
  const expires = Date.now() + overallTimeoutMs;
  function unavailable() {
    const saved = lastGood.get(key) ?? (key === demoKey || key === sieveDemo.ra + ',' + sieveDemo.dec
      ? {frames: sieveDemo.frames, refreshedAt: '2026-11-14', coverage: 'curated'} : null);
    return saved && !signal?.aborted
      ? {status: 'ready', truncated: true, ...saved}
      : {status: 'archive_unavailable', frames: []};
  }
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), overallTimeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    let activeWindows = 0;
    const waitingWindows = [];
    async function windowQuery(collection, time) {
      if (activeWindows >= 3) await new Promise(resolve => waitingWindows.push(resolve));
      else activeWindows++;
      try { return await query(collection, time); }
      finally {
        const next = waitingWindows.shift();
        if (next) next();
        else activeWindows--;
      }
    }
    async function query(collection, time) {
      const url = new URL('/SIA', archive);
      url.search = new URLSearchParams({
        COLLECTION: collection, POS: 'circle ' + ra + ' ' + dec + ' 0',
        MAXREC: String(maxRecords), RESPONSEFORMAT: 'CSV',
      });
      if (time) url.searchParams.set('TIME', time);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (controller.signal.aborted) throw controller.signal.reason;
        let upstream;
        let delay = retryDelayMs;
        let failure = 'download';
        const started = Date.now();
        const timeout = AbortSignal.timeout(requestTimeoutMs);
        const report = outcome => console.info('SPHEREx lookup', {
          collection, stage: time ? 'time_window' : 'initial', attempt: attempt + 1,
          status: upstream?.status ?? null, elapsedMs: Date.now() - started, outcome,
        });
        try {
          const signal = AbortSignal.any([controller.signal, timeout]);
          upstream = await fetch(url, { signal });
          if (upstream.ok) {
            const csv = await upstream.text();
            try {
              const result = exposureRows(csv, ra, dec);
              report(result.rowCount ? 'success' : 'empty');
              return result;
            } catch (error) {
              failure = 'invalid_body';
              error.permanent = true;
              throw error;
            }
          }
          failure = 'http_error';
          const retryAfter = upstream.headers.get('retry-after');
          if (retryAfter?.trim()) {
            const wait = /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
            if (Number.isFinite(wait)) delay = Math.max(delay, wait);
          }
          await upstream.body?.cancel();
          if (![408, 429].includes(upstream.status) && upstream.status < 500) {
            throw Object.assign(new Error('IRSA HTTP ' + upstream.status), {permanent: true});
          }
          throw new Error('IRSA HTTP ' + upstream.status);
        } catch (error) {
          report(timeout.aborted ? 'timeout' : controller.signal.aborted
            ? (signal?.aborted ? 'cancelled' : 'timeout') : failure);
          if (controller.signal.aborted || error.permanent || attempt === 1 || Date.now() + delay >= expires) throw error;
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, delay);
            const abort = () => { clearTimeout(timer); reject(controller.signal.reason); };
            controller.signal.addEventListener('abort', abort, {once: true});
            if (controller.signal.aborted) abort();
          });
        }
      }
    }
    const settled = await Promise.allSettled(collections.map(async collection => {
      const initial = await query(collection);
      if (initial.rowCount < maxRecords) return { results: [initial], partial: false };
      const end = Math.ceil(Date.now() / 86400000 + 40587);
      const start = collection === 'spherex_dr1' ? 60745 : 61176;
      const stop = collection === 'spherex_dr1' ? 61177 : end;
      const windows = [];
      for (let day = start; day < stop; day += 60) {
        windows.push(windowQuery(collection, day + ' ' + Math.min(day + 60, stop)));
      }
      const settledWindows = await Promise.allSettled(windows);
      const partial = !windows.length || settledWindows.some(window => window.status === 'rejected');
      const results = settledWindows.flatMap(window => window.status === 'fulfilled' ? [window.value] : []);
      // A capped response still contains verified exposures that can fill failed windows.
      if (partial) results.push(initial);
      return { results, partial };
    }));
    const completed = settled.flatMap(collection => collection.status === 'fulfilled' ? [collection.value] : []);
    const partial = completed.length < collections.length || completed.some(collection => collection.partial);
    const results = completed.flatMap(collection => collection.results);
    const truncated = partial || results.some(result => result.rowCount >= maxRecords);
    const frames = selectFrames(results.flatMap(result => result.frames));
    if (partial && !frames.length) return unavailable();
    if (frames.length && !partial && !signal?.aborted) {
      lastGood.delete(key);
      lastGood.set(key, {frames, refreshedAt: new Date().toISOString(), coverage: 'cached'});
      if (lastGood.size > 128) lastGood.delete(lastGood.keys().next().value);
    } else if (!truncated && !signal?.aborted) {
      lastGood.delete(key);
    }
    return { status: frames.length ? 'ready' : 'empty', frames, truncated };
  } catch {
    return unavailable();
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', onAbort);
    controller.abort();
  }
}
