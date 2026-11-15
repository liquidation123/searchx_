import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeQuery, marketingAttribution, sessionAttribution } from './analytics.js';
import { serveAnalyticsConfig } from './analytics-config.mjs';

test('search analytics only retain public astronomy identifiers', () => {
  assert.equal(safeQuery('Gaia DR3 12345'), 'Gaia DR3 12345');
  assert.equal(safeQuery('frb20180725a'), 'FRB20180725A');
  assert.equal(safeQuery('M42'), 'M 42');
  assert.equal(safeQuery('Barnard 33'), 'Barnard 33');
  assert.equal(safeQuery('someone@example.com'), null);
  assert.equal(safeQuery('look up my private address'), null);
});

test('attribution retains bounded UTMs and referrer hostname only', () => {
  const url = new URL('https://searchx.earth/observatory?utm_source=newsletter&utm_campaign=launch-1&utm_term=someone%40example.com&secret=hidden');
  assert.deepEqual(marketingAttribution(url, 'https://example.org/path?private=yes'), {
    utm_source: 'newsletter', utm_campaign: 'launch-1', referrer_domain: 'example.org',
  });
  assert.equal(marketingAttribution(url, 'https://searchx.earth/private').referrer_domain, undefined);
});

test('campaign attribution follows a visitor from homepage to Observatory within a session', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const first = { utm_source: 'newsletter', utm_campaign: 'launch' };
  assert.deepEqual(sessionAttribution(first, true, storage), first);
  assert.deepEqual(sessionAttribution({}, false, storage), first);
  assert.deepEqual(sessionAttribution({}, true, storage), {});
});

test('analytics configuration is disabled without a valid project token', () => {
  const previous = process.env.MIXPANEL_TOKEN;
  const previousRegion = process.env.MIXPANEL_REGION;
  delete process.env.MIXPANEL_TOKEN;
  process.env.MIXPANEL_REGION = 'EU';
  let body;
  const response = { writeHead(status, headers) {
    assert.equal(status, 200);
    assert.equal(headers['Cache-Control'], 'no-store');
    return this;
  }, end(value) { body = JSON.parse(value); } };
  try {
    serveAnalyticsConfig({ headers: { 'x-vercel-ip-country': 'CA' } }, response);
    assert.deepEqual(body, { token: null, region: 'EU', country: 'CA' });
  } finally {
    if (previous === undefined) delete process.env.MIXPANEL_TOKEN;
    else process.env.MIXPANEL_TOKEN = previous;
    if (previousRegion === undefined) delete process.env.MIXPANEL_REGION;
    else process.env.MIXPANEL_REGION = previousRegion;
  }
});
