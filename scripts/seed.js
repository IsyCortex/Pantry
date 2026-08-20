const pool = require('../src/db/pool');
const {
  saveManualDraftBatch,
  markBatchPendingReview,
  confirmIntakeBatch
} = require('../src/services/intake-batch-service');
const { createConfirmedInventoryItem } = require('../src/services/inventory-service');

// Seeded dataset:
//  - 4 individual inventory items (no source batch)
//  - 1 confirmed batch: 3 accepted items confirmed through the real workflow
//  - 1 open draft batch: 4 items still awaiting review/confirmation
//
// The seed truncates the M1 tables first so it is deterministic and safe to
// re-run (ids restart at 1 each time).

function draftRow(overrides) {
  return {
    name: '',
    quantity: '',
    unit: '',
    location: '',
    expirationDate: '',
    dateType: '',
    accepted: true,
    ...overrides
  };
}

async function main() {
  await pool.query('TRUNCATE TABLE intake_batches, intake_batch_items, inventory_items RESTART IDENTITY CASCADE');

  const report = [];

  // 1) Individual inventory items (2-5 requested; we seed 4).
  const individualItems = [
    { name: 'Oat Milk', quantity: 2, unit: 'package', location: 'fridge', expirationDate: '2026-08-28', dateType: 'best_before' },
    { name: 'Brown Rice', quantity: 1, unit: 'package', location: 'pantry', expirationDate: null, dateType: null },
    { name: 'Tomatoes', quantity: 6, unit: 'piece', location: 'fridge', expirationDate: '2026-08-21', dateType: 'use_by' },
    { name: 'Yoghurt', quantity: 4, unit: 'piece', location: 'fridge', expirationDate: '2026-08-25', dateType: 'best_before' }
  ];

  for (const item of individualItems) {
    const created = await createConfirmedInventoryItem({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
      expirationDate: item.expirationDate,
      dateType: item.dateType
    });
    report.push(`individual item: ${created.name} (inventory id ${created.id})`);
  }

  // 2) Confirmed batch: create a draft, move it to review, then confirm it.
  const confirmedRows = [
    draftRow({ name: 'Pasta', quantity: '3', unit: 'package', location: 'pantry', expirationDate: '2026-12-01', dateType: 'best_before' }),
    draftRow({ name: 'Frozen Peas', quantity: '5', unit: 'package', location: 'freezer', expirationDate: '2027-02-01', dateType: 'best_before' }),
    draftRow({ name: 'Bread', quantity: '2', unit: 'piece', location: 'pantry', expirationDate: '2026-08-24', dateType: 'best_before' })
  ];

  const confirmedDraft = await saveManualDraftBatch({ batchId: null, rows: confirmedRows });
  await markBatchPendingReview(confirmedDraft.id);
  const confirmed = await confirmIntakeBatch(confirmedDraft.id);
  report.push(`Confirmed batch ${confirmed.batchId}: ${confirmed.createdItems.length} item(s) added to inventory.`);

  // 3) Open batch: a draft awaiting review/confirmation, 4 items.
  const openRows = [
    draftRow({ name: 'Milk', quantity: '2', unit: 'package', location: 'fridge', expirationDate: '2026-08-27', dateType: 'best_before' }),
    draftRow({ name: 'Carrots', quantity: '10', unit: 'piece', location: 'fridge', expirationDate: '', dateType: '' }),
    draftRow({ name: 'Chicken', quantity: '1', unit: 'kg', location: 'freezer', expirationDate: '2027-01-01', dateType: 'use_by' }),
    draftRow({ name: 'Bananas', quantity: '6', unit: 'piece', location: 'pantry', expirationDate: '2026-08-23', dateType: 'best_before' })
  ];

  const openBatch = await saveManualDraftBatch({ batchId: null, rows: openRows });
  report.push(`Open draft batch ${openBatch.id}: ${openBatch.rows.length} item(s) awaiting review.`);

  console.log(report.join('\n'));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});