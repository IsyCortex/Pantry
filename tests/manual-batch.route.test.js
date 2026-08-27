'use strict';

// Ticket 4.2 — route-level behavior of the advisory duplicate warnings on
// the manual batch editor. Warnings are informational at every path: they
// render server-side against ACTIVE inventory, never block validation or
// confirmation, and confirmation never merges or deduplicates anything.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetAllTables } = require('./helpers/test-db');
const { createApp } = require('../src/app');
const {
  createConfirmedInventoryItem,
  getActiveInventoryForDisplay
} = require('../src/services/inventory-service');

function startServer(app) {
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

async function postForm(base, fields, options = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value != null) params.set(key, String(value));
  }
  return fetch(`${base}/batches/manual`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
    redirect: options.redirect || 'follow'
  });
}

function rowFields(index, row) {
  return {
    [`rows[${index}][name]`]: row.name ?? '',
    [`rows[${index}][quantity]`]: row.quantity ?? '',
    [`rows[${index}][unit]`]: row.unit ?? '',
    [`rows[${index}][location]`]: row.location ?? '',
    [`rows[${index}][expirationDate]`]: row.expirationDate ?? '',
    [`rows[${index}][dateType]`]: row.dateType ?? '',
    [`rows[${index}][accepted]`]: row.accepted ?? 'on'
  };
}

async function seedActiveItem(overrides) {
  return createConfirmedInventoryItem({
    name: 'Milk',
    quantity: 2,
    unit: 'package',
    location: 'fridge',
    expirationDate: null,
    dateType: null,
    ...overrides
  });
}

test('draft rows that plausibly duplicate active inventory render an advisory warning', async () => {
  await resetAllTables();
  await seedActiveItem({});

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const savedDraft = await postForm(base, {
      action: 'save',
      defaultLocation: '',
      ...rowFields(0, { name: 'miik', quantity: '1', unit: 'package', location: 'fridge' })
    });
    // fetch follows the save redirect by default; the landed page is the
    // reloaded editor with its confirmation banner.
    assert.equal(savedDraft.status, 200);
    assert.match(await savedDraft.text(), /Draft batch saved\./);

    const response = await fetch(`${base}/batches/manual`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Manual intake batch/);
    assert.match(body, /class="duplicate-warning-title">Possible duplicates already in your inventory/);
    assert.match(body, /data-duplicate-warning="0"/);
    assert.match(body, />Milk</);
    assert.match(body, /Saving keeps both entries side by side/);
    assert.match(body, /data-name-suggest/);
  } finally {
    server.close();
  }
});

test('lookalike but distinct products never warn', async () => {
  await resetAllTables();
  await seedActiveItem({});

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const savedDraft = await postForm(base, {
      action: 'save',
      defaultLocation: '',
      ...rowFields(0, { name: 'Buttermilk', quantity: '1', unit: 'package', location: 'fridge' })
    });
    assert.equal(savedDraft.status, 200);
    await savedDraft.text();

    const response = await fetch(`${base}/batches/manual`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!body.includes('class="duplicate-warning-title"'));
    assert.match(body, /data-duplicate-warning="0"/);
    assert.match(body, /hidden/);
  } finally {
    server.close();
  }
});

test('add-row re-render also carries advisory warnings', async () => {
  await resetAllTables();
  await seedActiveItem({});

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    await fetch(`${base}/batches/manual`);
    const response = await postForm(base, {
      action: 'add-row',
      defaultLocation: '',
      ...rowFields(0, { name: 'milk', quantity: '1' })
    });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Row added\./);
    assert.match(body, /class="duplicate-warning-title">Possible duplicates already in your inventory/);
  } finally {
    server.close();
  }
});

test('warnings never block save-to-inventory validation handling', async () => {
  await resetAllTables();
  await seedActiveItem({});

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const response = await postForm(base, {
      action: 'save-to-inventory',
      defaultLocation: '',
      ...rowFields(0, { name: 'MILK', quantity: '-2', unit: 'package', location: 'fridge' })
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /value="MILK"/);
    assert.match(body, /class="duplicate-warning-title">Possible duplicates already in your inventory/);

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items');
    assert.equal(rows[0].count, 1);
  } finally {
    server.close();
  }
});

test('confirmation succeeds despite a warning and keeps BOTH entries (no merge)', async () => {
  await resetAllTables();
  const stored = await seedActiveItem({});

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const response = await postForm(base, {
      action: 'save-to-inventory',
      defaultLocation: '',
      ...rowFields(0, { name: 'MILK', quantity: '1', unit: 'package', location: 'pantry' })
    }, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location'), /\/inventory\?notice=confirmed&created=1$/);

    const items = await getActiveInventoryForDisplay();
    assert.equal(items.length, 2);
    const names = items.map((item) => item.name).sort();
    assert.deepEqual(names, ['MILK', 'Milk']);
    assert.ok(items.every((item) => item.id !== stored.id));
  } finally {
    server.close();
  }
});

test('GET /inventory/duplicate-check exposes matches as read-only JSON', async () => {
  await resetAllTables();
  await seedActiveItem({});

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const hit = await fetch(`http://127.0.0.1:${port}/inventory/duplicate-check?q=miik`);
    assert.equal(hit.status, 200);
    const payload = await hit.json();
    assert.equal(payload.query, 'miik');
    assert.ok(Array.isArray(payload.matches) && payload.matches.length >= 1);
    assert.equal(payload.matches[0].matchedItem.name, 'Milk');
    assert.equal(typeof payload.matches[0].rule, 'string');
    assert.ok(!('write' in payload) && !('confirm' in payload));

    const blank = await fetch(`http://127.0.0.1:${port}/inventory/duplicate-check?q=%20`);
    assert.equal(blank.status, 200);
    const blankPayload = await blank.json();
    assert.deepEqual(blankPayload.matches, []);
  } finally {
    server.close();
  }
});
