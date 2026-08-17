# Pantry Domain Model

## Domain language

### Inventory item

A specific batch of food currently present in the household. Two packages of the same product with different expiration dates are separate inventory items.

### Intake batch

A reviewable collection of draft items created during one entry session. Its source can initially be manual or natural language.

### Draft item

An editable proposal inside an intake batch. It is not active inventory and may be incomplete.

The analyzer proposal contract and the transformation into application-owned canonical draft items are defined in [`docs/analyzer-contract.md`](analyzer-contract.md).

### Storage location

One of:

- `pantry`
- `fridge`
- `freezer`

Draft items may temporarily have no location. Confirmed inventory items may not.

### Expiration date

The calendar date supplied by the user or explicitly extracted from the user's input. It is not an assertion that the food is safe or unsafe.

### Date type

One of:

- `best_before`
- `use_by`
- `unspecified`
- `null` when no date exists

### Attention reason

An explainable condition requiring or inviting review. Initial reasons include:

- `missing_location`
- `missing_expiration_date`
- `ambiguous_quantity`
- `ambiguous_date`
- `unrecognized_unit`
- `possible_batch_duplicate`
- `possible_inventory_duplicate`

Future adapters may add reasons such as `uncertain_transcription`, `uncertain_receipt_text`, `possible_non_food_item`, and `abbreviated_product_name`.

## Conceptual entities

### `inventory_items`

| Field | Rule |
| --- | --- |
| `id` | Stable identifier |
| `name` | Required, trimmed, length-limited |
| `quantity` | Optional positive number |
| `unit` | Optional controlled value |
| `location` | Required storage-location value |
| `expiration_date` | Optional calendar date |
| `date_type` | Optional controlled value |
| `lifecycle_status` | `active`, `used_up`, or `discarded` |
| `source_batch_id` | Optional reference to the confirmed intake batch |
| `created_at` | Application-generated timestamp |
| `updated_at` | Application-generated timestamp |
| `removed_at` | Set when used up or discarded |

Expiration status is calculated and must not be persisted as permanent truth.

### `intake_batches`

| Field | Rule |
| --- | --- |
| `id` | Stable identifier |
| `source_type` | Initially `manual` or `natural_language`; extensible to `voice`, `receipt`, and `barcode` |
| `state` | Controlled lifecycle state |
| `original_text` | Optional original or extracted text |
| `processor_id` | Optional provider-neutral processor identifier |
| `processor_version` | Optional processor version |
| `processed_at` | Optional timestamp |
| `created_at` | Application-generated timestamp |
| `confirmed_at` | Set after successful confirmation |

Source-specific binary material does not belong in this table.

### `intake_batch_items`

| Field | Rule |
| --- | --- |
| `id` | Stable identifier |
| `batch_id` | Required intake-batch reference |
| `position` | Stable display order within the batch |
| `name` | May be incomplete while draft; required for confirmation |
| `quantity` | Optional positive number |
| `unit` | Optional controlled value |
| `location` | Optional in draft; required for confirmation |
| `expiration_date` | Optional calendar date |
| `date_type` | Optional controlled value |
| `attention_reasons` | Controlled, recalculable review information |
| `accepted` | Whether the row will be included on confirmation |

## Batch lifecycle

```text
draft -> analyzed -> pending_review -> confirmed
                                  \-> cancelled
```

- A manual batch can move from `draft` directly to `pending_review`.
- An automated batch passes through `analyzed` after a structurally valid proposal is produced.
- Only `pending_review` can be confirmed.
- `confirmed` and `cancelled` are terminal.
- Confirmation is idempotent and transactional.

## Inventory lifecycle

```text
active -> used_up
active -> discarded
```

Used-up and discarded items leave the active inventory but remain distinguishable for future waste analytics. Analytics are outside the MVP.

## Expiration status

The application derives one of:

- `expired`
- `expiring_soon`
- `later`
- `no_date`

The initial proposal is a fixed three-day `expiring_soon` window, evaluated using the application date in `Europe/Berlin`. The threshold remains a product decision to confirm during M0.

## Core invariants

- Draft rows never appear in active inventory.
- A confirmed inventory item always has a name and location.
- Missing optional values remain `null`; they are not guessed.
- An automated proposal cannot confirm itself.
- Batch confirmation creates all accepted items or none.
- A confirmed batch cannot be confirmed twice.
- Later edits to inventory do not rewrite the original draft batch.
- Input source and provider metadata do not alter inventory behavior.
