
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetAllTables } = require('./helpers/test-db');
const { createApp } = require('../src/app');

// Deterministic provider double; records every analyzer input it receives so
// tests can assert the application-supplied context.
function stubProvider() {
  const provider = {
    name: 'stub-analyzer',
    calls: [],
    failNext: false,
    items: [],
    async analyze(input) {
      provider.calls.push(input);
      if (provider.failNext) {
        provider.failNext = false;
        throw new Error('simulated provider outage');
      }
      return { items: provider.items };
    }
  };
  return provider;
}

const TWO_ITEMS = [
  { name: 'milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: '2026-09-20', dateType: 'best_before' },
  { name: 'rice', quantity: null, unit: null, location: null, expirationDate: null, dateType: null }
];

async function withApp(options, run) {
  const app = createApp(options);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await run(base);
  } finally {
    server.close();
  }
}

function postForm(base, path, params, fetchOptions = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
    redirect: 'manual',
    ...fetchOptions
  });
}

test('GET /batches/natural-language renders the form with a manual continuation path', async () => {
  await resetAllTables();

  await withApp({}, async (base) => {
    const response = await fetch(`${base}/batches/natural-language`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /name="rawText"/);
    assert.match(body, /app-nav/);
    assert.match(body, /href="\/batches\/manual"/);
  });
});

test('a valid multi-item proposal creates an editable pending-review batch and no inventory', async () => {
  await resetAllTables();

  const provider = stubProvider();
  provider.items = TWO_ITEMS;

  await withApp({ analyzerProvider: provider }, async (base) => {
    const response = await postForm(
      base,
      '/batches/natural-language',
      new URLSearchParams({ rawText: 'Fridge: two cartons of milk best before 20 September 2026. Rice.' })
    );
    assert.equal(response.status, 302);
    const location = response.headers.get('location');
    assert.match(location, /^\/batches\/\d+\/review$/);

    const review = await fetch(`${base}${location}`);
    assert.equal(review.status, 200);
    const reviewBody = await review.text();
    assert.match(reviewBody, /milk/);
    assert.match(reviewBody, /rice/);
    // Owner acceptance feedback: the preserved description must be visible on
    // the review page, not only stored in intake_batches.original_text.
    assert.ok(reviewBody.includes('Original description'));
    assert.ok(reviewBody.includes('Fridge: two cartons of milk best before 20 September 2026. Rice.'));
  });

  const batch = (
    await pool.query('SELECT source_type, state, original_text, processor_id FROM intake_batches ORDER BY id DESC LIMIT 1')
  ).rows[0];
  assert.equal(batch.source_type, 'natural_language');
  assert.equal(batch.state, 'pending_review');
  assert.equal(batch.original_text, 'Fridge: two cartons of milk best before 20 September 2026. Rice.');
  assert.equal(batch.processor_id, 'stub-analyzer');

  assert.equal((await pool.query('SELECT COUNT(*)::int AS c FROM intake_batch_items')).rows[0].c, 2);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS c FROM inventory_items')).rows[0].c, 0);
});

