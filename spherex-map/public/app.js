import { setupComparisonReport } from './comparison-report.js';
import { comparisonLink, parseComparisonLink, restoreComparisonObject, sieveComparisonRecord } from './comparison-link.js';
import { setupComparison, comparisonObject, hasSkyPosition } from './comparison.js';
import { questionsFor } from './quiz-data.js';
import { parseProperties, references, decodeView, encodeView, restoreView, normalizeFavourite, parseFavourites } from './sky-data.js';
import { catalogQuery, search } from './search.js';
import { uiState } from './ui-state.js';
import { setupObservations } from './observations.js';
import { sieveDemo } from './sieve-demo.js';
import { setupCatalogDiscovery } from './catalog-discovery.js';
import { searchStartedEvent, searchSubmitted, resultsShown, noResults, resultSelected, objectExplored, featureUsed, track } from '/analytics.js';

import { barnardMarker, setupBarnard } from './barnard-timelapse.js';

const byId = id => document.getElementById(id);
const channel = byId('channel');
const survey = byId('survey');
const opticalUrl = 'https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color';
const notice = byId('notice');
const target = byId('target');
const returnButton = byId('home');
const exhibits = {
  'Barnard 33': {type:'DARK NEBULA', why:'The Horsehead is a cloud of dust and gas seen in silhouette against a brighter background, revealing how interstellar dust blocks visible light.', url:'https://science.nasa.gov/asset/hubble/the-horsehead-nebula/'},
  'M 42': {type:'EMISSION NEBULA', why:'The Orion Nebula is a nearby stellar nursery. Its gas and dust provide a place to study how stars form.', url:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-42/'},
  'M 31': {type:'SPIRAL GALAXY', why:'Andromeda is our nearest major galactic neighbour. Its relatively close view helps astronomers study the stars and history of a spiral galaxy.', url:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-31/'},
  'M 101': {type:'SPIRAL GALAXY', why:'We see this spiral galaxy nearly face-on, making its arms and star-forming regions easier to study across the disk.', url:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-101/'}
};
function syncState() { document.querySelector('main').dataset.state = uiState({searchOpen:!byId('search-popup').hidden, inspectorOpen:!byId('inspector').hidden, lessonOpen:!byId('lesson').hidden}); }
const blankFrames = new Set([50, 51]);
const home = references[0];
const loadedFrames = new Set();
let viewer, A, layer, selectObservations;
let showResolvedMarker = () => {};
let selectedReference;
let activeFrame = 62;
let searchRevision = 0;
let loadDeadline;
let lastTarget = { ...home, label: 'Horsehead' };

function showNotice(message, blank = false) {
  notice.textContent = message;
  notice.hidden = !message;
  notice.toggleAttribute('data-blank', blank);
}

function showNavigationStatus(message) {
  const status = byId('navigation-status');
  status.textContent = message;
  status.hidden = !message;
}

const positionText = (ra, dec) => `RA ${ra.toFixed(4)}° · Dec ${dec.toFixed(4)}°`;
function updatePosition() {
  const center = viewer.getRaDec();
  if (center?.every(Number.isFinite)) byId('position').textContent = positionText(...center);
}

function inspect(reference, compareSelection = true) {
  if (reference) { byId("guide").open = false; byId('lesson').hidden = true; }

  selectedReference = reference;
  byId('panel-drag-title').textContent = reference?.name || 'Explore';
  byId('inspector').hidden = !reference;
  byId('story-supplement').hidden = !reference;
  byId('panel-stages').querySelector('[data-stage=understand]').hidden = !reference || !questionsFor(reference.id).length;
  byId('quiz-unavailable').hidden = !reference || questionsFor(reference.id).length > 0;
  resetQuiz();
  setStage('discover');
  syncState();
  for (const pin of byId('map-pins').children) {
    pin.setAttribute('aria-expanded', String(pin.dataset.reference === reference?.id));
  }
  if (compareSelection) comparison.accept(asComparisonObject(reference));
  if (!reference) return;
  const curated = references.find(item => item.id === reference.id);
  objectExplored(reference);
  byId('object-fields').closest('details').open = false;
  byId('copy-status').textContent = '';
  const exhibit = exhibits[reference.id];
  byId('object-type').textContent = exhibit?.type ?? asComparisonObject(curated ?? reference)?.classification ?? reference.category ?? 'CATALOG SOURCE';
  byId('object-id').textContent = reference.id + '  ·  ' + reference.source;
  byId('object-why').textContent = exhibit?.why ?? '';
  byId('story-supplement').hidden = !exhibit;
  if (exhibit) byId('object-learn').href = exhibit.url;
  byId('object-name').textContent = reference.name;
  byId('favourite-feedback').textContent = '';
  syncFavourite();
  byId('object-description').textContent = reference.description || 'Position resolved by CDS Sesame; classification not available.';
  byId('object-catalog').textContent = reference.source + ' · ' + reference.id;
  byId('object-position').textContent = positionText(reference.ra, reference.dec);
  byId('object-frame').textContent = 'Sky position · ' + (reference.radio ? 'J2000' : 'ICRS');
  byId('object-source').href = reference.url ??
    'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=' + encodeURIComponent(reference.id);
  if (selectObservations) {
    if (reference.radio) selectObservations.radio(reference);
    else void selectObservations(reference.ra, reference.dec);
  }
}

function asComparisonObject(reference) {
  return comparisonObject(reference, exhibits[reference?.id]);
}

const comparison = setupComparison({
  focusSearch() { ++searchRevision; submittedForInput = false; target.value = ''; target.focus(); render(); },
  selectedObject: () => asComparisonObject(selectedReference),
  onChange: () => comparisonReport.changed(),
});
const comparisonReport = setupComparisonReport({
  getPair: () => comparison.objects,
  getComparisonUrl: pair => comparisonLink(location.href, pair),
});
const sharedComparison = parseComparisonLink(location.search);
if (sharedComparison) {
  void Promise.all([restoreComparisonObject(sharedComparison.A), restoreComparisonObject(sharedComparison.B)])
    .then(([A, B]) => comparison.restore({A, B}));
}

const favouriteKey = 'searchx.favourites.v1';
let favourites = [];
try { favourites = parseFavourites(localStorage.getItem(favouriteKey)); } catch {}
const favouriteId = item => item.source + '\0' + item.id;
function syncFavourite() {
  const button = byId('favourite-toggle');
  const saved = !!selectedReference && favourites.some(item => favouriteId(item) === favouriteId(selectedReference));
  button.textContent = saved ? '★' : '☆';
  button.setAttribute('aria-pressed', String(saved));
  button.setAttribute('aria-label', saved ? 'Remove from favourites' : 'Add to favourites');
  button.title = button.getAttribute('aria-label');
}
function renderFavourites() {
  const list = byId('favourites-list');
  list.replaceChildren();
  if (!favourites.length) list.textContent = 'No favourites yet.';
  for (const item of favourites) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = item.name;
    button.addEventListener('click', () => {
      if (!viewer) { showNavigationStatus('The sky map is still starting.'); return; }
      byId('favourites').open = false;
      if (item.source === 'CHIME/FRB Catalog 2') { void resolveChime(item.id); return; }
      const reference = references.find(entry => favouriteId(entry) === favouriteId(item)) ?? item;
      goToReference({...reference, fov: reference.fov ?? .25});
    });
    list.append(button);
  }
  syncFavourite();
}
byId('favourite-toggle').addEventListener('click', () => {
  const entry = normalizeFavourite(selectedReference);
  if (!entry) return;
  const id = favouriteId(entry);
  const next = favourites.some(item => favouriteId(item) === id)
    ? favourites.filter(item => favouriteId(item) !== id) : [...favourites, entry];
  if (next.length > 500) { byId('favourite-feedback').textContent = 'Favourites are full; remove one to add another.'; return; }
  try {
    localStorage.setItem(favouriteKey, JSON.stringify(next));
    favourites = next;
    byId('favourite-feedback').textContent = next.some(item => favouriteId(item) === id) ? 'Added to favourites.' : 'Removed from favourites.';
    renderFavourites();
  } catch { byId('favourite-feedback').textContent = 'Could not save favourites on this device.'; }
});
addEventListener('storage', event => { if (event.key === favouriteKey) { favourites = parseFavourites(event.newValue); renderFavourites(); } });
renderFavourites();

function rememberTarget(ra, dec, label, fov = viewer.getFoV()[0]) {
  lastTarget = { ra, dec, label, fov };
  returnButton.title = 'Recenter on ' + label + ' at the saved zoom';
  returnButton.setAttribute('aria-label', returnButton.title);
}

function pointAt(ra, dec, fov) {
  // Any newer map navigation supersedes a pending name-resolution request.
  searchRevision++;
  viewer.stopAnimation();
  viewer.gotoRaDec(ra, dec);
  if (fov !== undefined) viewer.setFoV(fov);
  byId('position').textContent = positionText(ra, dec);
  requestAnimationFrame(updatePosition);
}

function goToReference(reference, source = 'shortcut') {
  searchRevision++;
  showNavigationStatus('');
  byId('guide').open = false;
  target.value = reference.id;
  pointAt(reference.ra, reference.dec, reference.fov);
  rememberTarget(reference.ra, reference.dec, reference.id, reference.fov);
  resultSelected(reference, source);
  inspect(reference);
}

function frameLayer(index) {
  return A.HiPS(location.origin + '/dr1-frame/' + index, {
    imgFormat: 'png',
    errorCallback: () => {
      if (survey.value !== 'infrared' || Number(channel.value) !== index) return;
      clearTimeout(loadDeadline);
      showNotice('Couldn’t load this wavelength. Try another wavelength or reload.');
    },
  });
}

function updateLoading() {
  clearTimeout(loadDeadline);
  if (loadedFrames.has(activeFrame) && viewer.getBaseImageLayer() === layer && layer.added) {
    showNotice('');
    return;
  }
  showNotice('Loading infrared imagery…');
  loadDeadline = setTimeout(() => showNotice('Imagery is taking longer than usual. You can try another wavelength.'), 8000);
}

function applyChannel() {
  const index = Number(channel.value);
  if (blankFrames.has(index)) {
    clearTimeout(loadDeadline);
    showNotice('SPHEREx has no image at this wavelength. Choose another wavelength to keep exploring.', true);
    return;
  }
  if (activeFrame !== index || viewer.getBaseImageLayer() !== layer) {
    const fov = viewer.getFoV()[0];
    const center = viewer.getRaDec();
    viewer.stopAnimation();
    activeFrame = index;
    layer = frameLayer(index);
    viewer.setBaseImageLayer(layer);
    pointAt(...center, fov);
  }
  updateLoading();
}

returnButton.addEventListener('click', () => {
  searchRevision++;
  showNavigationStatus('');
  pointAt(lastTarget.ra, lastTarget.dec, lastTarget.fov);
});
byId('close-inspector').addEventListener('click', () => {
  selectObservations?.close();
  inspect(null);
  target.focus({preventScroll:true}); dismiss();
});
byId("guide").addEventListener("toggle", event => {
  if (event.target.open) {
    byId('lesson').hidden = true;
    byId('barnard-panel').hidden = true;
  }
});

function opticalLayer() {
  return A.HiPS(opticalUrl, {imgFormat:'jpeg', errorCallback:()=>{
    if (survey.value === 'optical') showNotice('Couldn’t load DSS2. Try SPHEREx or reload the map.');
  }});
}
survey.addEventListener('change', () => {
  if (!viewer) return;
  featureUsed('sky survey', survey.value);
  const infrared = survey.value === 'infrared';
  const source = byId('image-source');
  channel.hidden = !infrared; channel.disabled = !infrared;
  source.textContent = infrared ? 'SPHEREx DR1' : 'DSS2 · STScI/NASA, CDS';
  source.href = infrared ? 'https://doi.org/10.26131/IRSA679' : 'https://doi.org/10.26093/cds/aladin/ht9n-7r';
  clearTimeout(loadDeadline); showNotice('');
  if (infrared) { applyChannel(); return; }
  const center = viewer.getRaDec(), fov = viewer.getFoV()[0];
  viewer.setBaseImageLayer(opticalLayer()); pointAt(...center, fov);
});
channel.addEventListener('change', () => { featureUsed('wavelength', String(channel.value)); applyChannel(); });
byId('share-view').addEventListener('click', async () => {
  const status = byId('share-status');
  try {
    const [ra, dec] = viewer.getRaDec();
    const state = {ra: Number(((ra % 360 + 360) % 360).toPrecision(12)) % 360, dec: Number(dec.toPrecision(12)),
      fov: Number(viewer.getFoV()[0].toPrecision(12)), survey: survey.value};
    if (state.survey === 'infrared') state.channel = Number(channel.value);
    const url = encodeView(location.href, state);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('textarea');
      input.value = url; input.setAttribute('readonly', '');
      input.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(input); input.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } finally { input.remove(); byId('share-view').focus(); }
      if (!copied) throw new Error('Copy unavailable');
    }
    status.textContent = 'View link copied.';
  } catch {
    status.textContent = 'Could not copy the view link. Check clipboard permissions and try again.';
  }
  status.hidden = false;
  clearTimeout(status.dismissTimer);
  status.dismissTimer = setTimeout(() => { status.hidden = true; }, 5000);
});
byId('copy-position').addEventListener('click', async () => {
  const status=byId('copy-status');
  try { await navigator.clipboard.writeText(`${selectedReference.ra}, ${selectedReference.dec}`); status.textContent=' Copied.'; }
  catch { status.textContent=' Copy unavailable; select the coordinates above.'; }
});
byId('sky').addEventListener('pointerdown', () => { ++searchRevision; showNavigationStatus(''); });
byId('sky').addEventListener('wheel', () => { ++searchRevision; showNavigationStatus(''); }, { passive: true });
for (const [id, factor] of [['map-zoom-in', .75], ['map-zoom-out', 1.333]]) byId(id).addEventListener('click',()=>{if(viewer) viewer.setFoV(Math.min(160,Math.max(.015,viewer.getFoV()[0]*factor)));});


