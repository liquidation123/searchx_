import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibratedCutout, differenceFrames } from './spherex-difference.mjs';

test('IRSA DR1 layout retains SOURCE-only pixels and masks combined quality flags', () => {
  const header = new Map(Object.entries({
    NAXIS1: '58', NAXIS2: '58', BITPIX: '-32', BUNIT: 'MJy / sr', RADESYS: 'ICRS',
    CTYPE1: 'RA---TAN-SIP', CTYPE2: 'DEC--TAN-SIP', PSF_FWHM: '7.530770327317724',
    CRVAL1: '85.013835', CRVAL2: '-2.463945', CRPIX1: '29.5', CRPIX2: '29.5',
    PC1_1: String(-6.15/3600), PC1_2: '0', PC2_1: '0', PC2_2: String(6.15/3600),
    CDELT1: '1', CDELT2: '1', CTYPE1W: 'WAVE-TAB', CTYPE2W: 'WAVE-TAB',
    PS1_0W: 'WCS-WAVE', PS2_0W: 'WCS-WAVE', CRPIX1W: '-1915', CRPIX2W: '-785',
    CRVAL1W: '1', CRVAL2W: '1', CDELT1W: '1', CDELT2W: '1',
  }));
  const data = Buffer.alloc(58*58*4), flagData = Buffer.alloc(data.length);
  for (let i=0;i<data.length;i+=4) {
    data.writeFloatBE(2,i);
    flagData.writeInt32BE(1<<21,i);
  }
  flagData.writeInt32BE((1<<21)|1, 4*(29*58+29));
  const table = Buffer.alloc(720);
  for (let i=0;i<9;i++) {
    table.writeInt32BE(1+255*i,4*i);
    table.writeInt32BE(1+255*i,36+4*i);
  }
  for (let i=0;i<81;i++) {
    table.writeFloatBE(.95,72+8*i);
    table.writeFloatBE(.02,76+8*i);
  }
  const maskHeader = new Map(header).set('BITPIX','32');
  const waveHeader = new Map(Object.entries({TTYPE1:'X',TTYPE2:'Y',TTYPE3:'VALUES',
    TFORM1:'9J',TFORM2:'9J',TFORM3:'162E',TDIM3:'(2,9,9)'}));
  const frame = calibratedCutout(new Map([
    ['IMAGE',{header,data}], ['FLAGS',{header:maskHeader,data:flagData}],
    ['WCS-WAVE',{header:waveHeader,data:table}],
  ]),85.013835,-2.463945);
  assert.ok(frame.pixels.filter(Number.isFinite).length > 3000);
  assert.ok(Number.isNaN(frame.pixels[1624]));
  assert.ok(Math.abs(frame.wavelengths[1624]-.95) < 1e-6);
  assert.ok(differenceFrames([frame,frame,frame]));
});

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
