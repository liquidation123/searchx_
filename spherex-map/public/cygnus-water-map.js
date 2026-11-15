// Registration and click sampling for the published Cygnus X H2O optical-depth map.
// WCS was fitted to the Galactic-coordinate ticks in Figure 3 of Hora et al. (2026).
export const cygnusWaterWcs = Object.freeze({
  NAXIS: 2,
  NAXIS1: 1600,
  NAXIS2: 1600,
  CTYPE1: 'GLON-TAN',
  CTYPE2: 'GLAT-TAN',
  CUNIT1: 'deg',
  CUNIT2: 'deg',
  EQUINOX: 2000,
  LONPOLE: 180,
  LATPOLE: 0,
  CRVAL1: 79.097794,
  CRVAL2: 0.593609,
  CRPIX1: 800.5,
  CRPIX2: 800.5,
  CD1_1: -0.003185378,
  CD1_2: 0,
  CD2_1: 0,
  CD2_2: -0.003185378,
});

const icrsToGalacticMatrix = [
  [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
  [ 0.4941094278755837, -0.4448296299600112,  0.7469822444972180],
  [-0.8676661490190047, -0.1980763734312015,  0.4559837761750669],
];
const degrees = 180 / Math.PI;
const radians = Math.PI / 180;

export function icrsToGalactic(ra, dec) {
  const alpha = ra * radians;
  const delta = dec * radians;
  const vector = [Math.cos(delta) * Math.cos(alpha), Math.cos(delta) * Math.sin(alpha), Math.sin(delta)];
  const [x, y, z] = icrsToGalacticMatrix.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));
  return { lon: (Math.atan2(y, x) * degrees + 360) % 360, lat: Math.asin(Math.max(-1, Math.min(1, z))) * degrees };
}

export function galacticToIcrs(lon, lat) {
  const lambda = lon * radians;
  const beta = lat * radians;
  const galactic = [Math.cos(beta) * Math.cos(lambda), Math.cos(beta) * Math.sin(lambda), Math.sin(beta)];
  const vector = [0, 1, 2].map(column => icrsToGalacticMatrix.reduce((sum, row, index) => sum + row[column] * galactic[index], 0));
  return { ra: (Math.atan2(vector[1], vector[0]) * degrees + 360) % 360, dec: Math.asin(vector[2]) * degrees };
}

export function galacticToWaterImagePixel(lon, lat) {
  const lon0 = cygnusWaterWcs.CRVAL1 * radians;
  const lat0 = cygnusWaterWcs.CRVAL2 * radians;
  const lambda = lon * radians;
  const beta = lat * radians;
  let delta = lambda - lon0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const denominator = Math.sin(lat0) * Math.sin(beta) + Math.cos(lat0) * Math.cos(beta) * Math.cos(delta);
  if (denominator <= 0) return null;
  const xi = Math.cos(beta) * Math.sin(delta) / denominator * degrees;
  const eta = (Math.cos(lat0) * Math.sin(beta) - Math.sin(lat0) * Math.cos(beta) * Math.cos(delta)) / denominator * degrees;
  const x = cygnusWaterWcs.CRPIX1 - 1 + xi / cygnusWaterWcs.CD1_1;
  const y = cygnusWaterWcs.CRPIX2 - 1 + eta / cygnusWaterWcs.CD2_2;
  if (x < 0 || y < 0 || x >= cygnusWaterWcs.NAXIS1 || y >= cygnusWaterWcs.NAXIS2) return null;
  return { x: Math.floor(x), y: Math.floor(y) };
}

// Relative brightness of the rasterized published figure, not a newly measured optical depth.
export function relativeWaterSignal(red, green, blue) {
  const luminance = .2126 * red + .7152 * green + .0722 * blue;
  return Math.max(0, Math.min(1, (luminance - 44) / 110));
}

export function waterSignalLabel(signal) {
  if (!Number.isFinite(signal)) return 'unavailable';
  if (signal >= .34) return 'stronger';
  if (signal >= .12) return 'moderate';
  return 'faint';
}
