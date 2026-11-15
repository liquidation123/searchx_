import { buildComparisonReport, loadComparisonObservations } from './comparison-evidence.js';

const byId = id => document.getElementById(id);
const heading = mode => mode === 'research' ? 'Research detail' : 'Accessible summary';

export function reportSections(report, mode) {
  const research = mode === 'research';
  const angle = report.separation ? (research
    ? 'The great-circle separation between the reported positions is approximately ' + report.separation + '.'
    : 'The two positions are about ' + report.separation + ' apart on the sky.') : 'The angular separation is unavailable.';
  return {
    heading: heading(mode),
    summary: report.objects.map(object => ({
      text: object.name + '. ' + (object.description || 'A description is unavailable.'),
      url: object.descriptionSource,
    })),
    findings: [report.classification, angle, report.infrared],
    rows: [
      ['Catalog identifier', ...report.objects.map(object => object.id)],
      ['Classification', ...report.objects.map(object => object.classification || 'Unavailable')],
      ['Right ascension', ...report.objects.map(object => (research ? object.ra : Number(object.ra.toFixed(3))) + '°')],
      ['Declination', ...report.objects.map(object => (research ? object.dec : Number(object.dec.toFixed(3))) + '°')],
      ...(research ? [
        ['Position provenance', ...report.objects.map(object => object.positionKind)],
        ['Reference frame', ...report.objects.map(object => object.frame)],
        ['Position epoch', ...report.objects.map(object => object.positionEpoch || 'Unspecified in record')],
        ['Localization uncertainty (RA, Dec)', ...report.objects.map(({radio}) =>
          Number.isFinite(radio?.raError) && Number.isFinite(radio?.decError)
            ? '±' + radio.raError + '°, ±' + radio.decError + '°' : 'Unavailable')],
      ] : []),
      ...(report.objects.some(object => object.radio) ? [
        ['CHIME exclusion flag', ...report.objects.map(({radio}) => radio ? (radio.excluded ? 'Flagged as excluded' : 'No exclusion flag set') : 'Unavailable')],
        ['Radio dispersion measure', ...report.objects.map(({radio}) =>
          Number.isFinite(radio?.dm) ? radio.dm + ' pc cm⁻³ (CHIME catalog)' : 'Unavailable')],
      ] : []),
      ['Catalog or evidence source', ...report.objects.map(object => object.source)],
    ],
  };
}