test('the application supplies reference date, timezone, and locale to the provider', async () => {
  await resetAllTables();

  const provider = stubProvider();
  provider.items = TWO_ITEMS;

  await withApp({ analyzerProvider: provider }, async (base) => {
    const response = await postForm(base, '/batches/natural-language', new URLSearchParams({ rawText: 'Rice.' }));
    assert.equal(response.status, 302);
  });

  assert.equal(provider.calls.length, 1);
  const input = provider.calls[0];
  assert.equal(input.rawText, 'Rice.');
  assert.match(input.referenceDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(typeof input.timezone === 'string' && input.timezone.length > 0);
  assert.ok(typeof input.locale === 'string' && input.locale.length > 0);

  // Independent recomputation: the reference date must equal the calendar
  // date of the submission instant inside the reported timezone — never a
  // UTC-derived date that drifts around local midnight (owner acceptance
  // feedback).
  const expectedReferenceDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: input.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  assert.equal(input.referenceDate, expectedReferenceDate);
});

test('a provider failure preserves the submitted text, hides provider details, and allows retry', async () => {
  await resetAllTables();

  const provider = stubProvider();
  provider.failNext = true;

  await withApp({ analyzerProvider: provider }, async (base) => {
    const failureResponse = await postForm(
      base,
      '/batches/natural-language',
      new URLSearchParams({ rawText: 'Two cartons of oat milk.' })
    );
    assert.equal(failureResponse.status, 422);
    const failureBody = await failureResponse.text();
    assert.match(failureBody, /analysis failed/i);
    assert.ok(failureBody.includes('Two cartons of oat milk.'));
    assert.doesNotMatch(failureBody, /simulated provider outage/);
    assert.match(failureBody, /href="\/batches\/manual"/);

    assert.equal((await pool.query('SELECT COUNT(*)::int AS c FROM intake_batches')).rows[0].c, 0);

    const retryParams = new URLSearchParams({ rawText: 'Two cartons of oat milk.' });
    provider.items = TWO_ITEMS;
    const retryResponse = await postForm(base, '/batches/natural-language', retryParams);
    assert.equal(retryResponse.status, 302);
    assert.match(retryResponse.headers.get('location'), /^\/batches\/\d+\/review$/);
  });
});

test('an empty description is rejected safely and creates no batch', async () => {
  await resetAllTables();

  await withApp({ analyzerProvider: stubProvider() }, async (base) => {
    const response = await postForm(base, '/batches/natural-language', new URLSearchParams({ rawText: '   ' }));
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Enter a grocery description/);

    assert.equal((await pool.query('SELECT COUNT(*)::int AS c FROM intake_batches')).rows[0].c, 0);
  });
});

test('an unrecognized description yields a safe no-items error and preserves the text', async () => {
  await resetAllTables();

  await withApp({ analyzerProvider: stubProvider() }, async (base) => {
    const response = await postForm(
      base,
      '/batches/natural-language',
      new URLSearchParams({ rawText: 'Something something groceries.' })
    );
    assert.equal(response.status, 422);
    const body = await response.text();
    assert.match(body, /No grocery items were recognized/);
    assert.ok(body.includes('Something something groceries.'));

    assert.equal((await pool.query('SELECT COUNT(*)::int AS c FROM intake_batches')).rows[0].c, 0);
  });
});

test('proposed rows remain editable through the shared review workflow', async () => {
  await resetAllTables();

  const provider = stubProvider();
  provider.items = TWO_ITEMS;

  await withApp({ analyzerProvider: provider }, async (base) => {
    const created = await postForm(
      base,
      '/batches/natural-language',
      new URLSearchParams({ rawText: 'Milk and rice.' })
    );
    const batchId = created.headers.get('location').match(/^\/batches\/(\d+)\/review$/)[1];

    const correctionParams = new URLSearchParams();
    correctionParams.set('rows[0][name]', 'Whole milk');
    correctionParams.set('rows[0][quantity]', '2');
    correctionParams.set('rows[0][unit]', 'package');
    correctionParams.set('rows[0][location]', 'fridge');
    correctionParams.set('rows[0][expirationDate]', '2026-09-20');
    correctionParams.set('rows[0][dateType]', 'best_before');
    correctionParams.set('rows[0][accepted]', 'true');
    correctionParams.set('rows[1][name]', 'rice');
    correctionParams.set('rows[1][quantity]', '');
    correctionParams.set('rows[1][unit]', '');
    correctionParams.set('rows[1][location]', '');
    correctionParams.set('rows[1][expirationDate]', '');
    correctionParams.set('rows[1][dateType]', '');
    correctionParams.set('rows[1][accepted]', 'false');

    const corrected = await postForm(base, `/batches/${batchId}/review`, correctionParams);
    assert.equal(corrected.status, 302);
    assert.equal(corrected.headers.get('location'), `/batches/${batchId}/review?notice=corrections_saved`);

    const stored = (
      await pool.query('SELECT name, accepted FROM intake_batch_items WHERE batch_id = $1 ORDER BY position ASC', [
        Number(batchId)
      ])
    ).rows;
    assert.equal(stored[0].name, 'Whole milk');
    assert.equal(stored[0].accepted, true);
    assert.equal(stored[1].accepted, false);
  });
});

