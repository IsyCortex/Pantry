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

## M2 completion (2026-08-25)

Milestone 2 — Natural-language batch analysis — completed. The milestone's only ticket was **Ticket 2.5 — Conduct live-model evaluation** (`Issue #16`).

- Branch: `feature/m2`, final commit `69520cb` ("Evaluation: S17 expected outcome + L7 approximate-duration note"), tree clean, in sync with `origin/feature/m2`.
- Workflow followed: implementation → serial verify → commit → push → issue evidence — `npm test` run serially: **106/106 pass**; focused local-provider adapter suite **16/16 pass**; no live model required.
- Live-model evaluation (`scripts/evaluate-local-model.js`, qwen3:30b-a3b, `referenceDate` 2026-08-25 UTC): all accepted scenarios landed in review batches read back from PostgreSQL; evaluation batches were `cancelled` afterward; no inventory row was ever written.
- Outcomes: S3 20/20 items; S10/S11 injection defense held; S17 (verbatim) resolved eggs `2026-08-30`, milk `2026-08-26` (explicit calendar date, exact), feta `2026-09-16` this run; S9 bare-temporal-phrase items → `null` dates (L3 resolved via conditional relative-date rule).
- Owner decisions (Issue #16): L1 accepted narrowly (explicit "frozen" names only); L2 accepted (container-word 422); L3 resolved; L4 accepted; L5 removed (harness `toISOString()` UTC conversion defect — storage and review UI verified correct); L6 accepted; L7 accepted narrowly (approximate duration arithmetic varies ±1 day across runs; explicit calendar/use-by/best-before dates must remain exact — distinct from L5).
- Release (Gitflow): `feature/m2` (@ `864e1ff`) merged into `main` and `develop` with `Merge feature/m2: M2 — Natural-language batch analysis (release v0.3.0)`; annotated tag **`v0.3.0`** created and pushed; GitHub Release published (`https://github.com/IsyCortex/Pantry/releases/tag/v0.3.0`); M2 milestone closed. `main` and `develop` now both sit at `42d9790`. M3 is prepared on `feature/m3` branched from the released `v0.3.0` state (`42d9790`); Ticket 3.1 (`Issue #17`) exists in `Todo`, not yet implemented.