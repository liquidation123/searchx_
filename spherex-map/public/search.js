import { coordinates, hasSkyPosition, references } from './sky-data.js';

const lessons = [
  {id:'birth', name:'How are stars born?', aliases:['where are stars born','star formation','birth of stars'], keywords:'stars born birth nebula formation', description:'Explore how clouds of gas and dust become stars.', body:'Stars form when dense regions within clouds of gas and dust collapse under gravity. As a young star grows, its core heats until nuclear fusion begins. Infrared observations help reveal young stars hidden by dust.', url:'https://science.nasa.gov/universe/stars/'},
  {id:'colour', name:'Why do stars change colour?', aliases:['why are some stars red','red stars','star color','star colour'], keywords:'stars red color colour temperature', description:'Colour offers clues to a star’s surface temperature.', body:'A star’s colour is related to its surface temperature: hotter stars generally appear blue-white, while cooler stars appear red. Dust and intervening material can also redden starlight.', url:'https://science.nasa.gov/universe/stars/'},
  {id:'death', name:'What happens when stars die?', aliases:['why do stars die','stars that explode','supernova','exploding stars','death of stars'], keywords:'star death die explode supernova', description:'A star’s mass shapes its eventual fate.', body:'Stars change as they exhaust nuclear fuel. Lower-mass stars can shed their outer layers and leave white dwarfs; massive stars may explode as supernovae, leaving neutron stars or black holes.', url:'https://science.nasa.gov/universe/stars/'},
  {id:'giants', name:'Giant stars', aliases:['red giant','giant star','big sun'], keywords:'large giant red stars size', description:'A class of stars larger than the Sun.', body:'A red giant is an evolved star whose outer layers have expanded as its internal fuel and energy production change. Giant stars are a category, not a single point in the sky.', url:'https://science.nasa.gov/universe/stars/'},
  {id:'largest', name:'Largest known stars', aliases:['largest star','largest stars','big sun'], keywords:'largest biggest star size', description:'Why identifying the largest star is uncertain.', body:'Some stars are hundreds of times wider than the Sun. Their apparent edges are diffuse and their distances and sizes can be uncertain, so rankings of the largest known stars can change.', url:'https://science.nasa.gov/universe/stars/'},
  {id:'sun', name:'The Sun', aliases:['sun','big sun'], keywords:'our nearest star solar', description:'Our nearest star; its position changes across the sky.', body:'The Sun is the star at the centre of our solar system. Its apparent sky position changes with time, so this lesson does not assign it a fixed coordinate.', url:'https://science.nasa.gov/sun/'},
  {id:'galaxy', name:'Star or galaxy?', aliases:['difference between a star and a galaxy','star vs galaxy'], keywords:'difference stars galaxies galaxy', description:'Compare a single star with a vast stellar system.', body:'A star is a self-gravitating luminous ball of gas. A galaxy is a much larger system containing stars, gas, dust and dark matter bound by gravity.', url:'https://science.nasa.gov/universe/galaxies/'},
  {id:'infrared', name:'Explore infrared wavelengths', aliases:['infrared','wavelength'], keywords:'spherex infrared wavelength observation', description:'Use the wavelength selector to compare the same sky.', body:'SPHEREx observes infrared light across many wavelengths. Choose a wavelength in the toolbar to compare how the sky appears; some wavelengths are marked as having no image.', url:'https://science.nasa.gov/mission/spherex/'}
].map(x=>({...x, type:'lesson', category:'Learn', source:'NASA'}));
const objectTerms = {
  'Barnard 33': {category:'Nebula', aliases:['Horsehead','Horse Head','Horse Head Nebula','B33','Barnard 33','nebula shaped like a horse','horse shaped nebula'], keywords:'dark dust nebula horse head'},
  'M 42': {category:'Nebula', aliases:['Orion','M42','NGC 1976'], keywords:'star birth formation nebula'},
  'M 31': {category:'Galaxy', aliases:['M31','NGC 224','Andromeda'], keywords:'spiral galaxy'},
  'M 1': {category:'Nebula', aliases:['Crab','NGC 1952'], keywords:'supernova remnant pulsar'},
  'M 45': {category:'Star cluster', aliases:['Seven Sisters','Pleiades','seven sisters star cluster'], keywords:'open cluster stars'},
  'M 51': {category:'Galaxy', aliases:['Whirlpool','NGC 5194','galaxy near the big dipper','galaxy near the handle of the big dipper'], keywords:'spiral galaxy'},
  'M 57': {category:'Nebula', aliases:['Ring','NGC 6720'], keywords:'planetary nebula'},
  'M 101': {category:'Galaxy', aliases:['M101','NGC 5457','Pinwheel','galaxy near the big dipper'], keywords:'spiral galaxy'}
};
const objects = references.map(x=>({...x, type:'object', ...(objectTerms[x.id] ?? {category:'Object', aliases:[], keywords:''})}));
export const entries = [...objects, {id:'barnard-star',type:'action',category:'Time-lapse',name:"Barnard's Star",aliases:['barnard star','barnards star'],keywords:'moving star time lapse',description:'Explore a NEOWISE time-lapse.'}, ...lessons];
export const defaults = ['Barnard 33','M 42','M 31','barnard-star','birth','death'].map(id=>entries.find(e=>e.id===id));
export const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(messier|m|ngc)\s*(\d+)/g,(_,a,b)=>a!=="ngc"?'m'+b:'ngc'+b).replace(/[^a-z0-9]+/g,' ').trim();
export function catalogQuery(query) {
  return query.trim()
    .replace(/^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:show me|take me to|locate|display|zoom (?:in )?(?:to|on)|point (?:me|the telescope) at|find|look up|search for|where (?:is|are)|go to)\s+/i, '')
    .replace(/^[\s]*(?:the|a|an)\s+/i, '')
    .replace(/(?:\s+(?:on (?:the )?(?:sky )?map|in the sky|please))*[?!.,]*$/i, '')
    .trim();
}

