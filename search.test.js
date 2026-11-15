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

test('requested objects resolve exactly by name, common alias, or catalog ID', () => {
  for (const [query, id] of [
    ['M42', 'M 42'], ['Orion Nebula', 'M 42'], ['M31', 'M 31'], ['Andromeda', 'M 31'],
    ['Horsehead Nebula', 'Barnard 33'], ['Barnard 33', 'Barnard 33'], ['M45', 'M 45'],
    ['M51', 'M 51'], ['M57', 'M 57'], ['Take me to the Pleiades in the sky', 'M 45']
  ]) assert.equal(search(query).exact?.id, id, query);
});

test('approximate matches and ambiguous phrases require a selection', () => {
  assert.equal(search('andromda').results[0]?.id, 'M 31');
  assert.equal(search('andromda').exact, undefined);
  assert.equal(search('galaxy near the big dipper').ambiguous, true);
  assert.equal(search('NGC 1977').results.length, 0);
  assert.equal(search('WISE J085510.83+071442.5').results.length, 0);
  assert.ok(search('???').error);
});
