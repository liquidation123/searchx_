const mirror = 'https://vizier.idia.ac.za/viz-bin/nph-sesame/-ox?';
const tag = (xml, name) => xml.match(new RegExp('<'+name+'>([^<]*)</'+name+'>'))?.[1];
const unescapeXml = text => text?.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') || '';
export function parseSesame(xml) {
  const resolver = xml.match(/<Resolver\b[^>]*>([\s\S]*?)<\/Resolver>/)?.[1];
  if (!resolver) return null;
  const ra=Number(tag(resolver,'jradeg')), dec=Number(tag(resolver,'jdedeg'));
  if (!Number.isFinite(ra)||!Number.isFinite(dec)||ra<0||ra>=360||Math.abs(dec)>90) return null;
  const id=unescapeXml(tag(resolver,'oname'));
  return {ra,dec,id:id||null,category:unescapeXml(tag(resolver,'otype'))||null};
}
export async function serveNameResolve(url,response) {
  const name=(url.searchParams.get('name')||'').trim();
  const send=(code,body)=>response.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':code===200?'public, max-age=300':'no-store'}).end(JSON.stringify(body));
  if(!name||name.length>120||/[\x00-\x1f]/.test(name))return send(400,{status:'invalid_name'});
  try {
    const upstream=await fetch(mirror+encodeURIComponent(name),{signal:AbortSignal.timeout(7000)});
    if(!upstream.ok)throw new Error('Resolver error');
    const result=parseSesame(await upstream.text());
    send(200,result?{status:'found',source:result}:{status:'not_found'});
  } catch {send(502,{status:'resolver_unavailable'});}
}
