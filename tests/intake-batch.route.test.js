const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/pool');
const { createApp } = require('../src/app');

async function resetBatchTables() {
  await pool.query('TRUNCATE TABLE intake_batch_items, intake_batches RESTART IDENTITY CASCADE');
}

test('GET /batches/manual renders the manual batch editor', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/batches/manual`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Manual intake batch/);
    assert.match(body, /Default location for newly created rows/);
    assert.match(body, /Save draft batch/);
  } finally {
    server.close();
  }
});

test('POST /batches/manual preserves validation errors and entered values', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const params = new URLSearchParams();
    params.set('action', 'save');
    params.set('defaultLocation', 'fridge');
    params.set('rows[0][name]', ' ');
    params.set('rows[0][quantity]', '-1');
    params.set('rows[0][unit]', 'piece');
    params.set('rows[0][location]', '');
    params.set('rows[0][expirationDate]', '');
    params.set('rows[0][dateType]', '');

    const response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /Validation errors/);
    assert.match(body, /quantity must be a positive number/);
    assert.match(body, /value="-1"/);
  } finally {
    server.close();
  }
});

test('POST /batches/manual supports add, duplicate, remove, and reorder actions', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const addParams = new URLSearchParams();
    addParams.set('action', 'add-row');
    addParams.set('defaultLocation', 'freezer');
    addParams.set('rows[0][name]', 'Peas');
    addParams.set('rows[0][quantity]', '1');
    addParams.set('rows[0][unit]', 'package');
    addParams.set('rows[0][location]', 'freezer');
    addParams.set('rows[0][expirationDate]', '');
    addParams.set('rows[0][dateType]', '');

    let response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: addParams
    });
    let body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /rows\[1\]\[name\]/);
    assert.match(body, /<option value="freezer" selected>/);

    const duplicateParams = new URLSearchParams(addParams);
    duplicateParams.set('action', 'duplicate-row');
    duplicateParams.set('rowIndex', '0');
    response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: duplicateParams
    });
    body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /value="Peas"/);

    const moveParams = new URLSearchParams();
    moveParams.set('action', 'move-up');
    moveParams.set('rowIndex', '1');
    moveParams.set('rows[0][name]', 'Milk');
    moveParams.set('rows[0][quantity]', '2');
    moveParams.set('rows[0][unit]', 'package');
    moveParams.set('rows[0][location]', 'fridge');
    moveParams.set('rows[0][expirationDate]', '');
    moveParams.set('rows[0][dateType]', '');
    moveParams.set('rows[1][name]', 'Rice');
    moveParams.set('rows[1][quantity]', '1');
    moveParams.set('rows[1][unit]', 'package');
    moveParams.set('rows[1][location]', 'pantry');
    moveParams.set('rows[1][expirationDate]', '');
    moveParams.set('rows[1][dateType]', '');
    response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: moveParams
    });
    body = await response.text();
    assert.equal(response.status, 200);
    assert.ok(body.indexOf('value="Rice"') < body.indexOf('value="Milk"'));

    const removeParams = new URLSearchParams(moveParams);
    removeParams.set('action', 'remove-row');
    removeParams.set('rowIndex', '0');
    response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: removeParams
    });
    body = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(body, /value="Milk"/);
    assert.match(body, /value="Rice"/);
  } finally {
    server.close();
  }
});

test('POST /batches/manual saves a draft batch that survives reload', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const params = new URLSearchParams();
    params.set('action', 'save');
    params.set('defaultLocation', 'fridge');
    params.set('rows[0][name]', 'Milk');
    params.set('rows[0][quantity]', '2');
    params.set('rows[0][unit]', 'package');
    params.set('rows[0][location]', '');
    params.set('rows[0][expirationDate]', '2026-08-20');
    params.set('rows[0][dateType]', 'best_before');

    let response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params
    });
    let body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /value="Milk"/);

    response = await fetch(`http://127.0.0.1:${port}/batches/manual`);
    body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /value="Milk"/);
    assert.match(body, /value="2026-08-20"/);
  } finally {
    server.close();
  }
});