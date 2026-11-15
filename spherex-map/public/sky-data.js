export const surveyRoot = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube';
const archiveEpoch = 2026;
function movingTarget(target, anchor, motion) {
  // Approximate the center of the survey field using linear proper motion.
  // The RA motion is μα cos δ in milliarcseconds per year.
  const years = archiveEpoch - anchor.epoch;
  const [east, north] = motion;
  return {
    ...target,
    ra: anchor.ra + years * east / (3_600_000 * Math.cos(anchor.dec * Math.PI / 180)),
    dec: anchor.dec + years * north / 3_600_000,
    positionLabel: 'ICRS · estimated for 2026.0',
  };
}

export const featuredTargets = [
  movingTarget({
    id: 'GJ 699', slug: 'barnards-star', name: 'Barnard’s Star', fov: .18,
    category: 'Red dwarf', aliases: ["Barnard's Star", 'barnards star', 'barnard star', 'GJ699', 'Gliese 699', 'HIP 87937'],
    description: 'A nearby red dwarf that moves about 10.4 arcseconds across the sky each year.',
    source: 'Gaia DR3', url: 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Gaia+DR3+4472832130942575872',
    evidence: { label: 'Open NASA’s Barnard’s Star record', url: 'https://exoplanetarchive.ipac.caltech.edu/overview/GJ-699' },
    timeLapse: true,
  }, {ra: 269.448503, dec: 4.739420, epoch: 2016}, [-801.551, 10362.394]),
  movingTarget({
    id: 'eps Ind B', slug: 'epsilon-indi-b', name: 'Epsilon Indi B', fov: .25,
    category: 'Brown dwarf pair', aliases: ['ε Indi B', 'Epsilon Indi Ba/Bb', 'Epsilon Indi Ba', 'Epsilon Indi Bb',
      'eps Ind Ba', 'eps Ind Bb', 'GJ 845 B', '2MASS J22041052-5646577'],
    description: 'Ba and Bb orbit each other. Together they form a distant companion to the star Epsilon Indi A.',
    source: '2MASS / McCaughrean et al.', url: 'https://www.aanda.org/articles/aa/pdf/2004/03/aa0292.pdf',
    evidence: { label: 'See the resolved pair in ESO data', url: 'https://www.eso.org/sci/activities/vltsv/visirsv/sterzik.html',
      note: 'The two brown dwarfs are separated by less than one arcsecond in the published images. SPHEREx shows their field.' },
    historical: { label: '1999 2MASS position', ra: 331.04383333, dec: -56.78269444 },
  }, {ra: 331.04383333, dec: -56.78269444, epoch: 1999.855}, [3960.93, -2539.23]),
  movingTarget({
    id: 'WISE J085510.83-071442.5', slug: 'wise-0855', name: 'WISE 0855', fov: .18,
    category: 'Cold brown dwarf', aliases: ['WISE0855', 'WISE 0855-0714', 'WISEA J085510.74-071442.5', 'J085510.83-071442.5'],
    description: 'A very cold brown dwarf. It shifts about 8 arcseconds per year and is extremely faint in visible light.',
    source: 'Luhman & Esplin', url: 'https://arxiv.org/html/1605.06655',
    evidence: { label: 'See the brown dwarf in infrared images', url: 'https://doi.org/10.1051/0004-6361/201628662',
      note: 'Published infrared images identify it at earlier dates. A SPHEREx exposure covers the field and may not show the dwarf.' },
    historical: {label: 'WISE designation coordinates', ra: 133.795129166667, dec: -7.245147222222},
  }, {ra: 133.7840688, dec: -7.2441796, epoch: 2000 + (57123.17 - 51544.5) / 365.25}, [-8188, 680]),
  {
    id: 'RW Aur', slug: 'rw-aurigae', name: 'RW Aurigae', ra: 76.95654, dec: 30.40144, fov: .16,
    category: 'Young variable star', aliases: ['RW Aur A', 'RW Aurigae A', 'HD 240764'],
    description: 'A young binary with deep, irregular drops in brightness. Dust around the system can block light from the primary star.',
    source: 'AAVSO VSX', url: 'https://vsx.aavso.org/index.php?revid=418953&view=detail.top',
    positionLabel: 'ICRS · J2000.0',
    evidence: { label: 'See the published RW Aur light curves', url: 'https://arxiv.org/html/1512.03745#S2.F2',
      note: 'Use the light curve to look for dips in brightness over time.' },
  },
  {
    id: 'R Dra', slug: 'r-draconis', name: 'R Draconis', ra: 248.16761083, dec: 66.75497942, fov: .16,
    category: 'Mira variable', aliases: ['HD 149880', 'V* R Dra'],
    description: 'A pulsating red giant in Draco. Its brightness rises and falls on a cycle of about 246 days.',
    source: 'SIMBAD', url: 'https://simbad.u-strasbg.fr/simbad/sim-id?Ident=R+Dra',
    positionLabel: 'ICRS · J2000.0',
    evidence: { label: 'See the BAA light curve', url: 'https://britastro.org/vss/objects/gifm/00166a.gif',
      note: 'Compare several peaks to see the repeating brightness cycle.' },
  },
];

