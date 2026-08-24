CREATE TABLE IF NOT EXISTS intake_batches (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'natural_language')),
  state TEXT NOT NULL CHECK (state IN ('draft', 'analyzed', 'pending_review', 'confirmed', 'cancelled')) DEFAULT 'draft',
  original_text TEXT NULL,
  processor_id TEXT NULL,
  processor_version TEXT NULL,
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS intake_batch_items (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES intake_batches(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  name TEXT NULL,
  quantity NUMERIC NULL,
  unit TEXT NULL,
  location TEXT NULL,
  expiration_date DATE NULL,
  date_type TEXT NULL,
  attention_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  accepted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intake_batch_items_location_check CHECK (location IS NULL OR location IN ('pantry', 'fridge', 'freezer')),
  CONSTRAINT intake_batch_items_unit_check CHECK (unit IS NULL OR unit IN ('g', 'kg', 'ml', 'l', 'piece', 'package')),
  CONSTRAINT intake_batch_items_date_type_check CHECK (date_type IS NULL OR date_type IN ('best_before', 'use_by', 'unspecified')),
  CONSTRAINT intake_batch_items_quantity_check CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT intake_batch_items_date_type_requires_date CHECK (
    (expiration_date IS NULL AND date_type IS NULL) OR expiration_date IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS intake_batch_items_batch_position_idx
  ON intake_batch_items(batch_id, position);