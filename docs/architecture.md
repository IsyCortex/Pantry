# Pantry Architecture

## Status

This document defines the proposed architecture to be reviewed in M0. The stack is not final until Ticket 0.3 is accepted.

## Proposed stack

The Fleet Maintenance reference stack remains suitable:

- Node.js LTS
- Plain JavaScript
- Express
- EJS
- Vanilla browser JavaScript and `fetch`
- Plain CSS
- PostgreSQL through Docker Compose
- `pg` with raw parameterized SQL
- No ORM
- No frontend build system

The project favors transparent application behavior, modest local requirements, and portfolio readability over framework breadth.

## Application layers

```text
Routes -> Services -> Database queries -> PostgreSQL
                 \-> Intake processors
```

### Routes

- Parse HTTP input.
- Invoke services.
- Map known errors to safe responses.
- Never contain database or provider logic.

### Services

- Enforce domain rules.
- Coordinate batches and inventory.
- Own state transitions and transactions.
- Remain independent of templates and provider protocols.

### Database queries

- Contain parameterized SQL.
- Return explicit records.
- Do not encode presentation behavior.

### Intake processors

- Convert one source representation into the canonical draft-item proposal.
- Do not persist inventory.
- Do not own batch confirmation.

## Core modules

```text
src/
  routes/
  services/
  db/
  analyzers/
  validation/
  views/
  public/
tests/
docs/
  adr/
```

The exact structure should be finalized only after repository inspection and the architecture ticket.

## Canonical boundary

Every input path produces draft items with the same domain fields:

```js
{
  name,
  quantity,
  unit,
  location,
  expirationDate,
  dateType,
  attentionReasons
}
```

Manual entry creates this shape directly. Natural-language analysis proposes it. Future voice and receipt processors must produce the same shape.

## Provider abstraction

The initial natural-language processor should have:

- A deterministic fake provider for development and automated tests
- A local provider for live integration
- Configuration outside application code
- One provider-neutral analyzer contract

Suggested contract:

```js
analyze({
  rawText,
  referenceDate,
  timezone,
  locale
}) => Promise<{ items: DraftItemProposal[] }>
```

The model receives controlled context. Relative dates must not depend on the model host's clock or timezone.

The single authoritative analyzer contract source is [`docs/analyzer-contract.md`](analyzer-contract.md).

## Persistence boundary

The application persists a proposal as an intake batch under review. It creates inventory only through the confirmation service.

Confirmation must:

1. Lock or otherwise protect the batch from repeated confirmation.
2. Revalidate every accepted draft row.
3. Begin a database transaction.
4. Create all accepted inventory items.
5. Mark the batch confirmed.
6. Commit as one operation.
7. Roll back completely on failure.

## Error categories

| Category | Meaning |
| --- | --- |
| `VALIDATION_FAILED` | User-controlled batch or inventory data violates domain rules |
| `NOT_FOUND` | Requested batch or item does not exist |
| `INVALID_STATE_TRANSITION` | Requested lifecycle action is not permitted |
| `AI_ANALYSIS_FAILED` | Provider transport, timeout, or execution failure |
| `AI_INVALID_RESPONSE` | Malformed JSON or off-contract structured output |
| `NO_ITEMS_FOUND` | Input was processed but contained no recognizable grocery items |

Known errors should produce safe user-facing messages. Provider payloads and database details must not leak into responses.

## Security and privacy

- Treat user text, transcripts, OCR output, and images as untrusted data.
- Automated output is structurally and semantically untrusted until reviewed.
- Do not let embedded user instructions redefine the analyzer task.
- Apply request, text, image, item-count, response-size, and timeout limits.
- Do not commit secrets, real private-network addresses, or provider credentials.
- Do not retain future audio or receipt images by default.
- Keep raw provider responses out of normal inventory APIs and views.

## Testing strategy

### Automated tests

- Domain validation and date boundaries
- Parameterized persistence operations
- Batch lifecycle transitions
- Transactional rollback and repeat confirmation
- Route behavior and safe error mapping
- Fake-analyzer success, malformed response, invalid schema, and provider failure
- Duplicate-warning rules
- Inventory sorting and filtering

Automated tests must not require a live language model.

### Live integration evaluation

A separate local-provider evaluation should cover:

- Single and multi-item input
- Location grouping
- Quantities and units
- Absolute and relative dates
- Missing values
- Ambiguous wording
- Mixed grocery and non-grocery text
- Embedded prompt-injection attempts
- Unsupported inference pressure
- Maximum supported batch size

Structural success and semantic correctness must be reported separately.

### End-to-end verification

The final MVP test should begin with an empty database and cover manual intake, natural-language proposal, correction, transactional confirmation, expiration review, editing, and lifecycle removal.

## Documentation during implementation

- Update `PROJECT_PLAN.md` as ticket checkboxes progress.
- Maintain `docs/engineering-log.md` concurrently with development.
- Add one ADR per significant accepted trade-off.
- Keep setup, test, and demo instructions in the root README once implementation begins.

Current ADR set:

- [ADR 0001: Application Stack](adr/0001-application-stack.md)
- [ADR 0002: Human Review Boundary](adr/0002-human-review-boundary.md)
- [ADR 0003: Canonical Input Pipeline](adr/0003-canonical-input-pipeline.md)

## Repository workflow and release boundaries

- Supporting product and technical documents belong under `docs/`.
- Ticket-state rules, acceptance boundaries, and release approvals are defined in `PROJECT_PLAN.md` and govern day-to-day technical execution.
- Each milestone is treated as a release candidate, but no release branch preparation, merge, tag, publication, or milestone closure occurs without explicit project-owner authorization.
- Gitflow release execution follows this sequence after approval: prepare the release, merge into `main` with an explicit merge commit, create an annotated version tag, merge back into `develop`, and publish a GitHub Release.
