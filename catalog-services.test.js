import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSesame } from './name-resolve.mjs';
import { serveGaiaField } from './gaia-field.mjs';
import { parseChimeEvent } from './chime-event.mjs';

test('Sesame parser preserves catalog identity, coordinates and classification', () => {
  const result = parseSesame('<Sesame><Resolver name="Simbad"><oname>* alf CMa</oname><otype>SB*</otype><jradeg>101.287155333</jradeg><jdedeg>-16.716115861</jdedeg></Resolver></Sesame>');
  assert.deepEqual(result, { ra:101.287155333, dec:-16.716115861, id:'* alf CMa', category:'SB*' });
  assert.equal(parseSesame('<Sesame><Resolver><oname>Unknown</oname></Resolver></Sesame>'), null);
  assert.equal(parseSesame('<Sesame><Resolver><jradeg>400</jradeg><jdedeg>0</jdedeg></Resolver></Sesame>'), null);
});

test('CHIME event keeps published position, uncertainty, radio measurements and provenance', () => {
  const source = parseChimeEvent({ rows: [{ tns_name:'FRB20180725A', ra:93.7025, dec:64.7582,
    ra_err:.00608, dec_err:.0223, mjd_400:58324.7498, dm_fitb:715.91, event_id:'9386707', excluded_flag:1 }] }, 'FRB20180725A');
  assert.equal(source.source, 'CHIME/FRB Catalog 2');
  assert.equal(source.category, 'RADIO TRANSIENT');
  assert.equal(source.radio.raError, .00608);
  assert.equal(source.radio.dm, 715.91);
  assert.equal(source.radio.excluded, true);
  assert.equal(parseChimeEvent({ rows:[{ tns_name:'FRB20180725A', ra:93, dec:92 }] }, 'FRB20180725A'), null);
});

test('Gaia field rejects unbounded and invalid cone queries before contacting archive', async () => {
  for (const query of ['', '?ra=10&dec=0&radius=0.36&limit=500', '?ra=10&dec=91&radius=0.02&limit=100', '?ra=10&dec=0&radius=0.02&limit=10000']) {
    let code, body;
    const response = { writeHead(status) { code=status; return this; }, end(value) { body=JSON.parse(value); } };
    await serveGaiaField(new URL('http://localhost/gaia-field'+query), response);
    assert.equal(code, 400);
    assert.equal(body.status, 'invalid_field');
  }
});
