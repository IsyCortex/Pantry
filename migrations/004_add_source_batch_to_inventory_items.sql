ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS source_batch_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_items_source_batch_id_fkey'
  ) THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_source_batch_id_fkey
      FOREIGN KEY (source_batch_id) REFERENCES intake_batches(id);
  END IF;
END
$$;