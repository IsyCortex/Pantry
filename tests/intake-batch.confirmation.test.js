const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/pool');
const { saveManualDraftBatch, markBatchPendingReview, confirmIntakeBatch, getManualDraftBatch } = require('../src/services/intake-batch-service');
const { getActiveInventoryForDisplay } = require('../src/services/inventory-service');
const { getConfirmedInventoryItem } = require('../src/services/inventory-service');

async function resetTables() {
  await pool.query('TRUNCATE TABLE inventory_items, intake_batch_items, intake_batches RESTART IDENTITY CASCADE');
}

test('confirms accepted valid rows and excludes non-accepted rows', async () => {
  await resetTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before', accepted: true },
      { name: 'Rice', quantity: '1', unit: 'package', location: 'pantry', expirationDate: '', dateType: '', accepted: false },
      { name: 'Peas', quantity: '1', unit: 'package', location: 'freezer', expirationDate: '', dateType: '', accepted: true }
    ]
  });
  await markBatchPendingReview(saved.id);

  const confirmation = await confirmIntakeBatch(saved.id);
  assert.equal(confirmation.state, 'confirmed');
  assert.equal(confirmation.createdItems.length, 2);
  assert.equal(confirmation.createdItems[0].name, 'Milk');
  assert.equal(confirmation.createdItems[1].name, 'Peas');

  const inventoryRows = await pool.query('SELECT name FROM inventory_items ORDER BY id');
  assert.deepEqual(inventoryRows.rows.map((row) => row.name), ['Milk', 'Peas']);

  const batch = await getManualDraftBatch(saved.id);
  assert.equal(batch.state, 'confirmed');
});

test('confirmed items retain their source-batch relationship', async () => {
  await resetTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '2026-08-20', dateType: 'best_before', accepted: true }
    ]
  });
  await markBatchPendingReview(saved.id);

  const confirmation = await confirmIntakeBatch(saved.id);
  assert.equal(confirmation.createdItems[0].source_batch_id, saved.id);

  const fetched = await getConfirmedInventoryItem(confirmation.createdItems[0].id);
  assert.equal(fetched.source_batch_id, saved.id);
});

test('revalidates accepted rows and rejects confirmation without partial inventory', async () => {
  await resetTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '', dateType: '', accepted: true },
      { name: '', quantity: '1', unit: 'package', location: 'pantry', expirationDate: '', dateType: '', accepted: true }
    ]
  });
  await markBatchPendingReview(saved.id);

  await assert.rejects(
    () => confirmIntakeBatch(saved.id),
    (error) => {
      assert.equal(error.code, 'VALIDATION_FAILED');
      return true;
    }
  );

  const inventoryCount = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items');
  assert.equal(inventoryCount.rows[0].count, 0);
});

test('rolls back already-started confirmation work when a later insert fails', async () => {
  await resetTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '', dateType: '', accepted: true },
      { name: 'Peas', quantity: '1', unit: 'package', location: 'freezer', expirationDate: '', dateType: '', accepted: true }
    ]
  });
  await markBatchPendingReview(saved.id);

  let callCount = 0;
  const { createConfirmedInventoryItem } = require('../src/services/inventory-service');

  await assert.rejects(
    () => confirmIntakeBatch(saved.id, {
      inventoryWriter: async (item, client) => {
        callCount += 1;
        const created = await createConfirmedInventoryItem(item, client);
        if (callCount === 2) {
          throw new Error('CONFIRMATION_INSERT_FAILURE_AFTER_FIRST_SUCCESS');
        }
        return created;
      }
    }),
    /CONFIRMATION_INSERT_FAILURE_AFTER_FIRST_SUCCESS/
  );

  const inventoryCount = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items');
  assert.equal(inventoryCount.rows[0].count, 0);

  const batch = await getManualDraftBatch(saved.id);
  assert.equal(batch.state, 'pending_review');
});

test('prevents repeat confirmation for already confirmed batches', async () => {
  await resetTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '', dateType: '', accepted: true }
    ]
  });
  await markBatchPendingReview(saved.id);
  await confirmIntakeBatch(saved.id);

  await assert.rejects(
    () => confirmIntakeBatch(saved.id),
    (error) => {
      assert.equal(error.code, 'INVALID_STATE_TRANSITION');
      return true;
    }
  );
});

test('confirmed items immediately appear in active inventory', async () => {
  await resetTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '', dateType: '', accepted: true }
    ]
  });
  await markBatchPendingReview(saved.id);
  await confirmIntakeBatch(saved.id);

  const activeItems = await getActiveInventoryForDisplay();
  assert.equal(activeItems.length, 1);
  assert.equal(activeItems[0].name, 'Milk');
});

test('concurrent confirmation yields one success, one rejection, and one inventory set', async () => {
  await resetTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '', dateType: '', accepted: true }
    ]
  });
  await markBatchPendingReview(saved.id);

  const results = await Promise.allSettled([
    confirmIntakeBatch(saved.id),
    confirmIntakeBatch(saved.id)
  ]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'INVALID_STATE_TRANSITION');

  const inventoryCount = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items');
  assert.equal(inventoryCount.rows[0].count, 1);
});