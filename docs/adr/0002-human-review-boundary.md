# ADR 0002: Human Review Boundary

## Status

Accepted for Ticket 0.3.

## Context

Pantry includes automation to reduce grocery-entry friction, especially for natural-language intake. However, the product goal is accurate household inventory, not autonomous recommendation or autonomous persistence. The existing product, architecture, and input-pipeline documents all define a boundary between draft proposals and confirmed inventory.

That boundary needs an explicit ADR because it governs trust, validation, persistence, and user expectations across every present and future input adapter.

## Decision

All automation in Pantry produces draft proposals only. No automated proposal becomes inventory without explicit human review and confirmation.

This means:

- manual and automated intake converge on the same reviewable batch structure
- automated output is structurally and semantically untrusted until reviewed
- inventory is created only through the confirmation service
- providers do not persist inventory directly
- missing or ambiguous values remain visible for correction rather than being silently accepted

## Consequences

### Positive

- Users remain in control of what becomes active inventory.
- AI-assisted intake improves speed without weakening correctness guarantees.
- Validation and persistence remain application-owned rather than provider-owned.
- Future adapters such as voice or receipt intake can reuse the same trusted review boundary.

### Negative

- Intake is not fully automatic.
- Users must still inspect and confirm drafts before inventory changes.
- Some apparently convenient autonomous behaviors are intentionally excluded from the MVP.

## Alternatives considered

- Direct provider-to-inventory persistence was rejected because it would weaken trust, auditability, and correction flow.
- Confidence-score-driven acceptance was rejected because explainable review reasons are more reliable and actionable for this product.