export const references = [
  { id: 'Barnard 33', name: 'Horsehead Nebula', ra: 85.24583, dec: -2.45833, fov: 1.25, description: 'A cloud of gas and dust that appears dark against the glowing gas behind it.', source: 'SIMBAD' },
  { id: 'M 42', name: 'Orion Nebula', ra: 83.82208, dec: -5.39111, fov: 2, description: 'A nearby cloud of glowing gas and dust where new stars are forming.', source: 'SIMBAD' },
  { id: 'M 31', name: 'Andromeda Galaxy', ra: 10.684708, dec: 41.26875, fov: 4, description: 'A spiral galaxy: a vast collection of stars, gas and dust held together by gravity.', source: 'SIMBAD' },
  { id: 'M 101', name: 'Pinwheel Galaxy', ra: 210.80227, dec: 54.34895, fov: 2, description: 'A spiral galaxy seen nearly face-on. Its position is the target used in an IRSA cutout tutorial.', source: 'IRSA / NED', url: 'https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/' },
  { id: 'M 1', name: 'Crab Nebula', ra: 83.6332, dec: 22.0145, fov: 0.6, description: 'An expanding remnant of a star that exploded as a supernova in 1054.', source: 'SIMBAD' },
  { id: 'M 45', name: 'Pleiades', ra: 56.75, dec: 24.1167, fov: 3, description: 'An open cluster of young stars also called the Seven Sisters.', source: 'SIMBAD' },
  { id: 'M 51', name: 'Whirlpool Galaxy', ra: 202.4696, dec: 47.1952, fov: 0.8, description: 'A spiral galaxy interacting with a smaller companion.', source: 'SIMBAD' },
  { id: 'M 57', name: 'Ring Nebula', ra: 283.3962, dec: 33.0291, fov: 0.4, description: 'A shell of gas shed by a dying star.', source: 'SIMBAD' },
  ...featuredTargets,
];

export function parseProperties(raw) {
  const values = Object.fromEntries(raw.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
    return match ? [[match[1], match[2]]] : [];
  }));
  const wavelengths = values.data_cube_crval3_arr?.split(/\s+/).map(Number);
  if (!wavelengths || values.data_cube_bunit3 !== 'um' || wavelengths.length !== 102 ||
      Number(values.hips_cube_depth) !== wavelengths.length ||
      wavelengths.some((value, index) => !Number.isFinite(value) || value <= (wavelengths[index - 1] ?? 0))) {
    throw new Error('Unexpected IRSA wavelength metadata.');
  }
  return wavelengths;
}

