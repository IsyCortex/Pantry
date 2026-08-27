# Ticket 4.2 — real-browser walkthrough: live duplicate warnings

## 1. Correction record

| Field | Value |
| --- | --- |
| Branch | `feature/m4` |
| Implementation commits | `09ae909`–`654672f` (feature, styling, docs) |
| Correction commit under test | `78d62bf` |
| Browser | Chromium 151.0.7922.173 (`--headless=new`), driven via raw CDP over Node's native WebSocket |
| Viewport | ≈1280 × 900 window (capture region ≈1280 × 800) |
| Data isolation | dedicated `pantry_walkthrough` database, seeded explicitly for this run |

Defect: the live watcher called `fetch(CHECK_URL + …)` while `CHECK_URL`
was never defined; the advisory `catch` swallowed the resulting
ReferenceError, so typing a duplicate produced no warning and "Save to
inventory" confirmed directly into duplicates. Fix `78d62bf` declares
the constant next to the suggestion URL and adds a regression test that
binds the rendered literal to the `/inventory/duplicate-check` JSON
route on the same application instance.

Seed for the run: Milk (active · qty 2 · package · fridge · best before
2026-09-10), Tomato (active), Oat Milk (**used_up**), Old Jam
(**discarded**).

## 2. Scenario results — 11/11 PASS

| Scenario | Assertion | Result |
| --- | --- | --- |
| W1 exact match | typing exact active name **Milk** shows warning *before any saving* (`Identical name (case and spacing ignored)`) | PASS |
| W1 exact match | save button remains enabled while warning is shown | PASS |
| W2 variants | plural **Tomatoes** warns via plural_form vs stored Tomato | PASS |
| W2 variants | typo **miik** warns via likely_typo vs stored Milk | PASS |
| W3 lookalike | **Buttermilk** does not warn against stored Milk | PASS |
| W4 inactive | **used_up** Oat Milk does not warn (discarded Old Jam likewise excluded by seed design) | PASS |
| W5 removal | editing miik → **miikx** removes the visible warning | PASS |
| W6 prefill link | selecting the Ticket 4.1 suggestion triggers the duplicate warning instantly through the prefill event | PASS |
| W7 blocking | Save to inventory stays enabled at submit time despite the live warning | PASS |
| W8 saved | submitting with the warning shown lands on the confirmed inventory page | PASS |
| DB proof | inventory rows move exactly **4 → 5**: a *separate* new entry is written | PASS |

## 3. Persistence proof straight from the database after the browser save

```
id | name     | qty | location | exp        | lifecycle_status
1  | Milk     | 2   | fridge   | 2026-09-10 | active      <- existing: UNCHANGED
2  | Tomato   | 3   | pantry   | none       | active      <- unchanged
3  | Oat Milk | 1   | freezer  | 2026-08-15 | used_up     <- inactive, untouched
4  | Old Jam  | 1   | pantry   | none       | discarded   <- inactive, untouched
5  | Milk     | 7   | fridge   | 2027-01-01 | active      <- NEW separate row (saved draft values)
```

Both mandated persistence properties hold: saving created a separate
entry instead of merging, and quantities plus expiration dates of the
existing items are byte-for-byte unchanged.
