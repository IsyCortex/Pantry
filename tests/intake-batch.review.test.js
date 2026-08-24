const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetAllTables } = require('./helpers/test-db');
const { createApp } = require('../src/app');
const { saveManualDraftBatch, markBatchPendingReview } = require('../src/services/intake-batch-service');

async function resetBatchTables() {
  await resetAllTables();
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

test('review page renders a batch moved to pending review via the service', async () => {
  await resetBatchTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before' }
    ]
  });
  await markBatchPendingReview(saved.id);

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const review = await fetch(`http://127.0.0.1:${port}/batches/${saved.id}/review`);
    const reviewBody = await review.text();
    assert.equal(review.status, 200);
    assert.match(reviewBody, /Review intake batch/);
    assert.match(reviewBody, /Confirm batch and add items to inventory/);
  } finally {
    server.close();
  }
});

test('review route shows structured row field errors for invalid edits and does not persist them', async () => {
  await resetBatchTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before' }
    ]
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const params = new URLSearchParams();
    params.set('rows[0][accepted]', 'true');
    params.set('rows[0][name]', 'Milk');
    params.set('rows[0][quantity]', '');
    params.set('rows[0][unit]', 'package');
    params.set('rows[0][location]', 'fridge');
    params.set('rows[0][expirationDate]', '2026-02-30');
    params.set('rows[0][dateType]', 'best_before');

    const response = await fetch(`http://127.0.0.1:${port}/batches/${saved.id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /Unit requires quantity\./);
    assert.match(body, /Expiration date must be a valid ISO date\./);
    assert.match(body, /value="2026-02-30"/);

    const reloaded = await fetch(`http://127.0.0.1:${port}/batches/${saved.id}/review`);
    const reloadedBody = await reloaded.text();
    assert.equal(reloaded.status, 200);
    assert.match(reloadedBody, /value="2"/);
    assert.match(reloadedBody, /value="2026-08-20"/);
    assert.doesNotMatch(reloadedBody, /value="2026-02-30"/);
  } finally {
    server.close();
  }
});