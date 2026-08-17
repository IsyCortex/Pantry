# Pantry Analyzer Contract

## Purpose

This document is the single authoritative source for Pantry's analyzer contract.

It defines:

- analyzer input
- analyzer output proposals
- transformation into application-owned canonical draft items
- controlled values
- contract limits
- proposal-validation rules
- provider and validation error boundaries
- analyzer/domain responsibilities
- representative sample inputs, outputs, and fixtures

## Scope clarification

Ticket 0.4 provides authoritative specification evidence for the analyzer contract and proposal-validation rules.

Ticket 2.3 provides executable enforcement and empirical tuning of malformed, off-contract, and provider-failure behavior.

## General non-invention invariant

The analyzer must extract only information that is explicit in the user input or explicit in application-supplied context.

It must not invent missing names, quantities, units, locations, dates, or date types.

Missing information remains `null` until the user reviews or completes it.

## Analyzer input schema

The application provides the analyzer with a provider-neutral input object:

```json
{
  "rawText": "Fridge: two cartons of milk. Pantry: one bag of rice.",
  "referenceDate": "2026-08-16",
  "timezone": "Europe/Berlin",
  "locale": "en-DE"
}
```

### Fields

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `rawText` | string | yes | Untrusted user-provided grocery description |
| `referenceDate` | string | yes | ISO calendar date supplied by the application |
| `timezone` | string | yes | IANA timezone supplied by the application |
| `locale` | string | yes | Locale supplied by the application |

## Analyzer output proposal schema

The analyzer returns proposal items only. These proposals are untrusted until application validation succeeds.

```json
{
  "items": [
    {
      "name": "milk",
      "quantity": 2,
      "unit": "package",
      "location": "fridge",
      "expirationDate": null,
      "dateType": null
    }
  ]
}
```

### Top-level rules

- The top-level object contains exactly one property: `items`.
- `items` must be an array.
- Unknown top-level properties are invalid.

### Proposal item fields

| Field | Type | Required | Nullable | Rule |
| --- | --- | --- | --- | --- |
| `name` | string | yes | no | Non-empty after trimming |
| `quantity` | number | no | yes | Positive when present |
| `unit` | string | no | yes | Controlled unit value when present |
| `location` | string | no | yes | Controlled location value when present |
| `expirationDate` | string | no | yes | ISO calendar date when present |
| `dateType` | string | no | yes | Controlled date-type value when present |
- Unknown proposal-item properties are invalid.

## Application-owned canonical draft-item schema

The application transforms a valid analyzer proposal into the same canonical draft-item structure used by manual intake and shared review.

```json
{
  "name": "milk",
  "quantity": 2,
  "unit": "package",
  "location": "fridge",
  "expirationDate": null,
  "dateType": null,
  "attentionReasons": []
}
```

Canonical draft items are application-owned review objects. They are not confirmed inventory.

## Controlled values

### Locations

- `pantry`
- `fridge`
- `freezer`

### Date types

- `best_before`
- `use_by`
- `unspecified`
- `null` when no date exists

### Units

- `g`
- `kg`
- `ml`
- `l`
- `piece`
- `package`

### Attention reasons

- `missing_location`
- `missing_expiration_date`
- `ambiguous_quantity`
- `ambiguous_date`
- `unrecognized_unit`
- `possible_batch_duplicate`
- `possible_inventory_duplicate`

## Contract limits

- `rawText` must not exceed 4,000 characters.
- Analyzer output must not contain more than 50 proposal items.
- Analyzer response payload must not exceed 64 KB.
- Analyzer processing timeout is 15 seconds.
- `name` must be 1 to 120 characters after trimming.
- `attentionReasons` must contain only controlled values.
- Unknown properties are invalid.

## Quantity and unit nullability

- `quantity` may be `null`.
- `unit` may be `null`.
- If `unit` is present, `quantity` must also be present.
- If `quantity` is present, `unit` may be present or `null`.
- If `quantity` is present, it must be positive.

## Proposal-validation rules

Ticket 0.4 specifies the rules below. Ticket 2.3 implements executable enforcement.

- Reject unknown top-level properties.
- Reject unknown proposal-item properties.
- Reject invalid enum values.
- Reject invalid ISO dates.
- Reject empty names after trimming.
- Reject non-positive quantities.
- Reject `unit` when `quantity` is absent.
- Reject malformed `items` payloads.
- Reject the full proposal if any item is invalid.
- Invalid proposals must not proceed toward inventory persistence.

## Provider and validation errors

| Category | Meaning |
| --- | --- |
| `AI_ANALYSIS_FAILED` | Provider transport, timeout, or execution failure |
| `AI_INVALID_RESPONSE` | Malformed JSON or off-contract structured output |
| `NO_ITEMS_FOUND` | Input was processed but contained no recognizable grocery items |

Provider payload details remain outside user-facing error output.

## Analyzer/domain responsibility table

| Concern | Analyzer responsibility | Application/domain responsibility |
| --- | --- | --- |
| Parse grocery text | yes | no |
| Return proposal structure | yes | no |
| Supply `referenceDate`, `timezone`, `locale` | no | yes |
| Enforce contract rules | no | yes |
| Transform proposals into canonical draft items | no | yes |
| Persist inventory | no | yes |
| Confirm accepted rows | no | yes |
| Make food-safety decisions | no | no |

## Representative fixtures

Representative reusable JSON fixtures are stored in `docs/fixtures/analyzer-contract/`.

- `valid-basic.json`
- `valid-missing-values.json`
- `invalid-unknown-field.json`
- `invalid-unit-without-quantity.json`
- `invalid-date.json`

## Sample input and output

### Sample input

```json
{
  "rawText": "Fridge: two cartons of milk best before 20 August. Pantry: one bag of rice.",
  "referenceDate": "2026-08-16",
  "timezone": "Europe/Berlin",
  "locale": "en-DE"
}
```

### Sample valid proposal output

```json
{
  "items": [
    {
      "name": "milk",
      "quantity": 2,
      "unit": "package",
      "location": "fridge",
      "expirationDate": "2026-08-20",
      "dateType": "best_before"
    },
    {
      "name": "rice",
      "quantity": 1,
      "unit": "package",
      "location": "pantry",
      "expirationDate": null,
      "dateType": null
    }
  ]
}
```