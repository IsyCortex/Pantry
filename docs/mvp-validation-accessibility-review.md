# MVP validation, accessibility, and error review

Ticket 5.1 (Issue #24) — Milestone 5: MVP verification and portfolio polish.

## Purpose and scope

Corrective review of every rendered surface and error path. No behavior
changes beyond message, label, and indicator corrections; the
duplicate-warning advisory model, confirmation-only persistence, and the
keyboard/focus behavior accepted in Tickets 4.1–4.3 are preserved.

Surfaces reviewed:

| Surface | Route |
|---|---|
| Inventory overview (list, filter/search, expiration overview) | `GET /inventory` |
| Manual batch editor | `GET/POST /batches/manual` |
| Natural-language intake | `GET/POST /batches/natural-language` |
| Batch review (AI drafts) | `GET/POST /batches/:batchId/review` |

Method: static review of routes, services, validation modules, and views,
cross-checked against the automated suite and the recorded browser
walkthroughs (`docs/ticket-4-1-browser-walkthrough.md`,
`docs/ticket-4-2-browser-walkthrough.md`,
`docs/ticket-4-3-browser-walkthrough.md`).

## Keyboard operation review

### Inventory overview

- Filter form (location select, status select, search input, Apply, Clear)
  and the expiration-overview cards are native focusable controls reached in
  DOM order. No positive `tabindex`, no focus traps.
- Expiration status badges and item rows are non-interactive.

### Manual batch editor

- Tab order per row: inputs first (name → quantity → unit → location →
  date), then the row action buttons (add, duplicate, remove, move).
  DOM order enforces this; CSS `order` affects visual placement only
  (regression-tested in `tests/manual-batch.route.test.js`).
- `Enter` inside a name field advances to the next row
  (`data-enter-target` binding); `Ctrl+Enter` submits the form.
- Suggestion combobox (Ticket 4.1): `ArrowDown`/`ArrowUp` move the
  highlight, `Enter` selects the highlighted candidate without triggering
  the row-advance shortcut, `Escape` closes the list, click-away closes it.
  Suggestions are advisory; the field remains editable, and the list does
  not reopen after a prefill until the content is edited again.
- Focus after actions: add row → new row's name field; duplicate row → the
  copy's name field; remove row → nearest remaining row's name field;
  validation/confirmation failure → first offending row's name field
  (server-driven `focusRow` → native `autofocus`).

### Natural-language intake

- Single textarea + submit. The analysis button sets `aria-busy` and is
  disabled while a request is in flight.
- On validation or provider failure the re-render preserves the submitted
  text and sets `autofocus` on the textarea (immediate keyboard recovery
  point); a manual-entry link remains available.

### Batch review

- Same per-row field order as the manual editor; include/exclude toggles
  are native checkboxes; confirmation is a normal submit.
- Validation or invalid-state re-renders focus the first offending row
  (`createReviewLocals` → `focusRow`).

## Accessible names

Requirement: every `input`, `select`, `textarea`, `button`, and link has a
programmatic name (label, `aria-label`, or `aria-labelledby`).

Findings (Ticket 5.1 audit):

- All form controls across `manual-batch.ejs`, `batch-review.ejs`,
  `inventory.ejs`, `inventory-edit.ejs`, `inventory-remove-confirm.ejs`, and
  `natural-language-batch.ejs` are either wrapped in a `<label>` carrying
  visible text or referenced by `<label for>` (natural-language textarea).
- No icon-only or glyph-only buttons exist; every `button` and link carries
  visible text (`+ Add item` additionally gets an `aria-label`; the name-input
  combobox sets `role="combobox"`, `aria-autocomplete`, `aria-expanded`, and
  `aria-controls` pointing at the labelled listbox).
- Global navigation is labelled (`aria-label="Global navigation"`).
- Regression coverage: `tests/validation-accessibility-review.test.js` renders
  every form page and asserts each rendered `input`/`select`/`textarea`/
  `button` (excluding `type="hidden"`) is labelled by a wrapping label, a
  `for`/`id` pair, an `aria-label`, or visible button text.

## Color independence

Requirement: no status is conveyed by color alone.

Known compliant (from Tickets 3.2/4.2): expiration badges combine a glyph,
a text label, and a border; duplicate warnings are text in an
`aria-live` block.

Findings (Ticket 5.1 audit):

- Expiration status badges (`status-expired`, `status-expiring-soon`,
  `status-later`) pair an `aria-hidden` glyph with a full text label and a
  `currentColor` border — no status is readable from color alone.
- Expiration-overview cards pair the count with a visible text label (`Expiring
  soon`, `Expired`, `Later`, `No expiration date`).
- Notices use `role="status"` with text; error panels and duplicate warnings are
  text blocks with borders (never background-only).
- Excluded review rows use reduced opacity while the include/exclude select
  separately states the row's status in text.
- Regression coverage: the same test file asserts every status badge carries a
  glyph + text label, every overview card carries a label, and notices use
  `role="status"`.

## Error messages and HTTP failure behavior

Requirement: validation messages are specific and understandable; no stack
traces, provider internals, SQL text, or configuration values reach a
rendered page or JSON error body.

Known safe by design: analyzer failures map to the canonical categories
`AI_INVALID_RESPONSE` / `AI_ANALYSIS_FAILED` and render the safe form
(422) with preserved input; unknown failures fall through to the generic
application error handler.

Findings (Ticket 5.1 audit):

- Validation messages have been user-facing in the report/review views for
  the fields checked by `createFieldErrors` (`Quantity must be a positive
  number when provided.`, `Unit requires quantity.`, `Name is required before
  confirmation.`), but the top-level error lists on the manual editor, the
  review page, and the inventory-edit form still rendered raw technical
  validation tokens such as `rows[0].quantity must be a positive number when
  provided`. **Corrected:** `src/validation/user-messages.js` translates the
  tokens into `Row N: ...` messages specific to each field, applied centrally
  in the shared render helpers (`renderManualBatch`, `sendBatchReview`) and
  the inventory-edit route. Messages already written for users pass through
  unchanged.
- No stack traces, SQL text, `console.error` output, or provider internals
  reach any rendered page or JSON body. The application error handler
  responds with a generic JSON `Internal server error`; route-level catches
  render safe pages/JSON (`Inventory could not be loaded right now.`,
  `Suggestions are unavailable right now.`).
- Regression coverage: the test file asserts friendly messages on manual
  save, review save, and inventory-edit failures (no `rows[` token on any
  rendered page), asserts the generic 500 body contains no error details, and
  asserts provider failures surface only the generic suggestion message.

## Findings and corrections

Completed by the Ticket 5.1 implementation commit(s) (`feature/m5`):

1. **AC1 — validation messages:** added `src/validation/user-messages.js`
   and applied it in `renderManualBatch`, `sendBatchReview`, and the
   inventory-edit route. No rendered page shows `rows[` tokens anymore.
2. **AC2 — failure behavior:** verified every error path; no changes were
   needed because the generic JSON 500, safe route-level catches, and the
   canonical AI error categories already contain no internals. Regression
   tests now pin this behavior.
3. **AC3 — accessible names:** verified every control; no markup changes were
   needed. Regression tests now assert label coverage on every form page.
4. **AC4 — color independence:** verified every status surface (badges,
   overview cards, notices, errors, warnings); no changes were needed.
   Regression tests now assert glyph+label pairing and `role="status"`.
5. **AC5 — keyboard and focus (this document):** completed with the
   browser-verified behavior from Tickets 4.1–4.3 (Tab order, Enter/Ctrl+Enter,
   suggestion combobox, focus-after-action, error autofocus, NL textarea
   recovery target).
6. **AC6 — test gaps:** added `tests/validation-accessibility-review.test.js`
   covering validation-message friendliness, error-leak safety, accessible
   names, and color-independent indicators across all rendered surfaces.
   Full serial suite run green at the final commit (see evidence comment on
   Issue #24).
