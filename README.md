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
- The implementation partner maintains only `Technical plan and progress` checkboxes and never checks acceptance criteria without explicit instruction.
- Product acceptance and movement to `Done` remain the project owner's responsibility.
- Each milestone is treated as a release and follows the Gitflow release responsibilities documented in the [project plan](PROJECT_PLAN.md#release-and-gitflow-responsibilities).

## Current status

Planning. No implementation stack is considered final until the relevant M0 ticket is reviewed and accepted.
