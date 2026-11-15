// The workspace projects the Observatory's existing story stages into navigation.
const main = document.querySelector('main');
const sections = document.getElementById('panel-stages');
const discover = sections.querySelector('[data-stage=discover]');
const observe = sections.querySelector('[data-stage=observe]');
const explore = document.getElementById('panel-open');
const details = document.getElementById('suggested-objects');
const comparison = document.getElementById('workspace-compare');
const learning = document.getElementById('workspace-learn');
const inspector = document.getElementById('inspector');
const lesson = document.getElementById('lesson');
let hasStory;

function sync() {
  const auxiliary = main.dataset.workspaceSection;
  for (const button of sections.querySelectorAll('button')) {
    const active = auxiliary ? button.id === 'workspace-' + auxiliary : button.dataset.stage === main.dataset.stage;
    if (active) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  for (const name of ['compare', 'learn']) {
    document.getElementById('workspace-' + name + '-empty').hidden = auxiliary !== name;
  }
  const selected = !inspector.hidden || !lesson.hidden;
  if (selected === hasStory) return;
  hasStory = selected;
  document.getElementById('discover-intro').hidden = selected;
  details.open = !selected;
}

function showAuxiliary(name) {
  main.dataset.workspaceSection = name;
  sync();
  document.getElementById('workspace-' + name + '-title').focus();
}

comparison.addEventListener('click', () => {
  // A future Compare implementation owns its own controls and comparison state.
  const openComparison = document.getElementById('compare-open');
  if (openComparison && !openComparison.disabled) {
    if (openComparison.getAttribute('aria-expanded') !== 'true') openComparison.click();
    return;
  }
  showAuxiliary('compare');
});
learning.addEventListener('click', () => showAuxiliary('learn'));
for (const button of sections.querySelectorAll('[data-stage]')) {
  button.addEventListener('click', () => {
    delete main.dataset.workspaceSection;
    sync();
  });
}
for (const button of document.querySelectorAll('[data-return-discover]')) {
  button.addEventListener('click', () => { discover.click(); discover.focus(); });
}
document.getElementById('panel-close').addEventListener('click', () => {
  delete main.dataset.workspaceSection;
  sync();
  explore.focus();
});

const story = new MutationObserver(() => {
  delete main.dataset.workspaceSection;
  sync();
});
story.observe(main, { attributes:true, attributeFilter:['data-stage'] });
for (const pane of [inspector, lesson]) story.observe(pane, { attributes:true, attributeFilter:['hidden'] });

const timeLapse = document.getElementById('barnard-panel');
new MutationObserver(() => {
  if (!timeLapse.hidden && main.dataset.stage !== 'observe') observe.click();
}).observe(timeLapse, { attributes:true, attributeFilter:['hidden'] });
sync();
if (location.pathname === '/observatory' && !location.search && !location.hash) explore.click();
