# Pantry

Pantry is a local-first reference project for household food inventory management and food-waste reduction. It helps a household record food with minimal friction, understand what is currently stored in the pantry, fridge, and freezer, and identify items that should be used soon.

The MVP deliberately concentrates on inventory visibility and expiration awareness. It does not include accounts, recipes, shopping recommendations, meal planning, diets, nutrition, or retailer integrations.

## Primary workflow

1. Enter groceries manually or describe a batch in natural language.
2. Manually entered batches are saved straight to the active inventory in one step.
3. AI-proposed batches are inspected and corrected through a human review step before confirmation.
4. Review inventory by location and expiration status.
5. Mark items as used up or discarded when they leave the inventory.

No AI-generated proposal becomes inventory without explicit human confirmation.

## Documentation

| Document | Purpose |
| --- | --- |
| [Project plan](PROJECT_PLAN.md) | Milestones, tickets, acceptance criteria, and technical progress checklists |
| [Development workflow](docs/development-workflow.md) | Operational workflow: ownership, ticket and blocker lifecycles, technical-checklist ownership, testing, Gitflow, evidence, and context loading |
| [Product scope](docs/product-scope.md) | Product goal, users, workflows, MVP boundary, success criteria, and scope acceptance |
| [Domain model](docs/domain-model.md) | Domain language, entities, lifecycle rules, and validation invariants |
| [Architecture](docs/architecture.md) | Application structure, technical boundaries, persistence, testing strategy, and release workflow constraints |
| [Input pipeline](docs/input-pipeline.md) | Manual and AI-assisted batch ingestion, review boundary, and future voice/receipt adapters |
| [Engineering log](docs/engineering-log.md) | Implementation-phase engineering notes, deviations, and evidence summaries |

## Documentation strategy

The documentation is intentionally split rather than maintained as one large file:

- The project plan will change frequently as tickets are completed and refined.
- Product scope should remain readable without implementation details.
- Domain rules need a stable source of truth shared by the UI, services, and tests.
- Architecture decisions should be reviewable independently from product planning.
- The input pipeline deserves a dedicated document because it is the main extensibility and AI-safety boundary.

Architectural decisions that require trade-off records are maintained as individual ADRs under `docs/adr/`. The engineering log is maintained under `docs/engineering-log.md` and should be updated alongside ticket progress.

## Delivery workflow

