import { spectralProduct } from './spherex-observations.mjs';
import { calibratedCutout, differenceFrames } from './spherex-difference.mjs';

const archive = 'https://irsa.ipac.caltech.edu';
const maxBytes = 512 * 1024;
const fitsBlock = 2880;
const calibratedCache = new Map();
const pendingCutouts = new Map();
const cutoutCacheLifetime = 10 * 60 * 1000;
const cutoutCacheLimit = 96;

export function readScienceImage(bytes, extensions) {
  let offset = 0;
  while (offset + 80 <= bytes.length) {
    const header = new Map();
    let card = offset;
    for (; card + 80 <= bytes.length; card += 80) {
      const name = bytes.toString('ascii', card, card + 8).trim();
      if (name === 'END') break;
      if (bytes[card + 8] === 61) {
        const field = bytes.toString('ascii', card + 10, card + 80).trim();
        header.set(name, field.startsWith("'") ? field.split("'")[1].trim() : field.split('/')[0].trim());
      }
    }
    if (card + 80 > bytes.length) return null;
    const data = Math.ceil((card + 80) / fitsBlock) * fitsBlock;
    const axes = Number(header.get('NAXIS'));
    if (!Number.isInteger(axes) || axes < 0 || axes > 9) throw new Error('Invalid FITS dimensions');
    const dimensions = Array.from({length: axes}, (_, i) => Number(header.get('NAXIS' + (i + 1))));
    const bitpix = Number(header.get('BITPIX'));
    const count = axes ? dimensions.reduce((a, b) => a * b, 1) : 0;
    const size = (count + Number(header.get('PCOUNT') ?? 0)) * Number(header.get('GCOUNT') ?? 1) * Math.abs(bitpix) / 8;
    if (!Number.isSafeInteger(size) || size < 0 || size > (extensions ? 5 * 1024 * 1024 : maxBytes)) throw new Error('FITS extension exceeds limit');
    if (data + size > bytes.length) return null;
    if (extensions) {
      extensions.set(header.get('EXTNAME'), {header, data: bytes.subarray(data, data + size)});
    } else if (header.get('EXTNAME') === 'IMAGE') {
      if (axes !== 2 || bitpix !== -32 || !count || dimensions.some(n => !Number.isInteger(n) || n < 1 || n > 256)) {
        throw new Error('Unsupported SPHEREx image format');
      }
      const scale = Number(header.get('BSCALE') ?? 1);
      const zero = Number(header.get('BZERO') ?? 0);
      const pixels = Array.from({length: count}, (_, i) => bytes.readFloatBE(data + i * 4) * scale + zero);
      return { width: dimensions[0], height: dimensions[1], pixels };
    }
    offset = data + Math.ceil(size / fitsBlock) * fitsBlock;
  }
  return null;
}

async function serveDifferences(products, ra, dec, response) {
  const send = (body) => response.writeHead(200, {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  }).end(JSON.stringify(body));
  const stages = new Map();
  const deadline = Date.now() + 26000;
  async function fetchCutout(source, index) {
      stages.set(index, 'download or timeout');
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      try {
        const upstream = await fetch(source, {
          redirect: 'error', signal: AbortSignal.timeout(Math.min(12000, remaining)),
        });
        if (!upstream.ok || !upstream.body) {
          if (upstream.status === 404 || upstream.status === 410) {
            stages.set(index, 'cutout unavailable');
          } else if (upstream.status >= 400 && upstream.status < 500 &&
                     upstream.status !== 408 && upstream.status !== 429) {
            stages.set(index, 'cutout request rejected');
          }
          await upstream.body?.cancel().catch(() => {});
          return null;
        }
        const reader = upstream.body.getReader();
        try {
          const chunks = [];
          let size = 0;
          while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 5 * 1024 * 1024) {
              stages.set(index, 'byte limit');
              return null;
            }
            chunks.push(value);
          }
          const extensions = new Map();
          stages.set(index, 'FITS or calibration parsing');
          readScienceImage(Buffer.concat(chunks), extensions);
          return calibratedCutout(extensions, ra, dec);
        } finally {
          void reader.cancel().catch(() => {});
        }
      } catch {
        return null;
      }
  }
  async function download(product, index) {
    const source = new URL(product, archive);
    source.searchParams.set('center', ra + ',' + dec);
    source.searchParams.set('size', '0.1');
    const key = source.href;
    const cached = calibratedCache.get(key);
    if (cached?.expires > Date.now()) {
      stages.set(index, 'FITS or calibration parsing');
      return cached.frame;
    }
    calibratedCache.delete(key);
    if (!pendingCutouts.has(key)) {
      const work = fetchCutout(source, index).then(frame => {
        if (frame) {
          calibratedCache.set(key, {frame, expires: Date.now() + cutoutCacheLifetime});
          if (calibratedCache.size > cutoutCacheLimit) {
            calibratedCache.delete(calibratedCache.keys().next().value);
          }
        }
        return {frame, stage: stages.get(index)};
      }).finally(() => pendingCutouts.delete(key));
      pendingCutouts.set(key, work);
    }
    const {frame, stage} = await pendingCutouts.get(key);
    stages.set(index, stage);
    return frame;
  }
  const frames = Array(products.length).fill(null);
  async function downloadBatch(indexes) {
    // Keep the archive fan-out below the number of frames in a full timeline.
    let next = 0;
    await Promise.all(Array.from({length: Math.min(3, indexes.length)}, async () => {
      while (next < indexes.length) {
        const index = indexes[next++];
        frames[index] = await download(products[index], index);
      }
    }));
  }
  await downloadBatch(products.map((_, index) => index));
  let result = differenceFrames(frames, stages);
  const retry = products.flatMap((_, index) =>
    stages.get(index) === 'download or timeout' ? [index] : []);
  if (!result && retry.length && deadline - Date.now() > 1000) {
    // Give a busy archive a moment to recover. Keep successful cutouts and retry only once.
    await new Promise(resolve => setTimeout(resolve, 400));
    await downloadBatch(retry);
    result = differenceFrames(frames, stages);
  }
  const diagnostics = products.map((product, index) => ({product, stage: stages.get(index)}));
  if (!result) {
    if (diagnostics.some(item => item.stage === 'download or timeout')) {
      return send({retryable: true, reason: 'IRSA is temporarily unavailable for one or more exposures. Retry static source subtraction.', diagnostics});
    }
    return send({reason: 'Need two early and one later exposure with matching wavelength coverage and usable calibration.', diagnostics});
  }
  send({images: result.frames.map(frame => frame && renderSvg(frame, [0, result.high]).svg), diagnostics});
}

