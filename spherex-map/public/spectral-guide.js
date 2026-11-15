// Region and feature metadata is kept separate so the guide can grow with new
// SPHEREx products without changing the map controls.
export const spectralFeatures = [
  {
    id: 'water-ice', label: 'Water ice · H₂O', wavelength: 3.0, kind: 'absorption',
    detail: 'A broad dip near 3 μm can trace water ice on dust grains. Compare the band with its surrounding continuum; brightness alone is not a detection.',
    regions: ['cygnus-x', 'north-american'], source: 'https://doi.org/10.3847/1538-4357/ae5180',
  },
  {
    id: 'carbon-dioxide', label: 'Carbon dioxide ice · CO₂', wavelength: 4.27, kind: 'absorption',
    detail: 'The 4.27 μm ice band is a narrow feature. It needs the calibrated channel response and careful checks for the detector transition and bad pixels.',
    regions: ['cygnus-x', 'north-american'], source: 'https://doi.org/10.3847/1538-4357/ae5180',
  },
  {
    id: 'carbon-monoxide', label: 'Carbon monoxide ice · CO', wavelength: 4.67, kind: 'absorption',
    detail: 'The 4.67 μm band can reveal CO ice. Interpret it with a continuum model and channel quality information, not as a single bright or dark pixel.',
    regions: ['cygnus-x', 'north-american'], source: 'https://doi.org/10.3847/1538-4357/ae5180',
  },
  {
    id: 'pah', label: 'PAH emission', wavelength: 3.28, kind: 'emission',
    detail: 'Emission near 3.28 μm can come from PAHs. Published SPHEREx maps use forward modelling to account for the wavelength-varying filter and striping.',
    regions: ['cygnus-x', 'north-american', 'rosette'], source: 'https://arxiv.org/abs/2611.12846',
  },
];

export const spectralRegions = [
  {
    id: 'cygnus-x', name: 'Cygnus X', ra: 308.0, dec: 41.0, fov: 8,
    note: 'A star-forming cloud with published SPHEREx maps of water ice, CO₂ ice, CO ice and PAH emission.',
    source: 'https://doi.org/10.3847/1538-4357/ae5180',
  },
  {
    id: 'north-american', name: 'North American Nebula', ra: 314.7, dec: 44.5, fov: 6,
    note: 'A nearby star-forming region included in published SPHEREx ice and PAH mapping.',
    source: 'https://doi.org/10.3847/1538-4357/ae5180',
  },
  {
    id: 'rosette', name: 'Rosette Nebula', ra: 97.98, dec: 4.93, fov: 5,
    note: 'A published SPHEREx PAH-emission mapping example. Ice maps are not claimed here.',
    source: 'https://arxiv.org/abs/2611.12846',
  },
];

export function nearestWavelengthIndex(wavelengths, target) {
  if (!Array.isArray(wavelengths) || !wavelengths.length || !Number.isFinite(target)) return -1;
  let best = -1;
  for (let index = 0; index < wavelengths.length; index++) {
    if (!Number.isFinite(wavelengths[index])) continue;
    if (best < 0 || Math.abs(wavelengths[index] - target) < Math.abs(wavelengths[best] - target)) best = index;
  }
  return best;
}
