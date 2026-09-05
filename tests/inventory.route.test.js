    const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetAllTables } = require('./helpers/test-db');
const { createApp } = require('../src/app');
const { todayInZone } = require('../src/services/app-date');

async function resetInventoryTable() {
  await resetAllTables();
}

// Expiration status derives from the application's dedicated calendar day
// (Europe/Berlin, Ticket 3.1). Tests that assert statuses must derive their
// fixtures from the same "today" so they never drift stale with the wall
// clock (Ticket 5.1 corrective fix).
const today = () => todayInZone('Europe/Berlin');

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
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
    assert.match(body, /value="2026-08-20"/);
    assert.match(body, /value="best_before" selected>/);
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

test('inventory overview renders per-item fields and primary CTA without obsolete client-side sort controls', async () => {
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
    // The obsolete client-side sort controls and script are removed; the
    // server-side expiration-prioritized ordering (Ticket 3.2) is now the
    // single ordering mechanism on the overview.
    assert.doesNotMatch(body, /data-sort=/);
    assert.doesNotMatch(body, /inventory-sort\.js/);
    // Per-item fields still render for display (retained as inert hooks).
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

test('inventory defaults to expiration-prioritized order with accessible badges', async () => {
  await resetInventoryTable();
  const expiry = today();
  // Inserted deliberately out of priority order; ids alone must not decide.
  await insertInventoryItem({ name: 'Zucchini', quantity: 1, unit: 'piece', location: 'fridge', expirationDate: addDays(expiry, 30), dateType: 'best_before', lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'Yoghurt', quantity: 2, unit: 'package', location: 'fridge', expirationDate: addDays(expiry, 3), dateType: 'use_by', lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: 'carton', location: 'fridge', expirationDate: addDays(expiry, -1), dateType: 'use_by', lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'Flour', quantity: 1, unit: 'kg', location: 'pantry', expirationDate: null, dateType: null, lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory`);
    const body = await response.text();
    assert.equal(response.status, 200);

    // Expired (Milk) -> expiring_soon (Yoghurt) -> later (Zucchini);
    // undated Flour stays visible, last.
    const positionOf = (name) => body.indexOf(name);
    assert.ok(positionOf('Milk') > -1, 'expired item rendered');
    assert.ok(positionOf('Milk') < positionOf('Yoghurt'), 'expired before soon');
    assert.ok(positionOf('Yoghurt') < positionOf('Zucchini'), 'soon before later');
    assert.ok(positionOf('Zucchini') < positionOf('Flour'), 'undated last but present');

    // Status indicators do not rely on color alone: each badge pairs a glyph
    // with its text label inside the same element.
    assert.match(body, /status-badge status-expired[^>]*><span class="status-glyph" aria-hidden="true">[^<]+<\/span>Expired</);
    assert.match(body, /status-badge status-expiring-soon[^>]*><span class="status-glyph" aria-hidden="true">[^<]+<\/span>Expiring soon</);
    assert.match(body, /status-badge status-later[^>]*><span class="status-glyph" aria-hidden="true">[^<]+<\/span>Later</);
  } finally {
    server.close();
  }
});

// --- Ticket 3.3: filter and search ---

async function fetchInventory(port, query) {
  const response = await fetch(`http://127.0.0.1:${port}/inventory${query}`);
  return { response, body: await response.text() };
}

test('filters inventory by storage location and keeps the selection visible', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: 'carton', location: 'fridge', expirationDate: '2026-08-01', dateType: 'use_by' });
  await insertInventoryItem({ name: 'Rice', quantity: 1, unit: 'kg', location: 'pantry', expirationDate: null, dateType: null });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const { response, body } = await fetchInventory(port, '?location=fridge');
    assert.equal(response.status, 200);
    assert.match(body, /Milk/);
    assert.doesNotMatch(body, />Rice</);

    // Active filter is visible: preserved selection + summary chips.
    assert.match(body, /<option value="fridge" selected>/);
    assert.match(body, /filter-chip">Location: fridge</);
    assert.match(body, /Showing 1 of 2 item\(s\)/);
    assert.match(body, /href="\/inventory">Clear all filters</);
  } finally {
    server.close();
  }
});

test('filters inventory by derived expiration status', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: 'carton', location: 'fridge', expirationDate: '2026-08-01', dateType: 'use_by' });
  await insertInventoryItem({ name: 'Cheese', quantity: 1, unit: 'piece', location: 'freezer', expirationDate: '2026-12-01', dateType: 'best_before' });
  await insertInventoryItem({ name: 'Rice', quantity: 1, unit: 'kg', location: 'pantry', expirationDate: null, dateType: null });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    let { response, body } = await fetchInventory(port, '?status=no_date');
    assert.equal(response.status, 200);
    assert.match(body, /Rice/);
    assert.doesNotMatch(body, />Milk</);
    assert.doesNotMatch(body, />Cheese</);
    assert.match(body, /<option value="no_date" selected>/);
    assert.match(body, /filter-chip">Status: No expiration date</);

    ({ response, body } = await fetchInventory(port, '?status=expired'));
    assert.equal(response.status, 200);
    assert.match(body, /Milk/);
    assert.doesNotMatch(body, />Rice</);
    assert.doesNotMatch(body, />Cheese</);
  } finally {
    server.close();
  }
});

