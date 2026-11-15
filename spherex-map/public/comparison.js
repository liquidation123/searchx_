import { references } from './sky-data.js';

export function hasSkyPosition(position) {
  const { ra, dec } = position ?? {};
  return Number.isFinite(ra) && ra >= 0 && ra < 360 && Number.isFinite(dec) && Math.abs(dec) <= 90;
}

const classes = {
  'Barnard 33': 'Dark nebula', 'M 42': 'Emission nebula', 'M 31': 'Spiral galaxy',
  'M 101': 'Spiral galaxy', 'M 1': 'Supernova remnant', 'M 45': 'Open cluster',
  'M 51': 'Spiral galaxy', 'M 57': 'Planetary nebula', 'eps Ind B': 'Brown dwarf binary',
  'WISE J085510.83-071442.5': 'Brown dwarf', 'RW Aur': 'Young variable star system',
  'R Dra': 'Long-period variable star',
};

export function comparisonObject(reference, exhibit) {
  if (!hasSkyPosition(reference)) return null;
  const curated = references.find(item => item.id === reference.id && item.ra === reference.ra && item.dec === reference.dec);
  return {
    ...reference,
    classification: (curated && classes[reference.id]) ||
      (reference.category && !/^(catalog source|gaia source)$/i.test(reference.category) ? reference.category : null),
    url: reference.url || 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=' + encodeURIComponent(reference.id),
    explanationUrl: exhibit?.url,
    positionEpoch: curated && ['eps Ind B', 'WISE J085510.83-071442.5'].includes(reference.id) ? '2026.0 (approximate)'
      : reference.source === 'Gaia DR3' ? 'J2016.0' : undefined,
    properties: reference.radio ? [['Dispersion measure', reference.radio.dm == null ? 'Unavailable' : reference.radio.dm + ' pc cm⁻³']] : [],
  };
}

export function angularSeparation(a, b) {
  if (!hasSkyPosition(a) || !hasSkyPosition(b)) return null;
  const radians = Math.PI / 180;
  const dRa = ((b.ra - a.ra + 540) % 360 - 180) * radians;
  const decA = a.dec * radians;
  const decB = b.dec * radians;
  const cosA = Math.abs(a.dec) === 90 ? 0 : Math.cos(decA);
  const cosB = Math.abs(b.dec) === 90 ? 0 : Math.cos(decB);
  const sinA = Math.sin(decA);
  const sinB = Math.sin(decB);
  const east = cosB * Math.sin(dRa);
  const north = cosA * sinB - sinA * cosB * Math.cos(dRa);
  const dot = sinA * sinB + cosA * cosB * Math.cos(dRa);
  return Math.atan2(Math.hypot(east, north), dot) / radians;
}

export function createComparison() {
  const slots = { A: null, B: null };
  let pending = null;
  return {
    get pending() { return pending; },
    get objects() { return { ...slots }; },
    arm(slot) { if (Object.hasOwn(slots, slot)) pending = slot; },
    cancel() { pending = null; },
    assign(slot, object) {
      if (!Object.hasOwn(slots, slot) || !hasSkyPosition(object)) return false;
      slots[slot] = { ...object };
      pending = null;
      return true;
    },
    accept(object) { return pending !== null && this.assign(pending, object); },
    swap() { [slots.A, slots.B] = [slots.B, slots.A]; },
  };
}

export function comparisonSummary({ A, B }) {
  const classification = [A?.classification, B?.classification];
  return {
    separation: A && B ? angularSeparation(A, B) : null,
    classification: classification.every(Boolean)
      ? classification[0] === classification[1] ? 'Both records list ' + classification[0].toLowerCase() + '.' : classification.join(' / ')
      : 'Classification unavailable for one or both targets.',
    properties: [A, B].map(object => object?.properties ?? []),
  };
}