const escapeMd = value => String(value).replace(/\r?\n/g, ' ').replace(/[\\`*_{}\[\]<>|]/g, '\\$&');
const mdLink = (label, url) => url ? '[' + escapeMd(label) + '](<' + url + '>)' : escapeMd(label);

export function reportMarkdown(report, mode) {
  const { heading, rows, summary, findings } = reportSections(report, mode);
  return [
    '# ' + escapeMd(report.title), '', report.date + ' · ' + heading, '',
    '## Executive summary', '', ...summary.map(item => '- ' + mdLink(item.text, item.url)), '',
    '## Object properties', '', '| Property | Object A · ' + escapeMd(report.objects[0].name) + ' | Object B · ' + escapeMd(report.objects[1].name) + ' |',
    '| --- | --- | --- |', ...rows.map(row => '| ' + row.map(escapeMd).join(' | ') + ' |'), '',
    '## Scientific comparison', '', ...findings.map(item => '- ' + escapeMd(item)),
    ...(report.context ? ['- ' + mdLink(report.context.text, report.context.url)] : []), '',
    '## Observations and images', '',
    ...report.objects.flatMap(object => [
      '### ' + escapeMd(object.name), '', object.coverage, '',
      ...(object.image ? [mdLink(object.image.caption, new URL(object.image.url, report.comparisonUrl).href), ''] : []),
      ...exposureEntries(object, mode).map(frame => '- ' + mdLink(frame.label, frame.url)),
      ...(object.candidateEvidence ? ['', escapeMd(object.candidateEvidence)] : []), '',
    ]),
    '## Evidence and limitations', '', ...report.limitations.map(item => '- ' + item), '',
    '## Sources', '', ...report.sources.map(item => '- ' + mdLink(item.label, item.url)), '',
    mdLink('Open this comparison in SearchX', report.comparisonUrl), '',
  ].join('\n');
}

function exposureEntries(object, mode) {
  const frames = mode === 'research' ? object.exposures : object.exposures.slice(0, 1);
  return frames.map(frame => ({
    label: (mode === 'research' ? frame.id + ' · ' : '') + frame.date + ' · ' + frame.detector +
      ' · nominal ' + frame.band + ' µm · ' + frame.release + ' · ' + frame.version,
    url: frame.url,
  }));
}

function element(tag, value) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  return node;
}

function sourceLink(label, url) {
  if (!url) return document.createTextNode(label);
  const a = element('a', label);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function list(items, ordered = false) {
  const container = element(ordered ? 'ol' : 'ul');
  for (const item of items) {
    const li = element('li');
    li.append(item);
    container.append(li);
  }
  return container;
}

function renderReport(report, mode) {
  const root = byId('report-content');
  const print = byId('report-print');
  const imageLoads = [];
  const { heading, rows, summary, findings } = reportSections(report, mode);
  root.replaceChildren(element('h1', report.title), element('p', report.date + ' · ' + heading),
    element('h2', 'Executive summary'), list(summary.map(item => sourceLink(item.text, item.url))));
  const table = element('table');
  const header = table.createTHead().insertRow();
  for (const label of ['Property', ...report.objects.map(object => 'Object ' + object.slot + ' · ' + object.name)]) {
    const cell = element('th', label);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = table.createTBody();
  for (const [label, ...values] of rows) {
    const row = body.insertRow();
    const th = element('th', label);
    th.scope = 'row';
    row.append(th, ...values.map(value => element('td', value)));
  }
  root.append(element('h2', 'Object properties'), table,
    element('h2', 'Scientific comparison'),
    list([...findings, ...(report.context ? [sourceLink(report.context.text, report.context.url)] : [])]),
    element('h2', 'Observations and images'));
  for (const object of report.objects) {
    root.append(element('h3', 'Object ' + object.slot + ' · ' + object.name), element('p', object.coverage));
    if (object.image) {
      const figure = element('figure');
      const image = element('img');
      image.alt = object.name + ' survey field';
      imageLoads.push(new Promise(resolve => {
        const fail = () => {
          clearTimeout(timeout);
          image.removeAttribute('src');
          image.replaceWith(element('p', 'The survey image could not be loaded.'));
          resolve();
        };
        const timeout = setTimeout(fail, 10000);
        image.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, {once: true});
        image.addEventListener('error', fail, {once: true});
        image.src = object.image.url;
      }));
      const caption = element('figcaption');
      caption.append(sourceLink(object.image.caption, object.image.source));
      figure.append(image, caption);
      root.append(figure);
    }
    if (object.exposures.length) root.append(list(exposureEntries(object, mode).map(frame => sourceLink(frame.label, frame.url))));
    if (mode !== 'research' && object.exposures.length > 1) {
      root.append(element('p', 'Research detail lists all exposures in the returned sample.'));
    }
    if (object.candidateEvidence) root.append(element('p', 'SIEVE interpretation · ' + object.candidateEvidence));
  }
  root.append(element('h2', 'Evidence and limitations'), list(report.limitations),
    element('h2', 'Sources'), list(report.sources.map(source => sourceLink(source.label, source.url)), true),
    sourceLink('Open this comparison in SearchX', report.comparisonUrl));
  const title = root.firstChild;
  print.disabled = imageLoads.length > 0;
  void Promise.all(imageLoads).then(() => { if (root.firstChild === title) print.disabled = false; });
}

export function setupComparisonReport({getPair, getComparisonUrl, load = loadComparisonObservations}) {
  const preview = byId('comparison-report');
  const status = byId('compare-report-status');
  const summary = byId('comparison-summary');
  const mode = byId('report-mode');
  const summaryAction = byId('compare-summary-action');
  const reportAction = byId('compare-report-action');
  let snapshot;
  let pending;
  let generation = 0;

  function changed() {
    ++generation;
    pending = null;
    snapshot = null;
    summary.hidden = true;
    summary.replaceChildren();
    status.textContent = '';
    if (preview.open) preview.close();
    const {A, B} = getPair();
    summaryAction.disabled = reportAction.disabled = !A || !B;
  }

  async function generate(openReport) {
    const pair = getPair();
    if (!pair.A || !pair.B) return;
    const requested = generation;
    status.textContent = 'Checking the archive for both objects…';
    pending ??= Promise.all([load(pair.A), load(pair.B)]).then(([A, B]) =>
      buildComparisonReport(pair, {A, B}, getComparisonUrl(pair)));
    let report;
    try {
      report = await pending;
    } catch {
      if (requested === generation) {
        status.textContent = 'The report could not be prepared. Try again.';
        pending = null;
      }
      return;
    }
    if (requested !== generation) return;
    snapshot = report;
    // Reuse an in-flight request, but permit retries after partial coverage or failure.
    pending = report.objects.some(object => object.retryable)
      ? null : Promise.resolve(report);
    status.textContent = '';
    if (openReport) {
      renderReport(snapshot, mode.value);
      if (!preview.open) preview.showModal();
      byId('report-close').focus();
    } else {
      const accessible = reportSections(report, 'accessible');
      summary.replaceChildren(element('h3', 'Comparison summary'),
        list(accessible.summary.map(item => sourceLink(item.text, item.url))),
        list([...accessible.findings, ...(report.context ? [sourceLink(report.context.text, report.context.url)] : [])]),
        ...report.objects.map(object => element('p', object.name + ' · ' + object.coverage)),
        ...report.objects.filter(object => object.radio?.excluded).map(object => element('p', object.name + ' carries a CHIME exclusion flag.')),
        ...report.objects.filter(object => object.candidateEvidence).map(object =>
          element('p', 'SIEVE interpretation · ' + object.candidateEvidence)),
        element('p', report.limitations[0]),
        list(report.sources.map(source => sourceLink(source.label, source.url))));
      summary.hidden = false;
      summary.focus();
    }
  }

  byId('report-close').onclick = () => preview.close();
  mode.onchange = () => { if (snapshot) renderReport(snapshot, mode.value); };
  byId('report-print').onclick = () => window.print();
  byId('report-markdown').onclick = () => {
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([reportMarkdown(snapshot, mode.value)], {type: 'text/markdown;charset=utf-8'}));
    const a = element('a');
    a.href = url;
    a.download = 'searchx-comparison-' + snapshot.date + '.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  summaryAction.onclick = () => void generate(false);
  reportAction.onclick = () => void generate(true);
  changed();
  return {changed};
}
