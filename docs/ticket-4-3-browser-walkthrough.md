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
