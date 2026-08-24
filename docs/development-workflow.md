Development workflow

Authoritative operational workflow for the implementation partner (Cline) across Pantry milestones. This compiles the workflow established and approved during M0 and M1; it defines how work is done, not what is built. For milestone scope and tickets, see PROJECT_PLAN.md. For local setup and environment, see README.md. For technical architecture and domain boundaries, see docs/architecture.md and docs/domain-model.md.

This document is the single source of truth for operational workflow. Other documents should link here instead of duplicating these rules.

Ownership and responsibility boundaries

Product owner — defines requirements, prioritizes work, checks acceptance criteria, accepts tickets, and authorizes releases.

Cline (implementation partner) — owns architecture, implementation, technical-plan/progress checkboxes, tests, commits, pushes, issue evidence, Gitflow operations, and authorized board transitions.

Cline must never — check acceptance-criteria boxes, declare owner acceptance, or move a ticket to Done, close an issue, or close a milestone without explicit instruction.

ChatGPT — repository role is read-only and advisory.

Repository or board mutations occur only when explicitly authorized. Authorization to implement a ticket covers the repository changes reasonably required for that ticket, but does not authorize acceptance, release operations, unrelated scope expansion, or destructive operations.

Authoritative-source precedence

A current explicit product-owner instruction has precedence over repository and GitHub sources. If an instruction appears to change established scope, acceptance criteria, responsibilities, or workflow, Cline must identify the change and obtain confirmation before updating an authoritative source.

Subject to that rule, use this precedence:

The ticket's GitHub issue — live acceptance criteria, technical checklist, evidence, and blockers.

docs/development-workflow.md — operational workflow rules.

PROJECT_PLAN.md — milestone vision, scope, ticket relationships, and planned outcomes; it does not mirror live technical progress.

docs/architecture.md — application structure and technical boundaries.

docs/domain-model.md — domain language, entities, lifecycle rules, and validation invariants.

docs/engineering-log.md — implementation-phase notes, deviations, and evidence summaries.

docs/blockers/ — detailed blocker incident records.

If authoritative sources conflict and precedence does not resolve the conflict safely, stop and report it rather than silently choosing or rewriting scope.

Ticket workflow states

Todo — the ticket exists and has not been started.

In Progress — Cline is actively working on the ticket after explicit instruction from the product owner to begin. (Cline-managed.)

Blocked — a formally tracked blocker prevents meaningful progress, when this option exists on the project board. (Cline-managed.)

Ready for Acceptance — all technical-plan items are complete, required verification has passed, pushed evidence has been recorded, and an acceptance handoff is available. (Cline-managed.)

Done — the product owner has assessed the acceptance criteria, accepted the ticket, and authorized finalization. (Owner-managed.)

If the project board has no Blocked option, keep the ticket In Progress and represent the blocker through the issue's active-blocker section. Do not invent a board state or alter board configuration without authorization.

Acceptance versus technical-checklist ownership

The GitHub issue is the authoritative live ticket record. PROJECT_PLAN.md provides milestone context and intended scope but does not mirror live progress.

Cline maintains only the Technical plan and progress checkboxes, checking an item only when supporting repository evidence has been committed and pushed.

The product owner alone checks acceptance-criteria boxes and accepts tickets.

Cline never moves a ticket to Done, closes an issue, or closes a milestone unless explicitly instructed after acceptance.

Ticket execution sequence

Process a ticket in this order:

Inspect the ticket and relevant repository state.

After explicit authorization to begin, move the ticket to In Progress.

Implement locally on the milestone branch (for example, feature/m1); do not commit directly to main or develop.

Verify in the appropriate order: focused tests → related tests → complete serial suite (npm test) → clean-migration verification when persistence or migrations are affected.

Commit using a focused commit and a concise imperative subject consistent with repository style.

Push to the milestone feature branch.

Update the live Technical plan and progress checklist using pushed evidence. Record relevant files, commit SHAs, verification results, decisions, and blockers in the GitHub issue.

When every technical-plan item is supported and required verification passes, move the ticket to Ready for Acceptance and provide a concise acceptance handoff.

Stop and wait for the product owner's acceptance decision.

Move the ticket to Done or close it only after explicit acceptance and instruction.

Do not use local, uncommitted, or unpushed work as remote acceptance evidence.

Test diagnosis, failure classification, and reruns

Diagnose the smallest reproducible failure first.

Capture the exact failure and establish which operation or assertion actually fails before proposing a correction.

Classify the failure before changing code. Relevant classifications include:

production defect;

test defect;

fixture defect;

environment failure;

concurrency or shared-state interference;

stale expectation.

When the application is wrong, correct production behavior before changing tests.

Change a fixture or expectation only when it is demonstrably incorrect.

Keep each test focused on one primary behavior. Split tests whose setup or assertions independently attempt to prove unrelated responsibilities.

After a correction, rerun in this order:

focused test;

related test file or suite;

complete serial suite;

clean-migration verification when persistence or migrations are affected.

Expected failure-path tests may capture or stub their own expected logging. Do not suppress production logging globally merely to make test output quiet.

Test execution and database isolation

npm test runs node --test --test-concurrency=1.

DB-backed tests run as one process with serialized execution.

Tests use the dedicated pantry_test database through TEST_DATABASE_URL, never the development database through DATABASE_URL.

tests/helpers/test-db.js protects this separation, prepares and migrates the test database, and resets shared tables for tests.

