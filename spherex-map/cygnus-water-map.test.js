import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cygnusWaterWcs, galacticToIcrs, icrsToGalactic, galacticToWaterImagePixel,
  relativeWaterSignal, waterSignalLabel,
} from './public/cygnus-water-map.js';

test('Cygnus map center transforms to the center pixel and back', () => {
  const { ra, dec } = galacticToIcrs(cygnusWaterWcs.CRVAL1, cygnusWaterWcs.CRVAL2);
  const galactic = icrsToGalactic(ra, dec);
  const pixel = galacticToWaterImagePixel(galactic.lon, galactic.lat);
  assert.deepEqual(pixel, { x: 799, y: 799 });
  assert.ok(Math.abs(galactic.lon - cygnusWaterWcs.CRVAL1) < 1e-8);
  assert.ok(Math.abs(galactic.lat - cygnusWaterWcs.CRVAL2) < 1e-8);
});

test('map pixel conversion rejects positions outside its footprint', () => {
  assert.equal(galacticToWaterImagePixel(0, 0), null);
});

test('relative signal labels reflect the rendered map color only', () => {
  assert.equal(relativeWaterSignal(44, 44, 44), 0);
  assert.equal(waterSignalLabel(relativeWaterSignal(75, 75, 75)), 'moderate');
  assert.equal(waterSignalLabel(relativeWaterSignal(200, 200, 200)), 'stronger');
  assert.equal(waterSignalLabel(Number.NaN), 'unavailable');
});
