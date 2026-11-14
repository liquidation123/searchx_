const center = [269.44783234, 4.74805538];
export const barnardMarker = { id: 'barnard-star', name: "Barnard's Star", ra: center[0], dec: center[1] };
const radius = 2 / 60;
const endpoint = '/timelapse/barnard-star/sequence';

export function setupBarnard(viewer, A, pointAt) {
  const byId = id => document.getElementById(id);
  const select = byId('barnard-select');
  const panel = byId('barnard-panel');
  const status = byId('barnard-status');
  const find = byId('barnard-find');
  const retry = byId('barnard-retry');
  const player = byId('barnard-player');
  const image = byId('barnard-image');
  const slider = byId('barnard-frame');
  const play = byId('barnard-play');
  const date = byId('barnard-date');
  const source = byId('barnard-source');
  const sky = byId('sky');
  const overlay = A.graphicOverlay({ name: 'Selected region', color: '#ffc779', lineWidth: 2 });
  viewer.addOverlay(overlay);
  let timer, pending, manifest;
  let revision = 0;
  let regionRequest, selectedRegion;
  let lastPrefetch = -Infinity;
  function regionQuery(ra, dec) {
    const longitude = Math.round((((ra % 360) + 360) % 360) * 3600) % 1296000 / 3600;
    const latitude = Math.round(dec * 3600) / 3600;
    return new URLSearchParams({ ra: longitude.toFixed(6), dec: latitude.toFixed(6), field: 4 });
  }
  let frameRevision = 0;

  function stop() {
    clearInterval(timer);
    timer = undefined;
    play.textContent = 'Play';
  }

  function setSelecting(active) {
    select.setAttribute('aria-pressed', String(active));
    sky.classList.toggle('select-region', active);
  }

  function reset() {
    regionRequest?.abort();
    regionRequest = undefined;
    stop();
    revision++;
    frameRevision++;
    panel.hidden = false;
    player.hidden = true;
    image.removeAttribute('src');
    date.textContent = '';
    source.removeAttribute('href');
    retry.hidden = true;
    find.hidden = false;
  }

  async function showFrame(index) {
    const frame = manifest.frames[index];
    const request = ++frameRevision;
    slider.value = index;
    try {
      const next = new Image();
      next.src = frame.imageUrl;
      await next.decode();
      if (request !== frameRevision) return;
      image.src = frame.imageUrl;
      date.textContent = new Date(frame.observedAt).toISOString().slice(0, 10) + ' UTC';
      source.href = frame.sourceUrl;
    } catch {
      if (request !== frameRevision) return;
      stop();
      status.textContent = 'Could not load this observation. Try again.';
      retry.hidden = false;
    }
  }

  async function getSequence(progress) {
    let response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(12000) });
    const deadline = Date.now() + 360000;
    while (true) {
      const result = await response.json();
      if (!response.ok || result.status !== 'running') return result;
      if (Date.now() >= deadline) throw new Error('Timed out waiting for IRSA');
      progress(result.message);
      await new Promise(resolve => setTimeout(resolve, 2000));
      response = await fetch(endpoint + '/' + encodeURIComponent(result.jobId), {
        signal: AbortSignal.timeout(12000),
      });
    }
  }

  async function loadRegion(ra, dec) {
    if (![ra, dec].every(Number.isFinite) || Math.abs(dec) > 90) return;
    reset();
    setSelecting(false);
    selectedRegion = [((ra % 360) + 360) % 360, dec];
    manifest = undefined;
    const current = revision;
    const controller = new AbortController();
    regionRequest = controller;
    const deadline = Date.now() + 360000;
    const query = regionQuery(...selectedRegion);
    const endpoint = '/timelapse/regions';
    byId('barnard-heading').textContent = 'Sky time-lapse';
    byId('barnard-position').textContent = `RA ${selectedRegion[0].toFixed(4)}°, Dec ${dec.toFixed(4)}° · 4′ field`;
    find.hidden = true;
    overlay.removeAll();
    overlay.add(A.circle(Number(query.get('ra')), Number(query.get('dec')), radius));
    status.textContent = 'Looking for NEOWISE W1 observations at IRSA.';
    delete status.dataset.loading;

    let path = endpoint + '?' + query;
    let method = 'POST';
    let delay = 800;
    try {
      while (Date.now() < deadline) {
        const response = await fetch(path, {
          method, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        const result = await response.json();
        if (current !== revision) return;
        if (result.manifest?.frames.length >= 2) {
          const first = !manifest;
          const product = manifest?.frames[Number(slider.value)]?.productId;
          manifest = result.manifest;
          slider.max = manifest.frames.length - 1;
          if (first) {
            overlay.removeAll();
            overlay.add(A.circle(...manifest.center, manifest.fieldArcmin / 120));
            byId('barnard-position').textContent = `RA ${manifest.center[0].toFixed(4)}°, Dec ${manifest.center[1].toFixed(4)}° · ${manifest.fieldArcmin}′ field`;
            player.hidden = false;
            await showFrame(0);
            if (current !== revision) return;
            if (retry.hidden) play.click();
          } else {
            const index = manifest.frames.findIndex(frame => frame.productId === product);
            if (index >= 0) slider.value = index;
          }
        }
        if (!response.ok || result.status === 'error') {
          throw new Error(result.message || result.detail || 'Time-lapse unavailable.');
        }
        status.textContent = result.message || '';
        if (result.status === 'ready' || result.status === 'insufficient') return;
        if (result.status !== 'running' || !/^[a-f0-9]{32}$/.test(result.jobId)) throw new Error('Invalid job response.');
        path = endpoint + '/' + result.jobId;
        method = 'GET';
        await new Promise(resolve => {
          const signal = controller.signal;
          const finish = () => { clearTimeout(timeout); signal.removeEventListener('abort', finish); resolve(); };
          const timeout = setTimeout(finish, delay);
          signal.addEventListener('abort', finish, { once: true });
        });
        if (controller.signal.aborted) return;
        delay = Math.min(3000, delay * 1.4);
      }
      throw new Error('The time-lapse is taking longer than expected. Try again.');
    } catch (error) {
      if (current !== revision) return;
      status.textContent = error.message || 'Could not load the IRSA observations.';
      retry.hidden = false;
    }
  }

  async function load(autoplay = false) {
    if (selectedRegion) manifest = undefined;
    selectedRegion = undefined;
    byId('barnard-heading').textContent = "Barnard's Star time-lapse";
    byId('barnard-position').textContent = '';
    reset();
    const current = revision;
    status.textContent = 'Finding NEOWISE W1 observations at IRSA.';
    try {
      if (!manifest) {
        pending ??= getSequence(message => {
          if (!panel.hidden && status.dataset.loading === 'true') status.textContent = message;
        }).finally(() => { pending = undefined; });
        status.dataset.loading = 'true';
        const result = await pending;
        if (current !== revision) return;
        if (result.status === 'ready') manifest = result.manifest;
        if (result.status === 'insufficient') {
          status.textContent = result.message;
          return;
        }
        if (result.status !== 'ready') throw new Error('IRSA job failed');
      }
      if (current !== revision) return;
      status.textContent = manifest.preview ? 'Playing archived IRSA observations.' : '';
      slider.max = manifest.frames.length - 1;
      player.hidden = false;
      await showFrame(0);
      if (current === revision && autoplay && retry.hidden) play.click();
    } catch {
      if (current !== revision) return;
      status.textContent = 'Could not prepare the IRSA observations. Try again.';
      retry.hidden = false;
    } finally {
      if (current === revision) delete status.dataset.loading;
    }
  }

  find.addEventListener('click', () => {
    pointAt(...center, .14);
    load(true);
  });
  retry.addEventListener('click', () => selectedRegion ? loadRegion(...selectedRegion) : load(true));
  byId('barnard-close').addEventListener('click', () => {
    reset();
    panel.hidden = true;
    delete status.dataset.loading;
    overlay.removeAll();
    setSelecting(false);
    select.focus();
  });

  slider.addEventListener('input', () => { stop(); showFrame(Number(slider.value)); });
  play.addEventListener('click', () => {
    if (timer) { stop(); return; }
    play.textContent = 'Pause';
    timer = setInterval(() => showFrame((Number(slider.value) + 1) % manifest.frames.length), 850);
  });
  select.disabled = false;
  const open = () => {
    pointAt(...center, .14);
    setSelecting(false);
    overlay.removeAll();
    overlay.add(A.circle(...center, radius));
    return load(true);
  };
  open.region = loadRegion;
  open.prefetch = async (ra, dec) => {
    if (![ra, dec].every(Number.isFinite) || Math.abs(dec) > 90 ||
        performance.now() - lastPrefetch < 30000) return;
    lastPrefetch = performance.now();
    const query = regionQuery(ra, dec);
    query.set('prefetch', 'true');
    try {
      const response = await fetch('/timelapse/regions?' + query, {
        method: 'POST', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return;
      const { manifest } = await response.json();
      for (const frame of manifest?.frames.slice(0, 2) ?? []) {
        const image = new Image();
        image.src = frame.imageUrl;
      }
    } catch {
      // Speculative requests must not affect foreground playback.
    }
  };
  return open;
}
