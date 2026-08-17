# Pantry Product Scope

## Product goal

Pantry gives a household a simple, low-friction overview of food stored at home and makes food that is expired or approaching its date visible early enough to be used.

The MVP solves one problem:

> Know what food is at home, where it is stored, and what should be used soon.

## Primary users

The initial product represents one household without accounts or permissions. A representative scenario is a family returning from a large weekly grocery trip and entering many items in one session.

The architecture should avoid unnecessary obstacles to later household accounts, but the MVP must not implement them.

## Core user outcomes

- See active food inventory in one place.
- Add a single item without unnecessary fields.
- Add a large grocery batch without repeating a full page workflow.
- Describe several groceries naturally and receive an editable draft.
- Correct every proposed field before confirmation.
- Find items stored in the pantry, fridge, or freezer.
- Recognize expired, soon-to-expire, later, and undated items.
- Remove used-up or discarded items from active inventory.

## MVP workflows

### Initial household inventory

1. Start a manual batch or natural-language intake.
2. Add the food already present at home.
3. Supply known locations, quantities, and dates.
4. Review incomplete or ambiguous rows.
5. Confirm the batch.

### Weekly grocery intake

1. Start an intake batch.
2. Enter rows manually or describe the groceries in natural language.
3. Apply a location default when useful.
4. Inspect the complete draft batch.
5. Correct names, quantities, units, locations, and dates.
6. Confirm all accepted rows transactionally.

### Inventory review

1. Open the active inventory.
2. See expired and soon-to-expire items first.
3. Filter by location or expiration status.
4. Edit an item or mark it as used up or discarded.

## MVP capabilities

- Active inventory list
- Pantry, fridge, and freezer locations
- Optional quantity and controlled unit
- Optional expiration date and date type
- Single-item editing
- Manual multi-row batch intake
- Natural-language batch proposal
- Human review and correction before persistence
- Transactional batch confirmation
- Expiration-status calculation
- Sorting, filtering, and expiration summary
- Used-up and discarded lifecycle actions
- Responsive and keyboard-usable interface

## Explicit MVP exclusions

- User accounts, authentication, and permissions
- Multiple households
- Recipe suggestions
- Shopping-list recommendations
- Meal planning
- Diet, allergy, or nutrition functionality
- Retailer integration
- Barcode lookup
- Voice capture and speech transcription
- Receipt image capture, OCR, and receipt parsing
- Automatic expiration-date prediction
- Automatic food-safety decisions
- Waste analytics and reporting

Voice and receipt intake are documented as future adapters, not MVP deliverables.

## Product principles

### Low friction

Only name and location are required for a confirmed item. Other fields remain optional. Batch entry must support keyboard-first use and must not lose valid work when one row is invalid.

### Human-controlled automation

Automation creates draft suggestions. The user decides what becomes inventory and can modify or reject every proposed item.

### Missing is better than invented

Unknown dates, quantities, units, and locations remain missing. The system must not manufacture plausible values.

### Explainable attention

The interface presents concrete reasons such as `missing_location` or `ambiguous_date`. It does not present an unreliable numerical AI-confidence score.

### One inventory truth

All input methods converge on the same draft-item structure and confirmation service. Confirmed inventory is independent of the input provider.

## Initial success criteria

The MVP is successful when a household member can:

- Enter at least 20 groceries in one uninterrupted batch workflow.
- Use natural language to produce a correctable multi-item proposal.
- Recover from provider or validation errors without losing the original input.
- Confirm a batch without partial database writes.
- Immediately identify expired, soon-to-expire, and undated food.
- Complete all core workflows on desktop and a narrow mobile viewport.

## Scope acceptance

The MVP product scope defined in this document is accepted as the current implementation boundary for Ticket 0.1.

Accepted scope summary:

- Single-household inventory management only
- Manual and natural-language batch intake converging on one review workflow
- Human confirmation required before inventory persistence
- Inventory visibility by location and expiration status
- Used-up and discarded lifecycle actions

Accepted exclusions remain in force:

- Accounts and permissions
- Multi-household collaboration
- Recipes, shopping recommendations, and meal planning
- Nutrition, allergy, and diet functionality
- Barcode, voice, and receipt intake as MVP deliverables
- Automatic expiration prediction or food-safety decisions