const popup = byId('search-popup');
const list = byId('suggestions');
let matches = [], active = -1;
let submittedForInput = false;
function dismiss() { popup.hidden = true; target.setAttribute('aria-expanded','false'); target.removeAttribute('aria-activedescendant'); active = -1; syncState(); }
function render() {
  renderSuggestions(search(target.value));
}
function renderSuggestions(result, offerCatalog = true) {
  matches = result.results.slice(0, 6); active = -1;
  const query = target.value.trim();
  if (offerCatalog && query && !result.error && !result.ambiguous && !matches.some(entry => entry.type === 'coordinates')) {
    matches.push({ type: 'catalog', name: 'Find “' + query + '” in the sky catalog',
      description: 'Search by name or describe an object in your own words', category: 'Catalog', query: catalogQuery(query) });
  }
  byId('clear-search').hidden = !target.value;
  byId('suggestion-heading').textContent = target.value ? (result.ambiguous ? 'CHOOSE WHAT YOU MEAN' : 'SEARCH RESULTS') : 'EXPLORE THE UNIVERSE';
  list.replaceChildren();
  matches.forEach((entry,i)=>{
    const option=document.createElement('div'); option.id='suggestion-'+i; option.role='option'; option.setAttribute('aria-selected','false'); option.className='suggestion';
    const icon=document.createElement('span'); icon.className='result-icon'; icon.textContent=entry.type==='lesson'?'✦':entry.type==='coordinates'?'⌖':'◌'; icon.setAttribute('aria-hidden','true');
    const text=document.createElement('span'); const title=document.createElement('strong'); title.textContent=entry.name; const detail=document.createElement('small'); detail.textContent=entry.description; text.append(title,detail);
    const category=document.createElement('span'); category.className='result-category'; category.textContent=entry.category;
    option.append(icon,text,category); option.addEventListener('pointerdown',e=>e.preventDefault()); option.addEventListener('click',()=>choose(entry)); list.append(option);
  });
  byId('search-hint').textContent=result.error || (!matches.length ? 'No local match. Press Enter or the search button to try the astronomical name resolver.' : target.value ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'} · ↑ ↓ to explore · Enter to select` : 'Choose a destination, ask a question, or enter RA, Dec');
  popup.hidden=false; target.setAttribute('aria-expanded','true'); target.removeAttribute('aria-activedescendant'); syncState();
}
function setActive(index) { active=(index+matches.length)%matches.length; [...list.children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===active))); target.setAttribute('aria-activedescendant','suggestion-'+active); list.children[active]?.scrollIntoView({block:'nearest'}); }
function choose(entry) {
  if (!submittedForInput && target.value.trim()) {
    searchSubmitted(target.value, 'suggestion');
    const count = matches.filter(match => match.type !== 'catalog').length;
    if (count) resultsShown(count, 'local catalog');
    submittedForInput = true;
  }
  if (entry.type === 'catalog') { resolveExternal(entry.query); return; }
  if (entry.type !== 'object' && entry.type !== 'resolved') resultSelected(entry, 'search');
  if (!byId('observation-panel').hidden) selectObservations?.close();
  if (!byId('barnard-panel').hidden) byId('barnard-close').click();
  ++searchRevision; dismiss(); showNavigationStatus(''); target.value=entry.name; byId('clear-search').hidden=false;
  if(entry.type==='action') { byId('barnard-shortcut').click(); return; }
  if(entry.type==='lesson') { inspect(null); byId('guide').open=false; byId('lesson-name').textContent=entry.name; byId('lesson-body').textContent=entry.body; byId('lesson-source').href=entry.url; byId('lesson').hidden=false; syncState(); return; }
  byId('lesson').hidden=true; syncState();
  if(!viewer) {showNavigationStatus('The sky map is still starting. Select this result again when it is ready.');return;}
  if(entry.type==='resolved') showResolvedMarker(entry);
  if(entry.type==='object' || entry.type==='resolved') {
    goToReference(entry, 'search');
    target.value=entry.name;
    return;
  }
  if (comparison.pending) showNavigationStatus('Coordinates center the map. Choose an object to fill the comparison slot.');
  pointAt(...entry.position); rememberTarget(...entry.position,'coordinates'); inspect(null);
}
async function resolveGaia(id) {
  if (!viewer) return showNavigationStatus('The sky map is still starting. Try again shortly.');
  const revision=++searchRevision;
  showNavigationStatus('Looking up Gaia DR3 source…'); dismiss();
  try {
    const response=await fetch('/gaia-source?id='+encodeURIComponent(id),{signal:AbortSignal.timeout(10000)});
    const result=await response.json();
    if(revision!==searchRevision)return;
    if(result.status==='not_found'){noResults('not_found');showNavigationStatus('Gaia DR3 source not found. Check the identifier.');return;}
    if(!response.ok||result.status!=='found')throw new Error('Gaia unavailable');
    const reference=result.source;
    if (!hasSkyPosition(reference)) throw new Error('Invalid Gaia position');
    pointAt(reference.ra,reference.dec,.25);rememberTarget(reference.ra,reference.dec,reference.id,.25);
    resultsShown(1, 'Gaia DR3'); resultSelected(reference); showResolvedMarker(reference);inspect(reference);showNavigationStatus('Source from ESA Gaia DR3.');
  }catch{if(revision===searchRevision)showNavigationStatus('Gaia archive is unavailable. Try again later.');}
}
async function resolveChime(id) {
  if (!viewer) return showNavigationStatus('The sky map is still starting. Try again shortly.');
  const revision = ++searchRevision;
  showNavigationStatus('Looking up CHIME/FRB Catalog 2…'); dismiss();
  try {
    const response = await fetch('/chime-event?id=' + encodeURIComponent(id), { signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (revision !== searchRevision) return;
    if (result.status === 'not_found') { noResults('not_found'); showNavigationStatus('Event not found in CHIME/FRB Catalog 2.'); return; }
    if (!response.ok || result.status !== 'found') throw new Error('CHIME unavailable');
    const reference = result.source;
    if (!hasSkyPosition(reference) || !reference.radio) throw new Error('Invalid CHIME event');
    pointAt(reference.ra, reference.dec, Math.max(.2, 4 * Math.max(reference.radio.raError || 0, reference.radio.decError || 0)));
    rememberTarget(reference.ra, reference.dec, reference.id);
    resultsShown(1, 'CHIME/FRB Catalog 2'); resultSelected(reference); showResolvedMarker(reference); inspect(reference);
    showNavigationStatus('Published CHIME/FRB Catalog 2 event.');
  } catch { if (revision === searchRevision) showNavigationStatus('CHIME/FRB Catalog 2 is unavailable. Try again later.'); }
}
function resolveExternal(query, useAi = true) {
  if (!viewer || !A) {
    showNavigationStatus('The sky map is still starting. Try again shortly.');
    return;
  }
  const revision = ++searchRevision;
  showNavigationStatus('Searching the sky catalog…');
  dismiss();

  async function lookup(name) {
    const response=await fetch('/name-resolve?name='+encodeURIComponent(name),{signal:AbortSignal.timeout(9000)});
    if(!response.ok) throw new Error('Resolver unavailable');
    const result=await response.json();
    return result.status==='found' ? result.source : null;
  }

  async function run() {
    let name = query;
    let position;
    try { position = await lookup(name); } catch { if (revision === searchRevision) showNavigationStatus('Name resolver unavailable. Try again later or enter coordinates.'); return; }
    if (revision !== searchRevision) return;
    if (!position && useAi) {
      showNavigationStatus('AI is interpreting your search…');
      try {
        const response = await fetch('/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(11000),
        });
        if (!response.ok) throw new Error('Search unavailable');
        const result = await response.json();
        if (revision !== searchRevision) return;
        if (!result.target) {
          noResults('not_found');
          showNavigationStatus(result.message || 'Try adding an object name or a constellation.');
          return;
        }
        name = result.target;
        position = await lookup(name);
      } catch {
        if (revision === searchRevision) showNavigationStatus('No catalog position found for ' + name + '. AI search is unavailable; try an object name, catalog ID, or RA and Dec.');
        return;
      }
    }
    if (revision !== searchRevision) return;
    const { ra, dec } = position ?? {};
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || Math.abs(dec) > 90) {
      noResults('not_found');
      showNavigationStatus('No catalog position found for ' + name + '. Try a more specific query.');
      return;
    }
    const resolved = { id: position.id || name, name, ra, dec, source: 'CDS Sesame',
      category: position.category || 'CATALOG SOURCE',
      description: position.category ? 'Catalog classification: '+position.category+'.' : 'Catalog name resolved to this sky position; classification is unavailable.',
      url: 'https://cds.unistra.fr/cgi-bin/Sesame?' + encodeURIComponent(name) };
    resultsShown(1, 'CDS Sesame');
    const entry = { ...resolved, type: 'resolved', fov: 1 };
    if (name !== query) {
      renderSuggestions({ results: [entry] }, false);
      showNavigationStatus('Suggested interpretation of your query. Select the catalog result to confirm.');
      return;
    }
    choose(entry);
  }
  void run();
}
target.addEventListener('focus',render);
target.addEventListener('click',()=>{if(popup.hidden)render();});
target.addEventListener('input',()=>{++searchRevision;submittedForInput=false;if(target.value.trim())searchStartedEvent();showNavigationStatus('');render();});
target.addEventListener('keydown',event=>{
  if(event.key==='Escape' && !popup.hidden){event.stopPropagation();dismiss();return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(popup.hidden)render();if(matches.length)setActive(active < 0 ? (event.key==='ArrowDown' ? 0 : matches.length-1) : active+(event.key==='ArrowDown'?1:-1));}
});
byId('navigation').addEventListener('submit',event=>{
  event.preventDefault(); const query=target.value.trim(); if(!query){render();return;}
  searchSubmitted(query); submittedForInput = true;
  const identifier=catalogQuery(query);
  const chime=identifier.match(/^(FRB\d{8}[A-Z])$/i); if(chime){void resolveChime(chime[1].toUpperCase());return;}
  const gaia=identifier.match(/^Gaia\s+(?:DR3\s+)?(\d{1,19})$/i); if(gaia){void resolveGaia(gaia[1]);return;}
  if(/^(?:Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Pluto|Europa|Ceres|Halley(?:'s)? comet)$/i.test(query)){showNavigationStatus('Moving objects need a date-specific ephemeris; this sky map does not locate them yet.');dismiss();return;}
  const result=search(query); if(result.error){showNavigationStatus(result.error);render();return;}
  if (result.results.length) resultsShown(result.results.length, 'local catalog');
  if(active>=0 && !popup.hidden){choose(matches[active]);return;}
  if(!popup.hidden && matches[0]?.type === 'resolved') { showNavigationStatus('Select the suggested catalog result to confirm.'); return; }
  if(result.exact){choose(result.exact);return;}
  if(result.ambiguous){render();showNavigationStatus('Choose a result from the suggestions.');return;}
  if(result.results[0]?.type === 'coordinates'){choose(result.results[0]);return;}
  if (result.results.length) {
    render();
    showNavigationStatus('Choose a suggestion or search by description.');
    return;
  }
  resolveExternal(catalogQuery(query));
});
byId('clear-search').addEventListener('click',()=>{++searchRevision;target.value='';showNavigationStatus('');target.focus();render();});
document.addEventListener('pointerdown',event=>{if(!byId('navigation').contains(event.target))dismiss();});
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||!popup.hidden)return; if(!byId('inspector').hidden){byId('close-inspector').click();} else if(!byId('lesson').hidden){byId('close-lesson').click();} else if(byId('guide').open){byId('guide').open=false;byId('guide').querySelector('summary').focus();}});
target.addEventListener('blur',()=>setTimeout(()=>{if(!byId('navigation').contains(document.activeElement))dismiss();},0));
byId('close-lesson').addEventListener('click',()=>{byId('lesson').hidden=true;resetQuiz();target.focus({preventScroll:true});dismiss();});


