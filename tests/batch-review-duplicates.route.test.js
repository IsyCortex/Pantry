'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetAllTables } = require('./helpers/test-db');
const { createApp } = require('../src/app');
const { saveManualDraftBatch, markBatchPendingReview } = require('../src/services/intake-batch-service');

// Ticket 4.2 - the AI draft-review page must compare review rows with ACTIVE
// inventory through the same conservative matcher as the manual editor, on
// EVERY render path (GET, saved-corrections validation, confirmation
// validation, invalid-state transition). Warnings stay strictly advisory:
// rows remain includable/excludable, confirmation stays reachable, and
// confirming keeps creating separate inventory entries without combining
// quantities or dates.

async function seedActiveItem({ name = 'Milk', quantity = 2, unit = 'package', location = 'fridge', expirationDate = '2026-09-10', lifecycleStatus = 'active' } = {}) {
  const dateType = expirationDate ? 'best_before' : null;
  const result = await pool.query(
    `INSERT INTO inventory_items (name, quantity, unit, location, expiration_date, date_type, lifecycle_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [name, quantity === '' ? null : quantity, unit, location, expirationDate || null, dateType, lifecycleStatus]
  );
  return Number(result.rows[0].id);
}

async function startApp() {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

function formSearchParams(rows) {
  const params = new URLSearchParams();
  rows.forEach((row, index) => {
    params.set(`rows[${index}][accepted]`, String(row.accepted !== false));
    params.set(`rows[${index}][name]`, row.name ?? '');
    params.set(`rows[${index}][quantity]`, row.quantity ?? '');
    params.set(`rows[${index}][unit]`, row.unit ?? '');
    params.set(`rows[${index}][location]`, row.location ?? '');
    params.set(`rows[${index}][expirationDate]`, row.expirationDate ?? '');
    params.set(`rows[${index}][dateType]`, row.dateType ?? '');
  });
  return params;
}

async function postForm(base, path, rows, { redirect = 'manual' } = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formSearchParams(rows).toString(),
    redirect
  });
}

test('GET review warns against active inventory only, keeps rows controllable and confirmable', async () => {
  await resetAllTables();
  await seedActiveItem({});
  const saved = await saveManualDraftBatch({ batchId: null, rows: [
    { name: 'MILK', quantity: '5', unit: 'package', location: 'fridge', expirationDate: '', dateType: '' },
    { name: 'Buttermilk', quantity: '1', unit: 'package', location: 'fridge', expirationDate: '', dateType: '' }
  ] });

  const { server, base } = await startApp();
  try {
    const response = await fetch(`${base}/batches/${saved.id}/review`);
    assert.equal(response.status, 200);
    const body = await response.text();
    const titles = body.match(/duplicate-warning-title/g) || [];
    assert.equal(titles.length, 1);
    assert.match(body, /data-row-duplicate-warning="0"[^>]*>/);
    assert.doesNotMatch(body, /data-row-duplicate-warning="0"[^>]*hidden/);
    assert.match(body, /data-row-duplicate-warning="1"[^>]*hidden/);
    assert.match(body, />Milk</);
    assert.match(body, /Saving keeps both entries side by side/);
    assert.match(body, /rows\[0\]\[accepted\]/);
    assert.match(body, new RegExp(`/batches/${saved.id}/confirm`));
    assert.match(body, /Confirm batch and add items to inventory/);
  } finally { server.close(); }
});

test('saved-corrections validation render keeps duplicate warnings', async () => {
  await resetAllTables();
  await seedActiveItem({});
  const saved = await saveManualDraftBatch({ batchId: null, rows: [
    { name: 'miik', quantity: '3', unit: 'package', location: 'fridge', expirationDate: '', dateType: '' }
  ] });

  const { server, base } = await startApp();
  try {
    const response = await postForm(base, `/batches/${saved.id}/review`, [
      { name: 'miik', quantity: 'not-a-number', unit: 'package', location: 'fridge' }
 ]);
    assert.equal(response.status, 400);
    const body = await response.text();
    assert.equal((body.match(/duplicate-warning-title/g) || []).length, 1);
    assert.match(body, /possible typo/);
  } finally { server.close(); }
});

test('confirmation validation error renders warnings while keeping confirmation available', async () => {
  await resetAllTables();
  await seedActiveItem({});
  // Inactive twin must stay silent: only ACTIVE inventory feeds warnings.
  await seedActiveItem({ name: 'Milk', location: 'freezer', expirationDate: '', lifecycleStatus: 'used_up' });
  const saved = await saveManualDraftBatch({ batchId: null, rows: [
    { name: 'miik', quantity: '1', unit: 'package', location: 'fridge', expirationDate: '', dateType: '', accepted: true },
    { name: '', quantity: '1', unit: 'package', location: 'pantry', expirationDate: '', dateType: '', accepted: true }
  ] });
  await markBatchPendingReview(saved.id);

  const { server, base } = await startApp();
  try {
    const response = await fetch(`${base}/batches/${saved.id}/confirm`, { method: 'POST', redirect: 'manual' });
    assert.equal(response.status, 400);
    const body = await response.text();
    assert.equal((body.match(/duplicate-warning-title/g) || []).length, 1);
    assert.match(body, /possible typo/);
    assert.match(body, />Milk</);
    assert.match(body, /Confirm batch and add items to inventory/);
    assert.match(body, /rows\[0\]\[accepted\]/);
  } finally { server.close(); }
});

test('invalid-state confirmation renders 409 review with warnings intact', async () => {
  await resetAllTables();
  await seedActiveItem({});
  const saved = await saveManualDraftBatch({ batchId: null, rows: [
    { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '', dateType: '' }
  ] });
  // Deliberately left in `draft` state: confirming must refuse with
  // INVALID_STATE_TRANSITION and re-render the review page WITH warnings.

  const { server, base } = await startApp();
  try {
    const response = await fetch(`${base}/batches/${saved.id}/confirm`, { method: 'POST', redirect: 'manual' });
    assert.equal(response.status, 409);
    const body = await response.text();
    assert.equal((body.match(/duplicate-warning-title/g) || []).length, 1);
    assert.match(body, />Milk</);
    assert.match(body, /rows\[0\]\[accepted\]/);
    assert.match(body, /Confirm batch and add items to inventory/);
  } finally { server.close(); }
});

