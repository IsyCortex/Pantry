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

## 4. Addendum — AI draft-review page (commit `7c9a50a`)

Acceptance required the identical advisory comparison on the canonical AI
draft-review page, which until then rendered no duplicate warnings at all.
`7c9a50a` routes every `batch-review` render path — normal GET,
saved-corrections redirect, validation-error render, invalid-state render —
through **one** shared helper that consults the existing duplicate service, and
reuses the manual editor's warning presentation verbatim. Excluded-row
controls and confirmation availability are untouched.

Environment: same Chromium 151.0.7922.173 (headless, raw CDP), ≈1280×900.
Isolated database seeded with one **active** `Milk` (qty 2, fridge, best
before 2026-09-10). The deterministic offline analyzer
(`ANALYZER_PROVIDER=offline` overriding the repo `.env`) processed the
proposal text `Two packages of milk.` — which additionally exercises the
case-insensitive `same_name` rule live (lowercase proposal vs stored `Milk`).

**12/12 PASS:**

| Scenario | Assertion | Result |
| --- | --- | --- |
| S1 nl-proposal | natural-language form accepts offline proposal text | PASS |
| S1 nl-proposal | analyzer created review batch and app landed on it | PASS |
| S2 warnings | review page renders live duplicate warning for Milk proposal | PASS |
| S2 warnings | warning names stored item + identical-name rule + keep-both hint | PASS |
| S2 warnings | non-matching rows stay closed | PASS |
| S2 advisory | exclude/include control present for warned row | PASS |
| S2 advisory | confirmation remains available and enabled | PASS |
| S2 proposals | proposal carries analyzer-parsed values (name milk, quantity 2) | PASS |
| S3 confirm | confirmation form submitted despite active duplicate warning | PASS |
| S3 confirm | validation-error render keeps duplicate warnings and asks for the missing location | PASS |
| S3 confirm | saved-corrections render keeps duplicate warnings | PASS |
| S3 confirm | confirmation proceeds after correction despite remaining duplicate warning | PASS |

Persistence proof straight from the database after the browser save: the
stored `Milk` row stayed **byte-identical** (qty 2, exp 2026-09-10) while the
confirmed proposal landed as a **separate** row (`milk`, qty 2, no expiry) —
inventory moved exactly **1 → 2**; nothing merged, no quantities or dates
combined. Confirmation succeeded while the warning was on screen.

Automated gates at `7c9a50a`: focused suites **61/61**; full serial suite
`node --test --test-concurrency=1` → **181/181 pass, 0 fail** (baseline 177).
