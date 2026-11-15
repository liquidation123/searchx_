import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFavourite, parseFavourites } from './spherex-map/public/sky-data.js';

test('favourites persist valid catalog identity and position with safe links', () => {
  const object = {id:'M 31', name:'Andromeda', source:'SIMBAD', ra:10.68, dec:41.27, fov:4,
    description:'A galaxy', url:'https://example.org/source'};
  assert.deepEqual(parseFavourites(JSON.stringify([object, object])), [object]);
  assert.equal(normalizeFavourite({...object, url:'javascript:alert(1)'}).url, undefined);
  assert.equal(normalizeFavourite({...object, dec:91}), null);
  assert.deepEqual(parseFavourites('{broken'), []);
  assert.deepEqual(parseFavourites('{}'), []);
});