test('searches by item name case-insensitively as a substring', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Oat Milk', quantity: 1, unit: 'carton', location: 'fridge', expirationDate: '2026-08-27', dateType: 'use_by' });
  await insertInventoryItem({ name: 'Yoghurt', quantity: 2, unit: 'package', location: 'fridge', expirationDate: '2026-09-30', dateType: 'best_before' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    for (const term of ['oat', 'OAT']) {
      const { response, body } = await fetchInventory(port, `?q=${term}`);
      assert.equal(response.status, 200);
      assert.match(body, /Oat Milk/);
      assert.doesNotMatch(body, />Yoghurt</);
    }

    // Search term stays visible in the input.
    const { body } = await fetchInventory(port, '?q=oat');
    assert.match(body, /value="oat"/);
    assert.match(body, /filter-chip">Search: &quot;oat&quot;</);
  } finally {
    server.close();
  }
});

test('combined filters intersect and clearing restores the full list', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: 'carton', location: 'fridge', expirationDate: '2026-08-01', dateType: 'use_by' });
  await insertInventoryItem({ name: 'Margarine', quantity: 1, unit: 'package', location: 'fridge', expirationDate: '2026-12-01', dateType: 'best_before' });
  await insertInventoryItem({ name: 'Rice', quantity: 1, unit: 'kg', location: 'pantry', expirationDate: null, dateType: null });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const { response, body } = await fetchInventory(port, '?location=fridge&status=expired&q=mil');
    assert.equal(response.status, 200);
    assert.match(body, /Milk/);
    assert.doesNotMatch(body, />Margarine</);
    assert.doesNotMatch(body, />Rice</);

    // Clearing via the unfiltered URL shows everything again.
    const cleared = await fetchInventory(port, '');
    assert.match(cleared.body, /Milk/);
    assert.match(cleared.body, /Margarine/);
    assert.match(cleared.body, /Rice/);
  } finally {
    server.close();
  }
});

test('empty filtered results are distinct from an empty inventory', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: 'carton', location: 'fridge', expirationDate: '2026-08-01', dateType: 'use_by' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    // Items exist, but no match -> filtered-empty message, NOT the
    // "nothing added yet" orientation.
    const filtered = await fetchInventory(port, '?q=zzz-nothing-matches');
    assert.equal(filtered.response.status, 200);
    assert.match(filtered.body, /No items match the active filters\./);
    assert.doesNotMatch(filtered.body, /No food has been added yet\./);

    // Truly empty inventory -> original orientation, no filter form.
    await resetInventoryTable();
    const empty = await fetchInventory(port, '');
    assert.equal(empty.response.status, 200);
    assert.match(empty.body, /No food has been added yet\./);
    assert.doesNotMatch(empty.body, /class="filter-form"/);
  } finally {
    server.close();
  }
});

test('unknown or repeated filter values are ignored instead of hiding inventory', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: 'carton', location: 'fridge', expirationDate: '2026-08-01', dateType: 'use_by' });
  await insertInventoryItem({ name: 'Rice', quantity: 1, unit: 'kg', location: 'pantry', expirationDate: null, dateType: null });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const { response, body } = await fetchInventory(port, '?location=junk&status=bogus');
    assert.equal(response.status, 200);
    assert.match(body, /Milk/);
    assert.match(body, /Rice/);
    assert.doesNotMatch(body, /selected>/);
    assert.doesNotMatch(body, /filter-chip/);
  } finally {
    server.close();
  }
});
// --- Ticket 3.4: expiration overview ---

