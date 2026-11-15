import { angularSeparation } from './comparison.js';
import { references } from './sky-data.js';
import { sieveDemo } from './sieve-demo.js';

const curatedPositions = 'https://github.com/liquidation123/searchx_/blob/29becd64b93454c4ddb69c19160319414861566d/spherex-map/public/sky-data.js';
const archive = 'https://irsa.ipac.caltech.edu/Missions/spherex.html';
const instrument = 'https://spherex.caltech.edu/page/instrument';
const sieveEvidence = 'https://github.com/liquidation123/searchx_/blob/29becd64b93454c4ddb69c19160319414861566d/spherex-map/public/sieve-demo.js';
const nominalBands = ['0.75–1.09', '1.10–1.62', '1.63–2.41', '2.42–3.82', '3.83–4.41', '4.42–5.00'];
const messier = 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-';
const descriptions = {
  'Barnard 33': 'https://science.nasa.gov/asset/hubble/the-horsehead-nebula/',
  'M 42': messier + '42/', 'M 31': messier + '31/', 'M 101': messier + '101/',
  'M 1': messier + '1/', 'M 45': messier + '45/', 'M 51': messier + '51/', 'M 57': messier + '57/',
  'eps Ind B': 'https://arxiv.org/abs/2205.08077',
  'WISE J085510.83-071442.5': 'https://arxiv.org/abs/1408.5424',
  'RW Aur': 'https://chandra.harvard.edu/press/18_releases/press_071818.html',
  'R Dra': 'https://britastro.org/vss/objects/obj-dra.html',
};

const horseheadImage = 'https://science.nasa.gov/asset/hubble/horsehead-nebula-infrared/';
const publishedImages = {
  'Barnard 33': {
    url: 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/nebulae/emission/STScI-01EVT1JBQVFXQ7DWD6Q54K7B2M.png/jcr:content/renditions/480x630.jpg',
    caption: "Hubble near-infrared composite (WFC3/IR F110W and F160W). The dust pillar and backlit edge are visible. Credit NASA, ESA, and the Hubble Heritage Team (STScI/AURA).",
    source: horseheadImage,
  },
  'M 42': {
    url: 'https://science.nasa.gov/wp-content/uploads/2023/04/orion-nebula-xlarge_web-jpg.webp',
    caption: "Hubble Orion Treasury image of the Orion Nebula, where young stars illuminate the surrounding gas. Credit NASA, ESA, M. Robberto (STScI/ESA), and the Hubble Space Telescope Orion Treasury Project Team.",
    source: descriptions['M 42'],
  },
  'M 31': {
    url: 'https://science.nasa.gov/wp-content/uploads/2023/04/hs-2015-02-a-hires_jpg-jpg.webp',
    caption: "Hubble PHAT mosaic of a portion of Andromeda’s disk, resolving individual stars. Credit NASA, ESA, J. Dalcanton, B.F. Williams, and L.C. Johnson (University of Washington), the PHAT team, and R. Gendler.",
    source: descriptions['M 31'],
  },
  'M 1': {
    url: 'https://science.nasa.gov/wp-content/uploads/2023/04/crab-nebula-mosaic-jpg.webp',
    caption: "Hubble mosaic of the Crab Nebula and its filaments. Credit NASA, ESA, J. Hester, and A. Loll (Arizona State University).",
    source: descriptions['M 1'],
  },
  'M 45': {
    url: 'https://science.nasa.gov/wp-content/uploads/2023/04/interstellar_cloud_in_pleiades-jpg.webp',
    caption: "Hubble image of a reflection nebula near Merope in the Pleiades. Credit NASA and the Hubble Heritage Team (STScI/AURA), with acknowledgment to G. Herbig and T. Simon (University of Hawaii).",
    source: descriptions['M 45'],
  },
  'M 51': {
    url: 'https://science.nasa.gov/wp-content/uploads/2023/04/m51-and-companion_0-jpg.webp',
    caption: "Hubble image of the Whirlpool Galaxy with companion NGC 5195. Credit NASA, ESA, S. Beckwith (STScI), and the Hubble Heritage Team (STScI/AURA).",
    source: descriptions['M 51'],
  },
  'M 57': {
    url: 'https://science.nasa.gov/wp-content/uploads/2023/04/ring-nebula-full_jpg-jpg.webp',
    caption: "Hubble image of the Ring Nebula. Credit NASA, ESA, and the Hubble Heritage (STScI/AURA)–ESA/Hubble Collaboration.",
    source: descriptions['M 57'],
  },
  'M 101': {
    url: 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/galaxies/spiral/M101_HST_MIRI_V3_flat_FINAL_NewImage.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg',
    caption: "Hubble and Webb composite of the center of the Pinwheel Galaxy. Credit NASA, CSA, ESA, D. Calzetti, C. Clark, K. Kuntz, and B. Shappee. Image processing by Gladys Kober.",
    source: descriptions['M 101'],
  },
};

const parsedUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch { return null; }
};

function exposure(frame) {
  const source = parsedUrl(frame?.sourceUrl);
  const detector = /^SPHEREx-D([1-6])$/.exec(frame?.detector)?.[1];
  const product = source?.pathname.match(/\/(dr1|qr3)\/level2\/\d{4}W\d{2}_[A-Z0-9]+\/(l2b-v\d+-\d{4}-\d+)\/([1-6])\/(level2_[A-Za-z0-9_-]+\.fits)$/);
  const validHost = ['irsa.ipac.caltech.edu', 'nasa-irsa-spherex.s3.us-east-1.amazonaws.com'].includes(source?.hostname);
  if (!frame || !validHost || !product || product[3] !== detector || product[1].toUpperCase() !== frame.release ||
      !Number.isFinite(Date.parse(frame.observedAt)) || typeof frame.id !== 'string') return null;
  return {
    id: frame.id, detector: frame.detector, date: frame.observedAt,
    release: frame.release, version: product[2], band: nominalBands[Number(detector) - 1],
    url: source.href,
  };
}

export async function loadComparisonObservations(object, fetcher = fetch) {
  if (object.id === sieveDemo.id && object.source === 'SIEVE demo') {
    return {status: 'pinned', frames: sieveDemo.frames.map(exposure).filter(Boolean), partial: false};
  }
  if (object.radio) return {status: 'radio', frames: [], partial: false};
  try {
    const query = new URLSearchParams({ra: object.ra, dec: object.dec});
    const response = await fetcher('/spherex-observations?' + query, {signal: AbortSignal.timeout(26000)});
    if (!response.ok) throw Error('Archive unavailable');
    const result = await response.json();
    if (!['ready', 'empty'].includes(result.status) || !Array.isArray(result.frames)) throw Error('Invalid archive response');
    const frames = result.frames.map(exposure).filter(Boolean);
    if (!frames.length && result.status === 'ready') throw Error('No traceable exposure metadata');
    return {status: frames.length ? 'sample' : 'empty', frames, partial: !!result.truncated || frames.length !== result.frames.length};
  } catch { return {status: 'unavailable', frames: [], partial: false}; }
}

function fieldImage(object, curated, observation) {
  if (curated && Object.hasOwn(publishedImages, object.id)) return publishedImages[object.id];
  const frame = observation.frames[0];
  if (!frame) return null;
  const product = new URL(frame.url).pathname.replace(/^(?=\/(?:qr3|dr1)\/)/, '/ibe/data/spherex');
  const query = new URLSearchParams({product, ra: object.ra, dec: object.dec, v: '2'});
  return {
    url: '/spherex-preview?' + query,
    caption: object.name + ' field · NASA/IPAC IRSA SPHEREx, ' + frame.release + ' · ' + frame.id +
      '. The preview uses a display stretch.',
    source: frame.url,
  };
}

function describeCoverage(observation) {
  switch (observation.status) {
    case 'pinned': return 'Pinned SIEVE evidence exposures.';
    case 'sample': return observation.partial
      ? 'A sample of matching exposures was returned. Archive coverage is partial.'
      : 'A sample of matching exposures was returned.';
    case 'empty': return observation.partial
      ? 'The partial search returned no usable exposures.'
      : 'The archive query returned no matching exposures.';
    case 'radio': return 'The catalog entry records a radio event. There is no SPHEREx counterpart established here.';
    default: return 'The SPHEREx archive was unavailable for this position.';
  }
}

