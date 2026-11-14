const endpoint = 'https://gea.esac.esa.int/tap-server/tap/sync';

export async function serveGaiaField(url, response) {
  const ra = Number(url.searchParams.get('ra'));
  const dec = Number(url.searchParams.get('dec'));
  const radius = Number(url.searchParams.get('radius'));
  const limit = Number(url.searchParams.get('limit'));
  const send = (code, body) => response.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': code === 200 ? 'public, max-age=120' : 'no-store',
  }).end(JSON.stringify(body));
  if (!['ra', 'dec', 'radius', 'limit'].every(key => url.searchParams.has(key)) ||
      ![ra, dec, radius, limit].every(Number.isFinite) || ra < 0 || ra >= 360 || Math.abs(dec) > 90 ||
      radius < .005 || radius > .35 || ![100, 250, 500].includes(limit)) {
    return send(400, { status: 'invalid_field' });
  }
  const query = `SELECT TOP ${limit} source_id, ra, dec, phot_g_mean_mag FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${ra},${dec},${radius})) ORDER BY phot_g_mean_mag ASC`;
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', QUERY: query }),
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) throw new Error('Gaia archive error');
    const rows = (await upstream.text()).trim().split(/\r?\n/);
    if (rows[0] !== 'source_id,ra,dec,phot_g_mean_mag') throw new Error('Unexpected Gaia response');
    const sources = rows.slice(1, limit + 1).map(row => {
      const [id, raValue, decValue, magnitudeValue] = row.split(',');
      return { id, ra: Number(raValue), dec: Number(decValue), magnitude: magnitudeValue ? Number(magnitudeValue) : null };
    }).filter(source => /^\d{1,19}$/.test(source.id) && Number.isFinite(source.ra) && Number.isFinite(source.dec));
    return send(200, { status: 'found', sources });
  } catch { return send(502, { status: 'archive_unavailable' }); }
}
