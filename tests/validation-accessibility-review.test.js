'use strict';

// Ticket 5.1 (Issue #24) — validation, accessibility, and error review.
//
// Regression coverage for the review's six acceptance areas:
//   1. Specific, understandable validation messages (no technical row tokens).
//   2. Known application failures never expose implementation details.
//   3. Every rendered form control carries an accessible name.
//   4. Status is never conveyed by color alone.
//   5. (Documented keyboard/focus review lives in
//      docs/mvp-validation-accessibility-review.md — not a unit test.)
//   6. Important failure paths are covered by tests (this file).
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetAllTables } = require('./helpers/test-db');
const { createApp } = require('../src/app');
const {
  createConfirmedInventoryItem
} = require('../src/services/inventory-service');
const { saveManualDraftBatch, markBatchPendingReview } = require('../src/services/intake-batch-service');
const { todayInZone } = require('../src/services/app-date');

const EXPIRATION_TIMEZONE = 'Europe/Berlin';

function startServer(app) {
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

async function postForm(base, path, fields, { redirect = 'manual' } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value != null) params.set(key, String(value));
  }
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
    redirect
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

const TOKEN_LEAK_RE = /rows\[\d+\]\.\w+/;

// --- Accessible-name scan ---------------------------------------------

function textOf(fragment) {
  return (fragment || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns the list of rendered input/select/textarea/button elements that do
// not resolve to a programmatic name (wrapping label text, for/id pair,
// aria-label/aria-labelledby, or visible button text).
function findControlsWithoutAccessibleNames(body) {
  const missing = [];
  const controlRe = /<(input|select|textarea|button)\b([^>]*)>/g;
  let match;

  controlRe.lastIndex = 0;
  while ((match = controlRe.exec(body)) !== null) {
    const tag = match[1];
    const attrs = match[2];
    const start = match.index;

    if (/\btype\s*=\s*["']hidden["']/.test(attrs)) continue;
    if (/\b(?:aria-label|aria-labelledby)\s*=\s*["']/.test(attrs)) continue;

    let named = false;

    // Wrapping label: nearest <label ...> block that contains this control.
    const labelStart = body.lastIndexOf('<label', start);
    if (labelStart !== -1) {
      const labelEnd = body.indexOf('</label>', start);
      if (labelEnd !== -1 && labelStart < start && textOf(body.slice(labelStart, labelEnd))) {
        named = true;
      }
    }

    // for/id pairing.
    if (!named) {
      const idMatch = /\bid\s*=\s*["']([^"']+)["']/.exec(attrs);
      if (idMatch) {
        const forRe = new RegExp(
          '<label\\b[^>]*\\bfor\\s*=\\s*["\']' + idMatch[1] + '["\'][^>]*>([\\s\\S]*?)<\\/label>',
          'g'
        );
        const forMatch = forRe.exec(body);
        if (forMatch && textOf(forMatch[1])) named = true;
      }
    }

    // Visible button text.
    if (!named && tag === 'button') {
      const close = body.indexOf('</button>', start);
      if (close !== -1 && textOf(body.slice(start + match[0].length, close))) named = true;
    }

    if (!named) {
      missing.push({ tag, attrs: attrs.slice(0, 120) });
    }
  }

  return missing;
}

async function assertPageControlsNamed(base, path) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, `${path} should render`);
  const body = await response.text();
  const missing = findControlsWithoutAccessibleNames(body);
  assert.deepEqual(missing, [], `${path} has controls without accessible names`);
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// --- AC1: specific, understandable validation messages ------------------

test('manual save-to-inventory validation shows friendly row messages, not tokens', async () => {
  await resetAllTables();
  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const response = await postForm(base, '/batches/manual', {
      action: 'save-to-inventory',
      defaultLocation: '',
      ...rowFields(0, { name: 'Milk', quantity: 'abc', unit: '', location: 'fridge' })
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, />Row 1: Quantity must be a number greater than 0\.</);
    assert.ok(!TOKEN_LEAK_RE.test(body), 'technical row tokens must not appear');
  } finally {
    server.close();
  }
});

test('review correction validation shows friendly row messages, not tokens', async () => {
  await resetAllTables();
  const saved = await saveManualDraftBatch({
    rows: [{ name: 'Milk', quantity: '1', unit: '', location: 'fridge', expirationDate: '', dateType: '' }]
  });
  await markBatchPendingReview(saved.id);

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const response = await postForm(base, `/batches/${saved.id}/review`, {
      ...rowFields(0, { name: 'Milk', quantity: 'abc', unit: '', location: 'fridge' })
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, />Row 1: Quantity must be a number greater than 0\.</);
    assert.ok(!TOKEN_LEAK_RE.test(body), 'technical row tokens must not appear');
  } finally {
    server.close();
  }
});

test('inventory-edit validation shows friendly messages, not tokens', async () => {
  await resetAllTables();
  const item = await seedActiveItem({});

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const response = await postForm(base, `/inventory/${item.id}/edit`, {
      name: 'Milk',
      quantity: '-5',
      unit: '',
      location: 'fridge',
      expirationDate: '',
      dateType: ''
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, />Quantity must be a number greater than 0\.</);
    assert.ok(!TOKEN_LEAK_RE.test(body), 'technical row tokens must not appear');
  } finally {
    server.close();
  }
});

test('already-user-facing validation messages pass through unchanged', async () => {
  const { toUserValidationMessages } = require('../src/validation/user-messages');
  assert.deepEqual(
    toUserValidationMessages(['At least one included row is required to add items to the inventory.']),
    ['At least one included row is required to add items to the inventory.']
  );
  assert.deepEqual(
    toUserValidationMessages(['Accepted row 2 is invalid for confirmation']),
    ['Accepted row 2 is invalid for confirmation']
  );
});

// --- AC2: no implementation details leak --------------------------------

test('unhandled application failures return generic JSON without internals', async () => {
  await resetAllTables();
  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const response = await fetch(`${base}/batches/999999/confirm`, {
      method: 'POST',
      redirect: 'manual'
    });
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(body), { status: 'error', message: 'Internal server error' });
    assert.ok(!body.includes('NOT_FOUND'));
    assert.ok(!body.includes('    at '), 'no stack frames');
  } finally {
    server.close();
  }
});

// --- AC3: accessible names ----------------------------------------------

test('every rendered form control has an accessible name', async () => {
  await resetAllTables();
  const item = await seedActiveItem({});
  const saved = await saveManualDraftBatch({
    rows: [{ name: 'Milk', quantity: '1', unit: '', location: 'fridge', expirationDate: '', dateType: '' }]
  });
  await markBatchPendingReview(saved.id);

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    await assertPageControlsNamed(base, '/batches/manual');
    await assertPageControlsNamed(base, '/batches/natural-language');
    await assertPageControlsNamed(base, `/inventory/${item.id}/edit`);
    await assertPageControlsNamed(base, `/inventory/${item.id}/use-up`);
    await assertPageControlsNamed(base, `/batches/${saved.id}/review`);
  } finally {
    server.close();
  }
});

// --- AC4: color independence --------------------------------------------

test('status is never conveyed by color alone on the inventory page', async () => {
  await resetAllTables();
  const today = todayInZone(EXPIRATION_TIMEZONE);
  await seedActiveItem({
    name: 'Old Yoghurt',
    location: 'fridge',
    expirationDate: addDays(today, -1),
    dateType: 'use_by'
  });
  await seedActiveItem({
    name: 'Fresh Milk',
    location: 'fridge',
    expirationDate: addDays(today, 2),
    dateType: 'best_before'
  });
  await seedActiveItem({
    name: 'Canned Beans',
    location: 'pantry',
    expirationDate: addDays(today, 30),
    dateType: 'best_before'
  });
  await seedActiveItem({ name: 'Rice', location: 'pantry', expirationDate: null, dateType: null });

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const response = await fetch(`${base}/inventory?notice=confirmed&created=1`);
    const body = await response.text();
    assert.equal(response.status, 200);

    // Each dated item has a badge pairing an aria-hidden glyph with a text
    // label; the undated item has none.
    const glyphCount = (body.match(/class="status-glyph"/g) || []).length;
    assert.equal(glyphCount, 3);
    assert.doesNotMatch(body, /status-badge status-no-date/);

    // Overview cards each pair a count with visible label text.
    const overviewLabels = (body.match(/class="overview-label"/g) || []).length;
    assert.equal(overviewLabels, 4);
    assert.match(body, />Expiring soon</);
    assert.match(body, />No expiration date</);

    // No inline color styles, and the notice relies on role=status + text.
    assert.doesNotMatch(body, /style\s*=\s*["'][^"']*color:/i);
    assert.match(body, /class="notice" role="status"/);
    assert.match(body, /Batch confirmed\. 1 item\(s\) added to inventory\./);
  } finally {
    server.close();
  }
});

test('validation-error and duplicate-warning states carry text, not color alone', async () => {
  await resetAllTables();
  await seedActiveItem({});

  const app = createApp();
  const { server, base } = startServer(app);
  try {
    const response = await postForm(base, '/batches/manual', {
      action: 'save-to-inventory',
      defaultLocation: '',
      ...rowFields(0, { name: 'Milk', quantity: 'abc', unit: '', location: 'fridge' })
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /class="errors"/);
    assert.match(body, /Validation errors/);

    const warningPage = await fetch(`${base}/batches/manual`);
    const warningBody = await warningPage.text();
    assert.match(warningBody, /aria-live="polite"/);
    assert.match(warningBody, /Saving keeps both entries side by side/);
  } finally {
    server.close();
  }
});

test.after(async () => {
  await pool.end();
});