function countInventoryItems(body) {
  const matches = body.match(/class="inventory-item"/g);
  return matches ? matches.length : 0;
}

test('expiration overview shows immediate counts that match filtered inventory results', async () => {
  await resetInventoryTable();
  const expiry = today();
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: 'carton', location: 'fridge', expirationDate: addDays(expiry, -5), dateType: 'use_by' }); // expired
  await insertInventoryItem({ name: 'Yoghurt', quantity: 2, unit: 'package', location: 'fridge', expirationDate: addDays(expiry, 3), dateType: 'best_before' }); // expiring soon (day 3)
  await insertInventoryItem({ name: 'Cheese', quantity: 1, unit: 'piece', location: 'freezer', expirationDate: addDays(expiry, 60), dateType: 'best_before' }); // later
  await insertInventoryItem({ name: 'Flour', quantity: 1, unit: 'kg', location: 'pantry', expirationDate: null, dateType: null }); // no_date

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const overviewResponse = await fetch(`http://127.0.0.1:${port}/inventory`);
    const overview = await overviewResponse.text();
    assert.equal(overviewResponse.status, 200);

    // Every count card links to the corresponding filtered inventory view.
    const cardRe = /<a class="overview-card overview-[\w-]+" href="\/inventory\?status=([\w_]+)">\s*<span class="overview-number">(\d+)<\/span>\s*<span class="overview-label">([^<]+)<\/span>\s*<\/a>/g;
    const links = new Map();
    let m;
    while ((m = cardRe.exec(overview)) !== null) {
      links.set(m[1], { count: Number(m[2]), label: m[3] });
    }

    // The three required categories are present and immediately visible.
    assert.ok(links.has('expired'), 'expired card present');
    assert.ok(links.has('expiring_soon'), 'expiring_soon card present');
    assert.ok(links.has('no_date'), 'no_date card present');
    assert.ok(links.has('later'), 'later card present');

    assert.deepEqual(links.get('expired').count, 1);
    assert.deepEqual(links.get('expiring_soon').count, 1);
    assert.deepEqual(links.get('later').count, 1);
    assert.deepEqual(links.get('no_date').count, 1);

    // Each overview count must equal the number of items the targeted
    // filtered inventory view actually returns (consistency).
    for (const status of ['expired', 'expiring_soon', 'later', 'no_date']) {
      const filtered = await fetch(`http://127.0.0.1:${port}/inventory?status=${status}`);
      const body = await filtered.text();
      assert.equal(filtered.status, 200);
      assert.equal(countInventoryItems(body), links.get(status).count,
        `overview count for '${status}' matches its filtered view`);
      assert.match(body, new RegExp(`<option value="${status}" selected>`), `filter preserved for ${status}`);
    }
  } finally {
    server.close();
  }
});

test('expiration overview renders a useful zero state when nothing is expiring', async () => {
  await resetInventoryTable();
  // Only far-future dated and undated items: nothing expired or expiring soon.
  await insertInventoryItem({ name: 'Cheese', quantity: 1, unit: 'piece', location: 'freezer', expirationDate: '2026-12-01', dateType: 'best_before' });
  await insertInventoryItem({ name: 'Flour', quantity: 1, unit: 'kg', location: 'pantry', expirationDate: null, dateType: null });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Nothing is expired or expiring soon\./);
    assert.match(body, /class="overview-card overview-expired"/);
    assert.match(body, /class="overview-card overview-expiring-soon"/);
  } finally {
    server.close();
  }
});

test('expiration overview is not shown for a truly empty inventory', async () => {
  await resetInventoryTable();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /No food has been added yet\./);
    assert.doesNotMatch(body, /expiry-overview/);
  } finally {
    server.close();
  }
});
// ---------------------------------------------------------------------------
// Ticket 4.1 — item-name suggestions endpoint and entry-form integration
// ---------------------------------------------------------------------------

