import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonObject } from './spherex-map/public/comparison.js';
import { references } from './spherex-map/public/sky-data.js';
import { buildComparisonReport, loadComparisonObservations } from './spherex-map/public/comparison-evidence.js';
import { comparisonLink, parseComparisonLink, restoreComparisonObject, sieveComparisonRecord } from './spherex-map/public/comparison-link.js';
import { reportMarkdown, reportSections } from './spherex-map/public/comparison-report.js';

const [B, A] = references.map(object => comparisonObject(object));
const pair = {A, B};
const url = comparisonLink('https://searchx.earth/observatory', pair);
const on = new Date(2026, 10, 15, 12);
const noCoverage = {status: 'empty', frames: [], partial: false};
const build = (a = noCoverage, b = noCoverage) => buildComparisonReport(pair, {A: a, B: b}, url, on);
const frame = {
  id: 'example', detector: 'SPHEREx-D3', observedAt: '2025-09-16T03:00:00.000Z', release: 'DR1',
  sourceUrl: 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W38_1A/l2b-v27-2026-237/3/level2_example.fits',
};
const answer = body => async () => Response.json(body);

test('report identifies the selected pair, compares directions, and links its sources and share URL', () => {
  const report = build();
  assert.equal(report.title, 'Orion Nebula and Horsehead Nebula');
  assert.equal(report.date, '2026-11-15');
  assert.equal(report.separation, '3.26°');
  assert.match(report.limitations[0], /Physical separation is unavailable/);
  assert.ok(report.sources.some(source => source.url.endsWith('messier-42/')));
  for (const mode of ['research', 'accessible']) {
    const markdown = reportMarkdown(report, mode);
    assert.match(markdown, /M 42/);
    assert.match(markdown, /Barnard 33/);
    assert.ok(markdown.includes(url));
    assert.ok(markdown.includes('Hubble Orion Treasury'));
    assert.match(markdown, /Both nebulae belong to the Orion Molecular Cloud/);
  }
  assert.deepEqual(reportSections(report, 'research').summary, reportSections(report, 'accessible').summary);
  assert.ok(reportSections(report, 'research').rows.length > reportSections(report, 'accessible').rows.length);
  assert.equal(buildComparisonReport({A: B, B: A}, {A: noCoverage, B: noCoverage}, url, on).title,
    'Horsehead Nebula and Orion Nebula');
});

test('archive outages and empty partial responses retain distinct limitations', async () => {
  const failed = await loadComparisonObservations(A, async () => { throw Error('offline'); });
  const partial = await loadComparisonObservations(B, answer({status:'empty', frames:[], truncated:true}));
  const report = build(failed, partial);
  assert.match(report.objects[0].coverage, /unavailable/);
  assert.match(report.objects[1].coverage, /partial/);
  assert.match(report.infrared, /do not establish comparable/);
});

test('compatible detector labels alone cannot establish matched wavelength or brightness', async () => {
  const observed = await loadComparisonObservations(A, answer({status:'ready', frames:[frame], truncated:false}));
  assert.equal(observed.frames[0].version, 'l2b-v27-2026-237');
  assert.match(build(observed, observed).infrared, /overlapping detector band.*do not establish a matched wavelength/);
  const other = { ...frame, detector:'SPHEREx-D2', sourceUrl:frame.sourceUrl.replace('/3/', '/2/') };
  const observedOther = await loadComparisonObservations(B, answer({status:'ready', frames:[other]}));
  assert.match(build(observed, observedOther).infrared, /different detector bands/);
  assert.match(reportMarkdown(build(observed, observedOther), 'research'), /nominal 1.63–2.41 µm/);
  const invalid = await loadComparisonObservations(B, answer({status:'ready', frames:[{...frame, sourceUrl:'https://example.org/fake'}]}));
  assert.equal(invalid.status, 'unavailable');
});

test('SIEVE evidence remains inconclusive with pinned QR3 provenance', async () => {
  const candidate = comparisonObject(sieveComparisonRecord);
  const evidence = await loadComparisonObservations(candidate, () => { assert.fail('Pinned evidence requires no fetch'); });
  assert.equal(evidence.status, 'pinned');
  assert.equal(evidence.frames.length, 2);
  const report = buildComparisonReport({A: candidate, B}, {A: evidence, B: noCoverage}, url, on);
  const md = reportMarkdown(report, 'research');
  assert.match(md, /Tentative catalog association/);
  assert.match(md, /unqualified for motion/);
  assert.match(md, /insufficient for brightness variability/);
  assert.match(md, /l2b-v27-2026-222/);
});

test('shared link restores curated identifiers and rejects invalid or changed catalog results', async () => {
  const parsed = parseComparisonLink(new URL(url).search);
  assert.equal((await restoreComparisonObject(parsed.A)).id, A.id);
  assert.equal((await restoreComparisonObject(parsed.B)).id, B.id);
  assert.equal(parseComparisonLink('?compareA=curated:M%2042&compareA=curated:M%2031&compareB=curated:M%2057'), null);
  const gaia = {provider: 'gaia', id:'Gaia DR3 123'};
  assert.equal(await restoreComparisonObject(gaia, answer({status:'found', source:{id:'Gaia DR3 124', ra:1, dec:1}})), null);
  assert.equal(await restoreComparisonObject(gaia, async () => { throw Error('offline'); }), null);
});
