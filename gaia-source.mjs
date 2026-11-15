const endpoint = 'https://gea.esac.esa.int/tap-server/tap/sync';
export async function serveGaiaSource(url, response) {
  const id = url.searchParams.get('id') || '';
  const send = (code, body) => response.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':code===200?'public, max-age=300':'no-store' }).end(JSON.stringify(body));
  if (!/^\d{1,19}$/.test(id)) return send(400, { status:'invalid_id' });
  const query = `SELECT TOP 1 source_id, ra, dec, phot_g_mean_mag FROM gaiadr3.gaia_source WHERE source_id = ${id}`;
  try {
    const upstream = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({REQUEST:'doQuery',LANG:'ADQL',FORMAT:'csv',QUERY:query}), signal:AbortSignal.timeout(8000) });
    if (!upstream.ok) throw new Error('Gaia archive error');
    const rows = (await upstream.text()).trim().split(/\r?\n/);
    if (rows.length < 2) return send(200, {status:'not_found'});
    const [sourceId, raRaw, decRaw, magnitudeRaw] = rows[1].split(',');
    const ra=Number(raRaw), dec=Number(decRaw), magnitude=magnitudeRaw?.trim() ? Number(magnitudeRaw) : NaN;
    if (sourceId !== id || !Number.isFinite(ra) || !Number.isFinite(dec)) throw new Error('Unexpected Gaia result');
    send(200, {status:'found',source:{id:'Gaia DR3 '+id,name:'Gaia DR3 '+id,ra,dec,source:'Gaia DR3',category:'GAIA SOURCE',
      gMagnitude:Number.isFinite(magnitude)?magnitude:null,
      description:Number.isFinite(magnitude)?`Gaia DR3 source · G magnitude ${magnitude.toFixed(2)}.`:'Source listed in Gaia DR3.',
      url:'https://gea.esac.esa.int/archive/'}});
  } catch { send(502,{status:'archive_unavailable'}); }
}
