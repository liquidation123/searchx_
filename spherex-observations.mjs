const archive = 'https://irsa.ipac.caltech.edu';
const maxRecords = 1000;
const collections = ['spherex_dr1', 'spherex_qr3'];
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
  try {
    const signal = AbortSignal.timeout(10000);
    async function query(collection, time) {
      const url = new URL('/SIA', archive);
      url.search = new URLSearchParams({
        COLLECTION: collection, POS: 'circle ' + ra + ' ' + dec + ' 0',
        MAXREC: String(maxRecords), RESPONSEFORMAT: 'CSV',
      });
      if (time) url.searchParams.set('TIME', time);
      const upstream = await fetch(url, { signal });
      if (!upstream.ok) throw new Error('IRSA HTTP ' + upstream.status);
      return exposureRows(await upstream.text(), ra, dec);
    }
    const results = (await Promise.all(collections.map(async collection => {
      const initial = await query(collection);
      if (initial.rowCount < maxRecords) return [initial];
      const end = Math.ceil(Date.now() / 86400000 + 40587);
      const start = collection === 'spherex_dr1' ? 60745 : 61176;
      const stop = collection === 'spherex_dr1' ? 61177 : end;
      const windows = [];
      for (let day = start; day < stop; day += 60) {
        windows.push(query(collection, day + ' ' + Math.min(day + 60, stop)));
      }
      return Promise.all(windows);
    }))).flat();
    const truncated = results.some(result => result.rowCount >= maxRecords);
    const frames = selectFrames(results.flatMap(result => result.frames));
    send(200, { status: frames.length ? 'ready' : 'empty', frames, truncated });
  } catch {
    send(502, { status: 'archive_unavailable', frames: [] });
  }
}