export function setupComparison({ focusSearch, selectedObject }) {
  const byId = id => document.getElementById(id);
  const state = createComparison();
  const panel = byId('comparison-panel');
  const toggle = byId('compare-open');
  const instruction = byId('compare-instruction');
  const requests = new Map();

  function show(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) render();
  }

  function observations(object) {
    if (object.radio) return Promise.resolve('Published CHIME radio measurements are linked above.');
    const key = object.ra + ',' + object.dec;
    if (!requests.has(key)) {
      const query = new URLSearchParams({ ra: object.ra.toFixed(6), dec: object.dec.toFixed(6) });
      const pending = fetch('/spherex-observations?' + query, { signal: AbortSignal.timeout(26000) })
        .then(async response => {
          if (!response.ok) throw new Error('Archive unavailable');
          const { frames, truncated } = await response.json();
          if (!frames.length) return truncated ? 'Archive coverage was incomplete.' : 'No matching SPHEREx exposures found.';
          const releases = [...new Set(frames.map(frame => frame.release))].join(', ');
          return frames.length + (frames.length === 1 ? ' exposure' : ' exposures') +
            ' · ' + frames[0].detector + ' · ' + releases + (truncated ? ' · partial coverage' : '');
        }).catch(() => {
          requests.delete(key);
          return 'SPHEREx archive unavailable.';
        });
      requests.set(key, pending);
    }
    return requests.get(key);
  }

  function render() {
    const objects = state.objects;
    for (const slot of ['A', 'B']) {
      const body = byId('compare-object-' + slot);
      body.replaceChildren();
      const object = objects[slot];
      if (!object) { body.textContent = 'No object selected.'; continue; }
      const name = document.createElement('h3');
      name.textContent = object.name;
      const details = document.createElement('dl');
      const add = (label, value) => {
        const term = document.createElement('dt');
        const data = document.createElement('dd');
        term.textContent = label;
        if (typeof value === 'string') data.textContent = value;
        else data.append(value);
        details.append(term, data);
        return data;
      };
      add('Classification', object.classification || 'Unavailable');
      add('Sky position', `RA ${object.ra.toFixed(5)}° · Dec ${object.dec.toFixed(5)}°`);
      if (object.positionEpoch) add('Position epoch', object.positionEpoch);
      add('Characteristics', object.description || 'Unavailable');
      if (object.url) {
        const link = document.createElement('a');
        link.href = object.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = object.source + ' · ' + object.id;
        add('Reference', link);
      } else add('Reference', object.source || 'Unavailable');
      for (const [label, value] of object.properties ?? []) add(label, value);
      const archive = add('Observations', 'Checking archive…');
      void observations(object).then(value => { archive.textContent = value; });
      body.append(name, details);
    }
    const { separation, classification } = comparisonSummary(objects);
    byId('compare-difference').hidden = !objects.A || !objects.B;
    byId('compare-types').textContent = classification;
    byId('compare-separation').textContent = separation === null ? 'Unavailable' :
      separation < .1 ? (separation * 3600).toFixed(2) + ' arcsec' : separation.toFixed(3) + '°';
    byId('compare-swap').disabled = !objects.A && !objects.B;
    for (const slot of ['A', 'B']) {
      byId('compare-pick-' + slot).textContent = (objects[slot] ? 'Replace ' : 'Choose ') + slot;
      byId('compare-use-' + slot).hidden = !selectedObject();
    }
  }

  toggle.onclick = () => {
    state.cancel(); instruction.hidden = true; show(panel.hidden);
    if (!panel.hidden) byId('compare-title').focus();
  };
  byId('compare-close').onclick = () => { show(false); toggle.focus(); };
  byId('compare-cancel').onclick = () => { state.cancel(); instruction.hidden = true; show(true); toggle.focus(); };
  byId('compare-swap').onclick = () => { state.swap(); render(); };
  for (const slot of ['A', 'B']) {
    byId('compare-pick-' + slot).onclick = () => {
      state.arm(slot);
      byId('compare-destination').textContent = slot;
      instruction.hidden = false;
      show(false);
      focusSearch();
    };
    byId('compare-use-' + slot).onclick = () => {
      if (state.assign(slot, selectedObject())) render();
    };
    byId('inspector-compare-' + slot).onclick = () => {
      if (!state.assign(slot, selectedObject())) return;
      instruction.hidden = true;
      show(true);
      byId('compare-title').focus();
    };
  }
  return {
    get pending() { return state.pending; },
    accept(object) {
      if (!state.accept(object)) { if (!panel.hidden) render(); return false; }
      instruction.hidden = true;
      show(true);
      byId('compare-title').focus();
      return true;
    },
  };
}
