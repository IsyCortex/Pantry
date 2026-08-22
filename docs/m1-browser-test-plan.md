# M1 Browser Test Plan — Manual inventory and shared batch workflow

## 1. Purpose

Human-owned acceptance testing of Milestone 1 (Tickets 1.1–1.6) through the browser, as defined by the working method in `PROJECT_PLAN.md`: acceptance remains product-owner-owned. This document only prepares that test; it does not replace the acceptance-criteria checklists in the GitHub issues.

Repository state under test: branch `feature/m1`, commit `856d02b`, clean working tree.

## 2. Environment setup

Run from the repository root:

1. `.env` must exist with the local `DATABASE_URL` (see README, "Local foundation setup"; default `postgres://pantry:pantry@127.0.0.1:15432/pantry`).
2. `docker compose up -d postgres` — repository-controlled PostgreSQL 16 on host port `15432`.
3. `npm run db:wait`
4. `npm run migrate` — safe to rerun; applied migrations are skipped.
5. `npm start` — app served at `http://127.0.0.1:3000`.
6. Health checks: `curl http://127.0.0.1:3000/health` and `curl http://127.0.0.1:3000/health/db`.
7. `npm test` — all automated tests must pass before starting the browser test.

Full reset at any time: `npm run db:reset && npm run migrate` (removes the Docker volume and wipes all data).

## 3. Choose a data path

- **Path A — full coverage (recommended):** start from an empty database (reset + migrate, no seed). This exercises the empty-state onboarding (Ticket 1.2) and every workflow with data you enter yourself.
- **Path B — seeded shortcut:** run `npm run seed` after migrating. Caution: the seed **truncates** all M1 tables and restarts IDs, so run it before manual testing, never in the middle.

Seeded dataset (Path B expectations):

| Inventory ID | Item | Location | Quantity | Expiration / type |
| --- | --- | --- | --- | --- |
| 1 | Oat Milk | fridge | 2 package | 2026-08-28, best_before |
| 2 | Brown Rice | pantry | 1 package | none (undated) |
| 3 | Tomatoes | fridge | 6 piece | 2026-08-21, use_by |
| 4 | Yoghurt | fridge | 4 piece | 2026-08-25, best_before |
| 5 | Pasta | pantry | 3 package | 2026-12-01, best_before (confirmed batch 1) |
| 6 | Frozen Peas | freezer | 5 package | 2027-02-01, best_before (batch 1) |
| 7 | Bread | pantry | 2 piece | 2026-08-24, best_before (batch 1) |

Plus one pending-review batch (id 2): Milk, Carrots (no date), Chicken, Bananas — awaiting human confirmation; open it at `/batches/2/review` for the S5/S6 checks.

## 4. Field value cheat sheet (what validation accepts)

- Locations: `pantry`, `fridge`, `freezer`
- Units: `g`, `kg`, `ml`, `l`, `piece`, `package`
- Date types: `best_before`, `use_by`, `unspecified`
- Rules: name at most 120 characters; quantity must be a positive number; a unit requires a quantity; a date type requires an expiration date; a date without a date type is stored as `unspecified`; dates must be valid ISO `YYYY-MM-DD`.

## 5. Scenarios

### S0 — Smoke and navigation

1. Open `http://127.0.0.1:3000/` — home page renders with links "Start a manual intake batch" and "View active inventory".
2. Global nav (Home / Inventory / Batches) reaches all three areas; no dead links.

### S1 — Empty inventory onboarding (Ticket 1.2)

Precondition: empty database (Path A).

1. Open `/inventory`.
2. Expected onboarding state: "No food has been added yet.", "Confirmed batches populate the inventory.", "Manual intake is the next step."
3. A clearly identified "+ Add item" action is visible above the message and leads to `/batches/manual`.

### S2 — Active inventory display (Ticket 1.2)

Precondition: seeded data or items confirmed in S6.

1. `/inventory` lists all active items; name and storage location are always shown.
2. Quantity and unit appear when available; expiration appears with its date-type label when available.
3. The undated item (Brown Rice) shows "No expiration date" — undated items are distinguishable from dated ones.
4. Sort toolbar: "Expiration date" orders chronologically with undated items last; "Location" orders alphabetically; the active sort is visually indicated.
5. Repeat at narrow mobile width (see S9).

### S3 — Manual batch entry and direct save (Ticket 1.3)

1. From `/inventory` click "+ Add item" (or nav → Batches). The manual batch editor opens with one empty row.
2. The editor shows **Save draft batch** and **Save to inventory** as its two saving actions. It does **not** offer a "Review batch" action — manual input never passes through the review workflow (ADR-0002); an action that cannot be performed is not offered.
3. Fill a row completely: name, quantity, unit, location, expiration date, date type.
4. Row actions: **Add row** appends an empty row; **Duplicate** copies the current row below itself; **Remove** deletes it (removing the last remaining row leaves one fresh empty row); **Move up / Move down** reorder rows.
5. Enter key: advances field to field within a row, then to the next row's name field; pressing Enter on the last field of the last row adds a row. At least 20 rows can be created and filled without navigating away.
6. Default location: set "Default location for newly created rows" to `freezer`, then click **Add row** — the new row is prefilled with `freezer`, while previously entered rows keep their own locations.
7. Draft survives validation errors: enter quantity `0` and click **Save draft batch** — validation errors are listed and every entered value is still present. Correct the value and save again.
8. **Save to inventory**: fill one valid row and click **Save to inventory** — redirect to `/inventory?notice=confirmed...` with notice "Batch confirmed. N item(s) added to inventory." and the item appears in the active list.
9. Invalid input on **Save to inventory**: submit a row with quantity `0` — the editor re-renders with the validation error, the entered values are preserved, and nothing is added to `/inventory`.

