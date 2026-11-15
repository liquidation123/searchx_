import { references } from '/sky-data.js';

const byId = id => document.getElementById(id);
byId('public-entry').replaceWith(byId('shared-entry').content.cloneNode(true));
const start = byId('start-object');
for (const item of references.filter(item => !item.description.includes('approximate position'))) {
  start.add(new Option(item.name, item.id));
}
function updatePosition() {
  const item = references.find(reference => reference.id === start.value);
  if (!item) return;
  byId('start-ra').value = item.ra;
  byId('start-dec').value = item.dec;
  byId('start-fov').value = item.fov;
}
start.addEventListener('change', updatePosition);
updatePosition();

for (const radio of document.querySelectorAll('input[name=mode]')) radio.addEventListener('change', () => {
  byId('dataset-choices').hidden = document.querySelector('input[name=mode]:checked').value === 'all';
});

async function clipboard(value, status) {
  try { await navigator.clipboard.writeText(value); status.textContent = 'Copied.'; }
  catch { status.textContent = 'Could not copy. Select the code or link and copy it manually.'; }
}

byId('create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = byId('create-button'), status = byId('create-status');
  const datasets = document.querySelector('input[name=mode]:checked').value === 'all' ? 'all' :
    [...document.querySelectorAll('input[name=dataset]:checked')].map(input => input.value);
  if (Array.isArray(datasets) && !datasets.length) { status.textContent = 'Select at least one dataset.'; return; }
  const survey = datasets === 'all' || datasets.includes('optical') ? 'optical' : 'infrared';
  const view = {ra: Number(byId('start-ra').value), dec: Number(byId('start-dec').value), fov: Number(byId('start-fov').value), survey};
  if (survey === 'infrared') view.channel = 62;
  button.disabled = true; status.textContent = 'Creating your map…';
  byId('created').hidden = true;
  try {
    const response = await fetch('/map-sessions', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({datasets,view})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not create map.');
    const url = new URL(result.path, location.origin).href;
    byId('invite-code').textContent = result.code;
    byId('invite-expiry').textContent = `Available until ${new Date(result.expiresAt).toLocaleDateString()}`;
    byId('invite-link').value = url;
    byId('open-map').href = url;
    button.classList.add('secondary');
    byId('created').hidden = false;
    byId('copy-status').textContent = '';
    byId('open-map').focus();
    byId('copy-code').onclick = () => clipboard(result.code, byId('copy-status'));
    byId('copy-link').onclick = () => clipboard(url, byId('copy-status'));
    status.textContent = 'Map ready. Share the code or link.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

byId('join-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = byId('join-button'), status = byId('join-status');
  const code = byId('join-code').value.trim().toUpperCase();
  const input = byId('join-code');
  input.value = code;
  input.removeAttribute('aria-invalid');
  if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) {
    status.textContent = 'Enter a valid 10-character code.';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  button.disabled = true; status.textContent = 'Looking up map…';
  try {
    const response = await fetch('/map-sessions/' + code);
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 404 || response.status === 410) input.setAttribute('aria-invalid', 'true');
      throw new Error(result.error || 'Map unavailable.');
    }
    location.assign('/observatory?map=' + encodeURIComponent(code));
  } catch (error) { status.textContent = error.message; button.disabled = false; input.focus(); }
});

byId('join-code').addEventListener('input', event => event.currentTarget.removeAttribute('aria-invalid'));
