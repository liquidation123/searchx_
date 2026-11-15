// SearchX event taxonomy. No autocapture, replay, raw URLs, coordinates, or free-text queries.
const events = new Set([
  'Page Viewed', 'Session Started', 'Page Engagement', 'Search Started', 'Search Submitted',
  'Search Results Shown', 'Search No Results', 'Result Selected', 'Object Explored',
  'Feature Used', 'Observation Viewed', 'Learning Question Answered',
]);
const sessionKey = 'searchx_analytics_session_v1';
const visitorKey = 'searchx_analytics_first_seen_v1';
const attributionKey = 'searchx_analytics_attribution_v1';
const idleMs = 30 * 60 * 1000;
let sdk;
let ready = false;
let country;
let session;
let attribution = {};
let activeSeconds = 0;
let lastTick = Date.now();
let lastInteraction = Date.now();
let searchId;
let searchSelected = false;
let searchStarted = false;
let page = typeof location !== 'undefined' && location.pathname === '/observatory' ? 'observatory' : 'home';
const pending = [];

export function safeQuery(query, canonical = '') {
  const value = (canonical || query || '').trim().replace(/\s+/g, ' ');
  if (['Barnard 33', 'eps Ind B', 'WISE J085510.83-071442.5', 'RW Aur', 'R Dra'].includes(value)) return value;
  if (/^FRB\d{8}[A-Z]$/i.test(value)) return value.toUpperCase();
  if (/^Gaia (?:DR3 )?\d{1,19}$/i.test(value)) return value.replace(/^Gaia (?:DR3 )?/i, 'Gaia DR3 ');
  if (/^(?:M|NGC|IC)\s?\d{1,6}$/i.test(value)) return value.toUpperCase().replace(/^([A-Z]+)\s?/, '$1 ');
  return null;
}

export function marketingAttribution(url, referrer = '', origin = url.origin) {
  const values = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = url.searchParams.get(key)?.trim();
    if (value && value.length <= 80 && /^[\p{L}\p{N} ._-]+$/u.test(value)) values[key] = value;
  }
  try {
    const source = new URL(referrer);
    if (source.origin !== origin && /^https?:$/.test(source.protocol)) values.referrer_domain = source.hostname.toLowerCase();
  } catch { /* Direct visit. */ }
  return values;
}

export function sessionAttribution(fresh, isNewSession, storage = sessionStorage) {
  try {
    const previous = JSON.parse(storage.getItem(attributionKey));
    const saved = {};
    if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
        const value = previous[key];
        if (typeof value === 'string' && value.length <= 80 && /^[\p{L}\p{N} ._-]+$/u.test(value)) saved[key] = value;
      }
      if (typeof previous.referrer_domain === 'string' && previous.referrer_domain.length <= 253 &&
          /^[a-z0-9.-]+$/.test(previous.referrer_domain)) saved.referrer_domain = previous.referrer_domain;
    }
    const hasNewCampaign = Object.keys(fresh).some(key => key.startsWith('utm_'));
    if (isNewSession || hasNewCampaign || !Object.keys(saved).length) {
      if (Object.keys(fresh).length) storage.setItem(attributionKey, JSON.stringify(fresh));
      else storage.removeItem(attributionKey);
      return fresh;
    }
    return saved;
  } catch { return fresh; }
}

function readSession(now) {
  let previous;
  try { previous = JSON.parse(sessionStorage.getItem(sessionKey)); } catch { /* Storage denied. */ }
  if (previous?.id && now - previous.last < idleMs && now >= previous.last) {
    previous.last = now;
    try { sessionStorage.setItem(sessionKey, JSON.stringify(previous)); } catch { /* Storage denied. */ }
    return { ...previous, started: false };
  }
  const next = { id: crypto.randomUUID(), last: now };
  try { sessionStorage.setItem(sessionKey, JSON.stringify(next)); } catch { /* Storage denied. */ }
  return { ...next, started: true };
}

function visitorStatus(now) {
  try {
    const first = Number(localStorage.getItem(visitorKey));
    if (first > 0 && first <= now) return now - first < 24 * 60 * 60 * 1000 ? 'new' : 'returning';
    localStorage.setItem(visitorKey, String(now));
  } catch { return 'unknown'; }
  return 'new';
}

export function track(event, properties = {}) {
  if (!events.has(event)) return;
  const payload = { page, session_id: session?.id, country, ...attribution, ...properties };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
  if (ready) { try { sdk.track(event, payload); } catch { /* Analytics cannot interrupt exploration. */ } }
  else if (pending.length < 30) pending.push([event, payload]);
}

export function searchStartedEvent() {
  if (searchStarted) return;
  searchStarted = true;
  track('Search Started');
}

export function searchSubmitted(query, kind = 'name') {
  if (!query.trim()) return;
  searchStartedEvent();
  const previousSelected = searchSelected;
  searchId = crypto.randomUUID();
  searchSelected = false;
  track('Search Submitted', { search_id: searchId, search_kind: kind,
    query: safeQuery(query) ?? undefined, follow_up: previousSelected });
}

