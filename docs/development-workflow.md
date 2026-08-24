# Development workflow

Authoritative operational workflow for the implementation partner (Cline) across Pantry milestones. This compiles the workflow established and approved during M0 and M1; it defines *how* work is done, not *what* is built. For milestone scope, tickets, and acceptance criteria, see [`PROJECT_PLAN.md`](../PROJECT_PLAN.md). For local setup and environment, see [`README.md`](../README.md). For architecture, testing strategy, and release constraints, see [`docs/architecture.md`](architecture.md). Per the repository's split-documentation strategy, this is the single source of truth for operational workflow; `PROJECT_PLAN.md` previously mirrored these rules and now points here instead.

## Ownership and responsibility boundaries

- **Product owner** — defines requirements, prioritizes work, checks acceptance criteria, accepts tickets, and authorizes releases.
- **Cline (implementation partner)** — architecture, implementation, technical-plan/progress checkboxes, tests, commits, pushes, issue evidence, Gitflow operations, and authorized board transitions.
- **Cline must never** — check acceptance-criteria boxes, declare owner acceptance, or move a ticket to `Done`, close an issue, or close a milestone without explicit instruction.
- **ChatGPT** — repository role is read-only and advisory.
- **Repository or board mutations occur only when explicitly authorized.**

## Authoritative-source precedence

1. GitHub issues — live technical checklist, evidence, and blockers for each ticket.
2. `docs/development-workflow.md` — operational workflow rules.
3. `PROJECT_PLAN.md` — milestone scope, ticket list, acceptance criteria, and tech-progress checklists (not live workflow rules).
4. `docs/architecture.md` — application structure, technical boundaries, persistence, testing strategy, and release constraints.
5. `docs/domain-model.md` — domain language, entities, lifecycle rules, and validation invariants.
6. `docs/engineering-log.md` — implementation-phase notes, deviations, and evidence summaries.
7. `docs/blockers/` — detailed blocker incident records.

## Ticket workflow states

- `Todo` — the ticket exists and has not been started.
- `In Progress` — the implementation partner is actively working the ticket after explicit instruction from the product owner to begin. *(Cline-managed.)*
- `Blocked` — technical work cannot continue; the exact blocker and required next action must be recorded in the issue. *(Cline-managed.)*
- `Ready for Acceptance` — all technical-plan items are complete, required verification has passed, and an acceptance handoff with supporting evidence has been recorded in the issue. *(Cline-managed.)*
- `Done` — the product owner has tested the ticket against its acceptance criteria, accepted it, and finalized the work. *(Owner-managed.)*

## Acceptance versus technical-checklist ownership

- The GitHub issue is the authoritative live technical checklist; `PROJECT_PLAN.md` defines scope and intended work but does not mirror live technical progress.
- The implementation partner maintains only the `Technical plan and progress` checkboxes, checking an item only when repository evidence has been committed and pushed.
- The implementation partner never checks acceptance-criteria boxes, moves a ticket to `Done`, closes an issue, or closes a milestone unless explicitly instructed.

## Implementation, verification, commit, push, and issue-synchronization order

Process a ticket in this order, and update the live checklist **only after** the push:

1. Activate the ticket (move to `In Progress`).
2. Implement locally on the milestone branch (e.g., `feature/m1`); do not commit to `main` or `develop`.
3. Verify — focused tests → related tests → complete serial suite (`npm test`) → clean-migration check when persistence is affected.
4. Commit (focused commit; free-form imperative subject, matching the repository style).
5. Push to the feature branch.
6. Update the live `Technical plan and progress` checklist; record relevant files, commit SHAs, verification evidence, decisions, and blockers in the GitHub issue.

If work cannot continue, move the ticket to `Blocked` and record the exact blocker and next diagnostic/resolution action before doing anything else.

## Test diagnosis, failure classification, and reruns

- Diagnose the smallest reproducible failure first.
- Classify the failure (production defect vs. test/fixture defect) **before** changing code.
- When the application is wrong, correct production behavior **before** changing tests.
- Change a fixture or expectation only when it is demonstrably incorrect.
- Keep each test focused on one primary behavior.
- Rerun order: the **focused** test → **related** tests → the **complete serial** suite → and, when persistence is affected, a **clean-migration** verification.

## Test execution and database isolation