let quizIndex = 0;
let quizQuestions = [];
function resetQuiz() {
  byId('quiz').hidden = true;
  byId('quiz-complete').hidden = true;
  byId('explore-another').hidden = true;
  byId('quiz-answers').replaceChildren();
  document.querySelector('main').classList.remove('quiz-open');
  quizIndex = 0;
  quizQuestions = [];
}

function showQuestion() {
  const question = quizQuestions[quizIndex];
  byId('quiz-progress').textContent = 'QUESTION ' + (quizIndex + 1) + ' / ' + quizQuestions.length;
  byId('quiz-heading').textContent = question.question;
  byId('quiz-feedback').textContent = '';
  byId('quiz-next').hidden = true;

  const answers = byId('quiz-answers');
  answers.replaceChildren();
  question.choices.forEach((choice, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = choice;
    button.addEventListener('click', () => {
      for (const answer of answers.children) answer.disabled = true;
      const correct = index === question.correct;
      track('Learning Question Answered', { question_number: quizIndex + 1, correct, object_id: selectedReference?.id });
      button.classList.add(correct ? 'correct' : 'incorrect');
      answers.children[question.correct].classList.add('correct');
      byId('quiz-feedback').textContent = (correct ? 'Correct. ' : 'Not quite. ') + question.feedback;
      const citation = document.createElement('a');
      citation.href = question.reference;
      citation.target = '_blank';
      citation.rel = 'noopener noreferrer';
      citation.textContent = ' Scientific reference ↗';
      byId('quiz-feedback').append(citation);
      byId('quiz-next').textContent = quizIndex === quizQuestions.length - 1 ? 'Finish quiz →' : 'Next question →';
      byId('quiz-next').hidden = false;
      byId('quiz-next').focus();
    });
    answers.append(button);
  });
  byId('quiz-heading').focus();
}
byId('quiz-start').addEventListener('click',()=>setStage(document.querySelector('main').dataset.stage==='discover'?'observe':'understand'));
byId('quiz-back').addEventListener('click',()=>setStage('observe'));
byId('quiz-next').addEventListener('click', () => {
  if (quizIndex + 1 < quizQuestions.length) {
    quizIndex++;
    showQuestion();
    return;
  }
  byId('quiz-answers').replaceChildren();
  byId('quiz-heading').textContent = 'Well explored';
  byId('quiz-progress').textContent = 'COMPLETE';
  byId('quiz-feedback').textContent = '';
  byId('quiz-next').hidden = true;
  byId('quiz-complete').textContent = quizQuestions.length + ' questions complete. Keep exploring the sky.';
  byId('quiz-complete').hidden = false;
  byId('explore-another').hidden = false;
  byId('quiz-heading').focus();
});
function setStage(stage, objectId = selectedReference?.id) {
  if(stage==='understand' && !questionsFor(selectedReference?.id).length) return;
  if (document.querySelector('main').dataset.stage !== stage) {
    featureUsed('panel stage', stage);
    if (stage === 'observe') track('Observation Viewed', { object_id: objectId });
  }
  const main=document.querySelector('main'); main.dataset.stage=stage;
  if (stage === 'understand' && !byId('quiz-complete').hidden) resetQuiz();
  byId('quiz').hidden = stage !== 'understand';
  if (stage === 'understand' && quizQuestions.length === 0) {
    quizQuestions = questionsFor(selectedReference.id);
    showQuestion();
  }
  for(const button of byId('panel-stages').querySelectorAll('button')) button.setAttribute('aria-current',button.dataset.stage===stage?'step':'false');
  byId('quiz-start').innerHTML=stage==='discover'?'Observe <span aria-hidden="true">→</span>':'Understand <span aria-hidden="true">→</span>';
  byId('story-action').hidden=stage==='understand' || (stage==='observe' && !questionsFor(selectedReference?.id).length);
}
for(const button of byId('panel-stages').querySelectorAll('button')) button.addEventListener('click',()=>setStage(button.dataset.stage));
byId('explore-another').addEventListener('click',()=>{byId('panel-close').click();target.focus();render();});
let panelRequested = false;
function syncPanelVisibility() {
  const storyVisible=['inspector','lesson','observation-panel','barnard-panel'].some(id=>!byId(id).hidden);
  const open=panelRequested||storyVisible;
  const main=document.querySelector('main');
  main.classList.toggle('story-open',open);
  main.classList.toggle('story-selected',storyVisible);
  byId('panel-open').setAttribute('aria-expanded',String(open));
}
byId('panel-open').addEventListener('click',()=>{panelRequested=true;syncPanelVisibility();});
byId('panel-close').addEventListener('click',()=>{panelRequested=false;selectObservations?.close(); inspect(null); byId('lesson').hidden=true; byId('barnard-panel').hidden=true; syncPanelVisibility();});
const storyObserver = new MutationObserver(()=>{
  syncPanelVisibility();
  const visible=document.querySelector('main').classList.contains('story-selected');
  byId('story-action').hidden=!visible || document.querySelector('main').dataset.stage==='understand' ||
    (document.querySelector('main').dataset.stage==='observe' && !questionsFor(selectedReference?.id).length);
});
for(const id of ['inspector','lesson','observation-panel','barnard-panel']) storyObserver.observe(byId(id),{attributes:true,attributeFilter:['hidden']});

