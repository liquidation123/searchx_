import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from './spherex-map/public/search.js';
const cases = [
 ['Orion','M 42'],['M42','M 42'],['orio','M 42'],['Orion Nebula','M 42'],['NGC 1976','M 42'],['Messier 42','M 42'],
 ['M31','M 31'],['andromda','M 31'],['Andromeda','M 31'],['NGC 224','M 31'],['M101','M 101'],['pinwheel','M 101'],['NGC 5457','M 101'],
 ['red giant','giants'],['largest star','largest'],['stars that explode','death'],['why do stars die','death'],['supernova','death'],
 ['where are stars born?','birth'],['star formation','birth'],['why are some stars red?','colour'],['star vs galaxy','galaxy'],['infrared','infrared'],
 ['210.80227, 54.34895','coordinates'],['05:35:17 -05:23:28','coordinates']
];
for (const [query,id] of cases) test(`search ${query}`,()=>assert.equal(search(query).results[0]?.id,id));
test('ambiguous big sun offers choices',()=>assert.deepEqual(search('big sun').results.map(x=>x.id),['sun','giants','largest']));
test('invalid coordinates show an error',()=>assert.ok(search('400, 91').error));
test('unknown terms do not invent a match',()=>assert.equal(search('zzqvxyz').results.length,0));
test('upstream Horsehead entry has independent aliases and correct category',()=>{const r=search('Horsehead').results[0];assert.equal(r.id,'Barnard 33');assert.equal(r.category,'Nebula');assert.equal(search('B33').results[0].id,'Barnard 33')});
test('upstream reference insertion preserves existing catalog mappings',()=>{assert.equal(search('M42').results[0].name,'Orion Nebula');assert.equal(search('M31').results[0].name,'Andromeda Galaxy');assert.equal(search('M101').results[0].name,'Pinwheel Galaxy')});

test('resolves requested curated names and catalog IDs, including natural-language wrappers', () => {
  for (const [query, id] of [
    ['M45', 'M 45'], ['M51', 'M 51'], ['M57', 'M 57'], ['Barnard 33', 'Barnard 33'],
    ['Please show me the Horsehead Nebula on the sky map', 'Barnard 33'],
    ['Could you locate Andromeda please?', 'M 31'], ['show me 85.24583, −2.45833', 'coordinates'],
  ]) {
    const result = search(query);
    assert.equal((result.exact ?? result.results[0])?.id, id, query);
  }
  assert.equal(search('Andromda').exact, undefined);
  assert.equal(search('Andromda').results[0].id, 'M 31');
  assert.equal(search('galaxy near the big dipper').ambiguous, true);
  for (const query of ['M4', 'M50', 'NGC 6721', 'Barnard 32']) assert.deepEqual(search(query).results, [], query);
  assert.ok(search('Find the').error || !search('Find the').exact);
});

test('featured targets resolve by public name and catalog aliases', () => {
  const targets = [
    ["Barnard’s Star", 'GJ 699', 'GJ699'],
    ['Epsilon Indi B', 'eps Ind B', 'Epsilon Indi Ba/Bb'],
    ['WISE 0855', 'WISE J085510.83-071442.5', 'WISE 0855-0714'],
    ['RW Aurigae', 'RW Aur', 'RW Aur A'],
    ['R Draconis', 'R Dra', 'HD 149880'],
  ];
  for (const [name, id, alias] of targets) {
    const result = search(name).exact;
    assert.equal(result?.type, 'object', name);
    assert.equal(result.id, id);
    assert.equal(search(alias).exact?.id, id);
    assert.match(result.evidence.url, /^https:\/\//);
  }
  assert.equal(search('Barnard’s Star time-lapse').exact?.type, 'action');
});

test('WISE 0855 designation coordinates and epoch estimate remain distinct', () => {
  const target = search('WISE 0855').exact;
  const [ra, dec] = search('RA 08h55m10.831s, declination -7d14m42.53s').results[0].position;
  assert.ok(Math.abs(ra - target.historical.ra) < 1e-9);
  assert.ok(Math.abs(dec - target.historical.dec) < 1e-9);
  assert.ok(target.ra < ra && target.dec > dec);
  assert.ok(search('08h60m10.831s -7d14m42.53s').error);
});
