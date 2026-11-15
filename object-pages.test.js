import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicObject, publicObjects, searchPublicObjects, imageForObject, evidenceForObject } from './object-data.mjs';
import { objectPage, objectsIndexPage, sitemapXml, serveObjectPage } from './object-pages.mjs';

test('curated pages have unique canonical metadata, citations and real survey previews', () => {
  assert.deepEqual(publicObjects.map(item => item.slug), ['m42','m31','m1','m101']);
  assert.deepEqual(searchPublicObjects('orion').map(item => item.slug), ['m42']);
  for (const item of publicObjects) {
    const html = objectPage(item);
    assert.match(html, new RegExp(`rel="canonical" href="https://searchx.earth/object/${item.slug}"`));
    assert.match(html, /property="og:image"/);
    assert.match(html, /SIMBAD record/);
    assert.match(html, /NASA source/);
    assert.match(html, /Uncertainty<\/dt><dd>Not supplied for this navigation center/);
    assert.match(html, /do not establish a new SIEVE detection/);
    assert.match(html, /\/observatory\?ra=/);
    const image = imageForObject(item);
    assert.equal(new URL(image.url).hostname.endsWith('science.nasa.gov'), true);
    assert.equal(evidenceForObject(item).length, 4);
  }
  assert.match(objectsIndexPage(), /\/object\/m42/);
  assert.equal((sitemapXml().match(/<loc>/g) ?? []).length, publicObjects.length + 4);
  assert.equal(getPublicObject('unverified'), null);
});

test('object routes return crawlable HTML and 404 unknown slugs', () => {
  function request(pathname) {
    const output = {};
    serveObjectPage({method:'GET'}, {writeHead(status,headers){output.status=status;output.headers=headers;return this;},end(body){output.body=body;return this;}},pathname);
    return output;
  }
  assert.equal(request('/object/m42').status, 200);
  assert.match(request('/robots.txt').body, /Sitemap: https:\/\/searchx.earth\/sitemap.xml/);
  assert.match(request('/sitemap.xml').body, /\/object\/m31/);
  assert.equal(request('/object/nope').status, 404);
});