async function start() {
  try {
    const metadata = fetch('/irsa.properties').then(response => {
      if (!response.ok) throw new Error('Wavelength labels unavailable.');
      return response.text();
    }).then(parseProperties).catch(() => null);
    ({ default: A } = await import('/vendor/aladin.js'));
    await A.init;
    viewer = A.aladin(byId('sky'), {
      target: `${home.ra} ${home.dec}`, fov: home.fov, cooFrame: 'ICRS',
      showSimbadPointerControl: false, showGotoControl: false, showShareControl: false,
      showProjectionControl: false, showFullscreenControl: false, showLayersControl: false,
      showReticle: false, survey: opticalLayer(), log: false,
    });
    viewer.on('positionChanged', updatePosition);
    const openBarnard = setupBarnard(viewer, A, pointAt);
    selectObservations = setupObservations(viewer, A, () => { byId('lesson').hidden = true; inspect(null); });
    byId('object-observations').addEventListener('click', () => {
      if (!selectedReference) return;
      const { ra, dec } = selectedReference;
      void selectObservations(ra, dec);
    });
    viewer.on('wheelTriggered', event => {
      const delta = event.deltaY;
      if (!delta) return;
      const field = viewer.getFoV()[0];
      const step = Math.min(Math.abs(delta) * (event.deltaMode ? .08 : .002), .22);
      viewer.setFoV(Math.min(160, Math.max(.015, field * Math.exp(Math.sign(delta) * step))));
    });
    viewer.on('stackChanged', () => {
      if (survey.value === 'infrared' && !blankFrames.has(Number(channel.value))) updateLoading();
    });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const path = new URL(entry.name).pathname;
        const tile = path.match(/^\/dr1-frame\/(\d+)\/.*\.png$/);
        if (!tile || entry.responseStatus < 200 || entry.responseStatus >= 400) continue;
        loadedFrames.add(Number(tile[1]));
      }
      if (survey.value === 'infrared' && Number(channel.value) === activeFrame && loadedFrames.has(activeFrame) && !notice.hidden) updateLoading();
    }).observe({ type: 'resource', buffered: true });

    const reviewCandidates = document.createElement('button');
    reviewCandidates.type = 'button';
    reviewCandidates.textContent = 'Review candidates';
    byId('observation-center').after(reviewCandidates);
    function openSieveDemo(source = 'review candidates') {
      featureUsed('SIEVE demo', source);
      track('Object Explored', { object_id: sieveDemo.id, object_type: 'candidate', catalog: 'SIEVE demo' });
      searchRevision++;
      byId('lesson').hidden = true;
      inspect(null);
      pointAt(sieveDemo.ra, sieveDemo.dec, .2);
      void selectObservations(sieveDemo.ra, sieveDemo.dec, false, sieveDemo);
      setStage('observe', sieveDemo.id);
      panelRequested = true;
      syncPanelVisibility();
    }
    reviewCandidates.addEventListener('click', () => openSieveDemo());
    const sharedReview = location.pathname.match(/^\/community-reviews\/([0-9a-f-]{36})$/i);
    if (sharedReview) {
      void (async () => {
        try {
          const report = await selectObservations.loadCommunityFeedback(sharedReview[1]);
          if (report.candidate_id !== sieveDemo.id) throw new Error('This review belongs to a candidate that is not available in this build.');
          openSieveDemo();
          selectObservations.showCommunityFeedback(report);
        } catch (error) { showNavigationStatus(error.message); }
      })();
    }

    const pins = [...references, barnardMarker, sieveDemo].map(reference => {
      const pin = document.createElement('button');
      pin.className = 'map-pin';
      pin.type = 'button';
      pin.dataset.reference = reference.id;
      pin.setAttribute('aria-controls', 'inspector');
      pin.setAttribute('aria-expanded', 'false');
      const label = document.createElement('span');
      label.textContent = reference.name;
      pin.append(label);
      pin.addEventListener('click', () => {
        if (reference === sieveDemo) {
          if (comparison.pending) {
            dismiss();
            comparison.accept(asComparisonObject(sieveComparisonRecord));
            return;
          }
          return openSieveDemo('map pin');
        }
        searchRevision++;
        showNavigationStatus('');
        if (reference === barnardMarker) {
          featureUsed('Barnard time lapse', 'map pin');
          byId('lesson').hidden = true;
          if (!byId('observation-panel').hidden) byId('observation-close').click();
          inspect(null);
          selectObservations.close();
          openBarnard();
          return;
        }
        rememberTarget(reference.ra, reference.dec, reference === home ? 'Horsehead' : reference.id);
        dismiss(); if (selectedReference?.id === reference.id && !comparison.pending) { selectObservations.close(); inspect(null); } else { resultSelected(reference, 'map'); inspect(reference); }
      });
      byId('map-pins').append(pin);
      return { pin, reference };
    });
    function positionPins() {
      const { clientWidth, clientHeight } = byId('sky');
      for (const { pin, reference } of pins) {
        const point = viewer.world2pix(reference.ra, reference.dec);
        pin.hidden = !point || !point.every(Number.isFinite) ||
          point[0] < 0 || point[0] > clientWidth || point[1] < 0 || point[1] > clientHeight;
        if (pin.hidden) continue;
        pin.style.left = point[0] + 'px';
        pin.style.top = point[1] + 'px';
        pin.classList.toggle('label-left', point[0] > clientWidth - 170);
      }
      requestAnimationFrame(positionPins);
    }
    positionPins();
    showResolvedMarker = reference => {
      const previous = pins.find(item => item.pin.dataset.resolved === 'true');
      if (previous) { previous.pin.remove(); pins.splice(pins.indexOf(previous), 1); }
      const pin = document.createElement('button'); pin.type='button'; pin.className='map-pin';
      pin.dataset.reference=reference.id; pin.dataset.resolved='true';
      pin.setAttribute('aria-label', reference.name); pin.setAttribute('aria-controls','inspector');
      pin.addEventListener('click', () => { resultSelected(reference, 'map'); inspect(reference); });
      const label=document.createElement('span');label.textContent=reference.name;pin.append(label);
      byId('map-pins').append(pin); pins.push({pin,reference});
    };
    setupCatalogDiscovery(viewer, A, reference => {
      resultSelected(reference, 'map'); showResolvedMarker(reference); inspect(reference);
    }, message => { byId('catalog-status').textContent=message; byId('catalog-status').hidden=!message; });
    for (const reference of references) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = reference.name;
      button.addEventListener('click', () => goToReference(reference));
      byId('references').append(button);
    }
    const barnardShortcut = byId('barnard-shortcut');
    barnardShortcut.addEventListener('click', () => {
      if (!byId('observation-panel').hidden) byId('observation-close').click();
      searchRevision++;
      byId('lesson').hidden = true;
      inspect(null);
      selectObservations.close();
      openBarnard();
    });
    barnardShortcut.disabled = false;
    returnButton.disabled = false;

    updatePosition();
    if (notice.textContent === 'Starting the sky map…') showNotice('');
    const wavelengths = await metadata;
    survey.disabled = false;
    if (!wavelengths) { survey.options[1].textContent = 'SPHEREx · unavailable'; survey.options[1].disabled = true; }
    (wavelengths ?? []).forEach((wavelength, index) => {
      channel.add(new Option(`${wavelength.toFixed(3)} µm${blankFrames.has(index) ? ' · no image' : ''}`, index));
      channel.options[index].disabled = blankFrames.has(index);
    });
    channel.value = String(activeFrame);
    channel.disabled = true;
    const shared = decodeView(location.search, wavelengths?.length ?? 102);
    if (shared) {
      const infraredUnavailable = shared.survey === 'infrared' && !wavelengths;
      restoreView(infraredUnavailable ? {...shared, survey:'optical', channel:undefined} : shared, {
        pointAt: (ra, dec, fov) => { pointAt(ra, dec, fov); rememberTarget(ra, dec, 'shared view', fov); },
        setSurvey: (name, index) => {
          if (name === 'infrared') channel.value = String(index);
          survey.value = name;
          survey.dispatchEvent(new Event('change'));
        },
      });
      if (infraredUnavailable) showNotice('The shared infrared survey is unavailable. Showing the optical view.');
    }
    byId('share-view').disabled = false;
  } catch (error) {
    console.error(error);
    showNotice('The sky map couldn’t start. Reload the page and check that WebGL2 is enabled.');
  }
}
syncState();
start();

