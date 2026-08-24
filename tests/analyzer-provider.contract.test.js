'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAnalyzerProvider,
  ANALYZER_PROVIDER_KIND
} = require('../src/analyzers/provider');
const {
  createFakeAnalyzerProvider
} = require('../src/analyzers/fake-provider');
const {
  validateAnalyzerProposal,
  validateAnalyzerInput
} = require('../src/validation/analyzer-contract');

const CONTEXT = {
  referenceDate: '2026-08-16',
  timezone: 'Europe/Berlin',
  locale: 'en-DE'
};

test('provider factory defaults to the deterministic fake provider', () => {
  const provider = createAnalyzerProvider();
  assert.ok(provider);
  assert.equal(typeof provider.analyze, 'function');
  assert.equal(provider.name, 'fake');
});

test('provider factory constructs the fake provider by kind', () => {
  const provider = createAnalyzerProvider({ kind: ANALYZER_PROVIDER_KIND.FAKE });
  assert.equal(provider.name, 'fake');
  assert.equal(typeof provider.analyze, 'function');
});

test('provider factory rejects unsupported kinds', () => {
  assert.throws(() => createAnalyzerProvider({ kind: 'unknown' }), /Unsupported ANALYZER_PROVIDER kind/);
});

test('fake provider produces deterministic multi-item proposals for grouped locations', async () => {
  const provider = createFakeAnalyzerProvider();

  const first = await provider.analyze({
    rawText: 'Fridge: two cartons of milk best before 20 August. Pantry: one bag of rice.',
    ...CONTEXT
  });
  const second = await provider.analyze({
    rawText: 'Fridge: two cartons of milk best before 20 August. Pantry: one bag of rice.',
    ...CONTEXT
  });

  assert.deepEqual(second, first);
  assert.equal(first.items.length, 2);
  assert.deepEqual(
    first.items.map((item) => item.name),
    ['milk', 'rice']
  );
  // Explicit values are extracted; missing values remain null (non-invention).
  assert.equal(first.items[0].location, 'fridge');
  assert.equal(first.items[0].expirationDate, '2026-08-20');
  assert.equal(first.items[1].location, 'pantry');
  assert.equal(first.items[1].expirationDate, null);
});

test('fake provider covers missing values', async () => {
  const provider = createFakeAnalyzerProvider();
  const result = await provider.analyze({
    rawText: 'one bag of rice',
    ...CONTEXT
  });

  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.name, 'rice');
  assert.equal(item.quantity, 1);
  assert.equal(item.unit, 'package');
  assert.equal(item.expirationDate, null);
  assert.equal(item.dateType, null);
});

test('fake provider covers ambiguous input by keeping values null', async () => {
  const provider = createFakeAnalyzerProvider();
  const result = await provider.analyze({
    rawText: 'three things. Two cartons of milk and maybe some rice, a bit of frozen peas.',
    ...CONTEXT
  });

  assert.equal(result.items.length, 3);
  // Ambiguous quantities and locations stay null rather than being invented.
  assert.equal(result.items[1].name, 'rice');
  assert.equal(result.items[1].quantity, null);
  assert.equal(result.items[2].name, 'frozen peas');
  assert.equal(result.items[2].location, null);
  assert.equal(result.items[2].quantity, null);
});

test('fake provider emits a proposal shaped like the analyzer contract', async () => {
  const provider = createFakeAnalyzerProvider();
  const result = await provider.analyze({
    rawText: 'two cartons of milk',
    ...CONTEXT
  });

  assert.deepEqual(Object.keys(result).sort(), ['items']);
  assert.ok(Array.isArray(result.items));

  assert.equal(validateAnalyzerProposal(result).ok, true);
});

test('fake provider rejects missing or non-string rawText', async () => {
  const provider = createFakeAnalyzerProvider();
  await assert.rejects(() => provider.analyze({}), /ANALYZER_INVALID_INPUT/);
  await assert.rejects(() => provider.analyze({ rawText: 42 }), /ANALYZER_INVALID_INPUT/);
});

test('fake provider handles arbitrary text without inventing items', async () => {
  const provider = createFakeAnalyzerProvider();
  const result = await provider.analyze({ rawText: 'unknown input text', ...CONTEXT });
  assert.deepEqual(result, { items: [] });
});

test('shared validator rejects malformed provider output', () => {
  const invalid = validateAnalyzerProposal({ items: [{ name: '', quantity: null, unit: 'package', location: 'cellar', expirationDate: '2026-02-30', dateType: null }] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.length >= 3);
});

test('shared validator enforces required analyzer context and raw-text limit', () => {
  assert.equal(validateAnalyzerInput({ rawText: 'x', ...CONTEXT }).ok, true);
  assert.equal(validateAnalyzerInput({ rawText: 'x'.repeat(4001), ...CONTEXT }).ok, false);
  assert.equal(validateAnalyzerInput({ rawText: 'x', ...CONTEXT, locale: undefined }).ok, false);
});