export function coordinates(input) {
  const normalized = input.trim().replaceAll('−', '-');
  const marked = normalized.match(/^(?:RA\s*[:=]?\s*)?(\d+)h\s*(\d+)m\s*(\d+(?:\.\d+)?)s\s*(?:,\s*)?(?:Dec(?:lination)?\s*[:=]?\s*)?([+-]?\d+)[d°]\s*(\d+)[m′']\s*(\d+(?:\.\d+)?)[s″"]$/i);
  const pair = marked
    ? [marked.slice(1, 4).join(':'), marked.slice(4, 7).join(':')]
    : normalized.split(/\s*,\s*|\s+/);
  if (pair.length !== 2) return null;
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const sexagesimal = /^[+-]?\d+:\d{1,2}:\d{1,2}(?:\.\d+)?$/;
  const angles = pair.map((value, index) => {
    if (decimal.test(value)) return Number(value);
    if (!sexagesimal.test(value)) return NaN;
    const [whole, minutes, seconds] = value.replace(/^[+-]/, '').split(':').map(Number);
    if (minutes >= 60 || seconds >= 60) return NaN;
    return (value.startsWith('-') ? -1 : 1) * (whole + minutes / 60 + seconds / 3600) * (index === 0 ? 15 : 1);
  });
  const [ra, dec] = angles;
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || Math.abs(dec) > 90) {
    throw new Error('Use RA from 0° to <360° and Dec from −90° to +90°. For sexagesimal use HH:MM:SS ±DD:MM:SS.');
  }
  return angles;
}

// Shared links contain only a complete, validated map state.
export function decodeView(search, channelCount = 102) {
  const params = new URLSearchParams(search);
  const keys = ['ra', 'dec', 'fov', 'survey', 'channel'];
  if (!keys.some(key => params.has(key))) return null;
  if (keys.some(key => params.getAll(key).length > 1)) return null;
  const number = key => {
    const value = params.get(key);
    return value && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ? Number(value) : NaN;
  };
  const ra = number('ra'), dec = number('dec'), fov = number('fov');
  const survey = params.get('survey');
  if (!Number.isFinite(ra) || ra < 0 || ra >= 360 || !Number.isFinite(dec) || Math.abs(dec) > 90 ||
      !Number.isFinite(fov) || fov <= 0 || fov > 180 || !['optical', 'infrared'].includes(survey)) return null;
  if (survey === 'optical') return params.has('channel') ? null : {ra, dec, fov, survey};
  const raw = params.get('channel');
  if (!raw || !/^\d+$/.test(raw)) return null;
  const channel = Number(raw);
  if (!Number.isSafeInteger(channel) || channel >= channelCount || [50, 51].includes(channel)) return null;
  return {ra, dec, fov, survey, channel};
}

export function encodeView(base, state) {
  const url = new URL(base);
  url.search = ''; url.hash = '';
  for (const key of ['ra', 'dec', 'fov', 'survey', 'channel']) {
    if (state[key] !== undefined) url.searchParams.set(key, String(state[key]));
  }
  if (!decodeView(url.search)) throw new Error('Cannot share this sky view.');
  return url.href;
}

export function restoreView(state, {pointAt, setSurvey}) {
  if (!state) return;
  setSurvey(state.survey, state.channel);
  pointAt(state.ra, state.dec, state.fov);
}

export function normalizeFavourite(item) {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() ||
      typeof item.name !== 'string' || !item.name.trim() || typeof item.source !== 'string' || !item.source.trim() ||
      !Number.isFinite(item.ra) || item.ra < 0 || item.ra >= 360 ||
      !Number.isFinite(item.dec) || Math.abs(item.dec) > 90) return null;
  const result = {id: item.id.slice(0, 256), name: item.name.slice(0, 256), source: item.source.slice(0, 128), ra: item.ra, dec: item.dec};
  for (const key of ['description', 'category']) if (typeof item[key] === 'string') result[key] = item[key].slice(0, 1000);
  if (Number.isFinite(item.fov) && item.fov > 0 && item.fov <= 180) result.fov = item.fov;
  if (typeof item.url === 'string') {
    try { const url = new URL(item.url); if (url.protocol === 'https:') result.url = url.href; } catch {}
  }
  // Radio details are restored from the catalog on selection, rather than saved as an incomplete object.
  return result;
}

export function parseFavourites(raw) {
  try {
    const items = JSON.parse(raw || '[]');
    if (!Array.isArray(items)) return [];
    const result = new Map();
    for (const item of items.slice(0, 500)) {
      const entry = normalizeFavourite(item);
      if (entry) result.set(entry.source + '\0' + entry.id, entry);
    }
    return [...result.values()];
  } catch { return []; }
}