byId('observation-panel').append(byId('object-fields').closest('details'));
byId('object-fields').closest('details').append(byId('observation-source'));
const panel=byId('story-sidebar'), main=document.querySelector('main');
let panelWidth=340, floating=false;
function positionPanel(x,y) {
  const width = panel.offsetWidth, height = panel.offsetHeight;
  const maxX = Math.max(0, innerWidth - width), maxY = Math.max(0, innerHeight - height);
  x = Math.max(0, Math.min(x, maxX));
  // Keep the search/layers row and, where space permits, the map controls clear.
  const minY = Math.min(76, maxY);
  const controls = document.querySelector('.map-controls').getBoundingClientRect();
  if (x + width > controls.left && x < controls.right) {
    const safeY = controls.top - height - 8;
    if (safeY >= minY) y = Math.min(y, safeY);
    else x = Math.max(0, Math.min(x, controls.left - width - 8));
  }
  panel.style.left = x + 'px';
  panel.style.top = Math.max(minY, Math.min(y, maxY)) + 'px';
}
function applyWidth(value) { panelWidth=Math.max(300,Math.min(440,value));main.style.setProperty('--panel-width',panelWidth+'px');byId('panel-resize').setAttribute('aria-valuenow',String(panelWidth));if(floating)positionPanel(panel.offsetLeft,panel.offsetTop); }
function dock() { floating=false;main.classList.remove('panel-floating');panel.style.left='';panel.style.top=''; }
byId('panel-header').addEventListener('pointerdown',event=>{if(event.target.closest('button')||matchMedia('(max-width:850px)').matches)return;const startX=event.clientX,startY=event.clientY,rect=panel.getBoundingClientRect();let moved=false;const move=e=>{if(!moved&&Math.hypot(e.clientX-startX,e.clientY-startY)<6)return;moved=true;floating=true;main.classList.add('panel-floating');positionPanel(rect.left+e.clientX-startX,rect.top+e.clientY-startY);};const up=e=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);if(moved&&e.clientX<45)dock();};addEventListener('pointermove',move);addEventListener('pointerup',up,{once:true});});
byId('panel-resize').addEventListener('pointerdown',event=>{if(matchMedia('(max-width:850px)').matches)return;event.preventDefault();event.target.setPointerCapture(event.pointerId);const width=panelWidth,x=event.clientX;const move=e=>applyWidth(width+e.clientX-x);const up=()=>{event.target.removeEventListener('pointermove',move);event.target.removeEventListener('pointerup',up);};event.target.addEventListener('pointermove',move);event.target.addEventListener('pointerup',up,{once:true});});
byId('panel-resize').addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();applyWidth(panelWidth+(event.key==='ArrowRight'?10:-10));}else if(event.key==='Home'||event.key==='End'){event.preventDefault();applyWidth(event.key==='Home'?300:440);}});
addEventListener('resize',()=>{if(floating && matchMedia('(max-width:850px)').matches) dock(); else if(floating) positionPanel(panel.offsetLeft,panel.offsetTop);});
new ResizeObserver(() => { if (floating && !matchMedia('(max-width:850px)').matches) positionPanel(panel.offsetLeft,panel.offsetTop); }).observe(panel);
applyWidth(340);
