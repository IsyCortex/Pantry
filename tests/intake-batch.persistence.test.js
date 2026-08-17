const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/pool');
const {
  ensureManualDraftBatch,
  saveManualDraftBatch,
  getManualDraftBatch
} = require('../src/services/intake-batch-service');

async function resetBatchTables() {
  await pool.query('TRUNCATE TABLE intake_batch_items, intake_batches RESTART IDENTITY CASCADE');
}

test('creates and resumes one manual draft batch', async () => {
  await resetBatchTables();

  const first = await ensureManualDraftBatch();
  const second = await ensureManualDraftBatch();

  assert.equal(first.id, second.id);
  assert.equal(second.rows.length, 0);
});

test('saves rows without overwriting explicit or already-empty existing locations during save', async () => {
  await resetBatchTables();

  const batch = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: '', expirationDate: '2026-08-20', dateType: 'best_before' },
      { name: 'Rice', quantity: '', unit: '', location: 'pantry', expirationDate: '', dateType: '' }
    ]
  });

  assert.equal(batch.rows[0].location, '');
  assert.equal(batch.rows[1].location, 'pantry');
});

test('saving an existing draft does not retroactively apply the current default location to older blank rows', async () => {
  await resetBatchTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: '', expirationDate: '', dateType: '' }
    ]
  });

  const reSaved = await saveManualDraftBatch({
    batchId: saved.id,
    rows: [
      { name: 'Milk', quantity: '2', unit: 'package', location: '', expirationDate: '', dateType: '' },
      { name: 'Peas', quantity: '1', unit: 'package', location: 'freezer', expirationDate: '', dateType: '' }
    ]
  });

  assert.equal(reSaved.rows[0].location, '');
  assert.equal(reSaved.rows[1].location, 'freezer');
});

test('preserves draft rows across reload by reloading the saved batch', async () => {
  await resetBatchTables();

  const saved = await saveManualDraftBatch({
    batchId: null,
    defaultLocation: '',
    rows: [
      { name: 'Yoghurt', quantity: '6', unit: 'piece', location: 'fridge', expirationDate: '', dateType: '' }
    ]
  });

  const loaded = await getManualDraftBatch(saved.id);
  assert.equal(loaded.rows.length, 1);
  assert.equal(loaded.rows[0].name, 'Yoghurt');
  assert.equal(loaded.rows[0].location, 'fridge');
});

test('rejects invalid draft rows and reports validation details', async () => {
  await resetBatchTables();

  await assert.rejects(
    () => saveManualDraftBatch({
      batchId: null,
      defaultLocation: '',
      rows: [
        { name: ' ', quantity: '-1', unit: 'stone', location: 'garage', expirationDate: '2026-02-30', dateType: 'best_before' }
      ]
    }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_FAILED');
      assert.match(error.details.join(' '), /location is invalid/);
      return true;
    }
  );
});