test('GET /inventory/name-suggestions ranks household entries and includes prior (inactive) entries', async () => {
  await resetInventoryTable();
  // Active entries for Milk (fridge twice, pantry once).
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: null, location: 'fridge', expirationDate: '2026-09-01', dateType: 'best_before', lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: null, location: 'pantry', expirationDate: null, dateType: null, lifecycleStatus: 'active' });
  await insertInventoryItem({ name: 'milk ', quantity: 1, unit: null, location: 'fridge', expirationDate: null, dateType: null, lifecycleStatus: 'active' });
  // Prior entries: a removed product the household used before…
  await insertInventoryItem({ name: 'Oat Milk', quantity: 1, unit: null, location: 'freezer', expirationDate: null, dateType: null, lifecycleStatus: 'used_up' });
  // …and a similar-but-distinct active name that must stay its own candidate.
  await insertInventoryItem({ name: 'Buttermilk', quantity: 1, unit: null, location: 'fridge', expirationDate: null, dateType: null, lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const before = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items');
    const response = await fetch(`http://127.0.0.1:${port}/inventory/name-suggestions?q=milk`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    const data = await response.json();
    assert.equal(data.query, 'milk');

    // Ranking: 'milk ' and Milk dedupe to one top candidate (startsWith,
    // highest frequency); containing names follow, prior entries included.
    assert.deepEqual(data.suggestions.map((suggestion) => suggestion.name), ['Milk', 'Buttermilk', 'Oat Milk']);
    assert.deepEqual(data.suggestions[0], { name: 'Milk', location: 'fridge' });
    assert.deepEqual(data.suggestions[2], { name: 'Oat Milk', location: 'freezer' });

    // Suggestions never create anything: read-only endpoint over stored data.
    const after = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items');
    assert.equal(after.rows[0].count, before.rows[0].count);
  } finally {
    server.close();
  }
});

test('GET /inventory/name-suggestions treats blank or unknown queries as an empty candidate list', async () => {
  await resetInventoryTable();
  await insertInventoryItem({ name: 'Milk', quantity: 1, unit: null, location: 'fridge', expirationDate: null, dateType: null, lifecycleStatus: 'active' });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    for (const query of ['', '%20%20', 'qwertyzz']) {
      const response = await fetch(`http://127.0.0.1:${port}/inventory/name-suggestions?q=${query}`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.suggestions, []);
    }
  } finally {
    server.close();
  }
});

test('GET /inventory/name-suggestions degrades safely when suggestions fail', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  const app = createApp({
    nameSuggestionProvider: async () => {
      throw new Error('SUGGESTIONS_TEST_FAILURE');
    }
  });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/inventory/name-suggestions?q=mil`);
    assert.equal(response.status, 500);
    const data = await response.json();
    assert.match(data.error, /unavailable/i);
    assert.doesNotMatch(JSON.stringify(data), /SELECT|postgres|inventory_items/i);
  } finally {
    server.close();
    console.error = originalConsoleError;
  }
});

test('manual batch form renders the accessible suggestion hooks and never prefills by itself', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/batches/manual`);
    const body = await response.text();
    assert.equal(response.status, 200);
    // Combobox/listbox wiring exists for every row's Name field.
    assert.match(body, /data-enter-target="name"/);
    assert.match(body, /role="combobox"/);
    assert.match(body, /aria-controls="name-suggestions-0"/);
    assert.match(body, /role="listbox"/);
    assert.match(body, /aria-label="Previously used item names"/);
    // The client reads candidates from the read-only JSON endpoint…
    assert.match(body, /\/inventory\/name-suggestions\?q=/);
    // …and selection only prefills visible fields; saving stays explicit.
    assert.match(body, /Save to inventory/);
    assert.doesNotMatch(body.replace(/<%[\s\S]*?%>/g, ''), /auto(confirm|create)/i);
  } finally {
    server.close();
  }
});

test('every manual batch Name input carries the data-name-suggest hook the initializer selects (T4.1 regression)', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/batches/manual`);
    const body = await response.text();
    assert.equal(response.status, 200);

    // Rendered hook must exist on EVERY name input regardless of row count,
    // and must be exactly the attribute the inline initializer selects —
    // otherwise the combobox silently initializes zero inputs (the T4.1
    // regression this assertion pins).
    const inputTags = body.match(/<input\b[^>]*>/g) || [];
    const nameInputs = inputTags.filter((tag) =>
      tag.includes('name="rows[') && tag.includes('data-enter-target="name"'));
    assert.ok(nameInputs.length >= 1, 'manual batch form renders at least one Name input');
    for (const tag of nameInputs) {
      assert.match(tag, /data-name-suggest(=|[\s>])/, 'Name input must carry the data-name-suggest hook');
    }
    assert.match(body, /querySelectorAll\('input\[data-name-suggest\]'\)/,
      'initializer must select the same hook the markup renders');
  } finally {
    server.close();
  }
});