test('confirming the reviewed proposal moves only included rows into inventory', async () => {
  await resetAllTables();

  const provider = stubProvider();
  provider.items = TWO_ITEMS;

  await withApp({ analyzerProvider: provider }, async (base) => {
    const created = await postForm(
      base,
      '/batches/natural-language',
      new URLSearchParams({ rawText: 'Milk and rice.' })
    );
    const batchId = created.headers.get('location').match(/^\/batches\/(\d+)\/review$/)[1];

    // Rice has no location yet: exclude it in review so only complete,
    // included rows reach the inventory.
    const exclusionParams = new URLSearchParams();
    exclusionParams.set('rows[0][name]', 'milk');
    exclusionParams.set('rows[0][quantity]', '2');
    exclusionParams.set('rows[0][unit]', 'package');
    exclusionParams.set('rows[0][location]', 'fridge');
    exclusionParams.set('rows[0][expirationDate]', '2026-09-20');
    exclusionParams.set('rows[0][dateType]', 'best_before');
    exclusionParams.set('rows[0][accepted]', 'true');
    exclusionParams.set('rows[1][name]', 'rice');
    exclusionParams.set('rows[1][quantity]', '');
    exclusionParams.set('rows[1][unit]', '');
    exclusionParams.set('rows[1][location]', '');
    exclusionParams.set('rows[1][expirationDate]', '');
    exclusionParams.set('rows[1][dateType]', '');
    exclusionParams.set('rows[1][accepted]', 'false');
    const saved = await postForm(base, `/batches/${batchId}/review`, exclusionParams);
    assert.equal(saved.status, 302);

    const confirmResponse = await postForm(base, `/batches/${batchId}/confirm`, new URLSearchParams());
    assert.equal(confirmResponse.status, 302);
    assert.equal(confirmResponse.headers.get('location'), '/inventory?notice=confirmed&created=1');

    const inventory = (await pool.query('SELECT name, source_batch_id FROM inventory_items ORDER BY id ASC')).rows;
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].name, 'milk');
    assert.equal(inventory[0].source_batch_id, String(batchId));

    const batch = (await pool.query('SELECT state, source_type FROM intake_batches WHERE id = $1', [Number(batchId)]))
      .rows[0];
    assert.equal(batch.state, 'confirmed');
    assert.equal(batch.source_type, 'natural_language');
  });
});

