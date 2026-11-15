const $ = selector => document.querySelector(selector);
const status = $('#game-status');
const round = $('#round');
const image = $('#signal-image');
const loading = $('#image-loading');
const frameCount = $('#frame-count');
const scoreValue = $('#score-value');
const guessOptions = $('#guess-options');
const stakesOptions = $('#stakes-options');
const lockButton = $('#lock-guess');
const reveal = $('#reveal');
const gameComplete = $('#game-complete');

let gameData;
let candidates = [];
let stakes = [];
let roundIndex = 0;
let frameIndex = 0;
let guess = '';
let stake = null;
let score = 0;
let savedAnswers = {};

function currentCandidate() { return candidates[roundIndex]; }
function dateLabel(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}
function sessionKey() { return `searchx.sky-hunt.v1.${gameData.challengeId}`; }
function persistGame() {
  try { localStorage.setItem(sessionKey(), JSON.stringify({ score, answers: savedAnswers })); } catch {}
}
function setFrame(index) {
  const frames = currentCandidate()?.frames ?? [];
  if (!frames.length) {
    loading.querySelector('span:last-child').textContent = 'No sky image is available for this signal.';
    image.hidden = true;
    frameCount.textContent = '0 / 0';
    return;
  }
  frameIndex = (index + frames.length) % frames.length;
  const frame = frames[frameIndex];
  frameCount.textContent = `${frameIndex + 1} / ${frames.length}`;
  $('#frame-instrument').textContent = frame.detector ?? 'SPHEREx';
  $('#frame-date').textContent = dateLabel(frame.observedAt);
  loading.hidden = false;
  loading.querySelector('span:last-child').textContent = 'Loading the sky…';
  image.hidden = true;
  const preload = new Image();
  preload.onload = () => {
    image.src = preload.src;
    image.hidden = false;
    loading.hidden = true;
  };
  preload.onerror = () => {
    loading.hidden = false;
    loading.querySelector('span:last-child').textContent = 'This sky image is unavailable. Try another frame.';
  };
  preload.src = frame.previewUrl;
}
function updateScore() { scoreValue.textContent = score.toLocaleString(); }
function resetGuess() {
  guess = '';
  stake = null;
  for (const button of guessOptions.querySelectorAll('[data-guess]')) button.setAttribute('aria-pressed', 'false');
  for (const button of stakesOptions.querySelectorAll('[data-stake]')) button.setAttribute('aria-pressed', 'false');
  $('#game-note').value = '';
  $('#game-feedback').textContent = '';
  lockButton.disabled = true;
  lockButton.hidden = false;
  reveal.hidden = true;
  $('#review-link').hidden = true;
  $('#reveal-details').open = false;
}
function renderStakes() {
  stakesOptions.replaceChildren();
  for (const option of stakes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stake-option';
    button.dataset.stake = option.id;
    button.setAttribute('aria-pressed', 'false');
    const label = document.createElement('strong');
    label.textContent = option.label;
    const points = document.createElement('small');
    points.textContent = `${option.points} pts`;
    button.append(label, points);
    button.addEventListener('click', () => {
      stake = option;
      for (const item of stakesOptions.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
      updateLockButton();
    });
    stakesOptions.append(button);
  }
}
function updateLockButton() {
  lockButton.disabled = !guess || !stake;
  lockButton.innerHTML = stake
    ? `Lock in your guess <span aria-hidden="true">→</span><small>${stake.points} points at stake</small>`
    : 'Lock in your guess <span aria-hidden="true">→</span>';
}
function renderRound() {
  const item = currentCandidate();
  resetGuess();
  frameIndex = 0;
  $('#round-count').textContent = `SIGNAL ${String(roundIndex + 1).padStart(2, '0')} / ${String(candidates.length).padStart(2, '0')}`;
  $('#candidate-name').textContent = item.name ?? `Signal ${String(roundIndex + 1).padStart(2, '0')}`;
  $('#signal-position').textContent = `RA ${Number(item.ra).toFixed(3)}°  ·  Dec ${Number(item.dec).toFixed(3)}°`;
  setFrame(0);
}
function localResponse(item, vote, confidence, note) {
  const key = 'searchx.game.responses.v1';
  let rows = [];
  try {
    const previous = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(previous)) rows = previous;
  } catch {}
  const row = {
    id: crypto.randomUUID(), candidateId: item.id, vote, note,
    context: { ra: item.ra, dec: item.dec, candidateName: item.name, source: item.source, confidence, frames: (item.frames ?? []).map(frame => ({ id: frame.id, observedAt: frame.observedAt })) },
    createdAt: new Date().toISOString(),
  };
  rows.push(row);
  localStorage.setItem(key, JSON.stringify(rows));
  return { ...row, storage: 'local' };
}
async function saveResponse(item, vote, confidence, note) {
  const context = {
    ra: item.ra, dec: item.dec, candidateName: item.name, source: item.source, confidence,
    frames: (item.frames ?? []).map(frame => ({ id: frame.id, observedAt: frame.observedAt })),
  };
  let response;
  try {
    response = await fetch('/community-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateId: item.id, vote, note, context }) });
  } catch { return localResponse(item, vote, confidence, note); }
  if (response.status === 503 || response.status >= 500) return localResponse(item, vote, confidence, note);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? 'Your review could not be saved.');
  }
  return { ...(await response.json()), storage: 'cloud' };
}
function showReveal(item, result, shouldSave = true) {
  const outcome = item.gameVerdict;
  const correct = result.guess === outcome;
  const earned = correct ? result.stake.points : -result.stake.points;
  if (shouldSave) {
    score += earned;
    savedAnswers[item.id] = result;
    persistGame();
  }
  updateScore();
  for (const button of guessOptions.querySelectorAll('[data-guess]')) button.setAttribute('aria-pressed', String(button.dataset.guess === result.guess));
  for (const button of stakesOptions.querySelectorAll('[data-stake]')) button.setAttribute('aria-pressed', String(button.dataset.stake === result.stake.id));
  $('#result-stamp').textContent = correct ? 'NICE READ' : 'SIEVE SAW IT DIFFERENTLY';
  $('#result-stamp').className = `result-stamp ${correct ? 'is-correct' : 'is-missed'}`;
  $('#points-earned').textContent = `${earned > 0 ? '+' : ''}${earned} pts`;
  $('#reveal-title').textContent = outcome === 'flagged' ? 'SIEVE flagged this signal.' : 'SIEVE let this one pass.';
  $('#reveal-summary').textContent = item.brief ?? (item.summary?.split(/(?<=[.!?])\s+/, 1)[0] ?? 'Review the available observations.');
  $('#reveal-evidence').textContent = item.summary ?? 'No additional evidence was provided.';
  $('#reveal').hidden = false;
  lockButton.hidden = true;
  if (roundIndex + 1 >= candidates.length) $('#next-round').textContent = 'Finish today’s hunt';
  if (!shouldSave) return;
  const vote = result.guess === 'flagged' ? 'anomaly' : 'not_anomaly';
  saveResponse(item, vote, result.stake.id, result.note).then(saved => {
    if (saved.storage === 'cloud') {
      const link = $('#review-link');
      link.href = new URL(`/community-reviews/${saved.id}`, location.origin).href;
      link.hidden = false;
    } else {
      $('#game-feedback').textContent = 'Saved on this device. Cloud sync is not set up yet.';
    }
  }).catch(error => { $('#game-feedback').textContent = error.message; });
}
function lockGuess() {
  if (!guess || !stake) return;
  const item = currentCandidate();
  showReveal(item, { guess, stake, note: $('#game-note').value.trim() });
}
function finishGame() {
  round.hidden = true;
  gameComplete.hidden = false;
  $('#final-score').textContent = `You earned ${score.toLocaleString()} points today.`;
}
function nextRound() {
  const nextIndex = candidates.findIndex((item, index) => index > roundIndex && !savedAnswers[item.id]);
  if (nextIndex >= 0) {
    roundIndex = nextIndex;
    renderRound();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  finishGame();
}
guessOptions.addEventListener('click', event => {
  const button = event.target.closest('[data-guess]');
  if (!button) return;
  guess = button.dataset.guess;
  for (const item of guessOptions.querySelectorAll('[data-guess]')) item.setAttribute('aria-pressed', String(item === button));
  updateLockButton();
});
$('#previous-frame').addEventListener('click', () => setFrame(frameIndex - 1));
$('#next-frame').addEventListener('click', () => setFrame(frameIndex + 1));
lockButton.addEventListener('click', lockGuess);
$('#next-round').addEventListener('click', nextRound);

try {
  const response = await fetch('/game-data', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Could not load today’s sky signals (${response.status}).`);
  gameData = await response.json();
  if (gameData.schemaVersion !== 1 || !Array.isArray(gameData.candidates) || !Array.isArray(gameData.stakes)) throw new Error('Today’s game data has an unsupported format.');
  candidates = gameData.candidates.filter(item => item && typeof item.id === 'string' && Number.isFinite(item.ra) && Number.isFinite(item.dec) && ['flagged', 'clear'].includes(item.gameVerdict));
  stakes = gameData.stakes.filter(item => typeof item.id === 'string' && Number.isFinite(item.points));
  if (!candidates.length || !stakes.length) throw new Error('No playable sky signals are available right now.');
  try {
    const saved = JSON.parse(localStorage.getItem(sessionKey()) || '{}');
    score = Number.isFinite(saved.score) ? saved.score : 0;
    savedAnswers = saved.answers && typeof saved.answers === 'object' ? saved.answers : {};
  } catch {}
  updateScore();
  renderStakes();
  status.hidden = true;
  const firstUnanswered = candidates.findIndex(item => !savedAnswers[item.id]);
  if (firstUnanswered < 0) {
    finishGame();
  } else {
    roundIndex = firstUnanswered;
    round.hidden = false;
    renderRound();
  }
} catch (error) {
  status.textContent = error.message;
  status.classList.add('is-error');
}
