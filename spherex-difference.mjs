const width = 57;
const step = 6.15; // arcseconds per output pixel
const rad = Math.PI / 180;

function interpolate(x, y, w, h, sample) {
  const i = Math.floor(x), j = Math.floor(y);
  if (!(i >= 0 && j >= 0 && i + 1 < w && j + 1 < h)) return NaN;
  const a = x - i, b = y - j;
  return (1 - b) * ((1 - a) * sample(i, j) + a * sample(i + 1, j)) +
    b * ((1 - a) * sample(i, j + 1) + a * sample(i + 1, j + 1));
}

function basis(ra, dec) {
  const a = ra * rad, d = dec * rad;
  return [[Math.cos(a)*Math.cos(d), Math.sin(a)*Math.cos(d), Math.sin(d)],
    [-Math.sin(a), Math.cos(a), 0], [-Math.cos(a)*Math.sin(d), -Math.sin(a)*Math.sin(d), Math.cos(d)]];
}

export function calibratedCutout(extensions, ra, dec) {
  const image = extensions.get('IMAGE'), flags = extensions.get('FLAGS');
  const wave = extensions.get('WCS-WAVE');
  if (!image || !flags || !wave) return null;
  const h = image.header, n = key => Number(h.get(key));
  const w = n('NAXIS1'), height = n('NAXIS2'), fwhm = n('PSF_FWHM');
  if (h.get('BUNIT') !== 'MJy / sr' || h.get('RADESYS') !== 'ICRS' ||
      !/^RA---TAN(-SIP)?$/.test(h.get('CTYPE1')) || !/^DEC--TAN(-SIP)?$/.test(h.get('CTYPE2')) ||
      n('BITPIX') !== -32 || !(fwhm > 0 && fwhm < 40) || !(w > 1 && height > 1 && w <= 128 && height <= 128) ||
      flags.header.get('BITPIX') !== '32' || +flags.header.get('NAXIS1') !== w ||
      +flags.header.get('NAXIS2') !== height || flags.data.length !== image.data.length ||
      image.data.length !== w * height * 4) return null;
  // Accept the documented DR1/QR3 lookup layout, with wavelength/bandwidth interleaved.
  if (h.get('CTYPE1W') !== 'WAVE-TAB' || h.get('CTYPE2W') !== 'WAVE-TAB' ||
      h.get('PS1_0W') !== 'WCS-WAVE' || h.get('PS2_0W') !== 'WCS-WAVE' ||
      ['TTYPE1','TTYPE2','TTYPE3','TFORM1','TFORM2','TFORM3','TDIM3'].some((key, i) =>
        wave.header.get(key) !== ['X','Y','VALUES','9J','9J','162E','(2,9,9)'][i]) ||
      wave.data.length !== 720) return null;
  const axis = offset => Array.from({length: 9}, (_, i) => wave.data.readInt32BE(offset + 4*i));
  const xs = axis(0), ys = axis(36);
  const lookup = (axis, p) => {
    const i = axis.findIndex((value, i) => i < 8 && p >= value && p < axis[i+1]);
    return i < 0 ? NaN : i + (p - axis[i]) / (axis[i+1] - axis[i]);
  };
  const [a,b,c,d] = ['PC1_1','PC1_2','PC2_1','PC2_2'].map((key, i) => n(key) * n(i < 2 ? 'CDELT1' : 'CDELT2'));
  const determinant = a*d-b*c;
  if (!determinant) return null;
  const terms = axis => [...h].flatMap(([key,value]) => {
    const match = key.match(new RegExp('^' + axis + '_([0-9])_([0-9])$'));
    return match ? [[+match[1], +match[2], +value]] : [];
  });
  const sip = [terms('A'), terms('B')];
  const correction = (axis, x, y) => sip[axis].reduce((sum,[i,j,v]) => sum + v*x**i*y**j, 0);
  const output = basis(ra,dec), input = basis(n('CRVAL1'),n('CRVAL2'));
  const dot = (a,b) => a.reduce((sum,v,i) => sum + v*b[i], 0);
  const pixels = [], wavelengths = [], bands = [];
  const scale = +(h.get('BSCALE') ?? 1), zero = +(h.get('BZERO') ?? 0);
  for (let j=0; j<width; j++) for (let i=0; i<width; i++) {
    const sky = output[0].map((v,k) => v + step * rad / 3600 *
      ((28-i)*output[1][k] + (j-28)*output[2][k]));
    const z = dot(sky,input[0]);
    const u = dot(sky,input[1])/z/rad, v = dot(sky,input[2])/z/rad;
    const px = (d*u-b*v)/determinant, py = (a*v-c*u)/determinant;
    let x=px, y=py;
    for(let k=0;k<8;k++) [x,y]=[px-correction(0,x,y),py-correction(1,x,y)];
    if (z <= 0 || !(Math.hypot(x+correction(0,x,y)-px,y+correction(1,x,y)-py) < .01)) x=y=NaN;
    x += n('CRPIX1')-1;
    y += n('CRPIX2')-1;
    const ix = lookup(xs, n('CRVAL1W') + (x+1-n('CRPIX1W'))*n('CDELT1W'));
    const iy = lookup(ys, n('CRVAL2W') + (y+1-n('CRPIX2W'))*n('CDELT2W'));
    const spectral = component => interpolate(ix,iy,9,9,(i,j) => wave.data.readFloatBE(72+8*(9*j+i)+4*component));
    wavelengths.push(spectral(0));
    bands.push(spectral(1));
    pixels.push(interpolate(x,y,w,height,(i,j) => {
      const offset = 4*(j*w+i);
      return flags.data.readInt32BE(offset) ? NaN : image.data.readFloatBE(offset)*scale+zero;
    }));
  }
  return {width,height:width,pixels,wavelengths,bands,fwhm};
}