### S4 — Draft persistence, resume, and isolation (Ticket 1.3)

1. With several rows entered, click **Save draft batch** — redirect back to `/batches/manual` with notice "Draft batch saved."
2. Navigate away (for example to `/`), then reopen `/batches/manual` — the same rows are restored because the app resumes the latest open draft batch.
3. Reload the page (F5) — rows are still there; nothing had to be recreated.
4. Throughout, none of the draft rows may appear in `/inventory`.

### S5 — Review of AI-proposed batches (Ticket 1.4)

Manual entry bypasses review; the review step belongs to provider (AI) input and will be exercised by M2. In the meantime the review interface can be regression-checked on a `pending_review` batch via its URL (Path B seeded draft / routes that placed a batch into `pending_review`):

1. Open `/batches/<id>/review` for a pending_review batch — the review page lists the complete batch with "Inspect the complete batch before later confirmation."
2. A row without a name shows the blocking message "Name is required before confirmation."; a row without a location shows "Storage location is required before confirmation."; each rejected field is identified per row.
3. A row without an expiration date shows an attention reason (warning) but does not block.
4. Two rows with the same name are flagged as a within-batch duplicate; rows are not merged or altered.
5. Invalid optional values (for example quantity `0`) are identified per row with a specific message.
6. Set one row to "Excluded", click **Save review corrections** — redirect back with notice "Review corrections saved."; corrections persist without recreating the batch.
7. While the batch remains pending, `/inventory` must not contain any of its rows.

### S6 — Confirm a batch transactionally (Ticket 1.5)

1. Fix all blocking issues on a pending_review batch; keep at least one excluded row and one undated row, then click **Confirm batch and add items to inventory**.
2. Expected redirect to `/inventory?notice=confirmed...` with notice "Batch confirmed. N item(s) added to inventory." — N counts only accepted valid rows; the excluded row is absent; the undated accepted row is present with "No expiration date".
3. Repeat-confirmation protection: navigate back and resubmit the confirm form (re-POST `/batches/<id>/confirm`) — the request is rejected (HTTP 409) and no duplicates appear in `/inventory`.
4. Optional database spot-check: `docker exec -it pantry-postgres psql -U pantry -d pantry -c "SELECT id, name, source_batch_id FROM inventory_items ORDER BY id;"` — confirmed items carry their source-batch id; draft-only fields (position, accepted) have no counterpart columns in `inventory_items`.
5. The failure-creates-no-partial-inventory criterion is covered by automated rollback tests (`tests/intake-batch.confirmation.test.js`) and is not practically triggerable from the browser — record it as automated-test-covered.

### S7 — Edit inventory items (Ticket 1.6)

1. On `/inventory`, open **Edit item** on any item.
2. Change values and save — redirect with notice "Inventory item updated successfully."; the change is visible in the list.
3. Submit an invalid update (clear the name) — validation errors render and entered values are preserved; the same domain rules apply as during intake.
4. Later edits must not rewrite the original intake batch: edit a batch-sourced item (for example Pasta), then reopen `/batches/1/review` (Path B) — the batch still shows its original rows.

### S8 — Use up / discard (Ticket 1.6)

1. Use up one item: the "Confirm removal" page appears first; confirm — redirect with notice "Item marked as used up." and the item leaves the active list.
2. Discard another item the same way — notice "Item marked as discarded.", item gone from active inventory.
3. Opening a removal URL directly always shows the confirmation page first — there is no unconfirmed one-click removal.

### S9 — Responsive layout (Ticket 1.2)

1. At desktop width (~1280 px) all views are usable.
2. At narrow mobile width (~375 px, browser device toolbar) the inventory list, batch editor, and review page remain readable and operable without horizontal page scrolling.

### S10 — Error states (cross-cutting)

1. Stop the database (`docker compose stop postgres`) and reload `/inventory` — friendly message "Inventory could not be loaded right now.", no stack trace or implementation details. Restart afterwards (`docker compose start postgres`).
2. Visit `/inventory/999/edit` and `/batches/999/review` — "Inventory item not found" / "Batch not found" (404), no internal details exposed.

## 6. Covered by automated tests instead (no browser step required)

- Inventory persistence and parameterized queries (Ticket 1.1): `tests/inventory.persistence.test.js`
- Confirmation transaction, rollback, repeat-confirmation protection: `tests/intake-batch.confirmation.test.js`
- Domain validation rules: exercised through route and persistence tests (`src/validation/`)
- Route rendering including empty state and notices: `tests/inventory.route.test.js`, `tests/intake-batch.route.test.js`

## 7. Observations worth recording during the test

- Confirmation failures (validation, 409 repeat-confirmation) render styled pages, not raw JSON bodies — part of the direct-save workflow change. If a raw error body ever appears, that is a regression and should be reported.
- The Enter-key advance behavior is script-based; verify it in your actual target browser.
- Any deviation found during this test goes into the corresponding GitHub issue as evidence; acceptance-criteria checkboxes remain yours to tick.

## 8. Recording results

- Work through the ticket 1.2–1.6 issue checklists in order S1 → S10.
- Collect one screenshot per scenario plus short notes as acceptance evidence.
- State under test: branch `feature/m1` at commit `856d02b`.



