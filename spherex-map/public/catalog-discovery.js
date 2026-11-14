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
    const radius = Math.min(.18, Math.max(.015, fov * .42));
    const key = [ra.toFixed(2), dec.toFixed(2), radius.toFixed(2)].join(':');
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
    const params = new URLSearchParams({ ra: ra.toFixed(6), dec: dec.toFixed(6), radius: Math.min(radius, .08).toFixed(4) });
    const controller = new AbortController();
    fieldRequest = controller;
    fetch('/gaia-field?' + params, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Gaia unavailable');
      return response.json();
    }).then(result => {
      if (current !== revision) return;
      const gaia = A.catalog({ name: 'Nearby Gaia DR3', color: '#c8a274', sourceSize: 6,
        onClick: source => select(source, 'Gaia DR3') });
      gaia.addSources(result.sources.map(source => A.source(source.ra, source.dec, { Source: source.id, magnitude: source.magnitude })));
      viewer.addCatalog(gaia);
      catalogs.push(gaia);
      gaiaCount = result.sources.length;
      report();
    }).catch(() => { if (current === revision) { gaiaCount = 0; failures++; report(); } });
    const add = (catalog, sources, label) => {
      if (current !== revision) { viewer.removeOverlay(catalog); return; }
      catalogs.push(catalog);
      simbadCount = sources.length;
      report();
    };
    try {
      const simbad = A.catalogFromSimbad(target, radius,
        { name: 'Nearby SIMBAD', limit: 50, color: '#7fcbd4', sourceSize: 8, onClick: source => select(source, 'SIMBAD') },
        sources => add(simbad, sources, 'SIMBAD'), () => { if (current === revision) { simbadCount = 0; failures++; report(); } });
      viewer.addCatalog(simbad);
    } catch { if (current === revision) onStatus('Catalog sources unavailable.'); }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 450); };
  viewer.on('zoomChanged', schedule);
  viewer.on('positionChanged', schedule);
  schedule();
  return { refresh, clear };
}
