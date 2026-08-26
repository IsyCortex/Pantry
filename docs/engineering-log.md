# Pantry Engineering Log

## Purpose

This log records implementation-phase engineering notes, deviations, and evidence summaries that do not belong in the stable product, domain, architecture, or analyzer-contract reference documents.

## Initial entries

- Milestone 0 established the accepted application architecture, analyzer contract boundary, and runnable application foundation.
- Pantry release tags follow Semantic Versioning, and the corrected M0 release is `v0.1.2`.
- Ticket-level implementation evidence continues to be recorded in the corresponding GitHub issues as the authoritative live technical record.

## M3 — Expiration awareness and inventory navigation

Milestone 3 targets expiration awareness over the Pantry inventory.

### Ticket 3.1 — Derive expiration status

- Branch: `feature/m3`, based on the released `v0.3.0` state (`42d9790`, the post-M2 `develop` tip) — M2 was released before M3 work began, per the workflow release sequence.
- Owner decisions (Issue #17):
  - **Q1 threshold:** fixed 3-calendar-day `expiring_soon` window — an item expiring today or within 3 days is `expiring_soon`; before today is `expired`; after the window is `later`; undated is `no_date`. The window is centralized (`config.expirationSoonDays`, env-overridable, default 3) so it can be re-tuned without UI changes. No settings UI is added in MVP.
  - **Q2 timezone:** a dedicated application/expiration timezone (`config.expirationTimezone`, default `Europe/Berlin`), deliberately **separate** from `analyzerTimezone` (the latter governs analyzer context per the input-pipeline contract). Inventory expiration calculations own their own zone. A future per-account/household model should supply this value; for now it is a project constant. The application date is derived once via the centralized `todayInZone` so it can never disagree with itself around local midnight.
- Implementation:
  - New `src/services/app-date.js`: single source of truth for zone-aware calendar dates — `calendarDateInZone(date, tz)`, `todayInZone(tz, now)` (injectable `now`), and `daysBetween(startDate, endDate)` over date-only `YYYY-MM-DD` strings (parsed as UTC midnights → exact day count, no zone ambiguity). `calendarDateInZone`/`buildAnalyzerInput` in `natural-language-intake-service.js` now delegate here; the existing L5-style midnight regression test (Europe/Berlin vs Pacific/Honolulu vs UTC) still passes, confirming behavior-preserving extraction.
  - New `src/services/expiration-status-service.js`: pure `deriveExpirationStatus(item, referenceDate, soonWindowDays)` returning `expired`/`expiring_soon`/`later`/`no_date`. `date_type` (best_before/use_by) is intentionally **not** part of the classification — it only labels the date; the interface never claims a date alone determines food safety.
  - `getActiveInventoryForDisplay` now also returns `expirationStatus`, `expirationStatusLabel`, and `expirationStatusClass` (additive; `isUndated` retained). Status is **calculated per request**, never persisted.
  - View (`src/views/inventory.ejs`) renders a neutral status badge (e.g. "Expiring soon") and a `data-status` attribute for future sort/filter hooks; existing date-type labels ("Best before"/"Use by"/"Date type not specified") carry quality-vs-safety context.
  - Config: `EXPIRATION_TIMEZONE` and `EXPIRATION_SOON_DAYS` documented in `.env.example` and `README.md`.
- Tests: `tests/expiration-status.test.js` (pure, no DB) covers `no_date`, `expired`, the 0/1/2/3 → expiring_soon and 4 → later boundary, a `soonWindowDays` override, best_before/use_by parity, and a Berlin-midnight `todayInZone` regression that asserts the calendar date, not UTC.
- Domain doc (`docs/domain-model.md`) updated to record the confirmed threshold and timezone.

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