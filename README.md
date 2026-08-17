# Pantry

Pantry is a local-first reference project for household food inventory management and food-waste reduction. It helps a household record food with minimal friction, understand what is currently stored in the pantry, fridge, and freezer, and identify items that should be used soon.

The MVP deliberately concentrates on inventory visibility and expiration awareness. It does not include accounts, recipes, shopping recommendations, meal planning, diets, nutrition, or retailer integrations.

## Primary workflow

1. Enter groceries manually or describe a batch in natural language.
2. Inspect and correct the resulting draft batch.
3. Confirm the batch into the active inventory.
4. Review inventory by location and expiration status.
5. Mark items as used up or discarded when they leave the inventory.

No AI-generated proposal becomes inventory without explicit human confirmation.

## Documentation

| Document | Purpose |
| --- | --- |
| [Project plan](PROJECT_PLAN.md) | Milestones, tickets, acceptance criteria, and technical progress checklists |
| [Product scope](docs/product-scope.md) | Product goal, users, workflows, MVP boundary, success criteria, and scope acceptance |
| [Domain model](docs/domain-model.md) | Domain language, entities, lifecycle rules, and validation invariants |
| [Architecture](docs/architecture.md) | Application structure, technical boundaries, persistence, testing strategy, and release workflow constraints |
| [Input pipeline](docs/input-pipeline.md) | Manual and AI-assisted batch ingestion, review boundary, and future voice/receipt adapters |

## Documentation strategy

The documentation is intentionally split rather than maintained as one large file:

- The project plan will change frequently as tickets are completed and refined.
- Product scope should remain readable without implementation details.
- Domain rules need a stable source of truth shared by the UI, services, and tests.
- Architecture decisions should be reviewable independently from product planning.
- The input pipeline deserves a dedicated document because it is the main extensibility and AI-safety boundary.

Architectural decisions that require trade-off records should later be added as individual ADRs under `docs/adr/`. An engineering log should be introduced when implementation begins and updated alongside ticket progress.

## Delivery workflow

- Ticket execution follows the technical ticket-state workflow documented in the [project plan](PROJECT_PLAN.md#ticket-workflow-states).
- The GitHub issue is the authoritative live technical checklist; technical items are updated only after implementation evidence is committed and pushed.
- The implementation partner maintains only `Technical plan and progress` checkboxes and never checks acceptance criteria without explicit instruction.
- Product acceptance and movement to `Done` remain the project owner's responsibility.
- Each milestone is treated as a release and follows the Gitflow release responsibilities documented in the [project plan](PROJECT_PLAN.md#release-and-gitflow-responsibilities).

## Current status

Planning. No implementation stack is considered final until the relevant M0 ticket is reviewed and accepted.

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

The foundation intentionally excludes inventory, batch intake, natural-language analysis, and other later feature workflows.

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
- Release tagging convention has not yet been established and must be approved before the first release tag is created.

### Consequences for subsequent work

- Milestone 1 can build on a documented and runnable foundation without reopening M0 scope decisions.
- Ticket 2.3 must treat `docs/analyzer-contract.md` as the authoritative contract source for executable validation.
- Release execution for M0 requires explicit approval of the initial version/tag convention before Gitflow integration proceeds.
