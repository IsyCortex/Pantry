const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/pool');
const { createApp } = require('../src/app');

async function resetInventoryTable() {
  await pool.query('TRUNCATE TABLE inventory_items RESTART IDENTITY');
}

async function logAllInventoryItems(label) {
  const rows = await pool.query(`SELECT id, name, quantity, unit, location, expiration_date::text AS expiration_date, date_type, lifecycle_status FROM inventory_items ORDER BY id`);
  console.log(`[inventory.route.test] ${label}: ${JSON.stringify(rows.rows)}`);
}

async function insertInventoryItem(item) {
  const sql = `INSERT INTO inventory_items (name, quantity, unit, location, expiration_date, date_type, lifecycle_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`;
  console.log('[inventory.route.test] SQL:', sql.replace(/\s+/g, ' ').trim());
  console.log('[inventory.route.test] PARAMS:', JSON.stringify([
    item.name,
    item.quantity,
    item.unit,
    item.location,
    item.expirationDate,
    item.dateType,
    item.lifecycleStatus || 'active'
  ]));
  await pool.query(
    sql,
    [item.name, item.quantity, item.unit, item.location, item.expirationDate, item.dateType, item.lifecycleStatus || 'active']
  );
}

test('displays active inventory items and excludes inactive items', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before', lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'Bread', quantity: 1, unit: 'package', location: 'pantry', expirationDate: null, dateType: null, lifecycleStatus: 'used_up' });
  await insertInventoryItem({ name: 'Soup', quantity: 1, unit: 'package', location: 'pantry', expirationDate: null, dateType: null, lifecycleStatus: 'discarded' });
  await logAllInventoryItems('test10-after-population');

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Milk/);
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
  } finally {
    server.close();
  }
});

test('retrieval failure produces a safe error page', async () => {
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
  } finally {
    server.close();
  }
});