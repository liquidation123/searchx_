const status = document.querySelector('#game-status');
const content = document.querySelector('#game-content');
const count = document.querySelector('#candidate-count');
const challengeCount = document.querySelector('#challenge-count');
const candidateSource = document.querySelector('#candidate-source');
const title = document.querySelector('#candidate-title');
const summary = document.querySelector('#candidate-summary');
const verdict = document.querySelector('#candidate-verdict');
const brief = document.querySelector('#candidate-brief');
const position = document.querySelector('#candidate-position');
const image = document.querySelector('#candidate-image');
const challengeImage = document.querySelector('#challenge-image');
const imagePlaceholder = document.querySelector('#image-placeholder');
const challengePlaceholder = document.querySelector('.challenge-placeholder');
const frameLabel = document.querySelector('#frame-label');
const frameDate = document.querySelector('#frame-date');
const challengeFrameLabel = document.querySelector('#challenge-frame-label');
const challengeFrameDate = document.querySelector('#challenge-frame-date');
const candidateResult = document.querySelector('#candidate-result');
const challengeResult = document.querySelector('#challenge-result');
const assessmentOptions = document.querySelector('#assessment-options');
const confidenceOptions = document.querySelector('#confidence-options');
const challengePanel = document.querySelector('#challenge-panel');
let candidates = [];
let candidateIndex = 0;
let frameIndex = 0;
let selectedAssessment = '';
let selectedConfidence = '';
let answered = false;

const assessmentChoices = [
  { value: 'anomaly', label: 'Anomaly' },
  { value: 'not_anomaly', label: 'Not an anomaly' },
  { value: 'unsure', label: 'Not sure' },
];
const confidenceChoices = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function addChoice(container, group, item, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice-button';
  button.dataset.value = item.value;
  button.textContent = item.label;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => onSelect(item.value, container));
  container.append(button);
}
function selectChoice(value, container) {
  for (const button of container.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.value === value));
  }
}
function candidate() { return candidates[candidateIndex]; }
function formattedDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
function updateFrame() {
  const item = candidate();
  const frame = item.frames?.[frameIndex];
  if (!frame) {
    image.hidden = true;
    challengeImage.hidden = true;
    imagePlaceholder.hidden = false;
    challengePlaceholder.hidden = false;
    imagePlaceholder.lastElementChild.textContent = 'No observation image available';
    return;
  }
  frameLabel.textContent = frame.detector ?? 'SPHEREx observation';
  frameDate.textContent = formattedDate(frame.observedAt);
  challengeFrameLabel.textContent = frame.detector ?? 'SPHEREx observation';
  challengeFrameDate.textContent = formattedDate(frame.observedAt);
  image.hidden = true;
  challengeImage.hidden = true;
  imagePlaceholder.hidden = false;
  challengePlaceholder.hidden = false;
  imagePlaceholder.lastElementChild.textContent = 'Loading sky image…';
  const next = new Image();
  next.onload = () => {
    image.src = next.src;
    challengeImage.src = next.src;
    image.hidden = false;
    challengeImage.hidden = false;
    imagePlaceholder.hidden = true;
    challengePlaceholder.hidden = true;
  };
  next.onerror = () => {
    imagePlaceholder.lastElementChild.textContent = 'Image unavailable';
    challengePlaceholder.textContent = 'Image unavailable';
  };
  next.src = frame.previewUrl;
}
function renderCandidate() {
  const item = candidate();
  count.textContent = `${candidateIndex + 1} of ${candidates.length}`;
  challengeCount.textContent = `${candidateIndex + 1} of ${candidates.length}`;
  candidateSource.textContent = item.source ?? 'Candidate';
  title.textContent = item.name ?? item.id;
  verdict.textContent = item.verdict ?? 'Review suggested';
  summary.textContent = item.summary ?? 'No additional evidence was provided.';
  brief.textContent = item.brief ?? (item.summary?.split(/(?<=[.!?])\s+/, 1)[0] ?? 'Review the available observations.');
  position.textContent = `RA ${Number(item.ra).toFixed(3)}° · Dec ${Number(item.dec).toFixed(3)}°`;
  candidateResult.textContent = '';
  challengeResult.textContent = '';
  answered = false;
  selectedAssessment = '';
  selectedConfidence = '';
  for (const button of [...assessmentOptions.querySelectorAll('button'), ...confidenceOptions.querySelectorAll('button')]) button.setAttribute('aria-pressed', 'false');
  document.querySelector('#game-note').value = '';
  document.querySelector('#confirm-button').hidden = false;
  document.querySelector('#challenge-button').hidden = false;
  document.querySelector('#confirm-button').disabled = false;
  document.querySelector('#challenge-button').disabled = false;
  document.querySelector('#submit-assessment').hidden = false;
  document.querySelector('#submit-assessment').disabled = false;
  document.querySelectorAll('.next-candidate').forEach(button => { button.hidden = true; });
  frameIndex = 0;
  updateFrame();
}
function renderOptions() {
  assessmentOptions.replaceChildren();
  confidenceOptions.replaceChildren();
  for (const item of assessmentChoices) addChoice(assessmentOptions, 'assessment', item, value => {
    selectedAssessment = value;
    selectChoice(value, assessmentOptions);
  });
  for (const item of confidenceChoices) addChoice(confidenceOptions, 'confidence', item, value => {
    selectedConfidence = value;
    selectChoice(value, confidenceOptions);
  });
}
function localResponse(vote) {
  const item = candidate();
  const context = {
    ra: item.ra, dec: item.dec, candidateName: item.name, source: item.source,
    confidence: selectedConfidence || undefined,
    frames: (item.frames ?? []).map(frame => ({ id: frame.id, observedAt: frame.observedAt })),
  };
  const record = {
    id: crypto.randomUUID(), candidateId: item.id, vote,
    note: document.querySelector('#game-note').value.trim(), context,
    createdAt: new Date().toISOString(),
  };
  const key = 'searchx.game.responses.v1';
  let saved = [];
  try {
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(existing)) saved = existing;
  } catch {}
  saved.push(record);
  localStorage.setItem(key, JSON.stringify(saved));
  return { ...record, storage: 'local' };
}
async function saveResponse(vote) {
  const item = candidate();
  const note = document.querySelector('#game-note').value.trim();
  const context = {
    ra: item.ra, dec: item.dec, candidateName: item.name, source: item.source,
    confidence: selectedConfidence || undefined,
    frames: (item.frames ?? []).map(frame => ({ id: frame.id, observedAt: frame.observedAt })),
  };
  let response;
  try {
    response = await fetch('/community-feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: item.id, vote, note, context }),
    });
  } catch {
    return localResponse(vote);
  }
  if (response.status === 503 || response.status >= 500) return localResponse(vote);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? 'Could not save your assessment.');
  }
  return { ...(await response.json()), storage: 'cloud' };
}
function showSaved(result, vote) {
  const voteLabel = { anomaly: 'Anomaly', not_anomaly: 'Not an anomaly', unsure: 'Not sure' }[vote];
  const shareUrl = result.storage === 'cloud'
    ? new URL(`/community-reviews/${result.id}`, location.origin).href
    : '';
  const messages = result.storage === 'cloud'
    ? [`${voteLabel} saved.`, 'Your assessment is saved.']
    : [`${voteLabel} saved on this device.`, 'Saved on this device. Cloud sync is not set up yet.'];
  for (const [node, message] of [[candidateResult, messages[0]], [challengeResult, messages[1]]]) {
    node.replaceChildren(document.createTextNode(message + ' '));
    if (shareUrl) {
      const link = document.createElement('a');
      link.href = shareUrl;
      link.textContent = 'Open review ↗';
      link.className = 'review-share-link';
      node.append(link);
    }
  }
  document.querySelector('#confirm-button').hidden = true;
  document.querySelector('#challenge-button').hidden = true;
  document.querySelector('#submit-assessment').hidden = true;
  if (candidateIndex + 1 < candidates.length) {
    const next = challengePanel.classList.contains('is-active') ? document.querySelector('#next-candidate-challenge') : document.querySelector('#next-candidate-top');
    next.hidden = false;
  } else {
    const done = ' You’ve reviewed all available candidates.';
    candidateResult.append(document.createTextNode(done));
    challengeResult.append(document.createTextNode(done));
  }
}

