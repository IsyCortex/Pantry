const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/pool');
const { createApp } = require('../src/app');
const { saveManualDraftBatch } = require('../src/services/intake-batch-service');

async function resetBatchTables() {
  await pool.query('TRUNCATE TABLE intake_batch_items, intake_batches RESTART IDENTITY CASCADE');
}

test('review page shows full batch, row-level issues, missing-date warnings, and duplicate warnings', async () => {
  await resetBatchTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: '', expirationDate: '', dateType: '' },
      { name: 'Milk', quantity: '1', unit: 'package', location: 'fridge', expirationDate: '', dateType: '' },
      { name: '   ', quantity: '', unit: '', location: 'pantry', expirationDate: '', dateType: '' }
    ]
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/batches/${saved.id}/review`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Inspect the complete batch before later confirmation/);
    assert.match(body, /missing_location/);
    assert.match(body, /missing_expiration_date/);
    assert.match(body, /possible_batch_duplicate/);
    assert.match(body, /Name is required before confirmation/);
  } finally {
    server.close();
  }
});

test('review page preserves exclusions and corrections without recreating the batch', async () => {
  await resetBatchTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: '', expirationDate: '', dateType: '' },
      { name: 'Rice', quantity: '1', unit: 'package', location: 'pantry', expirationDate: '', dateType: '' }
    ]
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const params = new URLSearchParams();
    params.set('rows[0][accepted]', 'false');
    params.set('rows[0][name]', 'Milk');
    params.set('rows[0][quantity]', '2');
    params.set('rows[0][unit]', 'package');
    params.set('rows[0][location]', 'fridge');
    params.set('rows[0][expirationDate]', '');
    params.set('rows[0][dateType]', '');
    params.set('rows[1][accepted]', 'true');
    params.set('rows[1][name]', 'Brown Rice');
    params.set('rows[1][quantity]', '1');
    params.set('rows[1][unit]', 'package');
    params.set('rows[1][location]', 'pantry');
    params.set('rows[1][expirationDate]', '');
    params.set('rows[1][dateType]', '');

    const response = await fetch(`http://127.0.0.1:${port}/batches/${saved.id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Brown Rice/);
    assert.match(body, /Excluded/);

    const reloaded = await fetch(`http://127.0.0.1:${port}/batches/${saved.id}/review`);
    const reloadedBody = await reloaded.text();
    assert.equal(reloaded.status, 200);
    assert.match(reloadedBody, /Brown Rice/);
    assert.match(reloadedBody, /Excluded/);
  } finally {
    server.close();
  }
});

test('excluded rows do not show blocking missing-name or missing-location errors', async () => {
  await resetBatchTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: '', quantity: '', unit: '', location: '', expirationDate: '', dateType: '', accepted: false },
      { name: 'Rice', quantity: '1', unit: 'package', location: 'pantry', expirationDate: '', dateType: '', accepted: true }
    ]
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/batches/${saved.id}/review`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(body, /Name is required before confirmation\./);
    assert.doesNotMatch(body, /Storage location is required before confirmation\./);
  } finally {
    server.close();
  }
});

test('review page shows structured field errors and transitions batch to pending_review', async () => {
  await resetBatchTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '', unit: 'package', location: 'fridge', expirationDate: '2026-02-30', dateType: 'best_before' }
    ]
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const manualReviewParams = new URLSearchParams();
    manualReviewParams.set('batchId', String(saved.id));
    manualReviewParams.set('action', 'review');
    manualReviewParams.set('rows[0][name]', 'Milk');
    manualReviewParams.set('rows[0][quantity]', '');
    manualReviewParams.set('rows[0][unit]', 'package');
    manualReviewParams.set('rows[0][location]', 'fridge');
    manualReviewParams.set('rows[0][expirationDate]', '2026-02-30');
    manualReviewParams.set('rows[0][dateType]', 'best_before');

    const manualReviewResponse = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: manualReviewParams
    });
    const manualReviewBody = await manualReviewResponse.text();
    assert.equal(manualReviewResponse.status, 200);
    assert.match(manualReviewBody, /Unit requires quantity\./);
    assert.match(manualReviewBody, /Expiration date must be a valid ISO date\./);

    const reloaded = await fetch(`http://127.0.0.1:${port}/batches/${saved.id}/review`);
    const reloadedBody = await reloaded.text();
    assert.equal(reloaded.status, 200);
    assert.match(reloadedBody, /Review intake batch/);
  } finally {
    server.close();
  }
});