function distance(a,b) { if(Math.abs(a.length-b.length)>2)return 99; let prev=Array.from({length:b.length+1},(_,i)=>i); for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row;}return prev[b.length]; }
export function catalogIdentifier(query) {
  const name = catalogQuery(query);
  const gaia = name.match(/^Gaia\s+(?:DR3\s+)?(\d{1,19})$/i);
  if (gaia) return { catalog: 'gaia', id: gaia[1] };
  const chime = name.match(/^FRB\s*(\d{8}[A-Z])$/i);
  if (chime) return { catalog: 'chime', id: 'FRB' + chime[1].toUpperCase() };
  return null;
}

export function search(query) {
  const raw=catalogQuery(query); if(!query.trim())return {results:defaults};
  if (!raw || !normalize(raw)) return {results:[], error:'Enter an object name, catalog ID, or RA and Dec.'};
  if (/^[+\-\d.,:\s−]+$/.test(raw)) { try { const pos=coordinates(raw); if(pos)return {results:[{id:'coordinates',type:'coordinates',name:`RA ${pos[0]}°, Dec ${pos[1]}°`,description:'Go to this sky position',position:pos,category:'Coordinates'}]}; } catch(e) { return {results:[],error:e.message}; } }
  if (/^[+\-\d.,:\s]+$/.test(raw)) return {results:[],error:'Enter a valid RA and Dec pair, for example 210.80227, 54.34895.'};
  const q=normalize(raw); if(q==='big sun')return {results:['sun','giants','largest'].map(id=>entries.find(e=>e.id===id)),ambiguous:true};
  // Catalog numbers are identities, never typo candidates or numeric prefixes.
  if (/^(?:m|ngc|b|barnard)\s*\d+$/.test(q)) {
    const compact = value => normalize(value).replace(/ /g, '');
    const exact = objects.find(entry => [entry.id, ...entry.aliases].some(term => compact(term) === compact(q)));
    return {results: exact ? [exact] : [], exact};
  }
  const results=entries.map((e,index)=>{const name=normalize(e.name), id=normalize(e.id), aliases=e.aliases.map(normalize), keys=normalize(e.keywords); let score=0;
    if(q===name||q===id)score=100; else if(aliases.includes(q))score=95; else if([name,id,...aliases].some(v=>v.startsWith(q)))score=80; else if(q.length>=3 && q.split(' ').every(w=>[name,keys,...aliases].some(value=>value.split(' ').some(word=>word.startsWith(w)))))score=60; else if(q.length>=4 && [name,...aliases].some(v=>distance(q,v)<= (q.length>7?2:1)))score=50;
    return {e,index,score};}).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.e).slice(0,8);
  const exact = results.filter(entry => [entry.name, entry.id, ...entry.aliases].some(term => normalize(term) === q));
  return {results, exact: exact.length === 1 ? exact[0] : undefined, ambiguous: exact.length > 1 || (!exact.length && results.length > 1)};
}

// A single selection transaction keeps the viewer, recenter target and inspector in sync.
export function selectSkyTarget(reference, { point, remember, inspect }) {
  if (!hasSkyPosition(reference)) return false;
  point(reference.ra, reference.dec, reference.fov);
  remember(reference.ra, reference.dec, reference.id, reference.fov);
  inspect(reference);
  return true;
}
