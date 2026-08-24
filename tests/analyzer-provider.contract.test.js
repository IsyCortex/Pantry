'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAnalyzerProvider,
  ANALYZER_PROVIDER_KIND
} = require('../src/analyzers/provider');
const {
  createFakeAnalyzerProvider,
  INPUT_FIXTURE_MAP
} = require('../src/analyzers/fake-provider');

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
  assert.equal(item.quantity, null);
  assert.equal(item.unit, null);
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

  const allowedItemKeys = new Set([
    'name',
    'quantity',
    'unit',
    'location',
    'expirationDate',
    'dateType'
  ]);
  for (const item of result.items) {
    for (const key of Object.keys(item)) {
      assert.ok(allowedItemKeys.has(key), `unexpected proposal item key: ${key}`);
    }
    assert.equal(typeof item.name, 'string');
    assert.ok(item.name.trim().length > 0);
    if (item.quantity != null) assert.ok(item.quantity > 0);
    if (item.unit != null) assert.ok(['g', 'kg', 'ml', 'l', 'piece', 'package'].includes(item.unit));
    if (item.location != null) assert.ok(['pantry', 'fridge', 'freezer'].includes(item.location));
    if (item.expirationDate != null) assert.match(item.expirationDate, /^\d{4}-\d{2}-\d{2}$/);
    if (item.dateType != null) assert.ok(['best_before', 'use_by', 'unspecified'].includes(item.dateType));
  }
});

test('fake provider rejects missing or non-string rawText', async () => {
  const provider = createFakeAnalyzerProvider();
  await assert.rejects(() => provider.analyze({}), /FAKE_PROVIDER_INVALID_INPUT/);
  await assert.rejects(() => provider.analyze({ rawText: 42 }), /FAKE_PROVIDER_INVALID_INPUT/);
});

test('fake provider rejects uncharted input without a corresponding fixture', async () => {
  const provider = createFakeAnalyzerProvider();
  await assert.rejects(
    () => provider.analyze({ rawText: 'unknown input text' }),
    /FAKE_PROVIDER_UNCHARTED/
  );
});

test('every fixture referenced by the fake provider maps to a named contract fixture', () => {
  const referenced = Object.values(INPUT_FIXTURE_MAP);
  assert.ok(referenced.length >= 4);
  assert.ok(referenced.includes('valid-basic.json'));
  assert.ok(referenced.includes('valid-missing-values.json'));
  assert.ok(referenced.includes('valid-grouped-locations.json'));
  assert.ok(referenced.includes('valid-ambiguous.json'));
});