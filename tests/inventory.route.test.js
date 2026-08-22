    const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetAllTables } = require('./helpers/test-db');
const { createApp } = require('../src/app');

async function resetInventoryTable() {
  await resetAllTables();
}

async function insertInventoryItem(item) {
  await pool.query(
    `INSERT INTO inventory_items (name, quantity, unit, location, expiration_date, date_type, lifecycle_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [item.name, item.quantity, item.unit, item.location, item.expirationDate, item.dateType, item.lifecycleStatus || 'active']
  );
}

test('displays active inventory items and excludes inactive items', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before', lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'Bread', quantity: 1, unit: 'package', location: 'pantry', expirationDate: null, dateType: null, lifecycleStatus: 'used_up' });
  await insertInventoryItem({ name: 'Soup', quantity: 1, unit: 'package', location: 'pantry', expirationDate: null, dateType: null, lifecycleStatus: 'discarded' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Milk/);
    assert.match(body, /Edit item/);
    assert.doesNotMatch(body, /Bread/);
    assert.doesNotMatch(body, /Soup/);
  } finally {
    server.close();
  }
});

test('shows optional fields and undated state with user-facing language', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Yoghurt', quantity: 6, unit: 'piece', location: 'fridge', expirationDate: '2026-08-22', dateType: 'unspecified', lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'Rice', quantity: null, unit: null, location: 'pantry', expirationDate: null, dateType: null, lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Quantity: 6 piece/);
    assert.match(body, /Date type not specified: 2026-08-22/);
    assert.match(body, /No expiration date/);
  } finally {
    server.close();
  }
});

test('shows useful empty-state orientation', async () => {
  await resetInventoryTable();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory`);
    const body = await response.text();
    assert.equal(response.status, 200);
        assert.match(body, /No food has been added yet/);
    assert.match(body, /Confirmed batches populate the inventory/);
    assert.match(body, /Manual intake is the next step/);
    assert.match(body, /href="\/batches\/manual"/);
    assert.match(body, /class="primary-btn"/);
    assert.match(body, /Add item to inventory/);
  } finally {
    server.close();
  }
});

test('retrieval failure produces a safe error page', async () => {
  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => {
    loggedErrors.push(args);
  };

  const app = createApp({ inventoryLoader: async () => {
    throw new Error('INVENTORY_TEST_FAILURE');
  }});
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory`);
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.match(body, /Inventory could not be loaded right now\./);
    assert.doesNotMatch(body, /SELECT|postgres|inventory_items|Error:/i);
    assert.equal(loggedErrors.length, 1);
    assert.match(String(loggedErrors[0][0]), /INVENTORY_TEST_FAILURE/);
  } finally {
    server.close();
    console.error = originalConsoleError;
  }
});

test('GET /inventory/:id/edit renders the edit interface for a confirmed item', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before', lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory/1/edit`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Edit inventory item/);
    assert.match(body, /Mark used up/);
    assert.match(body, /Mark discarded/);
  } finally {
    server.close();
  }
});

test('POST /inventory/:id/edit preserves submitted values when validation fails', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before', lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const params = new URLSearchParams();
    params.set('name', ' ');
    params.set('quantity', '-1');
    params.set('unit', 'package');
    params.set('location', 'garage');
    params.set('expirationDate', '');
    params.set('dateType', '');

    const response = await fetch(`http://127.0.0.1:${port}/inventory/1/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /Validation errors/);
    assert.match(body, /value="-1"/);
  } finally {
    server.close();
  }
});

test('removal actions follow the protected user-facing path and remove items from active inventory', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: null, dateType: null, lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    let response = await fetch(`http://127.0.0.1:${port}/inventory/1/use-up`);
    let body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Confirm that you want to mark/);
    assert.match(body, /Confirm used up/);

    response = await fetch(`http://127.0.0.1:${port}/inventory/1/use-up/confirm`, { method: 'POST' });
    assert.equal(response.status, 200);

    response = await fetch(`http://127.0.0.1:${port}/inventory`);
    body = await response.text();
    assert.doesNotMatch(body, /Milk/);

    await resetInventoryTable();
    await insertInventoryItem({ name: 'Soup', quantity: 1, unit: 'package', location: 'pantry', expirationDate: null, dateType: null, lifecycleStatus: 'active' });

    response = await fetch(`http://127.0.0.1:${port}/inventory/1/discard`);
    body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Confirm discarded/);

    response = await fetch(`http://127.0.0.1:${port}/inventory/1/discard/confirm`, { method: 'POST' });
    assert.equal(response.status, 200);

    response = await fetch(`http://127.0.0.1:${port}/inventory`);
    body = await response.text();
    assert.doesNotMatch(body, /Soup/);
  } finally {
    server.close();
  }
});

