const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set; using default local fallback.');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://pantry:pantry@127.0.0.1:15432/pantry',
  // Provider selection for input analysis. `fake` is deterministic and offline,
  // suitable for development and automated tests. A local language-model provider
  // will be added behind the same contract in Ticket 2.4.
  analyzerProvider: process.env.ANALYZER_PROVIDER || 'fake'
};