export function resultsShown(count, source) {
  if (searchId) track('Search Results Shown', { search_id: searchId, result_count: count, result_source: source });
}

export function noResults(reason) {
  if (searchId) track('Search No Results', { search_id: searchId, reason });
  searchStarted = false;
}

export function resultSelected(reference, source = 'search') {
  if (source === 'search' && !searchId) searchSubmitted(reference.name || reference.id, 'suggestion');
  if (source !== 'search') searchId = undefined;
  searchSelected = true;
  searchStarted = false;
  track('Result Selected', { search_id: source === 'search' ? searchId : undefined, result_source: source,
    object_id: safeQuery(reference.id), object_type: reference.category || 'catalog source' });
}

export function objectExplored(reference) {
  track('Object Explored', { search_id: searchSelected ? searchId : undefined, object_id: safeQuery(reference.id),
    object_type: reference.category || 'catalog source', catalog: reference.source });
}

export function featureUsed(feature, detail) {
  track('Feature Used', { feature, detail });
}

function reportEngagement() {
  const seconds = Math.floor(activeSeconds);
  if (!seconds) return;
  activeSeconds -= seconds;
  track('Page Engagement', { active_seconds: seconds });
}

function tick() {
  const now = Date.now();
  const elapsed = Math.min(15, Math.max(0, (now - lastTick) / 1000));
  if (!document.hidden && now - lastInteraction < 60_000) activeSeconds += elapsed;
  lastTick = now;
  if (activeSeconds >= 60) reportEngagement();
}

async function initialize() {
  if (navigator.globalPrivacyControl || ['1', 'yes'].includes(navigator.doNotTrack) ||
      ['1', 'yes'].includes(window.doNotTrack)) return;
  try {
    const response = await fetch('/analytics-config', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    if (!config.token) return;
    // The official browser module is loaded only when analytics is configured.
    const { default: mixpanel } = await import('https://cdn.mxpnl.com/libs/mixpanel-js/dist/mixpanel.module.js');
    sdk = mixpanel;
    sdk.init(config.token, {
      autocapture: false, track_pageview: false, record_sessions_percent: 0,
      ip: false, save_referrer: false, skip_first_touch_marketing: true,
      stop_utm_persistence: true, persistence: 'localStorage',
      property_blacklist: ['$current_url', '$referrer', '$initial_referrer', '$initial_referring_domain'],
    });
    country = config.country || undefined;
    const now = Date.now();
    session = readSession(now);
    attribution = sessionAttribution(marketingAttribution(new URL(location.href), document.referrer), session.started);
    const visitor = visitorStatus(now);
    ready = true;
    if (session.started) track('Session Started', { visitor_type: visitor });
    track('Page Viewed', { visitor_type: visitor });
    for (const [event, properties] of pending.splice(0)) sdk.track(event, { ...properties, session_id: session.id, country, ...attribution });
  } catch { /* Analytics must never affect the application. */ }
}

if (typeof window !== 'undefined') {
  if (page === 'home') document.querySelector('a[href="/observatory"]')?.addEventListener('click', () => featureUsed('open observatory'));
  if (page === 'observatory') {
    const controls = {
      'map-zoom-in': 'map zoom in', 'map-zoom-out': 'map zoom out', home: 'recenter map',
      'observation-play': 'observation playback', 'observation-difference': 'observation difference',
      'observation-retry': 'observation retry', 'barnard-play': 'time lapse playback',
      'barnard-shortcut': 'Barnard time lapse', 'copy-position': 'copy sky position',
    };
    document.addEventListener('click', event => {
      const id = event.target.closest('button')?.id;
      if (controls[id]) featureUsed(controls[id]);
      if (event.target.closest('#layers > summary')) featureUsed('layers menu');
    });
    document.addEventListener('change', event => {
      if (event.target.id === 'observation-frame') featureUsed('observation frame scrub');
      if (event.target.id === 'barnard-frame') featureUsed('time lapse frame scrub');
    });
  }
  const activity = () => {
    lastInteraction = Date.now();
    if (session && lastInteraction - session.last >= idleMs) {
      tick(); reportEngagement();
      session = readSession(lastInteraction);
      attribution = sessionAttribution({}, true);
      track('Session Started', { visitor_type: visitorStatus(lastInteraction) });
    }
    if (session && lastInteraction - session.last > 60_000) {
      session.last = lastInteraction;
      try { sessionStorage.setItem(sessionKey, JSON.stringify({ id: session.id, last: session.last })); } catch { /* Storage denied. */ }
    }
  };
  for (const name of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(name, activity, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { tick(); if (document.hidden) reportEngagement(); });
  window.addEventListener('pagehide', () => { tick(); reportEngagement(); });
  setInterval(tick, 15_000);
  void initialize();
}