function compatible(a,b) {
  let shared = 0;
  for (let i=0;i<a.pixels.length;i++) {
    if (!Number.isFinite(a.pixels[i]) || !Number.isFinite(b.pixels[i])) continue;
    const narrow = Math.min(a.bands[i],b.bands[i]), wide = Math.max(a.bands[i],b.bands[i]);
    if (!(narrow > 0 && narrow >= .8*wide &&
          Math.abs(a.wavelengths[i]-b.wavelengths[i]) <= .25*narrow)) return false;
    shared++;
  }
  return shared >= .5*a.pixels.length;
}

function blur(frame, target) {
  const sigma = Math.sqrt(target**2-frame.fwhm**2)/(2.355*step);
  if (sigma < .05) return frame.pixels;
  const radius = Math.ceil(3*sigma);
  return frame.pixels.map((_,i) => {
    const x=i%frame.width, y=Math.floor(i/frame.width);
    if (x<radius || y<radius || x>=frame.width-radius || y>=frame.height-radius) return NaN;
    let sum=0, total=0;
    for(let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++) {
      const weight=Math.exp(-(dx**2+dy**2)/(2*sigma**2));
      sum += weight*frame.pixels[i+dy*frame.width+dx];
      total += weight;
    }
    return sum/total;
  });
}

export function differenceFrames(frames) {
  // Use the earliest viable group and leave at least one later exposure out of its reference.
  for (let i=0;i<frames.length-2;i++) {
    const group = frames[i] ? [i] : [];
    for(let j=i+1; group.length && j<frames.length;j++) {
      if (frames[j] && group.every(k=>compatible(frames[k],frames[j]))) group.push(j);
    }
    if(group.length<3) continue;
    const target=Math.max(...group.map(k=>frames[k].fwhm));
    const matched=group.map(k=>blur(frames[k],target));
    const refs=matched.slice(0,Math.min(3,matched.length-1));
    const reference=refs[0].map((_,i)=>{
      const values=refs.map(a=>a[i]);
      if (!values.every(Number.isFinite)) return NaN;
      values.sort((a,b)=>a-b);
      return values.length===2 ? (values[0]+values[1])/2 : values[1];
    });
    const result=frames.map(()=>null);
    for(const [j,k] of group.entries()){
      const pixels=matched[j].map((v,i)=>Math.max(0,v-reference[i]));
      if(pixels.filter(Number.isFinite).length >= .25*pixels.length) result[k]={...frames[k],pixels};
    }
    if(!group.slice(refs.length).some(k=>result[k]) || group.slice(0,refs.length).some(k=>!result[k])) continue;
    const positive=result.flatMap(f=>f?.pixels.filter(v=>Number.isFinite(v)&&v>0) ?? []).sort((a,b)=>a-b);
    return {frames:result,high:positive[Math.floor(.99*(positive.length-1))] || 1};
  }
  return null;
}
