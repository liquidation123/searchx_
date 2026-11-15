import { references } from './spherex-map/public/sky-data.js';
import { queryObservations } from './spherex-observations.mjs';

const published = [
  {slug:'m42', id:'M 42', aliases:['M42','NGC 1976','Orion Nebula'], type:'Emission nebula', summary:'The Orion Nebula is a cloud of gas and dust where new stars are forming.', detail:'Its bright central region is shaped by young, massive stars in the Trapezium cluster.', science:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-42/', imageUrl:'https://science.nasa.gov/wp-content/uploads/2023/04/orion-nebula-xlarge_web-jpg.webp'},
  {slug:'m31', id:'M 31', aliases:['M31','NGC 224','Andromeda Galaxy'], type:'Spiral galaxy', summary:'The Andromeda Galaxy is the nearest major galaxy to the Milky Way.', detail:'Its broad disk makes it a useful nearby example for studying stars and the history of a spiral galaxy.', science:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-31/', imageUrl:'https://science.nasa.gov/wp-content/uploads/2023/04/hs-2015-02-a-hires_jpg-jpg.webp'},
  {slug:'m1', id:'M 1', aliases:['M1','NGC 1952','Crab Nebula'], type:'Supernova remnant', summary:'The Crab Nebula is the remnant of a stellar explosion observed in 1054.', detail:'The expanding nebula surrounds a rapidly spinning neutron star known as the Crab Pulsar.', science:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-1/', imageUrl:'https://science.nasa.gov/wp-content/uploads/2023/04/crab-nebula-mosaic-jpg.webp'},
  {slug:'m101', id:'M 101', aliases:['M101','NGC 5457','Pinwheel Galaxy'], type:'Spiral galaxy', summary:'The Pinwheel Galaxy is a nearly face-on spiral galaxy.', detail:'Its orientation makes the spiral arms and star-forming regions especially clear in wide-field views.', science:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-101/', imageUrl:'https://science.nasa.gov/wp-content/uploads/2023/04/m101-jpg.webp?w=2048'},
];

export const publicObjects = Object.freeze(published.map(item => {
  const reference = references.find(value => value.id === item.id);
  if (!reference) throw new Error('Missing curated object reference: ' + item.id);
  return Object.freeze({ ...item, name: reference.name, ra: reference.ra, dec: reference.dec, fov: reference.fov,
    coordinateSystem: 'ICRS', positionUncertainty: null,
    catalogSource: {name:'SIMBAD astronomical database mirror', url:'https://simbad.cfa.harvard.edu/simbad/sim-id?Ident=' + encodeURIComponent(item.id)},
    scienceSource: {name:'NASA Hubble Messier Catalog', url:item.science}, imageSource:{name:'NASA Hubble Messier Catalog image (full credit at source)',url:item.science} });
}));

export function getPublicObject(slug) { return publicObjects.find(object => object.slug === slug) ?? null; }

export function searchPublicObjects(query) {
  if (typeof query !== 'string' || query.length > 100) return [];
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return publicObjects.filter(object => [object.id, object.name, object.type, ...object.aliases]
    .some(value => value.toLowerCase().includes(term))).slice(0, 10);
}

export function imageForObject(object) {
  if (!object) return null;
  return { url:object.imageUrl, survey:'NASA published astronomy image', source:object.imageSource,
    note:'Published NASA image. This is not a live SPHEREx exposure or a new SearchX measurement; see the source for filters and full image credit.' };
}

export function evidenceForObject(object) {
  if (!object) return null;
  return [
    {claim:`${object.id} is identified as ${object.name}.`, kind:'catalog identity', source:object.catalogSource},
    {claim:`SearchX points the map at ICRS RA ${object.ra}°, Dec ${object.dec}°.`, kind:'catalog pointing position', source:object.catalogSource,
      limitation:'The listed center is for navigation. Positional uncertainty is not supplied here.'},
    {claim:object.summary, kind:'scientific description', source:object.scienceSource},
    {claim:`The preview is an image published in NASA’s Hubble Messier Catalog.`, kind:'image provenance', source:object.imageSource,
      limitation:'Image appearance alone does not establish a new detection or SIEVE verification.'},
  ];
}

export async function observationsForObject(object) {
  if (!object) return null;
  const result = await queryObservations(object.ra, object.dec);
  return { object_id:object.id, position:{ra:object.ra,dec:object.dec,frame:'ICRS'},
    archive:'NASA/IPAC IRSA SPHEREx DR1 and QR3', archiveUrl:'https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/',
    status:result.status, truncated:result.truncated ?? false,
    frames:result.frames.map(frame => ({id:frame.id,detector:frame.detector,release:frame.release,
      observedAt:frame.observedAt,mjd:frame.mjd,sourceUrl:frame.sourceUrl,cutoutUrl:frame.cutoutUrl})),
    measurementUncertainty:null,
    limitation:'A positional archive match is not an identification, flux measurement, or SIEVE-verified detection. No photometric uncertainty is supplied by this metadata response.' };
}