- `npm test` runs `node --test --test-concurrency=1`.
- DB-backed tests run as **one process** with **serialized** execution (`--test-concurrency=1`).
- Tests run against a **dedicated `pantry_test` database** (`TEST_DATABASE_URL`), never the development database (`DATABASE_URL`). `tests/helpers/test-db.js` raises a hard error if `TEST_DATABASE_URL` points at the development database, (re)creates and migrates the test database on first use, and truncates the shared M1 tables (`resetAllTables`) before tests.
- Never run competing DB-backed commands against the same test database.

## Blocker lifecycle

- A ticket moves to `Blocked` only when a formally tracked blocker prevents further work.
- While an active blocker is unresolved, the GitHub issue carries a concurrent active-blocker section covering observed symptoms, affected workflow steps, currently known evidence, and the next diagnostic or resolution action.
- After a blocker is resolved and verified, create a blocker-resolution document under `docs/blockers/` (filename `YYYY-MM-DD-ticket-N.short-description.md`) **before** updating the GitHub issue. Record: related ticket and milestone, dates encountered and resolved, context, symptoms, impact, diagnostic steps and evidence, confirmed root cause (causes must not be invented), resolution, verification, recurrence indicators and recovery guidance, and related commits or files. Do not include secrets, sensitive configuration, or excessive raw logs.
- After the blocker document is committed and pushed, replace the issue's active-blocker section with a concise resolved summary containing the dates, confirmed cause, resolution, verification result, and a link to the blocker document.
- A ticket returns from `Blocked` to `In Progress` only after the resolution has been verified.

Format examples: `docs/blockers/2026-08-18-ticket-1.5-migration-chain-source-batch-id.md`, `docs/blockers/2026-08-19-ticket-1.7-bigint-identifier-type-consistency.md`.

## Release and Gitflow responsibilities

- Each milestone is treated as a release. Pantry release tags follow Semantic Versioning in the format `vMAJOR.MINOR.PATCH`; during pre-1.0 development, each completed milestone release increments the minor version, corrective non-milestone releases increment the patch version, and prerelease candidates use suffixes such as `-rc.1` when needed.
- Release tags must be annotated, must point to the final released commit, and must never be reused or moved after publication.
- Release preparation begins only after every ticket in the milestone has been accepted and moved to `Done`, and the product owner explicitly authorizes release preparation.
- During release preparation, the implementation partner verifies milestone tickets, repository state, tests, documentation, and version, then prepares the proposed release version, functional release summary, included-ticket list, verification evidence, changelog, release commit, annotated tag, and GitHub Release materials.
- Before merges, tagging, release publication, version changes, or milestone closure, the implementation partner presents the proposed version, included tickets, test evidence, release commit message, and release notes for explicit project-owner approval.
- The implementation partner must not merge into `main` or `develop`, create a tag, publish a GitHub Release, begin release publication, or close a milestone without explicit project-owner approval.

Release sequence: 1) complete and accept milestone tickets; 2) receive explicit authorization; 3) prepare the release on the authorized release branch; 4) present the full release package for project-owner approval before any merge, tag, or milestone closure; 5) merge the approved release into `main` with an explicit merge commit; 6) create an annotated version tag from the approved state; 7) merge the release back into `develop`; 8) publish the GitHub Release from the approved release notes; 9) close the milestone only after explicit project-owner approval.

## Evidence requirements

- Evidence is **text only; screenshots are not required** acceptance evidence.
- Primary evidence is: the implementation, the automated-test suite, a clean migration chain applied in order, and persisted database behavior.
- Record the tested branch/commit, environment, scenarios exercised, and pass/fail result for each.
- Keep a concise manual walkthrough (text only) for the interaction and responsive-layout scenarios that automated tests cannot sufficiently demonstrate.

## Targeted context loading for future tasks

Before starting a task, load only the authoritative sources needed for its scope:

1. `PROJECT_PLAN.md` — scope and the specific ticket's acceptance criteria and technical plan.
2. The ticket's GitHub issue — live checklist, evidence, and active blockers.
3. `docs/development-workflow.md` — this document.
4. `docs/architecture.md`, `docs/domain-model.md`, `docs/input-pipeline.md` — boundaries and validation invariants for the area being changed.
5. `README.md` — local setup, migrations, seed, and test commands.
6. `docs/blockers/` and `docs/engineering-log.md` — any active blocker or relevant deviation for the milestone.
7. `tests/helpers/test-db.js` — confirm test-database isolation and serialized execution; confirm no competing DB-backed processes are running against the same test database.
8. Confirm the current branch and `HEAD` before implementing.