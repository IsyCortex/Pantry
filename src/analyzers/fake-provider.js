'use strict';

const fs = require('fs');
const path = require('path');

// Deterministic fake analyzer provider.
//
// For every known input this provider returns the same proposal regardless of
// how many times it is called, and it never performs I/O beyond reading the
// application-owned fixture files once at construction time. It satisfies the
// analyzer-contract ask:
//   - produces deterministic multi-item proposals;
//   - representative fixtures cover explicit values, missing values, ambiguity,
//     and grouped locations;
//   - automated tests require no live model or network service;
//   - output has the same canonical proposal-item shape the local provider
//     (Ticket 2.4) will produce, and which Ticket 2.3 will validate.
//
// The analyzer-contract input schema is `{ rawText, referenceDate, timezone,
// locale }`. The fake provider resolves deterministically from `rawText` (the
// untrusted user input); the application-owned context fields are accepted and
// ignored by the fake, exactly as they would be by a provider that does not
// need them for fixture lookup.

const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'docs', 'fixtures', 'analyzer-contract');

// Deterministic input-key -> fixture filename resolution. Kept explicit so the
// provider is predictable for tests and review.
const INPUT_FIXTURE_MAP = {
  'Fridge: two cartons of milk best before 20 August. Pantry: one bag of rice.':
    'valid-grouped-locations.json',
  'two cartons of milk': 'valid-basic.json',
  'one bag of rice': 'valid-missing-values.json',
  'three things. Two cartons of milk and maybe some rice, a bit of frozen peas.':
    'valid-ambiguous.json'
};

function loadFixture(filename) {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8');
  return JSON.parse(raw).items;
}

function createFakeAnalyzerProvider() {
  const fixtureCache = {};
  for (const filename of new Set(Object.values(INPUT_FIXTURE_MAP))) {
    fixtureCache[filename] = loadFixture(filename);
  }

  return {
    name: 'fake',

    /**
     * Analyze a grocery description and return a deterministic proposal.
     *
     * @param {object} input
     * @param {string} input.rawText
     * @param {string} [input.referenceDate]
     * @param {string} [input.timezone]
     * @param {string} [input.locale]
     * @returns {Promise<{items: Array}>}
     */
    async analyze(input) {
      if (!input || typeof input.rawText !== 'string') {
        throw new Error('FAKE_PROVIDER_INVALID_INPUT: rawText must be a string');
      }

      const filename = INPUT_FIXTURE_MAP[input.rawText];
      if (!filename) {
        throw new Error('FAKE_PROVIDER_UNCHARTED: no deterministic fixture for this input');
      }

      // Return a deep copy so callers can never mutate the shared fixture.
      return { items: JSON.parse(JSON.stringify(fixtureCache[filename])) };
    }
  };
}

module.exports = { createFakeAnalyzerProvider, INPUT_FIXTURE_MAP };