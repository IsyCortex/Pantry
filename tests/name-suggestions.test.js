'use strict';

// Ticket 4.1 — unit tests for the pure suggestion builder. No database, no
// HTTP: aggregation, ranking, dedupe-vs-merge semantics, and limit behavior
// must be deterministic on their own.
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildNameSuggestions, normalizeName } = require('../src/services/name-suggestion-service');

function names(suggestions) {
  return suggestions.map((suggestion) => suggestion.name);
}

test('returns no suggestions for empty, blank, or non-string queries', () => {
  const entries = [{ name: 'Milk', location: 'fridge' }];
  assert.deepEqual(buildNameSuggestions(entries, ''), []);
  assert.deepEqual(buildNameSuggestions(entries, '   '), []);
  assert.deepEqual(buildNameSuggestions(entries, undefined), []);
  assert.deepEqual(buildNameSuggestions(entries, null), []);
});

test('returns no suggestions when there are no stored entries', () => {
  assert.deepEqual(buildNameSuggestions([], 'milk'), []);
  assert.deepEqual(buildNameSuggestions(undefined, 'milk'), []);
});

test('matches case-insensitively against stored names', () => {
  const entries = [{ name: 'Whole Milk', location: 'fridge' }];
  const suggestions = buildNameSuggestions(entries, 'MILK');
  assert.deepEqual(suggestions, [{ name: 'Whole Milk', location: 'fridge' }]);
});

test('names starting with the query rank above names merely containing it', () => {
  const entries = [
    { name: 'Buttermilk', location: 'fridge' },
    { name: 'Buttermilk', location: 'fridge' },
    { name: 'Buttermilk', location: 'fridge' },
    { name: 'Milk', location: 'pantry' }
  ];
  const suggestions = buildNameSuggestions(entries, 'mil');
  assert.equal(suggestions[0].name, 'Milk');
  assert.equal(suggestions[1].name, 'Buttermilk');
});

test('prefills the most commonly used location for that exact name', () => {
  const entries = [
    { name: 'Milk', location: 'fridge' },
    { name: 'Milk', location: 'fridge' },
    { name: 'Milk', location: 'pantry' }
  ];
  const suggestions = buildNameSuggestions(entries, 'milk');
  assert.deepEqual(suggestions, [{ name: 'Milk', location: 'fridge' }]);
});

test('common-location ties resolve deterministically by lexicographic order', () => {
  const entries = [
    { name: 'Juice', location: 'fridge' },
    { name: 'Juice', location: 'pantry' }
  ];
  const suggestions = buildNameSuggestions(entries, 'juice');
  assert.deepEqual(suggestions, [{ name: 'Juice', location: 'fridge' }]);
});

test('similar-but-distinct names are NEVER silently merged into one candidate', () => {
  const entries = [
    { name: 'Milk', location: 'fridge' },
    { name: 'Buttermilk', location: 'fridge' },
    { name: 'Oat Milk', location: 'freezer' }
  ];
  const suggestions = buildNameSuggestions(entries, 'milk');
  assert.deepEqual(names(suggestions).sort(), ['Buttermilk', 'Milk', 'Oat Milk']);
  // Every distinct stored name remains its own selectable suggestion with
  // its own location — selection is required before anything is prefilled.
});

test('same product entered with different casing or spacing collapses to ONE deduplicated candidate', () => {
  const entries = [
    { name: 'Yoghurt', location: 'fridge' },
    { name: 'yoghurt ', location: 'pantry' },
    { name: ' YOGHURT', location: 'fridge' }
  ];
  const suggestions = buildNameSuggestions(entries, 'yoghurt');
  assert.equal(suggestions.length, 1);
  assert.deepEqual(suggestions, [{ name: 'Yoghurt', location: 'fridge' }]);
});

test('entries without a usable location still suggest the name without a location prefill', () => {
  const entries = [
    { name: 'Rice', location: '' },
    { name: 'Rice', location: null }
  ];
  const suggestions = buildNameSuggestions(entries, 'rice');
  assert.deepEqual(suggestions, [{ name: 'Rice', location: '' }]);
});

test('results are limited while preserving rank order', () => {
  const entries = [
    { name: 'Apple juice', location: 'pantry' },
    { name: 'Juice', location: 'fridge' },
    { name: 'Tomato juice', location: 'pantry' },
    { name: 'Cherry juice', location: 'fridge' }
  ];
  const suggestions = buildNameSuggestions(entries, 'juice', { limit: 2 });
  assert.deepEqual(names(suggestions), ['Juice', 'Apple juice']);
});

test('zero or negative limits produce no suggestions', () => {
  const entries = [{ name: 'Milk', location: 'fridge' }];
  assert.deepEqual(buildNameSuggestions(entries, 'milk', { limit: 0 }), []);
  assert.deepEqual(buildNameSuggestions(entries, 'milk', { limit: -1 }), []);
});

test('frequency ties among containing names break by lexicographic name order', () => {
  // Same usage frequency, neither starts with 'an' — pure lexicographic tie.
  const entries = [
    { name: 'Pomegranate', location: 'fridge' },
    { name: 'Banana', location: 'fridge' }
  ];
  const suggestions = buildNameSuggestions(entries, 'an');
  assert.deepEqual(names(suggestions), ['Banana', 'Pomegranate']);
});

test('normalizeName trims and lowercases consistently', () => {
  assert.equal(normalizeName('  Whole Milk '), 'whole milk');
  assert.equal(normalizeName(null), '');
});

test('input entries are never mutated by building suggestions', () => {
  const entries = [{ name: 'Milk', location: 'pantry' }];
  const snapshot = JSON.stringify(entries);
  buildNameSuggestions(entries, 'milk');
  buildNameSuggestions(entries, 'milk', { limit: 1 });
  assert.equal(JSON.stringify(entries), snapshot);
});