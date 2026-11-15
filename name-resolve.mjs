const mirror = 'https://vizier.idia.ac.za/viz-bin/nph-sesame/-ox?';
const tag = (xml, name) => xml.match(new RegExp('<'+name+'>([^<]*)</'+name+'>'))?.[1];
const unescapeXml = text => text?.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') || '';
export function sesameCandidates(xml) {
  const candidates = [];
  for (const [, resolver] of xml.matchAll(/<Resolver\b[^>]*>([\s\S]*?)<\/Resolver>/g)) {
    const rawRa = tag(resolver, 'jradeg')?.trim(), rawDec = tag(resolver, 'jdedeg')?.trim();
    if (!rawRa || !rawDec) continue;
    const ra = Number(rawRa), dec = Number(rawDec);
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || Math.abs(dec) > 90) continue;
    const id = unescapeXml(tag(resolver, 'oname')).trim();
    // Mirrors can report the same object in multiple catalogs with rounded coordinates.
    const nearby = candidates.some(candidate => {
      const dRa = Math.min(Math.abs(candidate.ra - ra), 360 - Math.abs(candidate.ra - ra));
      return Math.hypot(dRa * Math.cos(dec * Math.PI / 180), candidate.dec - dec) < 2 / 3600;
    });
    if (!nearby) candidates.push({ ra, dec, id: id || null, category: unescapeXml(tag(resolver, 'otype')) || null });
  }
  return candidates;
}
export function parseSesame(xml) {
  return sesameCandidates(xml)[0] ?? null;
}
export async function serveNameResolve(url,response) {
  const name=(url.searchParams.get('name')||'').trim();
  const send=(code,body)=>response.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':code===200?'public, max-age=300':'no-store'}).end(JSON.stringify(body));
  if(!name||name.length>120||/[\x00-\x1f]/.test(name))return send(400,{status:'invalid_name'});
  try {
    const upstream=await fetch(mirror+encodeURIComponent(name),{signal:AbortSignal.timeout(7000)});
    if(!upstream.ok)throw new Error('Resolver error');
    const candidates = sesameCandidates(await upstream.text());
    if (candidates.length > 1) return send(200, {status:'ambiguous', candidates});
    send(200, candidates.length ? {status:'found', source:candidates[0]} : {status:'not_found'});
  } catch {send(502,{status:'resolver_unavailable'});}
}
