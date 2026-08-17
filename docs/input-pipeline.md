# Pantry Input Pipeline

## Purpose

Pantry minimizes grocery-entry friction while keeping confirmed inventory accurate. All input methods create an editable intake batch. They never write inventory directly.

The single authoritative analyzer contract source is [`docs/analyzer-contract.md`](analyzer-contract.md).

## Pipeline stages

```text
Source acquisition -> Source extraction -> Proposal validation -> Draft review -> Confirmation
```

### Source acquisition

Receives manual rows, text, and eventually audio or an image.

### Source extraction

Converts source material into canonical draft-item proposals. This stage may use deterministic logic, a language model, speech recognition, OCR, or a vision model depending on the adapter.

### Proposal validation

Rejects malformed or off-contract results before draft persistence. Structural validation does not establish semantic correctness.

### Draft review

Displays every proposed item in the shared batch editor. The user can add, edit, duplicate, reject, or reorder rows.

### Confirmation

Revalidates accepted rows and creates inventory in one database transaction.

## MVP input sources

### Manual batch

The user creates rows directly. Keyboard-first entry, persistent defaults for new rows, and preservation across validation errors support large grocery trips.

### Natural language

The user describes several groceries in free text. The analyzer extracts only explicit information and returns a structured proposal.

Example input:

> Fridge: two cartons of milk best before 20 August, six yoghurts until Friday, and chicken breast use by tomorrow. Freezer: frozen peas. Pantry: two packs of pasta and a bag of rice.

The application supplies an explicit reference date, timezone, and locale when resolving relative dates.

## Analyzer rules

The analyzer may:

- Split input into distinct food batches.
- Extract explicit product names.
- Extract explicit quantities and units.
- Extract explicit or grouped storage locations.
- Resolve stated dates from controlled application context.
- Identify ambiguity or missing information.

The analyzer must not:

- Invent expiration dates.
- Make food-safety decisions.
- Silently infer storage locations from general knowledge.
- Merge similar products automatically.
- Drop uncertain rows without reporting them.
- Create or confirm inventory.
- Follow instructions embedded in the grocery text that change its extraction task.

## Validation policy

- The response must be valid JSON matching an exact schema.
- Unknown properties and enum values are rejected.
- Item count and text lengths are bounded.
- Item names must be non-empty after trimming.
- Quantity must be positive when supplied.
- Location must be `pantry`, `fridge`, `freezer`, or `null` in a draft.
- Dates must be valid ISO calendar dates or `null`.
- Missing values remain `null`.
- One invalid item rejects the proposal; items are not silently discarded.

Executable enforcement of these rules is implemented later in Ticket 2.3. This ticket defines the authoritative specification in [`docs/analyzer-contract.md`](analyzer-contract.md).

## Review behavior

- The original input remains available while reviewing.
- Every field is editable.
- A row can be excluded without deleting the rest of the batch.
- Missing expiration dates warn but do not block confirmation.
- Missing names or locations block confirmation.
- Possible duplicates warn but are never silently merged.
- Provider failure preserves the user's text and permits retry or manual continuation.

## Future voice adapter

```text
Audio -> Speech transcription -> Natural-language analyzer -> Draft batch
```

Voice reuses the natural-language analyzer after transcription. The transcript should be reviewable. Uncertain transcription should become an attention reason, not a hidden confidence calculation.

Audio should be processed temporarily and deleted by default unless a later, explicit requirement justifies retention.

## Future receipt adapter

```text
Receipt image -> OCR/vision -> Receipt-line interpretation -> Draft batch
```

Receipt processing can suggest product names and some quantities. Receipts generally do not provide expiration dates or storage locations, so the resulting draft will often require substantial completion.

The receipt processor must handle or flag:

- Abbreviated product descriptions
- Deposits and returns
- Discounts and coupons
- Totals and payment lines
- Non-food household products
- Weighted-item calculations
- Duplicate-looking lines
- Unreadable or uncertain text

Receipt images should be processed temporarily and deleted by default. Extracted text may be retained with the review batch when necessary for correction and reproducibility.

## Extensibility rules

- `source_type` is provider-neutral and extensible.
- Source-specific metadata does not enter `inventory_items`.
- All adapters produce the canonical draft schema.
- All adapters use the same review and confirmation services.
- Inventory routes and queries never branch on the source provider.
- New adapters require contract tests before live-provider evaluation.
