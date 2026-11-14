// Bounded, disposable Aladin catalogs. Image HiPS layers remain independent.
export function setupCatalogDiscovery(viewer, A, onSource, onStatus = () => {}) {
  let catalogs = [];
  let revision = 0;
  let timer;
  let lastQuery = '';
  let fieldRequest;
  const clear = () => { for (const catalog of catalogs) viewer.removeOverlay(catalog); catalogs = []; };
  function select(source, provider) {
    const ra = Number(source?.ra), dec = Number(source?.dec);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return;
    const data = source.data || {};
    const id = provider === 'Gaia DR3'
      ? String(data.Source || data.source_id || data.SOURCE_ID || '').trim()
      : String(data.main_id || data.MAIN_ID || data.id || data.ID || '').trim();
    if (!id) return;
    onSource({ id: provider === 'Gaia DR3' ? 'Gaia DR3 ' + id : id,
      name: provider === 'Gaia DR3' ? 'Gaia DR3 ' + id : id,
      ra, dec, source: provider, category: provider === 'Gaia DR3' ? 'GAIA SOURCE' : String(data.otype || data.OTYPE || 'CATALOG SOURCE'),
      description: provider === 'Gaia DR3' ? 'Source listed in Gaia DR3.' : 'Astronomical source listed in SIMBAD.',
      url: provider === 'Gaia DR3' ? 'https://gea.esac.esa.int/archive/' :
        'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=' + encodeURIComponent(id) });
  }
  function refresh() {
    const fov = viewer.getFoV()[0];
    if (fov > .65) { ++revision; fieldRequest?.abort(); clear(); lastQuery = ''; onStatus(''); return; }
    const [ra, dec] = viewer.getRaDec();
    const limit = fov > .3 ? 100 : fov > .12 ? 250 : 500;
    const radius = Math.min(.35, Math.max(.005, fov * .55));
    const key = [ra.toFixed(2), dec.toFixed(2), radius.toFixed(3), limit].join(':');
    if (key === lastQuery) return;
    lastQuery = key;
    const current = ++revision;
    fieldRequest?.abort();
    clear();
    onStatus('Finding catalog sources in this field…');
    const target = { ra, dec };
    let gaiaCount = null, simbadCount = null, failures = 0;
    const report = () => {
      const count = (gaiaCount || 0) + (simbadCount || 0);
      if (count) onStatus(`${count} catalog sources shown`);
      else if (gaiaCount !== null && simbadCount !== null) onStatus(failures ? 'Catalog services unavailable in this field.' : 'No catalog sources in this field.');
    };
    const params = new URLSearchParams({ ra: ra.toFixed(6), dec: dec.toFixed(6), radius: radius.toFixed(4), limit });
    const controller = new AbortController();
    fieldRequest = controller;
    fetch('/gaia-field?' + params, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Gaia unavailable');
      return response.json();
    }).then(result => {
      if (current !== revision) return;
      const gaia = A.catalog({ name: 'Nearby Gaia DR3', color: '#c8a274', sourceSize: 6,
        onClick: source => select(source, 'Gaia DR3') });
      const occupied = new Set();
      const sky = document.getElementById('sky');
      const cell = sky.clientWidth <= 600 ? 20 : Math.max(10, Math.min(16, fov * 25));
      const sources = result.sources.filter(source => {
        const point = viewer.world2pix(source.ra, source.dec);
        if (!point || !point.every(Number.isFinite) || point[0] < 0 || point[0] > sky.clientWidth || point[1] < 0 || point[1] > sky.clientHeight) return false;
        const key = `${Math.floor(point[0] / cell)}:${Math.floor(point[1] / cell)}`;
        if (occupied.has(key)) return false;
        occupied.add(key);
        return true;
      });
      gaia.addSources(sources.map(source => A.source(source.ra, source.dec, { Source: source.id, magnitude: source.magnitude })));
      viewer.addCatalog(gaia);
      catalogs.push(gaia);
      gaiaCount = sources.length;
      report();
    }).catch(() => { if (current === revision) { gaiaCount = 0; failures++; report(); } });
    const add = (catalog, sources, label) => {
      if (current !== revision) { viewer.removeOverlay(catalog); return; }
      simbadCount = sources.length;
      report();
    };
    try {
      const simbad = A.catalogFromSimbad(target, Math.min(radius, .18),
        { name: 'Nearby SIMBAD', limit: 50, color: '#7fcbd4', sourceSize: 8, onClick: source => select(source, 'SIMBAD') },
        sources => add(simbad, sources, 'SIMBAD'), () => { if (current === revision) { simbadCount = 0; failures++; report(); } });
      viewer.addCatalog(simbad);
      catalogs.push(simbad);
    } catch { if (current === revision) { simbadCount = 0; failures++; report(); } }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 450); };
  viewer.on('zoomChanged', schedule);
  viewer.on('positionChanged', schedule);
  addEventListener('resize', () => { lastQuery = ''; schedule(); });
  schedule();
  return { refresh, clear };
}
