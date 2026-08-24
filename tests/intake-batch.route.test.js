const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetAllTables } = require('./helpers/test-db');
const { createApp } = require('../src/app');

async function resetBatchTables() {
  await resetAllTables();
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
    assert.match(body, /class="app-nav"/);
    assert.match(body, /href="\/inventory"/);
    assert.match(body, /href="\/batches\/manual"/);
    assert.match(body, /Enter advances/);
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

test('POST /batches/manual targets the clicked row instead of the last rendered row', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const duplicateParams = new URLSearchParams();
    duplicateParams.set('action', 'duplicate-row');
    duplicateParams.set('actionRowIndex', '0');
    duplicateParams.set('rows[0][name]', 'Milk');
    duplicateParams.set('rows[0][quantity]', '2');
    duplicateParams.set('rows[0][unit]', 'package');
    duplicateParams.set('rows[0][location]', 'fridge');
    duplicateParams.set('rows[0][expirationDate]', '');
    duplicateParams.set('rows[0][dateType]', '');
    duplicateParams.set('rows[1][name]', 'Rice');
    duplicateParams.set('rows[1][quantity]', '1');
    duplicateParams.set('rows[1][unit]', 'package');
    duplicateParams.set('rows[1][location]', 'pantry');
    duplicateParams.set('rows[1][expirationDate]', '');
    duplicateParams.set('rows[1][dateType]', '');
    let response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: duplicateParams
    });
    let body = await response.text();
    assert.equal(response.status, 200);
    assert.ok(body.indexOf('value="Milk"') < body.indexOf('value="Milk"', body.indexOf('value="Milk"') + 1));
    assert.match(body, /value="Rice"/);

    const moveParams = new URLSearchParams();
    moveParams.set('action', 'move-down');
    moveParams.set('actionRowIndex', '0');
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
    let response2 = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: moveParams
    });
    body = await response2.text();
    assert.equal(response2.status, 200);
    assert.ok(body.indexOf('value="Rice"') < body.indexOf('value="Milk"'));

    const removeParams = new URLSearchParams();
    removeParams.set('action', 'remove-row');
    removeParams.set('actionRowIndex', '0');
    removeParams.set('rows[0][name]', 'Milk');
    removeParams.set('rows[0][quantity]', '2');
    removeParams.set('rows[0][unit]', 'package');
    removeParams.set('rows[0][location]', 'fridge');
    removeParams.set('rows[0][expirationDate]', '');
    removeParams.set('rows[0][dateType]', '');
    removeParams.set('rows[1][name]', 'Rice');
    removeParams.set('rows[1][quantity]', '1');
    removeParams.set('rows[1][unit]', 'package');
    removeParams.set('rows[1][location]', 'pantry');
    removeParams.set('rows[1][expirationDate]', '');
    removeParams.set('rows[1][dateType]', '');
    let response3 = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: removeParams
    });
    body = await response3.text();
    assert.equal(response3.status, 200);
    assert.doesNotMatch(body, /value="Milk"/);
    assert.match(body, /value="Rice"/);
  } finally {
    server.close();
  }
});

test('GET / exposes a discoverable link into manual intake', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Start a manual intake batch/);
    assert.match(body, /href="\/batches\/manual"/);
  } finally {
    server.close();
  }
});

