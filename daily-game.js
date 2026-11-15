const status = document.querySelector('#game-status');
const content = document.querySelector('#game-content');
const count = document.querySelector('#candidate-count');
const challengeCount = document.querySelector('#challenge-count');
const candidateSource = document.querySelector('#candidate-source');
const title = document.querySelector('#candidate-title');
const summary = document.querySelector('#candidate-summary');
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
  summary.textContent = item.summary ?? 'Review this candidate and share what you notice.';
  position.textContent = `RA ${Number(item.ra).toFixed(3)}° · Dec ${Number(item.dec).toFixed(3)}°`;
  candidateResult.textContent = '';
  challengeResult.textContent = '';
  answered = false;
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
function saveResponse(vote) {
  const item = candidate();
  const note = document.querySelector('#game-note').value.trim();
  const context = {
    ra: item.ra,
    dec: item.dec,
    candidateName: item.name,
    source: item.source,
    confidence: selectedConfidence || undefined,
    frames: (item.frames ?? []).map(frame => ({ id: frame.id, observedAt: frame.observedAt })),
  };
  return fetch('/community-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId: item.id, vote, note, context }),
  });
}
async function submit(vote) {
  if (answered) return;
  answered = true;
  document.querySelector('#confirm-button').disabled = true;
  document.querySelector('#challenge-button').disabled = true;
  try {
    const response = await saveResponse(vote);
    if (!response.ok) throw new Error((await response.json()).error ?? 'Could not save your assessment.');
    const result = await response.json();
    candidateResult.textContent = `Assessment saved. Share it with this link: ${new URL(`/community-reviews/${result.id}`, location.origin).href}`;
    challengeResult.textContent = 'Assessment saved. Thank you for taking part.';
  } catch (error) {
    answered = false;
    document.querySelector('#confirm-button').disabled = false;
    document.querySelector('#challenge-button').disabled = false;
    const message = error.message.includes('storage is not configured')
      ? 'Response storage is not configured yet. Your assessment could not be saved.'
      : error.message;
    if (challengePanel.classList.contains('is-active')) challengeResult.textContent = message;
    else candidateResult.textContent = message;
  }
}

document.querySelector('#confirm-button').addEventListener('click', () => submit('anomaly'));
document.querySelector('#challenge-button').addEventListener('click', () => {
  challengePanel.classList.add('is-active');
  challengePanel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  document.querySelector('#challenge-title').focus({ preventScroll: true });
});
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
