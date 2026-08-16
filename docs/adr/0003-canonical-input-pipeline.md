# ADR 0003: Canonical Input Pipeline

## Status

Accepted for Ticket 0.3.

## Context

Pantry supports multiple present and future intake sources: manual entry now, natural-language input in the MVP, and potential future adapters such as voice, receipt, or barcode intake. The system needs one stable path from source material to reviewed inventory so that new adapters do not fragment validation, review, or persistence behavior.

The architecture and input-pipeline documents already define the pipeline stages and canonical draft-item boundary. This decision needs an ADR because it is the main extensibility and AI-safety boundary in the system.

## Decision

All Pantry input sources must pass through one canonical pipeline:

```text
Source acquisition -> Source extraction -> Proposal validation -> Draft review -> Confirmation
```

All sources must produce the same canonical draft-item structure before confirmation. Inventory persistence remains independent of the input source and provider.

This means:

- manual entry creates canonical draft items directly
- natural-language analysis proposes canonical draft items
- future adapters must normalize to the same draft-item shape
- validation occurs before trusted persistence
- review and confirmation services are shared across all input methods

## Consequences

### Positive

- New adapters can be added without changing inventory behavior.
- Validation, review, and confirmation remain centralized and testable.
- AI-assisted and non-AI-assisted input share the same trusted persistence boundary.
- Inventory persistence stays provider-neutral.

### Negative

- New source adapters must conform to the canonical schema rather than invent their own persistence path.
- Adapter-specific quirks must be normalized before review.

## Alternatives considered

- Source-specific persistence paths were rejected because they would duplicate rules and weaken consistency.
- Provider-specific inventory behavior was rejected because inventory should represent confirmed household state, not source implementation details.