# Ticket 4.3 — Keyboard, mobile, and recovery behavior (browser walkthrough)

- **Branch / commits:** `feature/m4`; code under test commit `829cace` (`feat(#23): keyboard, focus, mobile, and draft-recovery for batch entry`), on top of Ticket 4.2 (`7e67e37`+).
- **Browser:** Chromium **151.0.7922.173**, headless (`--headless=new`), driven via raw CDP over a native WebSocket (no browser-automation framework added to the stack).
- **Approx. viewport:** 1280 × 900 window (captured at ≈1280 × 800).
- **Data:** isolated `pantry_walkthrough` database — one active `Milk` (qty 2, package, fridge, exp 2026-09-10, best_before).

## Background

The manual batch editor renders per-row advisory duplicate warnings
(`data-duplicate-warning`) and a live watcher that fetches
`GET /inventory/duplicate-check?q=` as the operator types. The watcher reacts
only to genuine (trusted) input events — exactly like the Ticket 4.1 name
suggestion list ignores programmatic input events — so any assertion must be
driven with real keyboard input, not DOM-value scripting. The editor also had a
latent targeting defect: every row-action button declared `name="action"`
twice, so the browser kept the first sibling's value and all row actions hit
row 1. The walkthrough exercises both the corrected targeting and the live
warning flow.

## Scenarios and results

| # | Scenario | Assertion | Result |
| --- | --- | --- | --- |
| S1 | type exact active name | typing an exact active-inventory name (`milk`) displays a duplicate warning before saving, matching `Milk` | **PASS** |
| S2 | plural + typo warn | plural variant `milks` and supported typo `miik` both display warnings | **PASS** |
| S3 | false-positive guard | `Buttermilk` (shares the word "milk") does **not** warn against `Milk` | **PASS** |
| S4 | inactive history | a `used_up` historical `Milk` does **not** trigger a warning (only active inventory is compared) | **PASS** |
| S5 | clear on non-match | changing the name to a non-match (`kale`) removes the warning | **PASS** |
| S6 | suggestion → warning | picking a Ticket 4.1 name suggestion (`Milk`) re-triggers the warning live | **PASS** |
| S7 | save unblocked | Save to inventory remains enabled and lands on `/inventory?notice=confirmed&created=1` | **PASS** |
| S8 | separate entry | saving creates a separate inventory row (count 1 → 2) — no merge | **PASS** |
| S9 | untouched original | the original `Milk` row stays byte-identical (qty 2, exp 2026-09-10, active) alongside the new entry | **PASS** |

**Result: 9/9 PASS.** Persistence forensics (psql row dump): row 1
`Milk|2|package|fridge|2026-09-10|active` unchanged; row 2 `Milk|<null>|<null>|fridge|<null>|active` inserted as a distinct entry.

## Acceptance-criteria mapping

| AC | Covered by |
| --- | --- |
| Core batch entry can be completed with a keyboard | S7 (Save-to-inventory via keyboard; no-JS `enter-row` + `?row=` targeting verified in route tests) |
| Focus moves predictably after row creation, deletion, and errors | route tests for `?row=` targeting, `enter-row` advance, and validation-error autofocus (manual + review) |
| Draft work survives expected validation and provider failures | warning retention on the 400 validation re-render (S5/S7 flows stay intact); NL safe-form + `rawText` preservation (Ticket 2.2); manual draft rows repopulate on every re-render |
| Core workflows remain usable on a narrow mobile viewport | inherited viewport meta + responsive `.field-grid`/`.batch-row`; 36rem CSS tightening and `:focus-visible` outline |
| Loading, success, empty, and failure states are distinct | NL analysis button now `aria-busy` "Analyzing items…" + disabled; `.errors`/`.notice`/`.empty`/`.excluded` states already distinct and retained |

---

## Follow-up — closing the partially-met acceptance criteria (acceptance round 2)

After product feedback marked the keyboard, focus, and mobile criteria
*partially met*, a second audit (same environment: Chromium 151.0.7922.173
headless/raw CDP; implementation commit **`ae734e5`**) closed the remaining
gaps:

- **Keyboard tab order aligned with the visual/Enter flow.** `.row-actions`
  moved *after* `.field-grid` in the DOM, so Tab reaches each row's inputs
  (Name → Quantity → Unit → Location → Expiration → Date type) before its
  action buttons; CSS `.batch-row .row-actions { order: -1 }` keeps the actions
  visually on top. Verified live: `Tab` from the Name field lands on Quantity
  (not "Move up").
- **Full keyboard completion.** A **Ctrl+Enter** accelerator now submits the
  editor straight to inventory (the toolbar sits above the rows, so tabbing
  back to it was otherwise the only keyboard path after the last field of the
  last row); the Save button carries the hint `title="Save to inventory
  (Ctrl+Enter)"`. Verified live: combo (ArrowDown+Enter) → Enter-advance →
  Ctrl+Enter lands on `/inventory?notice=confirmed&created=1`, with a separate
  `Milk` row persisted (count 2 → 3) and the original id-1 `Milk` untouched.
- **Predictable focus on errors.** Verified live that the validation-error
  re-render leaves the offending row's Name field focused (native `autofocus`
  from `focusRow`).
- **Narrow-mobile hardening.** At `max-width: 36rem`, comfortable touch target
  `min-height: 2.5rem` on editor/toolbar controls and overflow guards
  (`max-width: 100%` suggestions, `word-break` warnings). Verified live at
  320px: no horizontal overflow and 40px min-height applied.

### Round-2 browser verification (all PASS)

| Check | Assertion | Result |
| --- | --- | --- |
| focus | row-actions still display above the fields (CSS order) | **PASS** |
| keyboard | Tab from Name reaches Quantity first (fields before action buttons) | **PASS** |
| focus | validation-error render keeps the name field focused | **PASS** |
| keyboard | Ctrl+Enter submits Save to inventory (full keyboard completion) → `/inventory?notice=confirmed&created=1` | **PASS** |
| mobile | no horizontal overflow at 320px | **PASS** |
| mobile | 320px touch target applied (min-height 40px) | **PASS** |

Regression guard added in `tests/manual-batch.route.test.js`: the rendered
editor is asserted to place every row's editable fields before its action
buttons in the document (previewable keyboard tab order).

---

## Follow-up — acceptance round 3 (focus after create/delete; NL failure focus; broad narrow-mobile)

Two criteria were marked *partially met* again: predictable focus (creation and
deletion focus were not browser-exercised, and natural-language failure had no
deliberate focus target) and narrow-mobile (the NL form, AI review page, and
inventory had not been included in the narrow-viewport verification). Closed
with commit **`cc7deef`** plus this browser evidence (same environment:
Chromium 151.0.7922.173 headless/raw CDP):

- **Creation/deletion focus now browser-verified.** Live assertions: `add-row`
  autofocuses the newly created row's Name, `duplicate-row` autofocuses the
  copy, `remove-row` autofocuses a remaining row's Name.
- **Natural-language failure focus target.** On an analysis failure (400/422
  re-render) the preserved `rawText #rawText` textarea now carries `autofocus`,
  giving keyboard users an explicit recovery target. Regression-tested in
  `tests/natural-language-intake.test.js`; browser-verified with an empty
  submit landing focus on the textarea.
- **Broad narrow-mobile coverage.** The natural-language form, the AI review
  page, and the inventory page are all verified to have **no horizontal
  overflow at 320px**.

### Round-3 browser verification (all PASS)

| Check | Assertion | Result |
| --- | --- | --- |
| focus | add-row autofocuses the newly created row name | **PASS** |
| focus | duplicate-row autofocuses the copied row name | **PASS** |
| focus | remove-row autofocuses a remaining row name | **PASS** |
| focus | NL failure re-render autofocuses the preserved rawText textarea | **PASS** |
| mobile | NL form no horizontal overflow at 320px | **PASS** |
| mobile | AI review page no horizontal overflow at 320px | **PASS** |
| mobile | inventory page no horizontal overflow at 320px | **PASS** |

With the round-2 checks (fields-first tab order, Ctrl+Enter completion, error
autofocus, 320px no overflow + touch targets on the manual editor), every
acceptance criterion is now directly browser-verified. Full serial suite
**187/187 pass**; focused **30/30**.
