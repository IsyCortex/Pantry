const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/pool');
const { saveManualDraftBatch, markBatchPendingReview, confirmIntakeBatch, getManualDraftBatch } = require('../src/services/intake-batch-service');
const { getConfirmedInventoryItem } = require('../src/services/inventory-service');

async function resetTables() {
  await pool.query('TRUNCATE TABLE inventory_items, intake_batch_items, intake_batches RESTART IDENTITY CASCADE');
}

test('confirms accepted valid rows transactionally and records source batch relationships', async () => {
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
  const batches = await pool.query('SELECT id, source_type, state, confirmed_at FROM intake_batches ORDER BY id');
  const batchItems = await pool.query(`SELECT id, batch_id, position, name, quantity, unit, location, expiration_date::text AS expiration_date, date_type, accepted FROM intake_batch_items ORDER BY id`);
  const inventoryItems = await pool.query(`SELECT id, name, quantity, unit, location, expiration_date::text AS expiration_date, date_type, lifecycle_status, source_batch_id FROM inventory_items ORDER BY id`);
  console.log('[confirmation-test] saved.id=', saved.id);
  console.log('[confirmation-test] intake_batches=', JSON.stringify(batches.rows));
  console.log('[confirmation-test] intake_batch_items=', JSON.stringify(batchItems.rows));
  console.log('[confirmation-test] inventory_items=', JSON.stringify(inventoryItems.rows));
  assert.equal(confirmation.state, 'confirmed');
  assert.equal(confirmation.createdItems.length, 2);
  assert.equal(confirmation.createdItems[0].source_batch_id, saved.id);
  assert.equal(confirmation.createdItems[1].source_batch_id, saved.id);

  const fetched = await getConfirmedInventoryItem(confirmation.createdItems[0].id);
  assert.equal(fetched.source_batch_id, saved.id);

  const batch = await getManualDraftBatch(saved.id);
  assert.equal(batch.state, 'confirmed');
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