export function buildComparisonReport(pair, observations, comparisonUrl, date = new Date()) {
  const objects = ['A', 'B'].map(slot => {
    const object = pair[slot];
    const curated = references.find(item => item.id === object.id && item.ra === object.ra && item.dec === object.dec);
    const observation = observations[slot];
    const candidate = object.id === sieveDemo.id && object.source === 'SIEVE demo';
    return {
      ...object, slot, image: fieldImage(object, curated, observation),
      positionSource: curated ? curatedPositions : object.url,
      positionKind: curated ? 'SearchX reference position' : candidate ? 'Pinned candidate position' : 'Catalog position',
      descriptionSource: (curated && descriptions[object.id]) || object.url,
      coverage: describeCoverage(observation), exposures: observation.frames,
      retryable: observation.status === 'unavailable' || observation.partial,
      candidateEvidence: candidate ? sieveDemo.summary : null,
      frame: object.radio ? 'J2000 as displayed by SearchX' : 'ICRS',
    };
  });
  const [a, b] = objects;
  const orionCloudPair = ['M 42', 'Barnard 33'].every(id =>
    objects.some(object => object.id === id && object.descriptionSource === descriptions[id]));
  const context = orionCloudPair ? {
    text: 'Both nebulae belong to the Orion Molecular Cloud. In visible light, the Orion Nebula glows while dust in the Horsehead blocks light from gas behind it.',
    url: horseheadImage,
  } : null;
  const angle = angularSeparation(a, b);
  const classesKnown = a.classification && b.classification;
  const sameClass = classesKnown && a.classification.toLowerCase() === b.classification.toLowerCase();
  const sameVocabulary = a.source === b.source || objects.every(object => Object.hasOwn(descriptions, object.id));
  const classification = !classesKnown ? 'A classification is unavailable for at least one object.'
    : sameClass ? 'Both records list the same classification (' + a.classification + ').'
    : sameVocabulary ? a.name + ' is listed as ' + a.classification.toLowerCase() + ', and ' + b.name + ' as ' + b.classification.toLowerCase() + '.'
    : 'The two records use different labels. Their catalogs may classify objects at different levels of detail.';
  const detectorOverlap = a.exposures.some(first => b.exposures.some(second => first.detector === second.detector));
  const infrared = a.exposures.length && b.exposures.length
    ? detectorOverlap
      ? 'The returned metadata includes an overlapping detector band. SPHEREx samples wavelength by position on the detector, so the samples do not establish a matched wavelength or a brightness difference.'
      : 'The returned samples use different detector bands. The samples cannot establish a wavelength-matched comparison.'
    : 'The available data do not establish comparable infrared observations for both objects.';
  const scale = angle == null ? null : angle >= 1 ? [angle, '°'] : [angle * 3600, ' arcsec'];
  const uncertainty = objects.some(object => object.radio || object.positionEpoch || object.candidateEvidence);
  const separation = scale ? Number(scale[0].toPrecision(uncertainty ? 2 : 3)) + scale[1] : null;
  return {
    title: a.name + ' and ' + b.name,
    date: new Intl.DateTimeFormat('en-CA', {year:'numeric', month:'2-digit', day:'2-digit'}).format(date),
    comparisonUrl,
    objects, classification, separation, infrared, context,
    limitations: [
      'These coordinates give directions on the sky. Physical separation is unavailable because the comparison records do not supply two reliable distances with stated uncertainties.',
      'The report has no matched calibrated photometry, spectra, or per-target wavelength solutions. The archive result describes exposure coverage rather than a detection.',
      'Positions are used as recorded. A SearchX reference position may differ from a current catalog centroid. The angular calculation applies no proper-motion, epoch, or reference-frame transformation and propagates no astrometric uncertainties.',
    ],
    sources: [
      ...objects.flatMap(object => [
        {label: object.name + ' · ' + object.source + ' · ' + object.id, url: object.url},
        ...(object.descriptionSource !== object.url ? [{label: object.name + ' · object characteristics', url: object.descriptionSource}] : []),
      ]),
      ...(objects.some(object => object.positionSource === curatedPositions) ? [{label: 'SearchX · bundled reference positions used in calculation', url: curatedPositions}] : []),
      {label: 'NASA/IPAC IRSA · SPHEREx archive and release documentation', url: archive},
      {label: 'SPHEREx instrument · nominal detector bands', url: instrument},
      ...objects.filter(object => object.image && object.descriptionSource !== object.image.source)
        .map(object => ({label: object.name + ' · image documentation', url: object.image.source})),
      ...(objects.some(object => object.candidateEvidence) ? [{label: 'SearchX · pinned SIEVE Case A evidence and provenance', url: sieveEvidence}] : []),
    ].filter(source => parsedUrl(source.url)),
  };
}
