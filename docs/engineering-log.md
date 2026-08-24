# Pantry Engineering Log

## Purpose

This log records implementation-phase engineering notes, deviations, and evidence summaries that do not belong in the stable product, domain, architecture, or analyzer-contract reference documents.

## Initial entries

- Milestone 0 established the accepted application architecture, analyzer contract boundary, and runnable application foundation.
- Pantry release tags follow Semantic Versioning, and the corrected M0 release is `v0.1.2`.
- Ticket-level implementation evidence continues to be recorded in the corresponding GitHub issues as the authoritative live technical record.

## M1 corrections (after first Path A browser walkthrough)

### Automated tests isolated from the development database

- `npm test` now runs against a dedicated `pantry_test` database, never the development database. The previous shared-database setup let the last test in `tests/inventory.route.test.js` silently truncate `inventory_items` and insert fixed fixture rows (Pears, Apples, Flour) into the developer's live inventory mid-walkthrough.
- Compose creates the database automatically via `docker/postgres-init/01-create-test-database.sql`; `tests/helpers/test-db.js` auto-creates and migrates it on first use and raises a hard error if `TEST_DATABASE_URL` points at the development database.
- All test suites truncate the shared M1 tables through `resetAllTables()` before tests.

### Manual intake saves directly to inventory; review reserved for AI-proposed input

- The manual batch editor now offers **Save to inventory** (`confirmManualBatchFromInput`) alongside **Save draft batch**; the **Review batch** action was removed from the manual path. Human review remains mandatory for provider (AI) input per the ADR-0002 review boundary; the review pages stay in place for that workflow (M2).
- A previously silent failure mode is gone: confirming a batch with zero stored rows used to redirect "successfully" while adding nothing. Confirmation now hard-blocks empty batches and renders styled error pages instead of raw JSON.
- State guards prevent editing a confirmed batch: saves and direct-saves only work while the batch is `draft` or `pending_review` (manual source).

## M1 completion — final release-readiness review

- Final state verified on branch `feature/m1` at commit `99853ca4e7528f786e473db764d38d9a83ea83bd`; working tree clean and in sync with `origin/feature/m1`.
- Complete serial suite at final HEAD: `npm test` (`node --test --test-concurrency=1`) → 61/61 pass, 0 fail. Repeated re-runs were intentionally not performed because no failure signal required them.
- The M1 browser walkthrough (`docs/m1-browser-test-plan.md`, pinned to `637a73e`) remains valid for the final HEAD: all commits from `637a73e` to `99853ca` were documentation-only, so application behavior did not change.
- Clean-migration evidence already in `docs/blockers/2026-08-18-ticket-1.5-migration-chain-source-batch-id.md` and Ticket 1.7 (`Issue #27`) covers the final schema state; no migration or schema file changed since, so a repeat clean-migration run was not required.
- Release-readiness integration confirms the delivered M1 journey (manual intake → batch confirm/direct-save → inventory display → edit/use-up/discard) with all M1 tickets on the board `Done` except `1.7` in `Ready for Acceptance`, awaiting product-owner acceptance via `Issue #27`.