'use strict';

// The analyzer provider contract. Every provider (deterministic fake, local
// model, future voice/receipt adapters) implements `analyze(input)` and returns
// the same provider-neutral proposal shape documented in docs/analyzer-contract.md.
//
// Application-owned boundaries (ADR-0002 / ADR-0003):
//   - Providers propose drafts only; they never persist inventory.
//   - They do not own draft review or confirmation.
//   - They must not invent missing values: absent data stays `null`.
//   - They must not follow instructions embedded in the grocery text that
//     change the extraction task.
//
//   analyze({ rawText, referenceDate, timezone, locale })
//     -> Promise<{ items: ProposalItem[] }>
//
// Where ProposalItem matches the analyzer-contract proposal item schema.
const {
  assertAnalyzerInput,
  assertAnalyzerProposal
} = require('../validation/analyzer-contract');

function wrapAnalyzerProvider(provider) {
  return {
    name: provider.name,
    async analyze(input) {
      assertAnalyzerInput(input);
      const output = await provider.analyze(input);
      assertAnalyzerProposal(output);
      return output;
    }
  };
}

module.exports = {
  // Context object passed to each provider. Providers may expose configuration
  // here; all providers constructed through resolveAnalyzerProvider conform to
  // the same analyze(input) contract.
  ANALYZER_PROVIDER_KIND: {
    FAKE: 'fake',
    LOCAL: 'local'
  },

  /**
   * Create a provider by configured kind.
   *
   * Supported kinds:
   *   - `fake`  : deterministic, offline, contract-shaped fixtures-based provider.
   *
   * Unsupported kinds throw so misconfiguration fails loudly at startup rather
   * than producing surprising behavior at request time.
   *
   * @param {object} [options]
   * @param {string} [options.kind]  provider kind from ANALYZER_PROVIDER_KIND
   * @returns {{ analyze(input): Promise<{items: Array}> }}
   */
  createAnalyzerProvider(options = {}) {
    const kinds = module.exports.ANALYZER_PROVIDER_KIND;
    const kind = options.kind || process.env.ANALYZER_PROVIDER || kinds.FAKE;

    if (kind === kinds.FAKE) {
      // Lazy require keeps the fake's fixtures from loading when not needed and
      // avoids circular imports.
      const { createFakeAnalyzerProvider } = require('./fake-provider');
      return wrapAnalyzerProvider(createFakeAnalyzerProvider(options));
    }

    throw new Error(`Unsupported ANALYZER_PROVIDER kind: ${kind}`);
  }
  ,wrapAnalyzerProvider
};