export function setupObservations(viewer, A, closeInspector) {
  const byId = id => document.getElementById(id);
  const sky = byId('sky');
  const region = byId('barnard-select');
  const setSelecting = active => {
    region.setAttribute('aria-pressed', String(active));
    sky.classList.toggle('select-region', active);
  };
  const panel = byId('observation-panel');
  const position = byId('observation-position');
  const status = byId('observation-status');
  const player = byId('observation-player');
  const slider = byId('observation-frame');
  const difference = byId('observation-difference');
  const differenceStatus = byId('observation-difference-status');
  const differenceRetry = document.createElement('button');
  differenceRetry.type = 'button';
  differenceRetry.textContent = 'Retry static source subtraction';
  differenceRetry.hidden = true;
  differenceStatus.after?.(differenceRetry);
  differenceRetry.addEventListener('click', () => { if (selected) void prepareDifferences(...selected); });
  let filtered;
  let differenceRequest;
  const play = byId('observation-play');
  const cutout = byId('observation-source');
  const image = byId('observation-image');
  const imageStatus = byId('observation-placeholder');
  const feedbackSection = byId('community-feedback');
  const feedbackForm = byId('community-feedback-form');
  status.after(feedbackSection);
  const viewport = byId('observation-viewport');
  const zoomOut = byId('observation-zoom-out');
  const zoomIn = byId('observation-zoom-in');
  let zoom = 1;
  let stretch;
  let previewRevision = 0;
  let failedFrame;
  let previewCache = new Map();
  const pendingPreloads = new Set();
  let referencePreviewUrl;
  let activeCandidate;
  let sharedFeedbackUrl;

  function resetCommunityFeedback(candidate) {
    activeCandidate = candidate;
    feedbackSection.hidden = !candidate;
    feedbackForm.hidden = false;
    feedbackForm.reset();
    byId('community-feedback-submit').disabled = false;
    byId('community-feedback-status').textContent = '';
    byId('community-feedback-share').hidden = true;
    byId('community-feedback-share-status').textContent = '';
    byId('community-feedback-shared').hidden = true;
    sharedFeedbackUrl = undefined;
  }
  feedbackForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!activeCandidate) return;
    const vote = feedbackForm.querySelector('input[name="community-vote"]:checked')?.value;
    if (!vote) { byId('community-feedback-status').textContent = 'Choose one response before saving.'; return; }
    const submit = byId('community-feedback-submit');
    submit.disabled = true;
    byId('community-feedback-status').textContent = 'Saving your response…';
    const context = {
      ra: activeCandidate.ra, dec: activeCandidate.dec, candidateName: activeCandidate.name,
      source: activeCandidate.sieveCommit ? 'SIEVE' : 'candidate',
      frames: (activeCandidate.frames ?? []).map(frame => ({ id: frame.id, observedAt: frame.observedAt })),
    };
    try {
      const response = await fetch('/community-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: activeCandidate.id, vote, note: byId('community-note').value, context }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your response.');
      sharedFeedbackUrl = new URL('/community-reviews/' + result.id, location.origin).href;
      byId('community-feedback-url').value = sharedFeedbackUrl;
      byId('community-feedback-status').textContent = 'Your response is saved.';
      byId('community-feedback-share').hidden = false;
    } catch (error) {
      submit.disabled = false;
      byId('community-feedback-status').textContent = error.message;
    }
  });
  byId('community-feedback-share-button').addEventListener('click', async () => {
    if (!sharedFeedbackUrl) return;
    try {
      if (navigator.share) await navigator.share({ title: 'Community review of a SIEVE candidate', text: 'Take a look at this candidate and community review.', url: sharedFeedbackUrl });
      else { await navigator.clipboard.writeText(sharedFeedbackUrl); byId('community-feedback-share-status').textContent = ' Link copied.'; }
    } catch (error) {
      if (error.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(sharedFeedbackUrl); byId('community-feedback-share-status').textContent = ' Link copied.'; }
      catch { byId('community-feedback-share-status').textContent = ' Copy unavailable; select and copy the link above.'; }
    }
  });
  byId('community-feedback-url').addEventListener('focus', event => event.currentTarget.select());

  function setZoom(value) {
    zoom = value;
    image.style.transform = 'scale(' + zoom + ')';
    byId('observation-field').textContent = zoom === 1 ? '6′ cutout' : zoom + '× zoom';
    zoomOut.disabled = zoom === 1;
    zoomIn.disabled = zoom === 4;
  }
  zoomOut.addEventListener('click', () => setZoom(zoom / 2));
  zoomIn.addEventListener('click', () => setZoom(zoom * 2));

  function resetPreview() {
    differenceRequest?.abort();
    filtered = undefined;
    difference.checked = false;
    difference.disabled = true;
    differenceStatus.textContent = '';
    differenceRetry.hidden = true;
    stretch = undefined;
    viewport.hidden = true;
    setZoom(1);
    previewRevision++;
    failedFrame = undefined;
    previewCache = new Map();
    for (const preload of pendingPreloads) preload.removeAttribute('src');
    pendingPreloads.clear();
    if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
    referencePreviewUrl = undefined;
    image.hidden = true;
    image.removeAttribute('src');
    cutout.removeAttribute('href');
    byId('observation-date').textContent = '';
    imageStatus.hidden = true;
    byId('observation-alternative').hidden = true;
    byId('observation-fits-fallback').hidden = true;
    byId('observation-available-dates').hidden = true;
    byId('observation-date-list').replaceChildren();
    byId('radio-fields').hidden = true;
    byId('radio-source').hidden = true;
  }
  const overlay = A.graphicOverlay({ name: 'SPHEREx observation position', color: '#8eeade', lineWidth: 2 });
  viewer.addOverlay(overlay);
  let gesture, request, timer, selected, frames = [];

  function stop() {
    clearTimeout(timer);
    timer = undefined;
    play.textContent = 'Play';
  }

  function previewUrl(frame) {
    const source = new URL(frame.cutoutUrl);
    const [ra, dec] = source.searchParams.get('center').split(',');
    const query = new URLSearchParams({ product: source.pathname, ra, dec, v: '2' });
    if (stretch) query.set('stretch', stretch);
    return '/spherex-preview?' + query;
  }

  function loadPreview(frame, index) {
    const residual = difference.checked && filtered?.[index];
    const url = residual ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(residual) : previewUrl(frame);
    if (!previewCache.has(url)) {
      const preload = new Image();
      pendingPreloads.add(preload);
      preload.src = url;
      const cache = previewCache;
      let timeout;
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => { preload.removeAttribute('src'); reject(new Error('Preview timed out')); }, 14000);
      });
      cache.set(url, Promise.race([preload.decode().then(() => preload.src), deadline])
        .finally(() => { clearTimeout(timeout); pendingPreloads.delete(preload); }).catch(error => {
          cache.delete(url);
          throw error;
        }));
    }
    return previewCache.get(url);
  }

  async function showFrame(index) {
    const frame = frames[index];
    if (!frame) return false;
    const revision = ++previewRevision;
    if (!image.hidden) status.textContent = 'Loading observation…';
    try {
      const src = await loadPreview(frame, index);
      if (revision !== previewRevision) return false;
      failedFrame = undefined;
      byId('observation-retry').hidden = true;
      image.src = src;
      viewport.hidden = image.hidden = false;
      imageStatus.hidden = true;
    } catch {
      if (revision !== previewRevision) return false;
      failedFrame = index;
      byId('observation-retry').hidden = false;
      stop();
      if (!image.hidden) {
        slider.value = image.dataset.frame;
        status.textContent = 'This frame could not load. The previous image is still displayed.';
        return false;
      }
      imageStatus.hidden = false;
      imageStatus.textContent = 'Image preview unavailable. The original FITS cutout is available below.';
      byId('observation-fits-fallback').href = frame.cutoutUrl;
      byId('observation-fits-fallback').hidden = false;
      byId('observation-alternative').hidden = false;
      return false;
    }
    byId('observation-fits-fallback').hidden = true;
    slider.value = index;
    image.dataset.frame = index;
    const time = frame.evidence ? frame.observedAt.slice(0, -1) : frame.observedAt.slice(0, 19);
    byId('observation-date').textContent = time.replace('T', ' ') +
      ' UTC · ' + frame.detector + ' · ' + frame.release + (frame.evidence ? ' · ' + frame.id : '');
    cutout.href = frame.sourceUrl;
    status.textContent = sequenceStatus;
    if (filtered) {
      difference.disabled = !difference.checked && !filtered[index];
      differenceStatus.textContent = difference.checked
        ? (filtered[index] ? 'Changes relative to early frames' : 'Original exposure. This frame has no compatible reference.')
        : (filtered[index] ? '' : 'Static source subtraction is unavailable for this exposure.');
    }
    const next = (index + 1) % frames.length;
    if (frames.length > 1) void loadPreview(frames[next], next).catch(() => {});
    return true;
  }

  let sequenceStatus = '';
  async function prepareDifferences(ra, dec) {
    differenceRequest?.abort();
    differenceRetry.hidden = true;
    if (frames.length < 3) {
      differenceStatus.textContent = 'Static source subtraction needs at least three exposures.';
      return;
    }
    const current = new AbortController();
    differenceRequest = current;
    differenceStatus.textContent = 'Checking exposure compatibility for static source subtraction…';
    const query = new URLSearchParams({ra, dec, view: 'difference'});
    for (const frame of frames) query.append('product', new URL(frame.cutoutUrl).pathname);
    try {
      const answer = await fetch('/spherex-preview?' + query, {signal: current.signal});
      if (!answer.ok) throw new Error('Subtraction unavailable');
      const result = await answer.json();
      if (current.signal.aborted) return;
      filtered = result.images;
      differenceRetry.hidden = !result.retryable;
      const available = filtered?.[Number(image.dataset.frame)] && !image.hidden;
      difference.disabled = !available;
      differenceStatus.textContent = available ? '' : result.reason ??
        'Static source subtraction is unavailable for this exposure.';
    } catch {
      if (!current.signal.aborted) {
        differenceStatus.textContent = 'Could not check exposure compatibility.';
        differenceRetry.hidden = false;
      }
    }
  }

  difference.addEventListener('change', async () => {
    stop();
    const timeline = differenceRequest;
    const shown = showFrame(Number(image.dataset.frame));
    const revision = previewRevision;
    if (!await shown && timeline === differenceRequest && revision === previewRevision) {
      difference.checked = !difference.checked;
    }
  });
  async function select(ra, dec, autoplay = false, candidate) {
    if (![ra, dec].every(Number.isFinite)) return;
    setSelecting(false);
    if (!byId('barnard-panel').hidden) byId('barnard-close').click();
    request?.abort();
    const current = new AbortController();
    request = current;
    selected = [ra, dec, false, candidate];
    resetCommunityFeedback(candidate);
    resetPreview();
    byId('observation-heading').querySelector('span').textContent = ' / SPHEREx DR1';
    byId('observation-frame-note').hidden = false;
    frames = [];
    stop();
    panel.hidden = false;
    player.hidden = true;
    overlay.removeAll();
    overlay.add(A.circle(ra, dec, .05));
    position.textContent = 'RA ' + ra.toFixed(4) + '° · Dec ' + dec.toFixed(4) + '°';
    status.textContent = 'Looking for SPHEREx DR1 and QR3 observations…';
    byId('observation-retry').hidden = true;
    const query = new URLSearchParams({ ra: ra.toFixed(6), dec: dec.toFixed(6) });
    try {
      let results = {frames: candidate?.frames};
      if (!candidate) {
        const response = await fetch('/spherex-observations?' + query, { signal: current.signal });
        if (!response.ok) throw new Error('Archive unavailable');
        results = await response.json();
      }
      if (current.signal.aborted) return;
      frames = results.frames;
      if (candidate) byId('observation-heading').querySelector('span').textContent = ' / SIEVE demo · QR3';
      const dateList = byId('observation-date-list');
      dateList.replaceChildren();
      for (const frame of frames) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = frame.cutoutUrl;
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = new Date((frame.mjd - 40587) * 86400000).toISOString().slice(0, 10) + ' · ' + frame.detector + ' · FITS ↗';
        item.append(link); dateList.append(item);
      }
      byId('observation-available-dates').hidden = frames.length === 0;
      if (!frames.length) {
        status.textContent = results.truncated ? 'IRSA returned partial coverage. Try again.' :
          'No matching SPHEREx wide-survey exposures found at this position.';
        byId('observation-retry').hidden = !results.truncated;
        byId('observation-alternative').hidden = false;
        return;
      }
      sequenceStatus = candidate?.summary ?? (frames.length === 1 ? 'One observation date found.' :
        frames.length + ' observation dates from the same detector.');
      if (results.truncated) sequenceStatus += ' IRSA returned partial archive coverage.';
      status.textContent = sequenceStatus;
      imageStatus.hidden = false;
      imageStatus.textContent = 'Loading first SPHEREx image…';
      let reference = 0;
      for (; reference < frames.length; reference++) {
        try {
          const response = await fetch(previewUrl(frames[reference]), { signal: current.signal });
          if (!response.ok) continue;
          const bounds = response.headers.get('X-SPHEREx-Stretch');
          const blob = await response.blob();
          if (current.signal.aborted) return;
          if (bounds) {
            stretch = bounds;
            // The first response was rendered using these exact bounds. Reuse it
            // for the corresponding stretched URL instead of fetching it again.
            referencePreviewUrl = URL.createObjectURL(blob);
            const preload = new Image();
            preload.src = referencePreviewUrl;
            await preload.decode();
            if (current.signal.aborted) return;
            previewCache.set(previewUrl(frames[reference]), Promise.resolve(referencePreviewUrl));
            break;
          }
        } catch {
          if (current.signal.aborted) return;
          if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
          referencePreviewUrl = undefined; stretch = undefined;
        }
      }
      slider.max = frames.length - 1;
      slider.disabled = play.disabled = frames.length < 2;
      player.hidden = false;
      const shown = await showFrame(reference < frames.length ? reference : 0);
      if (!current.signal.aborted) void prepareDifferences(ra, dec);
      if (shown && !current.signal.aborted && autoplay && frames.length > 1) play.click();
    } catch {
      if (current.signal.aborted) return;
      status.textContent = 'IRSA couldn’t return observations. Try again or choose another spot.';
      byId('observation-retry').hidden = false;
      byId('observation-alternative').hidden = false;
    }
  }

  select.showCommunityFeedback = report => {
    feedbackSection.hidden = false;
    feedbackForm.hidden = true;
    byId('community-feedback-share').hidden = true;
    byId('community-feedback-shared').hidden = false;
    const labels = { anomaly: 'The reviewer thinks this candidate could be an anomaly.', not_anomaly: 'The reviewer thinks this candidate is probably not an anomaly.', unsure: 'The reviewer is unsure whether this is an anomaly.' };
    byId('community-feedback-shared-vote').textContent = labels[report.vote] ?? 'Assessment unavailable.';
    byId('community-feedback-shared-note').textContent = report.note || 'The reviewer did not add notes.';
    byId('community-feedback-shared-date').textContent = `Community review · ${new Date(report.created_at).toLocaleDateString()}`;
  };

  select.loadCommunityFeedback = async id => {
    const response = await fetch('/community-feedback/' + encodeURIComponent(id));
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || 'Could not load this shared review.');
    return report;
  };

  select.radio = reference => {
    setSelecting(false);
    resetCommunityFeedback(undefined);
    request?.abort();
    resetPreview();
    stop();
    overlay.removeAll();
    frames = [];
    selected = undefined;
    player.hidden = true;
    panel.hidden = false;
    byId('observation-retry').hidden = true;
    byId('observation-heading').querySelector('span').textContent = ' / CHIME/FRB Catalog 2';
    byId('observation-frame-note').hidden = true;
    position.textContent = reference.id + ' · published radio transient';
    status.textContent = 'These are CHIME radio measurements. An optical or SPHEREx image at this position is not an image of the burst.';
    const fields = byId('radio-fields');
    fields.replaceChildren();
    const add = (label, value) => {
      if (value === null || value === undefined || value === '') return;
      const term = document.createElement('dt'), detail = document.createElement('dd');
      term.textContent = label; detail.textContent = value; fields.append(term, detail);
    };
    const radio = reference.radio;
    add('CHIME event ID', radio.eventId);
    add('Arrival at 400 MHz · UTC', radio.mjd === null ? null : new Date((radio.mjd - 40587) * 86400000).toISOString());
    add('Dispersion measure', radio.dm === null ? null : radio.dm.toFixed(2) + ' pc cm⁻³');
    add('Localization · J2000', `RA ${reference.ra.toFixed(4)}°${radio.raError === null ? '' : ' ±' + radio.raError.toFixed(4) + '°'} · Dec ${reference.dec.toFixed(4)}°${radio.decError === null ? '' : ' ±' + radio.decError.toFixed(4) + '°'}`);
    add('Published sub-bursts', String(radio.subBursts));
    if (radio.excluded) add('Catalog note', 'Flagged as excluded from population inference.');
    add('Localization note', radio.notes);
    fields.hidden = false;
    byId('radio-source').href = reference.url;
    byId('radio-source').hidden = false;
  };

  function coordinatesAt(x, y) {
    const rect = sky.getBoundingClientRect();
    try {
      return viewer.pix2world(x - rect.left, y - rect.top, 'ICRS');
    } catch {
      return null;
    }
  }

  sky.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 ||
        event.target.closest('button, a, input, select, .aladin-control-container')) {
      gesture = undefined;
      return;
    }
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, true);
  sky.addEventListener('pointermove', event => {
    if (gesture && (gesture.id !== event.pointerId ||
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6)) gesture = undefined;
  }, true);
  sky.addEventListener('pointercancel', () => { gesture = undefined; }, true);
  sky.addEventListener('pointerup', event => {
    const start = gesture;
    gesture = undefined;
    if (start?.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const coords = coordinatesAt(event.clientX, event.clientY);
    if (coords) {
      closeInspector();
      void select(...coords, true);
    }
  }, true);
  byId('observation-close').addEventListener('click', () => {
    setSelecting(false);
    request?.abort();
    resetPreview();
    stop();
    overlay.removeAll();
    panel.hidden = true;
    byId('observation-center').focus();
  });
  byId('observation-retry').addEventListener('click', () => { if (frames.length && !player.hidden) void showFrame(failedFrame ?? Number(slider.value)); else if (selected) void select(...selected); });
  region.addEventListener('click', () => {
    const activate = region.getAttribute('aria-pressed') !== 'true';
    select.close();
    if (!activate) return;
    if (!byId('barnard-panel').hidden) byId('barnard-close').click();
    setSelecting(true);
    panel.hidden = false;
    player.hidden = true;
    position.textContent = '';
    status.textContent = 'Click or tap the sky to select a six-arcminute SPHEREx cutout.';
    byId('observation-retry').hidden = true;
  });
  byId('observation-center').addEventListener('click', () => { void select(...viewer.getRaDec()); });
  byId('observation-center').disabled = false;
  slider.addEventListener('input', () => { stop(); showFrame(Number(slider.value)); });
  play.addEventListener('click', () => {
    if (timer) return stop();
    play.textContent = 'Pause';
    async function advance() {
      const current = timer;
      const shown = await showFrame((Number(slider.value) + 1) % frames.length);
      if (timer !== current) return;
      if (shown) timer = setTimeout(advance, 1000);
      else stop();
    }
    timer = setTimeout(advance, 1000);
  });

  select.close = () => { setSelecting(false); request?.abort(); resetPreview(); stop(); overlay.removeAll(); panel.hidden = true; };
  return select;
}
