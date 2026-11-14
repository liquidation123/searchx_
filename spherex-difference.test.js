import { test } from 'node:test';
import assert from 'node:assert/strict';
import { differenceFrames } from './spherex-difference.mjs';

function exposure({ moving = 33, bright = 4, wavelength = 1 } = {}) {
  const pixels = Array(81).fill(2);
  pixels[29] += 10; // Steady source
  pixels[moving] += 6;
  pixels[57] += bright;
  pixels[0] = NaN; // Flagged coverage
  return {width:9,height:9,pixels,fwhm:7,wavelengths:Array(81).fill(wavelength),bands:Array(81).fill(.04)};
}

test('fixed early reference suppresses steady sources and retains positive changes', () => {
  const early = exposure();
  const later = exposure({moving:42,bright:9});
  const {frames,high} = differenceFrames([early, exposure(), later, exposure({wavelength:1.3})]);
  assert.equal(frames[2].pixels[29], 0);
  assert.equal(frames[2].pixels[33], 0);
  assert.equal(frames[2].pixels[42], 6);
  assert.equal(frames[2].pixels[57], 5);
  assert.ok(Number.isNaN(frames[2].pixels[0]));
  assert.ok(high > 0);
  assert.equal(frames[3], null);
  assert.equal(later.pixels[29], 12);
});

test('requires two early exposures and a later wavelength-compatible exposure', () => {
  assert.equal(differenceFrames([exposure(), exposure()]), null);
  assert.equal(differenceFrames([exposure(), exposure(), exposure({wavelength:1.3})]), null);
});
