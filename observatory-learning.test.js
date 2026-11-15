import test from 'node:test';
import assert from 'node:assert/strict';
import { references } from './spherex-map/public/sky-data.js';
import { angularSeparation, comparisonSummary, createComparison } from './spherex-map/public/comparison.js';
import { catalogIdentifier, search, selectSkyTarget } from './spherex-map/public/search.js';
import { questionsFor } from './spherex-map/public/quiz-data.js';
import { sesameCandidates } from './name-resolve.mjs';

test('selection moves the map, sets recenter, and opens the same object in the inspector', () => {
  const object = search('Messier 42').exact;
  const calls = [];
  const actions = {
    point: (...args) => calls.push(['goto', ...args]),
    remember: (...args) => calls.push(['recenter', ...args]),
    inspect: value => calls.push(['inspect', value]),
  };
  assert.equal(selectSkyTarget(object, actions), true);
  assert.deepEqual(calls, [
    ['goto', object.ra, object.dec, object.fov],
    ['recenter', object.ra, object.dec, object.id, object.fov],
    ['inspect', object],
  ]);
  assert.equal(selectSkyTarget({ ra: 360, dec: 0 }, actions), false);
  assert.equal(calls.length, 3);
  assert.deepEqual(catalogIdentifier('Find Gaia DR3 6316705404065320832'), { catalog: 'gaia', id: '6316705404065320832' });
  assert.deepEqual(catalogIdentifier('show me FRB 20180725A'), { catalog: 'chime', id: 'FRB20180725A' });
});

test('comparison only consumes an armed selection and preserves the other slot on replacement', () => {
  const state = createComparison();
  const [horsehead, orion, andromeda] = references;
  assert.equal(state.accept(horsehead), false);
  state.arm('A');
  assert.equal(state.accept(null), false);
  assert.equal(state.pending, 'A');
  assert.equal(state.accept(horsehead), true);
  state.assign('B', orion);
  assert.equal(state.accept(andromeda), false);
  state.arm('A');
  state.cancel();
  assert.equal(state.accept(andromeda), false);
  state.swap();
  state.arm('B');
  state.accept(andromeda);
  assert.deepEqual(state.objects, { A: orion, B: andromeda });
});

test('separation is spherical and comparison only pairs like catalog properties', () => {
  assert.ok(Math.abs(angularSeparation({ra:359, dec:0}, {ra:1, dec:0}) - 2) < 1e-10);
  assert.equal(angularSeparation({ra:0, dec:0}, {ra:180, dec:0}), 180);
  assert.equal(angularSeparation({ra:1, dec:1}, {ra:1, dec:1}), 0);
  assert.equal(angularSeparation({ra:1, dec:91}, {ra:1, dec:1}), null);
  const A = { ra: 0, dec: 0, classification: 'Star', properties: [['Gaia G magnitude', '12.0'], ['Redshift', '0.2']] };
  const B = { ra: 1, dec: 1, classification: 'Star', properties: [['Gaia G magnitude', '13.0']] };
  assert.deepEqual(comparisonSummary({ A, B }).sharedProperties, ['Gaia G magnitude: 12.0 vs. 13.0']);
});

test('each curated object has unique reviewed questions, answers, explanations and references', () => {
  const prompts = new Set();
  for (const { id } of references) {
    const questions = questionsFor(id);
    assert.ok(questions.length >= 3 && questions.length <= 5, id);
    for (const { question, choices, correct, feedback, reference } of questions) {
      assert.ok(question.endsWith('?') && !prompts.has(question), question);
      prompts.add(question);
      assert.equal(new Set(choices).size, 3);
      assert.ok(Number.isInteger(correct) && choices[correct]);
      assert.ok(feedback.length > 25);
      assert.match(reference, /^https:\/\//);
    }
  }
  assert.equal(questionsFor('M 42')[0].choices[questionsFor('M 42')[0].correct], 'New stars are forming in its gas and dust');
  assert.equal(questionsFor('M 1')[1].choices[questionsFor('M 1')[1].correct], 'A rapidly spinning neutron star');
  assert.deepEqual(questionsFor('Unreviewed object'), []);
});

test('Sesame keeps distinct catalog candidates and rejects blank coordinates', () => {
  const result = (id, ra, dec) => `<Resolver><oname>${id}</oname><jradeg>${ra}</jradeg><jdedeg>${dec}</jdedeg></Resolver>`;
  const xml = result('A', 359.9999, 0) + result('A rounded', 0, 0) +
    result('B', 14, 7) + result('Blank', ' ', 0);
  assert.deepEqual(sesameCandidates(xml).map(value => value.id), ['A', 'B']);
});
