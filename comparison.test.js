import test from 'node:test';
import assert from 'node:assert/strict';
import { angularSeparation, comparisonObject, comparisonSummary, createComparison } from './spherex-map/public/comparison.js';
import { references } from './spherex-map/public/sky-data.js';
import { questionsFor } from './spherex-map/public/quiz-data.js';

test('angular separation handles wrap-around, polar positions, and antipodes', () => {
  const angle = (ra, dec, otherRa, otherDec) => angularSeparation({ra, dec}, {ra:otherRa, dec:otherDec});
  assert.ok(Math.abs(angle(359, 0, 1, 0) - 2) < 1e-10);
  assert.equal(angle(0, 90, 200, 90), 0);
  assert.equal(angle(0, 0, 180, 0), 180);
  assert.equal(angle(360, 0, 1, 0), null);
  assert.equal(angularSeparation(null, {ra: 0, dec: 0}), null);
});

test('comparison replaces only the selected slot, preserves selection, and swaps both records', () => {
  const state = createComparison();
  const [a, b, c] = references.map(object => comparisonObject(object));
  assert.equal(state.accept(a), false);
  state.arm('A');
  assert.equal(state.accept(null), false);
  assert.equal(state.pending, 'A');
  assert.equal(state.accept(a), true);
  state.assign('B', b);
  state.arm('A');
  state.cancel();
  assert.equal(state.accept(c), false);
  assert.deepEqual(state.objects, {A: a, B: b});
  state.arm('A');
  state.accept(c);
  state.swap();
  assert.deepEqual(state.objects, {A: b, B: c});
  assert.match(comparisonSummary(state.objects).classification, /Emission nebula \/ Spiral galaxy/);
});

test('each curated object has distinct sourced questions and an unambiguous answer key', () => {
  const seen = new Set();
  for (const object of references) {
    const questions = questionsFor(object.id);
    assert.ok(questions.length >= 3 && questions.length <= 5, object.id);
    for (const item of questions) {
      assert.ok(!seen.has(item.question), item.question);
      seen.add(item.question);
      assert.equal(item.choices.length, new Set(item.choices).size);
      assert.ok(Number.isInteger(item.correct) && item.choices[item.correct]);
      assert.ok(item.feedback.length > 20);
      assert.equal(new URL(item.reference).protocol, 'https:');
    }
  }
  assert.deepEqual(questionsFor('unknown'), []);
});