function renderSvg({width, height, pixels}, stretch) {
  const sorted = pixels.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) throw new Error('No finite science pixels');
  const low = stretch?.[0] ?? sorted[Math.floor((sorted.length - 1) * .02)];
  const high = stretch?.[1] ?? sorted[Math.floor((sorted.length - 1) * .98)];
  const paths = Array.from({length: 64}, () => []);
  for (let i = 0; i < pixels.length; i++) {
    if (!Number.isFinite(pixels[i])) continue;
    const shade = high === low ? 32 : Math.round(63 * Math.max(0, Math.min(1, (pixels[i] - low) / (high - low))));
    const x = i % width;
    const y = height - 1 - Math.floor(i / width);
    paths[shade].push('M' + x + ' ' + y + 'h1v1h-1z');
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height +
    '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#17212c"/>' +
    paths.map((path, shade) => {
      const value = Math.round(shade * 255 / 63);
      return path.length ? '<path fill="rgb(' + [value, value, value].join(',') + ')" d="' + path.join('') + '"/>' : '';
    }).join('') + '</svg>';
  return { svg, low, high };
}

export async function servePreview(url, response) {
  const products = url.searchParams.getAll('product');
  const product = products[0] ?? '';
  const difference = url.searchParams.get('view') === 'difference';
  const raw = ['ra', 'dec'].map(name => url.searchParams.get(name));
  const [ra, dec] = raw.map(Number);
  if (!spectralProduct.test(product) || (difference &&
      (products.length < 3 || products.length > 8 || new Set(products).size !== products.length ||
       products.some(path => !spectralProduct.test(path)))) ||
      raw.some(value => !value?.trim()) || ![ra, dec].every(Number.isFinite) ||
      ra < 0 || ra >= 360 || dec < -90 || dec > 90) {
    response.writeHead(400).end();
    return;
  }
  if (difference) return serveDifferences(products, ra, dec, response);
  const source = new URL(product, archive);
  source.searchParams.set('center', ra + ',' + dec);
  source.searchParams.set('size', '0.1');
  const stretch = url.searchParams.get('stretch')?.split(',').map(Number);
  if (stretch && (stretch.length !== 2 || !stretch.every(Number.isFinite) || stretch[0] > stretch[1])) {
    response.writeHead(400).end();
    return;
  }
  let reader;
  const controller = new AbortController();
  const onClose = () => { if (!response.writableEnded) controller.abort(); };
  response.once('close', onClose);
  try {
    let upstream;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5500)]);
        upstream = await fetch(source, { redirect: 'error', signal });
        if (upstream.ok && upstream.body) break;
        await upstream.body?.cancel();
        if (![408, 429].includes(upstream.status) && upstream.status < 500) {
          throw Object.assign(new Error('IRSA HTTP ' + upstream.status), {permanent: true});
        }
        throw new Error('Cutout unavailable');
      } catch (error) {
        if (controller.signal.aborted || error.permanent || attempt === 1) throw error;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, 350);
          const abort = () => { clearTimeout(timer); reject(controller.signal.reason); };
          controller.signal.addEventListener('abort', abort, {once: true});
          if (controller.signal.aborted) abort();
        });
      }
    }
    reader = upstream.body.getReader();
    let bytes = Buffer.alloc(0);
    while (bytes.length < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes = Buffer.concat([bytes, value.subarray(0, maxBytes - bytes.length)]);
      const image = readScienceImage(bytes);
      if (!image) continue;
      const { svg, low, high } = renderSvg(image, stretch);
      response.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'X-SPHEREx-Stretch': low + ',' + high,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      }).end(svg);
      return;
    }
    throw new Error('Science image is missing');
  } catch {
    if (!response.destroyed) response.writeHead(502, { 'Cache-Control': 'no-store' }).end();
  } finally {
    response.removeListener('close', onClose);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}