test('ordinary edit route does not remove or reactivate lifecycle state', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: null, dateType: null, lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const params = new URLSearchParams();
    params.set('name', 'Oat Milk');
    params.set('quantity', '3');
    params.set('unit', 'package');
    params.set('location', 'pantry');
    params.set('expirationDate', '');
    params.set('dateType', '');

    const response = await fetch(`http://127.0.0.1:${port}/inventory/1/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params
    });
    assert.equal(response.status, 200);

        const row = await pool.query('SELECT lifecycle_status, removed_at FROM inventory_items WHERE id = 1');
    assert.equal(row.rows[0].lifecycle_status, 'active');
    assert.equal(row.rows[0].removed_at, null);
  } finally {
    server.close();
  }
});

test('POST /inventory/:id/edit shows a success notice and the global navigation', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before', lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const params = new URLSearchParams();
    params.set('name', 'Oat Milk');
    params.set('quantity', '4');
    params.set('unit', 'package');
    params.set('location', 'pantry');
    params.set('expirationDate', '2026-10-10');
    params.set('dateType', 'best_before');

    const response = await fetch(`http://127.0.0.1:${port}/inventory/1/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
      redirect: 'manual'
    });
    // Ground rule 3: saving an inventory item forwards to the inventory report.
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/inventory?notice=updated');

    const inventoryResponse = await fetch(`http://127.0.0.1:${port}/inventory?notice=updated`);
    const body = await inventoryResponse.text();
    assert.equal(inventoryResponse.status, 200);
    assert.match(body, /Inventory item updated successfully\./);
    assert.match(body, /Oat Milk/);
    assert.match(body, /class="app-nav"/);
    assert.match(body, /href="\/inventory"/);
  } finally {
    server.close();
  }
});

test('removal confirmation redirects back to inventory with a success notice', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: null, dateType: null, lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const confirmResponse = await fetch(`http://127.0.0.1:${port}/inventory/1/use-up/confirm`, { method: 'POST', redirect: 'manual' });
    assert.equal(confirmResponse.status, 302);
    assert.equal(confirmResponse.headers.get('location'), '/inventory?notice=used_up');

    const inventoryResponse = await fetch(`http://127.0.0.1:${port}/inventory?notice=used_up`);
    const inventoryBody = await inventoryResponse.text();
    assert.match(inventoryBody, /Item marked as used up\./);
    assert.doesNotMatch(inventoryBody, /Milk/);
  } finally {
    server.close();
  }
});

test('inventory overview exposes client-side sort controls and sortable item fields', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Pears', quantity: 3, unit: 'piece', location: 'pantry', expirationDate: '2026-08-30', dateType: 'best_before', lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'Apples', quantity: 5, unit: 'piece', location: 'fridge', expirationDate: '2026-08-25', dateType: 'best_before', lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'Flour', quantity: 1, unit: 'kg', location: 'pantry', expirationDate: null, dateType: null, lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory`);
    const body = await response.text();
    assert.equal(response.status, 200);
    // Sort controls (client-only; no query params involved).
    assert.match(body, /data-sort="date"/);
    assert.match(body, /data-sort="location"/);
    assert.match(body, /inventory-sort\.js/);
    // Per-item sortable fields.
        assert.match(body, /data-date="2026-08-25"/);
    assert.match(body, /data-date="2026-08-30"/);
    assert.match(body, /data-date=""/);
    assert.match(body, /data-location="fridge"/);
    assert.match(body, /data-location="pantry"/);
    // Primary add-item call-to-action is surfaced on the overview.
    assert.match(body, /href="\/batches\/manual"/);
    assert.match(body, /class="primary-btn"/);
  } finally {
    server.close();
  }
});