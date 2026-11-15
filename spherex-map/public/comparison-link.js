import { comparisonObject } from './comparison.js';
import { references } from './sky-data.js';
import { sieveDemo } from './sieve-demo.js';

export const sieveComparisonRecord = {
  ...sieveDemo,
  source: 'SIEVE demo',
  category: 'Unconfirmed candidate',
  description: 'A candidate from the pinned SIEVE evidence review. Its catalog association is tentative.',
  url: 'https://github.com/liquidation123/searchx_/blob/29becd64b93454c4ddb69c19160319414861566d/spherex-map/public/sieve-demo.js',
};

export function comparisonLink(location, pair) {
  const url = new URL('/observatory', location);
  for (const slot of ['A', 'B']) {
    const object = pair[slot];
    const curated = references.some(item => item.id === object.id && item.ra === object.ra && item.dec === object.dec);
    const provider = curated ? 'curated' : object.source === 'SIEVE demo' ? 'sieve'
      : object.source === 'Gaia DR3' ? 'gaia' : object.radio ? 'chime' : 'sesame';
    url.searchParams.set('compare' + slot, provider + ':' + object.id);
  }
  return url.href;
}

export function parseComparisonLink(search) {
  const params = new URLSearchParams(search);
  const read = slot => {
    const values = params.getAll('compare' + slot);
    if (values.length !== 1) return null;
    const match = /^(curated|sieve|gaia|chime|sesame):([^\x00-\x1f]{1,120})$/.exec(values[0]);
    return match ? {provider: match[1], id: match[2]} : null;
  };
  const A = read('A'), B = read('B');
  return A && B ? {A, B} : null;
}

export async function restoreComparisonObject({provider, id}, fetcher = fetch) {
  if (provider === 'curated') return comparisonObject(references.find(object => object.id === id));
  if (provider === 'sieve') return id === sieveDemo.id ? comparisonObject(sieveComparisonRecord) : null;
  try {
    const route = provider === 'gaia' ? '/gaia-source?id=' + encodeURIComponent(id.replace(/^Gaia DR3 /, ''))
      : provider === 'chime' ? '/chime-event?id=' + encodeURIComponent(id)
      : '/name-resolve?name=' + encodeURIComponent(id);
    const response = await fetcher(route, {signal: AbortSignal.timeout(10000)});
    if (!response.ok) return null;
    const result = await response.json();
    if (result.status !== 'found' || !result.source) return null;
    const object = result.source;
    if (provider !== 'sesame') return object.id === id ? comparisonObject(object) : null;
    if (object.id && object.id.toLowerCase() !== id.toLowerCase()) return null;
    return comparisonObject({
      ...object, id, name: id, source: 'CDS Sesame',
      description: object.category ? 'Catalog classification: ' + object.category + '.' : 'Catalog position from CDS Sesame.',
      url: 'https://cds.unistra.fr/cgi-bin/Sesame?' + encodeURIComponent(id),
    });
  } catch { return null; }
}