// Owner acceptance feedback: referenceDate must be the calendar date inside
// the reported timezone, so date and timezone can never disagree near local
// midnight.
test('referenceDate is derived inside the configured timezone, not UTC', () => {
  const { calendarDateInZone, buildAnalyzerInput } = require('../src/services/natural-language-intake-service');

  const justBeforeUtcMidnight = new Date('2026-08-24T23:30:00Z');
  assert.equal(calendarDateInZone(justBeforeUtcMidnight, 'Europe/Berlin'), '2026-08-25');
  assert.equal(calendarDateInZone(justBeforeUtcMidnight, 'Pacific/Honolulu'), '2026-08-24');
  assert.equal(calendarDateInZone(justBeforeUtcMidnight, 'UTC'), '2026-08-24');

  const context = buildAnalyzerInput('Milk.');
  assert.equal(context.rawText, 'Milk.');
  assert.equal(context.locale, 'en-US');

  // Independent recomputation, not via the service helper.
  const expected = new Intl.DateTimeFormat('en-CA', {
    timeZone: context.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  assert.equal(context.referenceDate, expected);
});

// ---------------------------------------------------------------------------
// Ticket 2.3: canonical analysis-failure taxonomy. Service-level assertions
// pin the exact error codes; HTTP tests below pin the safe route mapping.
// ---------------------------------------------------------------------------
const {
  ANALYSIS_ERROR_CODES,
  analyzeAndCreateReviewBatch
} = require('../src/services/natural-language-intake-service');
const { wrapAnalyzerProvider } = require('../src/analyzers/provider');

test('oversized descriptions are rejected before any provider work', async () => {
  await resetAllTables();

  const provider = stubProvider(TWO_ITEMS);
  const longText = `${'Milk. '.repeat(900)}end`; // > 4000 chars

  await assert.rejects(
    analyzeAndCreateReviewBatch({ rawText: longText }, { analyzerProvider: provider }),
    (error) => error.code === 'ANALYSIS_INPUT_TOO_LONG'
  );
  assert.equal(provider.calls.length, 0);

  const batchCount = await pool.query('SELECT COUNT(*)::int AS count FROM intake_batches');
  assert.equal(batchCount.rows[0].count, 0);
});

test('contract-invalid analyzer output maps to AI_INVALID_RESPONSE', async () => {
  await resetAllTables();

  const badProvider = wrapAnalyzerProvider({
    name: 'bad-analyzer',
    async analyze() {
      return { items: [{ name: 'milk', unit: 'bottle' }] }; // unit without quantity
    }
  });

  await assert.rejects(
    analyzeAndCreateReviewBatch({ rawText: 'Two bottles of milk.' }, { analyzerProvider: badProvider }),
    (error) => {
      assert.equal(error.code, ANALYSIS_ERROR_CODES.INVALID_RESPONSE);
      assert.doesNotMatch(error.message, /bad-analyzer|ANALYZER_INVALID_OUTPUT/);
      return true;
    }
  );

  const batchCount = await pool.query('SELECT COUNT(*)::int AS count FROM intake_batches');
  assert.equal(batchCount.rows[0].count, 0);
});

test('provider execution failures map to AI_ANALYSIS_FAILED without provider detail', async () => {
  await resetAllTables();

  const failingProvider = {
    name: 'secret-provider-internal-7',
    async analyze() {
      throw new Error('connection refused to model host 10.0.0.7');
    }
  };

  await assert.rejects(
    analyzeAndCreateReviewBatch({ rawText: 'Some rice.' }, { analyzerProvider: failingProvider }),
    (error) => {
      assert.equal(error.code, ANALYSIS_ERROR_CODES.ANALYSIS_FAILED);
      assert.ok(!error.message.includes('secret-provider') && !error.message.includes('10.0.0.7'));
      return true;
    }
  );
});

test('analyses exceeding the wall-clock budget map to AI_ANALYSIS_FAILED', async () => {
  await resetAllTables();

  const hangingProvider = {
    name: 'hanging-analyzer',
    async analyze() {
      return new Promise(() => {}); // never resolves
    }
  };

  await assert.rejects(
    analyzeAndCreateReviewBatch(
      { rawText: 'Some rice.' },
      { analyzerProvider: hangingProvider, analysisTimeoutMs: 40 }
    ),
    (error) => error.code === ANALYSIS_ERROR_CODES.ANALYSIS_FAILED
  );

  const batchCount = await pool.query('SELECT COUNT(*)::int AS count FROM intake_batches');
  assert.equal(batchCount.rows[0].count, 0);
});

// ---------------------------------------------------------------------------
// Ticket 2.3: HTTP mapping — every recoverable analysis failure renders the
// safe form with the original description; none may surface as a JSON 500.
// ---------------------------------------------------------------------------
test('an oversized description returns a 400 safe form and never reaches the provider', async () => {
  await resetAllTables();

  const provider = stubProvider(TWO_ITEMS);
  const longText = `Fridge: milk best before tomorrow. ${'More items. '.repeat(600)}`;

  await withApp({ analyzerProvider: provider }, async (base) => {
    const response = await postForm(base, '/batches/natural-language', new URLSearchParams({ rawText: longText }));
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type') || '', /text\/html/);

    const body = await response.text();
    assert.match(body, /too long/i);
    assert.ok(body.includes('Fridge: milk best before tomorrow.'));
    assert.doesNotMatch(body, /Internal server error/);
  });

  assert.equal(provider.calls.length, 0);
  const batchCount = await pool.query('SELECT COUNT(*)::int AS count FROM intake_batches');
  assert.equal(batchCount.rows[0].count, 0);
});

test('contract-invalid provider output renders the unusable-response form with preserved text', async () => {
  await resetAllTables();

  const badProvider = wrapAnalyzerProvider({
    name: 'bad-analyzer',
    async analyze() {
      return { items: [{ name: 'milk', unit: 'bottle' }] }; // unit without quantity
    }
  });

  await withApp({ analyzerProvider: badProvider }, async (base) => {
    const response = await postForm(
      base,
      '/batches/natural-language',
      new URLSearchParams({ rawText: 'Two bottles of milk.' })
    );
    assert.equal(response.status, 422);
    assert.match(response.headers.get('content-type') || '', /text\/html/);

    const body = await response.text();
    assert.match(body, /unusable response/i);
    assert.ok(body.includes('Two bottles of milk.'));
    assert.match(body, /href="\/batches\/manual"/);
    assert.doesNotMatch(body, /bad-analyzer|Internal server error/);
  });

  const batchCount = await pool.query('SELECT COUNT(*)::int AS count FROM intake_batches');
  assert.equal(batchCount.rows[0].count, 0);
});

test('a timed-out analysis renders the safe form with preserved text instead of a JSON 500', async () => {
  await resetAllTables();

  const hangingProvider = {
    name: 'hanging-analyzer',
    async analyze() {
      return new Promise(() => {});
    }
  };

  await withApp({ analyzerProvider: hangingProvider, analysisTimeoutMs: 40 }, async (base) => {
    const response = await postForm(
      base,
      '/batches/natural-language',
      new URLSearchParams({ rawText: 'Frozen peas and maybe some rice.' })
    );
    assert.equal(response.status, 422);
    assert.match(response.headers.get('content-type') || '', /text\/html/);

    const body = await response.text();
    assert.match(body, /analysis failed/i);
    assert.ok(body.includes('Frozen peas and maybe some rice.'));
    assert.doesNotMatch(body, /Internal server error/);
  });

  const batchCount = await pool.query('SELECT COUNT(*)::int AS count FROM intake_batches');
  assert.equal(batchCount.rows[0].count, 0);
});

test('the normal application analyzes through the configured fake provider without injection', async () => {
  await resetAllTables();

  await withApp({}, async (base) => {
    const params = new URLSearchParams();
    params.set('rawText', 'Fridge: two cartons of milk best before 20 August.');

    const response = await postForm(base, '/batches/natural-language', params, { redirect: 'manual' });
    assert.equal(response.status, 302);
    const location = response.headers.get('location');
    assert.match(location, /^\/batches\/\d+\/review$/);

    const review = await fetch(`${base}${location}`);
    assert.equal(review.status, 200);
    const body = await review.text();
    assert.match(body, /milk/);
    assert.match(body, /Fridge: two cartons of milk best before 20 August\./);
  });

  const batch = await pool.query('SELECT source_type, processor_id FROM intake_batches ORDER BY id DESC LIMIT 1');
  assert.equal(batch.rows[0].source_type, 'natural_language');
  assert.equal(batch.rows[0].processor_id, 'fake');

  const inventoryCount = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items');
  assert.equal(inventoryCount.rows[0].count, 0);
});

test('a provider-resolution failure renders the safe form with preserved text instead of a JSON 500', async () => {
  await resetAllTables();

  await withApp({ analyzerProviderKind: 'does-not-exist' }, async (base) => {
    const params = new URLSearchParams();
    params.set('rawText', 'Fridge: two cartons of milk best before 20 August.');

    const response = await postForm(base, '/batches/natural-language', params);
    assert.equal(response.status, 422);
    assert.match(response.headers.get('content-type') || '', /text\/html/);

    const body = await response.text();
    assert.ok(body.includes('Fridge: two cartons of milk best before 20 August.'));
    assert.match(body, /analysis failed/i);
    assert.doesNotMatch(body, /Internal server error/);

    const batchCount = await pool.query('SELECT COUNT(*)::int AS count FROM intake_batches');
    assert.equal(batchCount.rows[0].count, 0);
  });
});
