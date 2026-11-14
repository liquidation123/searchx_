import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSesame } from './name-resolve.mjs';
import { serveGaiaField } from './gaia-field.mjs';

test('Sesame parser preserves catalog identity, coordinates and classification', () => {
  const result = parseSesame('<Sesame><Resolver name="Simbad"><oname>* alf CMa</oname><otype>SB*</otype><jradeg>101.287155333</jradeg><jdedeg>-16.716115861</jdedeg></Resolver></Sesame>');
  assert.deepEqual(result, { ra:101.287155333, dec:-16.716115861, id:'* alf CMa', category:'SB*' });
  assert.equal(parseSesame('<Sesame><Resolver><oname>Unknown</oname></Resolver></Sesame>'), null);
  assert.equal(parseSesame('<Sesame><Resolver><jradeg>400</jradeg><jdedeg>0</jdedeg></Resolver></Sesame>'), null);
});

test('Gaia field rejects unbounded and invalid cone queries before contacting archive', async () => {
  for (const query of ['', '?ra=10&dec=0&radius=0.09', '?ra=10&dec=91&radius=0.02']) {
    let code, body;
    const response = { writeHead(status) { code=status; return this; }, end(value) { body=JSON.parse(value); } };
    await serveGaiaField(new URL('http://localhost/gaia-field'+query), response);
    assert.equal(code, 400);
    assert.equal(body.status, 'invalid_field');
  }
});
