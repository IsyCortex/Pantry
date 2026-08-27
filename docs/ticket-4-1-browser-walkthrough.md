# Ticket 4.1 Browser Walkthrough — Accessible name suggestions (manual batch intake)

## 1. Purpose and context

Developer-owned, real-browser verification of the Ticket 4.1 combobox **after a
review-before-acceptance defect**: commit `8eb9092` shipped an initializer that
selected `input[data-name-suggest]`, but the rendered manual-batch Name inputs
never carried that attribute — so no combobox ever initialized. The fix renders
the attribute on every Name input and pins the markup↔initializer contract with
an automated regression assertion (commit `04a5ae6`). This document records the
subsequent interactive walkthrough against the fixed build. It complements, and
does not replace, product-owner acceptance of the Issue #21 criteria.

## 2. Test record

| Field | Value |
| --- | --- |
| Branch | `feature/m4` |
| Code under test | commit `04a5ae6` (walkthrough executed on exactly this working-tree content, committed immediately after; this document lands in a later documentation-only commit) |
| Automated suite at that content | serial `node --test --test-concurrency=1` → **160/160 pass** |
| Browser | Chromium **151.0.7922.173** (Arch Linux), `--headless=new` |
| Approximate viewport | **1280 × 800** (`Emulation.setDeviceMetricsOverride` 1280×800 @1x, window 1280×900) |
| Automation | Raw Chrome DevTools Protocol over Node's native WebSocket; trusted `Input.*` keyboard/mouse events; **no automation framework added** |
| Application environment | `node src/server.js` on `127.0.0.1:3107`, isolated database `pantry_walkthrough` (freshly migrated), health-checked before start |

## 3. Seeded data (inventory before walkthrough)

| name | location | lifecycle_status | purpose in scenarios |
| --- | --- | --- | --- |
| Milk ×2 | fridge | active | makes **fridge** the commonly used location (2× vs 1× pantry) |
| Milk ×1 | pantry | active | frequency tie-break above |
| Buttermilk | fridge | active | similar-but-separate candidate |
| Oat Milk | freezer | **used_up** | **inactive historical entry** must still resurface |

Row count before walkthrough: **4**.

## 4. Scenarios and results (15/15 assertions passed)

| Scenario | Assertion | Result |
| --- | --- | --- |
| setup | rendered Name input carries `data-name-suggest` (hook consumed by the initializer) | PASS |
| S1 mouse | dropdown opens debounced with ranked candidates `[Milk, Buttermilk, Oat Milk]`, `aria-expanded=true` | PASS |
| S1 mouse | **separate similar names**: three distinct candidates stay unmerged | PASS |
| S1 mouse | **inactive historical entry**: `used_up` *Oat Milk* is offered | PASS |
| S1 mouse | mouse click on candidate prefills name `Oat Milk` | PASS |
| S1 mouse | click also carries its most-frequent location (**freezer**) | PASS |
| S1 mouse | dropdown closes after selection | PASS |
| S1 mouse | **editable prefill**: typed trailing space sticks in the prefilled field | PASS |
| S2 arrows | query `but` narrows to exactly `[Buttermilk]` | PASS |
| S2 arrows | **ArrowDown** moves the visual highlight onto the candidate (`is-active`) | PASS |
| S2 arrows | **Enter** selects the highlighted candidate (Buttermilk + fridge) without row-advance side effects | PASS |
| S3 escape | **Escape** closes the list without selecting (`milk` stays as typed) | PASS |
| S3 escape | unknown token keeps the list closed — no fabricated candidates | PASS |
| S3 escape | reopened-list keyboard pick prefills **Milk** with its commonly used location (**fridge**, 2×fridge > 1×pantry) | PASS |
| S4 persistence | prefilled values remain visible/editable up to the click on **Save to inventory**; redirect to `/inventory`; saved entry listed | PASS |

## 5. Confirmation-only persistence proof

Inventory row count was checked in PostgreSQL directly around the entire
interactive session (all suggestion fetches, previews, keyboard/mouse picks):

- Before walkthrough: **4**
- After walkthrough, including one explicit *Save to inventory*: **5**

Exactly one row was written — by the confirmed save. Suggestion browsing,
prefill, and dismissal wrote nothing, reproducing the automated no-write
invariant under a real browser.

## 6. Conclusion

All requested interaction paths behave correctly against the corrected build
(`04a5ae6`). The five Issue #21 acceptance criteria remain **unchecked** pending
product-owner acceptance.
