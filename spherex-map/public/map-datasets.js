const surveys = {
  all: ['optical', 'infrared'],
  optical: ['optical'],
  infrared: ['infrared'],
};

export function datasetMode(search, sessionDatasets) {
  // Shared maps keep the dataset choices made by their owner.
  if (sessionDatasets === 'all' || Array.isArray(sessionDatasets) && sessionDatasets.length === 2) return 'all';
  const requested = Array.isArray(sessionDatasets) ? sessionDatasets[0] :
    new URLSearchParams(search).get('dataset');
  return Object.hasOwn(surveys, requested) ? requested : 'all';
}

export function skySurveys(mode) {
  return [...(surveys[mode] ?? surveys.all)];
}

export function selectMapView(mode, view, defaultChannel) {
  const choices = skySurveys(mode);
  const survey = choices.includes(view?.survey) ? view.survey : choices[0];
  return {
    ...view,
    survey,
    channel: survey === 'infrared' ? view?.channel ?? defaultChannel : undefined,
  };
}

export function shareDataset(url, mode) {
  const link = new URL(url);
  if (mode !== 'all' && Object.hasOwn(surveys, mode)) link.searchParams.set('dataset', mode);
  return link.href;
}