- Ticket execution follows the operational workflow documented in [`docs/development-workflow.md`](docs/development-workflow.md#ticket-workflow-states).
- The GitHub issue is the authoritative live technical checklist; technical items are updated only after implementation evidence is committed and pushed.
- The implementation partner maintains only `Technical plan and progress` checkboxes and never checks acceptance criteria without explicit instruction.
- Formally tracked blockers follow the blocker lifecycle documented in [`docs/development-workflow.md`](docs/development-workflow.md#blocker-lifecycle), with detailed incident records stored under `docs/blockers/`.
- Product acceptance and movement to `Done` remain the project owner's responsibility.
- Each milestone is treated as a release and follows the Gitflow release responsibilities documented in [`docs/development-workflow.md`](docs/development-workflow.md#release-and-gitflow-responsibilities).

## Current status

Milestone 4 is complete and released as `v0.5.0`. Faster repeat entry and accessibility (name suggestions, duplicate warnings, and keyboard, mobile, and recovery refinements) are accepted for the current development phase.

Earlier milestone releases: Milestone 3 `v0.4.0` (expiration awareness and inventory navigation), Milestone 2 `v0.3.0` (natural-language batch analysis), Milestone 1 `v0.2.0` (manual inventory and shared batch workflow), and Milestone 0 `v0.1.2` (foundational application architecture and analyzer contract).

## Local foundation setup

### Prerequisites

- Node.js 26 or newer
- npm 11 or newer
- Docker with Compose support

### 1. Install dependencies

```bash
npm install
```

### 2. Create local environment configuration

```bash
cp .env.example .env
```

The example file contains only local development values. Do not commit secrets or machine-specific overrides.

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
```

The Compose service is repository-controlled and reproducible. It binds PostgreSQL to host port `15432`, leaving the common local port `5432` free to avoid conflicts with another local database.

### 4. Run migrations

Wait for the database to become reachable:

```bash
npm run db:wait
```

Then run migrations:

```bash
npm run migrate
```

The migration command uses the `DATABASE_URL` from `.env`.

Safe rerun behavior:

- applied migrations are recorded in `schema_migrations`
- rerunning the migration command skips already applied migrations
- reruns are non-destructive for the existing migration set

### 5. Start the application

```bash
npm start
```

The application uses the `DATABASE_URL` from `.env` for `/health/db`.

### 6. Verify operational state

Application health:

```bash
curl http://127.0.0.1:3000/health
```

Database health:

```bash
curl http://127.0.0.1:3000/health/db
```

### 7. Run automated tests

```bash
npm test
```

`npm test` runs Node's test runner with `--test-concurrency=1`.

DB-backed tests currently share the repository-controlled test database and use serialized execution to avoid cross-file fixture interference.

The foundation intentionally excludes inventory, batch intake, natural-language analysis, and other later feature workflows.

## Local language-model analyzer (optional)

Natural-language intake works out of the box with the built-in deterministic `fake` analyzer (the default). To analyze descriptions with a locally running language model instead, Pantry speaks the Ollama `/api/generate` protocol:

1. Install [Ollama](https://ollama.com) and pull a model, e.g. `ollama pull llama3.2`.
2. Point Pantry at it in `.env`:

```bash
ANALYZER_PROVIDER=local
ANALYZER_LOCAL_URL=http://127.0.0.1:11434
ANALYZER_LOCAL_MODEL=llama3.2
ANALYZER_TIMEOUT_MS=15000
ANALYZER_TIMEZONE=UTC
```

Notes:

- Extraction requests explicitly disable model thinking (`think: false`, so reasoning models such as Qwen3 put the completion into `response`, not `thinking`) and use Ollama structured outputs: the `format` field carries a JSON schema derived from the application-owned analyzer contract (controlled units, locations, and date types; nullable fields; item-count and name-length limits). Only the `response` field is treated as analyzer output; a `thinking` payload is never parsed as a fallback.
- Known provider-schema limitation: Ollama's grammar generator cannot compile JSON-schema `pattern` (regex) constraints — including them aborts generation before inference with HTTP 400 (`Failed to initialize samplers: failed to parse grammar`). The structured-output schema therefore omits `pattern` and expresses every constraint Ollama supports (required shape, closed properties, nullability, enums, bounds); calendar-valid ISO dates are enforced exclusively by the shared application validator, which rejects out-of-contract completions as a whole.
- The model proposes draft rows only: every proposal passes the same application-owned structural validation as any other provider before reaching human review; structurally invalid proposals are rejected as a whole.
- The extraction prompt forbids inventing missing values (absent data stays JSON `null`, never the string `"null"`), extracts groceries only, and instructs the model to ignore any instructions embedded in the grocery text. Canonical date types are `best_before`, `use_by`, and `unspecified`.
- Provider, timeout, and parsing failures degrade to the safe recoverable analysis state; the submitted text is preserved for retry or manual continuation, and raw provider details never reach the user.
- Automated tests never require a running model: they use stubbed HTTP servers and the deterministic fake provider.

## Inventory expiration status

Pantry derives an expiration status for each dated inventory item: `expired`, `expiring soon`, `later`, or `no date`. The reference day is the calendar date in a dedicated timezone (separate from the analyzer timezone), and the `expiring_soon` threshold is a fixed 3-day window. Both are environment settings (see `.env.example`):

```bash
# IANA timezone for expiration "today" (default Europe/Berlin; separate from ANALYZER_TIMEZONE).
EXPIRATION_TIMEZONE=Europe/Berlin
# Calendar days within which a dated item is expiring_soon (default 3).
EXPIRATION_SOON_DAYS=3
```

A future per-account/household model will supply the household timezone.

## M0 implementation record

### Delivered across Tickets 0.1–0.5

- Ticket 0.1 documented the MVP scope, workflows, exclusions, and the draft-versus-confirmed inventory boundary.
- Ticket 0.2 documented the Pantry domain model, lifecycle rules, expiration semantics, and review-oriented invariants.
- Ticket 0.3 documented the application architecture and recorded the core accepted trade-offs in ADRs.
- Ticket 0.4 established a single analyzer contract source, representative JSON fixtures, and the specification boundary between Ticket 0.4 and Ticket 2.3.
- Ticket 0.5 delivered a minimal runnable foundation with application bootstrap, repository-controlled PostgreSQL configuration, a migration mechanism, health checks, deterministic tests, and documented local setup.

### Material differences from the original milestone plan

- The M0 architecture and analyzer-contract work was delivered primarily as authoritative specification and ADR evidence rather than executable feature code.
- Ticket 0.4 clarified the separation between analyzer output proposals and application-owned canonical draft items.
- Ticket 0.4 specified proposal-validation rules, while executable enforcement was deliberately deferred to Ticket 2.3.
- Ticket 0.5 established migration infrastructure without introducing later domain tables solely to prove the foundation.

### Deliberate deferrals

- Executable analyzer-response enforcement and error hardening remain in Ticket 2.3.
- Inventory persistence tables and feature workflows remain for Milestone 1 tickets.

### Consequences for subsequent work

- Milestone 1 can build on a documented and runnable foundation without reopening M0 scope decisions.
- Ticket 2.3 must treat `docs/analyzer-contract.md` as the authoritative contract source for executable validation.
- Release execution for M0 requires explicit approval of the initial version/tag convention before Gitflow integration proceeds.