Never run competing DB-backed test commands or diagnostic processes against the same test database.

A failure observed while multiple processes share and reset one database must be reproduced with the supported single-process execution strategy before it is classified as a product defect.

Blocker lifecycle

A failing test is not automatically an official blocker. Treat a problem as an official blocker when it prevents meaningful implementation, required verification, workflow progression, or release readiness and requires tracked resolution.

When blocked:

Use the board's Blocked state if it exists. Otherwise keep the ticket In Progress.

Add an active-blocker section to the GitHub issue containing observed symptoms, affected workflow steps, known evidence, and the next diagnostic or resolution action.

Diagnose and resolve the blocker before claiming completion of affected technical work.

Do not commit, push, or synchronize incomplete ticket work merely to advance the workflow unless the product owner explicitly authorizes an intermediate diagnostic commit.

After resolution:

Verify the resolution through the relevant focused, related, full-suite, and migration checks.

Create a blocker-resolution document under docs/blockers/ using:

YYYY-MM-DD-ticket-N-short-description.md

Record the related ticket and milestone, dates encountered and resolved, context, symptoms, impact, diagnostic evidence, confirmed root cause, resolution, verification, recurrence indicators, recovery guidance, and related commits or files.

Never invent a root cause or include secrets, sensitive configuration, or excessive raw logs.

Commit and push the blocker document.

Replace the issue's active-blocker section with a concise resolved summary containing the dates, confirmed cause, resolution, verification result, and a link to the blocker document.

If the ticket was moved to Blocked, return it to In Progress only after the resolution has been verified, then continue the remaining ticket work.

Examples:

docs/blockers/2026-08-18-ticket-1.5-migration-chain-source-batch-id.md

docs/blockers/2026-08-19-ticket-1.7-bigint-identifier-type-consistency.md

Release and Gitflow responsibilities

Each milestone is treated as a release.

Pantry release tags follow Semantic Versioning as vMAJOR.MINOR.PATCH.

During pre-1.0 development, each completed milestone release increments the minor version; corrective non-milestone releases increment the patch version; prerelease candidates may use suffixes such as -rc.1.

Tags must be annotated, must point to the approved released commit, and must never be reused or moved after publication.

Release preparation begins only after every milestone ticket has been accepted and moved to Done and the product owner explicitly authorizes release preparation.

Before merging, tagging, publishing a release, changing versions, closing a milestone, or creating the next milestone branch, Cline presents the proposed version, included tickets, test evidence, release commit message, and release notes for explicit product-owner approval.

Cline must not merge into main or develop, create a tag, publish a GitHub Release, close a milestone, or begin the next milestone without explicit authorization.

Authorized release sequence:

Complete and accept every milestone ticket.

Receive explicit authorization to prepare the release.

Verify milestone tickets, repository state, tests, documentation, and proposed version.

Prepare and present the functional release summary, included-ticket list, verification evidence, changelog, release commit message, tag, and GitHub Release materials.

Receive explicit approval for the release package.

Merge the approved release into main with an explicit merge commit.

Create the annotated version tag from the approved release state.

Merge the release back into develop.

Publish the GitHub Release using the approved notes.

Close the milestone only after explicit product-owner approval.

Create or begin the next milestone branch only after authorization.

Evidence requirements

Evidence is text-based; screenshots are not required acceptance evidence.

Primary evidence consists of implementation, automated tests, the migration chain applied in order, and persisted database behavior.

Record the tested branch and commit, relevant environment, commands or scenarios exercised, and pass/fail results.

Keep concise manual walkthrough evidence only for interaction, accessibility, browser behavior, and responsive-layout outcomes that automated tests cannot sufficiently establish.

Manual evidence should state the tested branch/commit, browser or environment, approximate viewport where relevant, scenarios, and results. Screenshots are optional and must never substitute for behavioral evidence.

Issue evidence should remain concise and link to repository documentation for detailed blocker or engineering records.

Targeted context loading for future tasks

The goal is to understand the active work without rereading the entire project history.

Always load

docs/development-workflow.md in full.

The active GitHub issue in full, including its acceptance criteria, technical checklist, evidence, and blocker state.

The current branch, HEAD, remote relationship, and working-tree state.

Code and tests directly relevant to the active ticket.

Load only when relevant

PROJECT_PLAN.md — milestone context, ticket relationships, scope ambiguity, or a suspected mismatch with the live issue.

docs/architecture.md — when architecture, layer boundaries, dependencies, persistence, testing strategy, or release constraints are affected.

docs/domain-model.md — when entities, controlled values, lifecycle, persistence semantics, or validation invariants are affected.

docs/input-pipeline.md and docs/analyzer-contract.md — for intake adapters, analyzer proposals, validation boundaries, or provider-related work.

README.md — for setup, environment, Compose, migration, seed, health-check, or command changes.

Relevant files under docs/blockers/ — only for an active blocker, a plausible recurrence, or a directly related resolved incident.

docs/engineering-log.md — only when investigating a documented deviation or when the current ticket requires an implementation-history record.

tests/helpers/test-db.js — for DB-backed implementation, migration work, database-test diagnosis, or changes to test execution.

Do not load every conditional source by default. Do not produce a broad repository or project-history summary unless requested. Before implementing, report only the understood objective, relevant boundaries, evidence inspected, unresolved conflicts or decisions, and the next workflow-correct action.
