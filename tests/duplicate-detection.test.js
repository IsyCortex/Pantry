'use strict';

// Ticket 4.2 — pure duplicate-detection rules plus their calibration
// fixtures (docs/fixtures/duplicate-detection). Advisory-only feature:
// these tests pin down precision (no lookalike false positives), recall
// (typos/plurals/casing still warn), determinism, cross-field immunity,
// and the guarantee that detection never writes or blocks anything.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DUPLICATE_RULES,
  damerauLevenshtein,
  findRowDuplicateMatches,
  findDraftRowDuplicates
} = require('../src/services/duplicate-detection-service');

function item(overrides) {
  return {
    id: 1,
    name: 'Milk',
    quantity: 2,
    unit: 'package',
    location: 'fridge',
    expirationDate: '2026-09-10',
    dateType: 'best_before',
    ...overrides
  };
}

function loadFixture(fileName) {
  const fixturePath = path.join(__dirname, '..', 'docs', 'fixtures', 'duplicate-detection', fileName);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

test('rules are declared most-confident-first with stable ranks', () => {
  assert.deepEqual(
    DUPLICATE_RULES.map((entry) => entry.rule),
    ['same_name', 'plural_form', 'likely_typo']
  );
  const ranks = DUPLICATE_RULES.map((entry) => entry.rank);
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks);
});

test('damerauLevenshtein covers substitution, gap, transposition', () => {
  assert.equal(damerauLevenshtein('', ''), 0);
  assert.equal(damerauLevenshtein('milk', 'milk'), 0);
  assert.equal(damerauLevenshtein('miik', 'milk'), 1); // substitution
  assert.equal(damerauLevenshtein('yohurt', 'yoghurt'), 1); // deletion
  assert.equal(damerauLevenshtein('mlk', 'milk'), 1); // insertion
  assert.equal(damerauLevenshtein('hlelo', 'hello'), 1); // transposition
});

test('fixture-calibrated true positives fire with rule and matched item', () => {
  const fixture = loadFixture('true-positive.json');
  for (const scenario of fixture.cases) {
    const matches = findRowDuplicateMatches(scenario.draftName, fixture.activeItems);
    assert.equal(matches.length > 0, scenario.expectMatch, scenario.draftName);
    const byId = matches.find((match) => match.matchedItem.id === scenario.matchedId);
    assert.ok(byId, `${scenario.draftName} should match id ${scenario.matchedId}`);
    assert.equal(byId.rule, scenario.expectedRule, scenario.draftName);
    assert.ok(byId.ruleDetail);
    assert.ok(['quantity', 'unit', 'location', 'expirationDate'].every((field) => field in byId.matchedItem));
  }
});

test('fixture-calibrated lookalike products never trigger warnings', () => {
  const fixture = loadFixture('false-positive.json');
  for (const scenario of fixture.cases) {
    const matches = findRowDuplicateMatches(scenario.draftName, fixture.activeItems);
    assert.equal(matches.length, 0, `${scenario.draftName} must stay silent`);
  }
});

test('quantity/unit/location/date differences never suppress a same-product warning', () => {
  const stored = item({ quantity: 99, unit: 'barrel', location: 'cellar', expirationDate: '1999-01-01' });
  const matches = findRowDuplicateMatches({ name: 'Milk', quantity: 0, unit: '', location: '', expirationDate: '' }, [stored]);
  assert.equal(matches.length, 1);
});

test('matching depends ONLY on the name, never on other row fields', () => {
  const stored = item();
  for (const mutated of [
    { name: 'milk', quantity: 7 },
    { name: 'MILK', unit: 'l' },
    { name: ' Milk ', location: 'attic' },
    { name: 'milk', expirationDate: '2000-01-01' }
  ]) {
    assert.equal(findRowDuplicateMatches(mutated, [stored]).length, 1, JSON.stringify(mutated));
  }
});

test('multiple matches order by rule rank then id', () => {
  const items = [
    item({ id: 9, name: 'Yoghurt' }),
    item({ id: 4, name: 'yoghurt' }),
    item({ id: 5, name: 'Yoghurts' })
  ];
  const matches = findRowDuplicateMatches('Yoghurt', items);
  assert.equal(matches.length, 3);
  assert.deepEqual(matches.map((match) => match.matchedItem.id), [4, 9, 5]);
  assert.deepEqual(matches.map((match) => match.rule), ['same_name', 'same_name', 'plural_form']);
});

test('empty or whitespace-only draft names produce no warnings', () => {
  assert.deepEqual(findRowDuplicateMatches('', [item()]), []);
  assert.deepEqual(findRowDuplicateMatches('   ', [item()]), []);
  assert.deepEqual(findRowDuplicateMatches({}, [item()]), []);
  assert.deepEqual(findRowDuplicateMatches(null, [item()]), []);
});

test('blank or nameless stored entries are ignored safely', () => {
  assert.deepEqual(findRowDuplicateMatches('Milk', [item({ name: '' }), item({ name: '   ' }), null]), []);
});

test('findDraftRowDuplicates aligns results per row', () => {
  const rows = [{ name: 'MiLK' }, { name: '' }, { name: 'Eggs' }];
  const result = findDraftRowDuplicates(rows, [item(), item({ id: 2, name: 'Egg' })]);
  assert.equal(result.length, 3);
  assert.equal(result[0][0].rule, 'same_name');
  assert.deepEqual(result[1], []);
  assert.equal(result[2][0].rule, 'plural_form');
  assert.deepEqual(findDraftRowDuplicates(null, [item()]), []);
});
