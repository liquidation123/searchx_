import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nearestWavelengthIndex, spectralFeatures, spectralRegions } from './spherex-map/public/spectral-guide.js';

test('nearestWavelengthIndex maps a requested molecular band to the closest channel', () => {
  assert.equal(nearestWavelengthIndex([2.9, 3.02, 3.1], 3.0), 1);
  assert.equal(nearestWavelengthIndex([4.0, 4.2, 4.4], 4.3), 1);
});

test('nearestWavelengthIndex handles missing channels and invalid requests', () => {
  assert.equal(nearestWavelengthIndex([NaN, 1, 3], 2.7), 2);
  assert.equal(nearestWavelengthIndex([], 3), -1);
  assert.equal(nearestWavelengthIndex([1], NaN), -1);
});

test('region and feature metadata only advertise published examples', () => {
  assert.deepEqual(spectralRegions.map(region => region.id), ['cygnus-x', 'north-american', 'rosette']);
  assert.deepEqual(spectralFeatures.map(feature => feature.wavelength), [3.0, 4.27, 4.67, 3.28]);
  assert.deepEqual(spectralFeatures.find(feature => feature.id === 'pah').regions, ['cygnus-x', 'north-american', 'rosette']);
  assert.deepEqual(spectralFeatures.find(feature => feature.id === 'water-ice').regions, ['cygnus-x', 'north-american']);
});

test('the Observatory guide labels its Cygnus visual as published evidence, not a live cursor detection', async () => {
  const html = await readFile(new URL('./spherex-map/public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('./spherex-map/public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="spectral-published-result" hidden/);
  assert.match(html, /See the Cygnus X water map/);
  assert.match(html, /id="spectral-result-status"/);
  assert.match(html, /Published SPHEREx view of Cygnus X/);
  assert.match(app, /dataset\.feature = feature\.id/);
  assert.match(app, /data-feature.*water-ice/);
  assert.match(app, /Published SPHEREx map: \$\{feature.label\} is mapped in Cygnus X/);
  assert.match(app, /This region-level map is separate from the live brightness view above/);
  assert.match(app, /this app does not calculate its strength at the cursor/);
});
