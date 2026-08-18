CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  quantity NUMERIC NULL,
  unit TEXT NULL,
  location TEXT NOT NULL,
  expiration_date DATE NULL,
  date_type TEXT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ NULL,
  CONSTRAINT inventory_items_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT inventory_items_quantity_positive CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT inventory_items_location_valid CHECK (location IN ('pantry', 'fridge', 'freezer')),
  CONSTRAINT inventory_items_date_type_valid CHECK (date_type IS NULL OR date_type IN ('best_before', 'use_by', 'unspecified')),
  CONSTRAINT inventory_items_date_type_requires_date CHECK (
    (expiration_date IS NULL AND date_type IS NULL)
    OR (expiration_date IS NOT NULL AND (date_type IS NULL OR date_type IN ('best_before', 'use_by', 'unspecified')))
  ),
  CONSTRAINT inventory_items_lifecycle_valid CHECK (lifecycle_status IN ('active', 'used_up', 'discarded'))
);