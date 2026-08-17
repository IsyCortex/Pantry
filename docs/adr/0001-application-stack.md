# ADR 0001: Application Stack

## Status

Accepted for Ticket 0.3.

## Context

Pantry is a local-first reference project intended to remain readable, easy to run locally, and explicit about system behavior. The MVP prioritizes inventory visibility, controlled AI-assisted intake, and transactional confirmation over framework breadth.

The architecture documentation already proposes a transparent stack centered on server-rendered pages, raw SQL, and a minimal browser runtime. This decision needs an explicit ADR because it constrains repository structure, testing strategy, and implementation complexity across the rest of the MVP.

## Decision

Pantry uses the following application stack for the MVP:

- Node.js LTS
- Plain JavaScript
- Express
- EJS
- Vanilla browser JavaScript with `fetch`
- Plain CSS
- PostgreSQL through Docker Compose
- `pg` with raw parameterized SQL
- No ORM
- No frontend build system

The application is organized around explicit boundaries between routes, services, database queries, validation, and intake processors.

## Consequences

### Positive

- The runtime model remains easy to understand and explain.
- Application behavior stays explicit and portfolio-readable.
- Database access remains transparent and auditable.
- Local setup stays modest and does not require a frontend toolchain.
- Layer boundaries can be documented and tested without framework indirection.

### Negative

- SQL and mapping code must be written and maintained manually.
- Client-side interaction helpers must be implemented without a frontend framework.
- Some convenience features that frameworks or ORMs provide will need deliberate application code.

## Alternatives considered

- A frontend-heavy SPA stack was rejected in favor of simpler local operation and clearer end-to-end behavior.
- An ORM-based persistence layer was rejected in favor of explicit SQL and tighter control over transactions and queries.
- A bundled frontend build pipeline was rejected because the MVP does not require that complexity.