async function submit(vote) {
  if (answered) return;
  answered = true;
  document.querySelector('#confirm-button').disabled = true;
  document.querySelector('#challenge-button').disabled = true;
  document.querySelector('#submit-assessment').disabled = true;
  try {
    const result = await saveResponse(vote);
    showSaved(result, vote);
  } catch (error) {
    answered = false;
    document.querySelector('#confirm-button').disabled = false;
    document.querySelector('#challenge-button').disabled = false;
    document.querySelector('#submit-assessment').disabled = false;
    const message = error.message;
    if (challengePanel.classList.contains('is-active')) challengeResult.textContent = message;
    else candidateResult.textContent = message;
  }
}
function nextCandidate() {
  if (candidateIndex + 1 >= candidates.length) return;
  candidateIndex += 1;
  challengePanel.classList.remove('is-active');
  renderCandidate();
  document.querySelector('.candidate-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelector('#confirm-button').addEventListener('click', () => submit('anomaly'));
document.querySelector('#challenge-button').addEventListener('click', () => {
  challengePanel.classList.add('is-active');
  challengePanel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  document.querySelector('#challenge-title').focus({ preventScroll: true });
});
document.querySelector('#next-candidate-top').addEventListener('click', nextCandidate);
document.querySelector('#next-candidate-challenge').addEventListener('click', nextCandidate);
document.querySelector('#back-to-candidate').addEventListener('click', () => {
  challengePanel.classList.remove('is-active');
  document.querySelector('.candidate-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.querySelector('#submit-assessment').addEventListener('click', () => {
  if (!selectedAssessment || !selectedConfidence) {
    challengeResult.textContent = 'Choose an assessment and confidence level first.';
    return;
  }
  submit(selectedAssessment);
});
for (const [id, direction] of [['frame-previous', -1], ['frame-next', 1]]) {
  document.querySelector('#' + id).addEventListener('click', () => {
    const frames = candidate().frames ?? [];
    if (!frames.length) return;
    frameIndex = (frameIndex + direction + frames.length) % frames.length;
    updateFrame();
  });
}

renderOptions();
try {
  const response = await fetch('/game-data', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Could not load game data (${response.status}).`);
  const data = await response.json();
  if (data.schemaVersion !== 1 || !Array.isArray(data.candidates)) throw new Error('Game data has an unsupported format.');
  candidates = data.candidates.filter(item => item && typeof item.id === 'string' && Number.isFinite(item.ra) && Number.isFinite(item.dec));
  if (!candidates.length) throw new Error('There are no candidates to review today.');
  renderCandidate();
  status.hidden = true;
  content.hidden = false;
} catch (error) {
  status.textContent = error.message;
  status.classList.add('is-error');
}