test('manual batch editor markup provides deterministic Enter-key advancement handling', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/batches/manual`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /form\.addEventListener\('keydown'/);
    assert.match(body, /event\.key !== 'Enter'/);
    assert.match(body, /data-row-submit-index/);
    assert.match(body, /requestSubmit\(submitter\)/);
  } finally {
    server.close();
  }
});

test('POST /batches/manual can render and save twenty rows without navigation away', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    let response = await fetch(`http://127.0.0.1:${port}/batches/manual`);
    let body = await response.text();
    assert.equal(response.status, 200);

    for (let totalRows = 2; totalRows <= 20; totalRows += 1) {
      const addParams = new URLSearchParams();
      addParams.set('action', 'add-row');
      addParams.set('defaultLocation', 'pantry');

      for (let index = 0; index < totalRows - 1; index += 1) {
        addParams.set(`rows[${index}][name]`, `Item ${index + 1}`);
        addParams.set(`rows[${index}][quantity]`, '1');
        addParams.set(`rows[${index}][unit]`, 'piece');
        addParams.set(`rows[${index}][location]`, index === 0 ? 'pantry' : '');
        addParams.set(`rows[${index}][expirationDate]`, '');
        addParams.set(`rows[${index}][dateType]`, '');
      }

      response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: addParams
      });
      body = await response.text();
      assert.equal(response.status, 200);
      assert.match(body, new RegExp(`rows\\[${totalRows - 1}\\]\\[name\\]`));
    }

    const saveParams = new URLSearchParams();
    saveParams.set('action', 'save');
    for (let index = 0; index < 20; index += 1) {
      saveParams.set(`rows[${index}][name]`, `Item ${index + 1}`);
      saveParams.set(`rows[${index}][quantity]`, '1');
      saveParams.set(`rows[${index}][unit]`, 'piece');
      saveParams.set(`rows[${index}][location]`, index === 0 ? 'pantry' : '');
      saveParams.set(`rows[${index}][expirationDate]`, '');
      saveParams.set(`rows[${index}][dateType]`, '');
    }

    response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: saveParams
    });
    body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /value="Item 20"/);

    response = await fetch(`http://127.0.0.1:${port}/batches/manual`);
    body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /value="Item 20"/);
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
test('POST /batches/manual shows success notices for draft saves and row actions', async () => {
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
    params.set('rows[0][location]', 'fridge');
    params.set('rows[0][expirationDate]', '2026-08-20');
    params.set('rows[0][dateType]', 'best_before');
    params.set('rows[1][name]', '');
    params.set('rows[1][quantity]', '');
    params.set('rows[1][unit]', '');
    params.set('rows[1][location]', '');

    // Ground rule 3: saving a batch forwards to the batch page/report.
    const response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
      redirect: 'manual'
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/batches/manual?notice=saved');

    const draftPage = await fetch(`http://127.0.0.1:${port}/batches/manual?notice=saved`);
    const body = await draftPage.text();
    assert.equal(draftPage.status, 200);
    assert.match(body, /Draft batch saved\./);
    assert.match(body, /class="app-nav"/);
    assert.match(body, /href="\/batches\/manual"/);

    const addParams = new URLSearchParams();
    addParams.set('action', 'add-row');
    addParams.set('defaultLocation', 'pantry');
    addParams.set('rows[0][name]', 'Milk');
    addParams.set('rows[0][quantity]', '2');

    const addResponse = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: addParams
    });
    const addBody = await addResponse.text();
    assert.equal(addResponse.status, 200);
    assert.match(addBody, /Row added\./);
  } finally {
    server.close();
  }
});

test('saving a manual batch directly adds items to inventory and returns with a notice', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const params = new URLSearchParams();
    params.set('action', 'save-to-inventory');
    params.set('defaultLocation', 'pantry');
    params.set('rows[0][name]', 'Milk Confirm');
    params.set('rows[0][quantity]', '3');
    params.set('rows[0][unit]', 'package');
    params.set('rows[0][location]', 'fridge');
    params.set('rows[0][expirationDate]', '2026-08-20');
    params.set('rows[0][dateType]', 'best_before');

    const response = await fetch(`http://127.0.0.1:${port}/batches/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
      redirect: 'manual'
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/inventory?notice=confirmed&created=1');

    const inventoryResponse = await fetch(`http://127.0.0.1:${port}/inventory?notice=confirmed&created=1`);
    const body = await inventoryResponse.text();
    assert.equal(inventoryResponse.status, 200);
    assert.match(body, /Batch confirmed\. 1 item\(s\) added to inventory\./);
    assert.match(body, /Milk Confirm/);
  } finally {
    server.close();
  }
});

test('manual batch editor offers direct save to inventory and no review detour', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/batches/manual`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Save to inventory/);
    assert.doesNotMatch(body, /Review batch/);
  } finally {
    server.close();
  }
});

test('direct save re-renders the editor with validation errors and preserved values', async () => {
  await resetBatchTables();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const params = new URLSearchParams();
    params.set('action', 'save-to-inventory');
    params.set('defaultLocation', 'pantry');
    params.set('rows[0][name]', 'Milk');
    params.set('rows[0][quantity]', '-1');
    params.set('rows[0][unit]', 'package');
    params.set('rows[0][location]', 'fridge');
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

    const inventoryCount = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items');
    assert.equal(inventoryCount.rows[0].count, 0);
  } finally {
    server.close();
  }
});
