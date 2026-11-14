export const surveyRoot = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube';
export const references = [
  { id: 'Barnard 33', name: 'Horsehead Nebula', ra: 85.24583, dec: -2.45833, fov: 1.25, description: 'A dark dust cloud silhouetted against the glowing gas of IC 434.', source: 'SIMBAD' },
  { id: 'M 42', name: 'Orion Nebula', ra: 83.82208, dec: -5.39111, fov: 2, description: 'A nearby emission nebula and region of active star formation.', source: 'SIMBAD' },
  { id: 'M 31', name: 'Andromeda Galaxy', ra: 10.684708, dec: 41.26875, fov: 4, description: 'A large spiral galaxy in the Local Group.', source: 'SIMBAD' },
  { id: 'M 101', name: 'Pinwheel Galaxy', ra: 210.80227, dec: 54.34895, fov: 2, description: 'A face-on spiral galaxy in Ursa Major. The coordinates are the target position in the IRSA cutout tutorial.', source: 'IRSA / NED', url: 'https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/' },
  { id: 'M 1', name: 'Crab Nebula', ra: 83.6332, dec: 22.0145, fov: 0.6, description: 'The remnant of a supernova observed in 1054.', source: 'SIMBAD' },
  { id: 'M 45', name: 'Pleiades', ra: 56.75, dec: 24.1167, fov: 3, description: 'An open cluster of young stars also called the Seven Sisters.', source: 'SIMBAD' },
  { id: 'M 51', name: 'Whirlpool Galaxy', ra: 202.4696, dec: 47.1952, fov: 0.8, description: 'A spiral galaxy interacting with a smaller companion.', source: 'SIMBAD' },
  { id: 'M 57', name: 'Ring Nebula', ra: 283.3962, dec: 33.0291, fov: 0.4, description: 'A shell of gas shed by a dying star.', source: 'SIMBAD' },
  { id: 'eps Ind B', name: 'Epsilon Indi B', ra: 331.09664, dec: -56.80066, fov: 0.25, description: 'A nearby brown dwarf pair. The pin shows an approximate position at epoch 2026.0.', source: 'SIMBAD' },
  { id: 'WISE J085510.83-071442.5', name: 'WISE 0855', ra: 133.75989, dec: -7.24224, fov: 0.25, description: 'A nearby, very cold brown dwarf. The pin shows an approximate position at epoch 2026.0.', source: 'SIMBAD' },
  { id: 'RW Aur', name: 'RW Aurigae', ra: 76.95653, dec: 30.40144, fov: 0.25, description: 'A young variable star system in Auriga. Position epoch J2000.0.', source: 'SIMBAD' },
  { id: 'R Dra', name: 'R Draconis', ra: 248.16667, dec: 66.75472, fov: 0.25, description: 'A long-period variable star in Draco. Position epoch J2000.0.', source: 'SIMBAD' },
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
  const pair = input.trim().replaceAll('−', '-').split(/\s*,\s*|\s+/);
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
