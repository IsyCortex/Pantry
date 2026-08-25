const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set; using default local fallback.');
}

module.exports = {
  // All settings are read lazily so runtime changes to process.env (e.g. the
  // hermetic env handling in the automated tests) take effect immediately.
  get port() {
    return Number(process.env.PORT || 3000);
  },
  get databaseUrl() {
    return process.env.DATABASE_URL || 'postgres://pantry:pantry@127.0.0.1:15432/pantry';
  },
  // Provider selection for input analysis. `fake` is deterministic and offline,
  // suitable for development and automated tests. `local` speaks the Ollama
  // /api/generate protocol against a locally running language model (Ticket 2.4).
  get analyzerProvider() {
    return process.env.ANALYZER_PROVIDER || 'fake';
  },
  // Local model server settings, used only when analyzerProvider is `local`.
  get analyzerLocalUrl() {
    return process.env.ANALYZER_LOCAL_URL || 'http://127.0.0.1:11434';
  },
  get analyzerLocalModel() {
    return process.env.ANALYZER_LOCAL_MODEL || 'llama3.2';
  },
  // Wall-clock budget for a single analyzer call. Contract budget is 15s;
  // overruns degrade to the recoverable analysis-failed state (Ticket 2.3).
  get analyzerTimeoutMs() {
    return Number(process.env.ANALYZER_TIMEOUT_MS || 15000);
  },
  // IANA timezone the application reports to analyzers. The analyzer reference
  // date is derived inside this zone, so the two values can never disagree
  // around local midnight.
  get analyzerTimezone() {
    return process.env.ANALYZER_TIMEZONE || 'UTC';
  }
};
