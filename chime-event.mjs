const base = 'https://chime-frb.ca/api/v1/catalogs/catalog2/bursts/';
const finite = value => value === null || value === undefined ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export function parseChimeEvent(data, requestedId) {
  const row = data?.rows?.[0];
  if (!row || row.tns_name !== requestedId) return null;
  const ra = finite(row.ra), dec = finite(row.dec);
  if (ra === null || dec === null || ra < 0 || ra >= 360 || Math.abs(dec) > 90) return null;
  const raError = finite(row.ra_err), decError = finite(row.dec_err), mjd = finite(row.mjd_400);
  const dm = finite(row.dm_fitb) ?? finite(row.bonsai_dm);
  return {
    id: requestedId, name: requestedId, ra, dec, source: 'CHIME/FRB Catalog 2', category: 'RADIO TRANSIENT',
    description: `Published fast radio burst detected by CHIME/FRB.${raError !== null && decError !== null ? ` Localization uncertainty: RA ±${raError.toFixed(4)}°, Dec ±${decError.toFixed(4)}°.` : ' Localization uncertainty unavailable.'}`,
    url: 'https://chime-frb.ca/catalogs/catalog2/' + requestedId,
    radio: { raError, decError, mjd, dm, eventId: String(row.event_id || ''),
      subBursts: data.rows.length, notes: String(row.ra_dec_notes || ''), excluded: row.excluded_flag === 1 },
  };
}

export async function serveChimeEvent(url, response) {
  const id = (url.searchParams.get('id') || '').toUpperCase();
  const send = (code, body) => response.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': code === 200 ? 'public, max-age=600' : 'no-store',
  }).end(JSON.stringify(body));
  if (!/^FRB\d{8}[A-Z]$/.test(id)) return send(400, { status: 'invalid_id' });
  try {
    const upstream = await fetch(base + id, { signal: AbortSignal.timeout(8000) });
    if (upstream.status === 404) return send(200, { status: 'not_found' });
    if (!upstream.ok) throw new Error('CHIME unavailable');
    const source = parseChimeEvent(await upstream.json(), id);
    return send(200, source ? { status: 'found', source } : { status: 'not_found' });
  } catch { return send(502, { status: 'catalog_unavailable' }); }
}
