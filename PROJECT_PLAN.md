# Pantry MVP Project Plan

## Working method

- Work proceeds through milestones containing small, reviewable tickets.
- Every ticket has acceptance criteria and a technical plan/progress checklist.
- Unless explicitly requested by the product owner, acceptance-criteria checkboxes are not edited or checked by the implementation partner; acceptance testing remains human-owned.
- Product scope and acceptance remain human-owned.
- The implementation partner inspects and reports before changing code.
- Automated tests use deterministic providers; live-model evaluation is separate.
- Product definitions belong in tickets and documentation. Implementation evidence and deviations are recorded in ticket progress and the engineering log.
- A ticket is complete only when its acceptance criteria have evidence and its documentation is current.

## Ticket workflow states

- `Todo`: the ticket exists and has not been started.
- `In Progress`: the implementation partner is actively working the ticket after explicit instruction from the product owner to begin.
- `Blocked`: technical work cannot continue; the exact blocker and required next action must be recorded in the issue.
- `Ready for Acceptance`: all technical-plan items are complete, required verification has passed, and an acceptance handoff with supporting evidence has been recorded in the issue.
- `Done`: the product owner has tested the ticket against its acceptance criteria, accepted it, and finalized the work.

## Ticket-state responsibilities

- The implementation partner manages technical ticket-state transitions into `In Progress`, `Blocked`, and `Ready for Acceptance`.
- The GitHub issue is the authoritative live technical checklist for each ticket. `PROJECT_PLAN.md` defines scope and intended work but does not mirror live technical progress.
- Ticket work follows this order: activate the ticket, implement locally, verify, commit, push, and only then update the live `Technical plan and progress` checklist in the GitHub issue.
- The implementation partner maintains only the `Technical plan and progress` checkboxes and checks an item only when repository evidence has been committed and pushed.
- The implementation partner records relevant files, commit SHAs, verification evidence, decisions, and blockers in the GitHub issue.
- If work cannot continue, the implementation partner moves the ticket to `Blocked` and records the exact blocker and required next action.
- A formally tracked blocker is a problem that prevents ticket work from continuing and causes the ticket to move to `Blocked`.
- While a formally tracked blocker is active, the GitHub issue contains a concise active-blocker section covering observed symptoms, affected workflow steps, currently known evidence, and the next diagnostic or resolution action.
- Minor implementation difficulties that do not stop progress do not require a separate blocker document.
- When all technical-plan items are complete, the implementation partner performs a full ticket review, pushes any necessary corrections, and then moves the ticket to `Ready for Acceptance` with evidence for every acceptance criterion.
- The implementation partner never checks acceptance-criteria boxes, moves a ticket to `Done`, closes an issue, or closes a milestone unless explicitly instructed.
- Product acceptance, movement to `Done`, and final completion remain the responsibility of the product owner.

## Blocker lifecycle

- A ticket moves to `Blocked` only when a formally tracked blocker prevents further work.
- Diagnosis and resolution continue through the normal evidence-driven workflow.
- After a blocker is resolved and verified, create a blocker-resolution document under `docs/blockers/` before updating the GitHub issue.
- Blocker-resolution documents must use a descriptive filename containing the date, ticket number, and a short blocker description.
- Each blocker-resolution document records the related ticket and milestone, dates encountered and resolved, context, symptoms, impact, diagnostic steps and evidence, confirmed root cause, resolution, verification, recurrence indicators, recovery guidance, and related commits or files.
- Symptoms, hypotheses considered, and confirmed root cause must be clearly separated. Causes must not be invented.
- Do not include secrets, sensitive configuration, or excessive raw logs in blocker documents.
- After the blocker document is committed and pushed, replace the issue’s active blocker section with a concise resolved summary containing the dates, confirmed cause, resolution, verification result, and a link to the blocker document.
- A ticket returns from `Blocked` to `In Progress` only after the resolution has been verified.

## Release and Gitflow responsibilities

- Each milestone is treated as a release.
- Pantry release tags follow Semantic Versioning in the format `vMAJOR.MINOR.PATCH`.
- During pre-1.0 development, each completed milestone release increments the minor version, corrective non-milestone releases increment the patch version, and prerelease candidates use suffixes such as `-rc.1` when needed.
- Release tags must be annotated, must point to the final released commit, and must never be reused or moved after publication.
- Release preparation begins only after every ticket in the milestone has been accepted and moved to `Done`, and the product owner explicitly authorizes release preparation.
- During release preparation, the implementation partner verifies milestone tickets, repository state, tests, documentation, and version.
- The implementation partner prepares the proposed release version, functional release summary, included-ticket list, verification evidence, changelog, annotated tag, and GitHub Release materials.
- Release commit messages identify the Pantry version and milestone and describe delivered functionality in user-facing or system-behavior terms rather than merely listing files or implementation tasks.
- Before merges, tagging, release publication, version changes, or milestone closure, the implementation partner presents the proposed version, included tickets, test evidence, release commit message, and release notes for explicit project-owner approval.
- The implementation partner must not merge into `main` or `develop`, create a tag, publish a GitHub Release, begin release publication, or close a milestone without explicit project-owner approval.

## Gitflow release sequence

1. Complete milestone tickets and move them to `Done` through owner acceptance.
2. Receive explicit authorization to begin release preparation.
3. Prepare the release version, release commit, functional release notes, included-ticket list, and verification evidence on the authorized release branch.
4. Present the full release package for project-owner approval before any merge, tag, publication, or milestone closure.
5. Merge the approved release into `main` with an explicit merge commit.
6. Create an annotated version tag from the approved release state.
7. Merge the release back into `develop`.
8. Publish the GitHub Release from the approved release notes.
9. Close the milestone only after explicit project-owner approval.

## MVP path

1. Establish the product, domain, architecture, and extensible input boundary.
2. Deliver a complete manual inventory and shared batch workflow.
3. Add natural-language batch proposals with mandatory human review.
4. Make expiration risk visible and inventory easy to navigate.
5. Reduce remaining entry friction without expanding the product domain.
6. Verify and present a reproducible portfolio MVP.

# M0 — Project and AI-ready foundation

## Ticket 0.1 — Define the MVP product scope and workflows

### Acceptance criteria

- [ ] The single-household MVP scope is documented.
- [ ] Initial inventory, weekly grocery intake, occasional single-item entry, inventory review, and removal workflows are documented.
- [ ] Manual and natural-language batch entry converge on the same review workflow.
- [ ] The boundary between draft proposals and confirmed inventory is explicit.
- [ ] AI extraction is explicitly distinguished from recommendations.
- [ ] Included and excluded functionality is documented.
- [ ] Voice and receipt intake are identified as future adapters, not MVP functionality.

### Technical plan and progress

- [x] Define the primary household scenario
- [x] Document initial inventory onboarding
- [x] Document weekly grocery intake
- [x] Document occasional single-item entry
- [x] Document inventory review and removal
- [x] Define draft, review, confirmation, and inventory boundaries
- [x] Record MVP exclusions
- [x] Review and accept the product scope

## Ticket 0.2 — Define the Pantry domain model

### Acceptance criteria

- [ ] Inventory item, intake batch, and draft item are defined separately.
- [ ] Storage-location, date-type, lifecycle, and expiration-status terms are defined.
- [ ] Required, optional, derived, and review-only fields are identified.
- [ ] A batch can contain multiple editable draft items.
- [ ] Confirmed items can be traced to their source batch.
- [ ] Domain invariants and valid state transitions are documented.
- [ ] The model permits future voice, receipt, and barcode sources without changing inventory persistence.

### Technical plan and progress

- [ ] Define `inventory_items`
- [ ] Define `intake_batches`
- [ ] Define `intake_batch_items`
- [ ] Define controlled values and nullability
- [ ] Define batch lifecycle
- [ ] Define inventory lifecycle
- [ ] Define expiration-status calculation
- [ ] Define attention reasons
- [ ] Review domain invariants

## Ticket 0.3 — Define the application architecture

### Acceptance criteria

- [ ] The technical stack is selected and documented.
- [ ] Application layers and responsibilities are defined.
- [ ] Inventory persistence is independent of input source and AI provider.
- [ ] The batch editor is independent of how draft rows were created.
- [ ] Source acquisition, extraction, validation, review, and confirmation are separate stages.
- [ ] Configuration and safe error boundaries are documented.
- [ ] Significant trade-offs are captured in ADRs.

### Technical plan and progress

- [ ] Confirm or revise the proposed Node.js/Express/EJS/PostgreSQL stack
- [ ] Define repository structure
- [ ] Define routes, services, database, validation, and processor layers
- [ ] Define transaction ownership
- [ ] Define provider configuration
- [ ] Define error categories
- [x] Define repository workflow and release boundaries
- [ ] Create architecture ADR
- [ ] Create human-review-boundary ADR
- [ ] Create input-pipeline ADR

## Ticket 0.4 — Specify the canonical input and analyzer contracts

### Acceptance criteria

- [ ] All input methods produce one canonical draft-item structure.
- [ ] Natural-language analyzer input and output schemas are documented.
- [ ] Relative-date processing receives an explicit reference date, timezone, and locale.
- [ ] Missing information remains `null` and is never invented.
- [ ] Controlled attention reasons replace numerical confidence scores.
- [ ] Unknown properties and invalid enum values are rejected.
- [ ] Input, output, item-count, and processing limits are defined.
- [ ] Invalid proposals cannot reach inventory persistence.

### Technical plan and progress

- [ ] Define canonical draft-item schema
- [ ] Define analyzer input schema
- [ ] Define analyzer output proposal schema
- [ ] Define controlled values
- [ ] Specify proposal-validation rules
- [ ] Define provider and validation errors
- [ ] Create representative JSON contract fixtures
- [ ] Document sample inputs and outputs
- [ ] Document analyzer/domain responsibility boundaries
- [ ] Document scope division between Ticket 0.4 specification and Ticket 2.3 enforcement

## Ticket 0.5 — Create the runnable application foundation

### Acceptance criteria

- [ ] The application starts locally using documented commands.
- [ ] PostgreSQL can be created reproducibly.
- [ ] Migrations run from a clean database.
- [ ] Application and database health can be verified.
- [ ] Automated tests run without a live language model.
- [ ] Configuration contains no committed secrets or machine-specific addresses.

### Technical plan and progress

- [ ] Initialize repository
- [ ] Create application skeleton
- [ ] Configure PostgreSQL through Docker Compose
- [ ] Establish migrations
- [ ] Add health check
- [ ] Establish automated tests
- [ ] Add environment configuration
- [ ] Document local setup

# M1 — Manual inventory and shared batch workflow

## Ticket 1.1 — Implement inventory persistence

### Acceptance criteria

- [ ] Inventory items can be created and retrieved.
- [ ] Confirmed items require a name and storage location.
- [ ] Quantity, unit, and expiration date are optional; date type follows the documented expiration-date nullability rules.
- [ ] Invalid values are rejected.
- [ ] Database operations use parameterized queries.
- [ ] Persistence behavior is covered by automated tests.

### Technical plan and progress

- [ ] Create inventory migration
- [ ] Add inventory queries
- [ ] Add inventory service
- [ ] Implement domain validation
- [ ] Add persistence tests

## Ticket 1.2 — Display the active inventory

### Acceptance criteria

- [ ] All active items are visible.
- [ ] Name and storage location are always shown.
- [ ] Quantity and expiration information appear when available.
- [ ] Undated items are distinguishable.
- [ ] An empty inventory provides a useful onboarding path.
- [ ] The interface works at desktop and narrow mobile widths.

### Technical plan and progress

- [ ] Add active-inventory query
- [ ] Add route and service
- [ ] Build inventory view
- [ ] Add empty and error states
- [ ] Add route tests
- [ ] Verify responsive layout

## Ticket 1.3 — Create manual intake batches

### Acceptance criteria

- [ ] Multiple draft rows can be created before confirmation.
- [ ] Rows support name, location, quantity, unit, expiration date, and date type.
- [ ] Rows can be added, edited, duplicated, reordered, and removed.
- [ ] Enter creates or advances to the next row where appropriate.
- [ ] A default storage location applies only to newly created rows.
- [ ] Draft work survives validation errors.
- [ ] An unconfirmed draft batch can be resumed after a page reload without recreating its rows.
- [ ] At least 20 items can be entered without navigating away.

### Technical plan and progress

- [ ] Create batch migrations
- [ ] Add batch and draft-item queries
- [ ] Add batch services
- [ ] Build shared batch editor
- [ ] Implement keyboard-first row entry
- [ ] Implement default-location behavior
- [ ] Add draft persistence tests
- [ ] Add interface tests

## Ticket 1.4 — Review and validate an intake batch

### Acceptance criteria

- [ ] The complete batch is inspectable before confirmation.
- [ ] Invalid fields are identified per row.
- [ ] Missing expiration dates warn but do not block confirmation.
- [ ] Missing names or storage locations block confirmation for accepted rows.
- [ ] Possible duplicates within the batch are flagged but not merged.
- [ ] Users can exclude individual rows.
- [ ] Corrections do not require recreating the batch.
- [ ] Draft rows never appear in active inventory.

### Technical plan and progress

- [ ] Add row-level validation
- [ ] Add attention-reason calculation and presentation
- [ ] Add within-batch duplicate detection
- [ ] Build review state
- [ ] Preserve corrections and exclusions
- [ ] Add validation and route tests

## Ticket 1.5 — Confirm a batch transactionally

### Acceptance criteria

- [ ] Confirmation creates inventory items from all accepted valid rows.
- [ ] The operation uses one database transaction.
- [ ] Failure creates no partial inventory.
- [ ] A confirmed batch cannot be confirmed again.
- [ ] Draft-only and provider metadata do not leak into inventory fields.
- [ ] Created items retain their source-batch relationship.
- [ ] Confirmed items immediately appear in active inventory.

### Technical plan and progress

- [ ] Implement confirmation transaction
- [ ] Revalidate accepted rows inside the confirmation service
- [ ] Add repeat-confirmation protection
- [ ] Map draft rows to inventory records
- [ ] Record source-batch relationships
- [ ] Add rollback tests
- [ ] Add repeat-confirmation tests

## Ticket 1.6 — Edit and remove inventory items

### Acceptance criteria

- [ ] A confirmed inventory item can be edited.
- [ ] The same domain validation applies during update.
- [ ] An item can be marked as used up or discarded.
- [ ] Removed items leave active inventory.
- [ ] Later edits do not rewrite the original intake batch.
- [ ] Removal is protected by confirmation or a reliable undo interaction.

### Technical plan and progress

- [ ] Add item lookup and update service
- [ ] Add lifecycle fields and transitions
- [ ] Build edit interface
- [ ] Implement used-up action
- [ ] Implement discarded action
- [ ] Add confirmation or undo behavior
- [ ] Add automated tests

# M2 — Natural-language batch analysis

## Ticket 2.1 — Implement the deterministic analyzer provider

### Acceptance criteria

- [ ] A fake provider implements the production analyzer contract.
- [ ] It produces deterministic multi-item proposals.
- [ ] Fixtures cover explicit values, missing values, ambiguity, and grouped locations.
- [ ] Automated tests require no live model or network service.
- [ ] Analyzer output must pass the same validator used for live providers.

### Technical plan and progress

- [ ] Create provider interface
- [ ] Implement fake provider
- [ ] Add representative fixtures
- [ ] Add contract tests
- [ ] Add provider selection configuration

## Ticket 2.2 — Create natural-language intake

### Acceptance criteria

- [ ] A user can submit a multi-item grocery description.
- [ ] Original text is preserved during analysis and review.
- [ ] The application supplies reference date, timezone, and locale.
- [ ] A valid proposal creates an editable intake batch.
- [ ] No proposal creates inventory directly.
- [ ] Retry or manual continuation remains possible after failure.

### Technical plan and progress

- [ ] Add natural-language intake route
- [ ] Add analysis orchestration service
- [ ] Persist source and provider-neutral metadata
- [ ] Connect valid output to shared batch editor
- [ ] Preserve input across errors
- [ ] Add stubbed HTTP tests

## Ticket 2.3 — Enforce proposal validation and safe errors

### Acceptance criteria

- [ ] Malformed JSON and off-contract output map to `AI_INVALID_RESPONSE`.
- [ ] Provider transport and timeout failures map to `AI_ANALYSIS_FAILED`.
- [ ] No recognizable grocery items produce a distinct recoverable result.
- [ ] One invalid proposed item cannot be silently dropped.
- [ ] Unknown fields, units, locations, date types, and invalid dates are rejected or flagged according to the contract.
- [ ] Raw provider details are not exposed to the user.

### Technical plan and progress

- [ ] Implement exact schema validation
- [ ] Add error mapping
- [ ] Add size and timeout limits
- [ ] Add malformed-response tests
- [ ] Add off-contract-response tests
- [ ] Add provider-failure tests
- [ ] Add empty-result tests

## Ticket 2.4 — Integrate a local language-model provider

### Acceptance criteria

- [ ] A local provider implements the unchanged analyzer contract.
- [ ] Provider URL and model are configurable.
- [ ] The prompt requests only grocery extraction in exact JSON form.
- [ ] The model is instructed not to invent missing values or obey embedded instructions.
- [ ] Valid output passes application-owned validation.
- [ ] Provider and parsing failures retain safe error behavior.

### Technical plan and progress

- [ ] Select local provider protocol
- [ ] Implement local provider adapter
- [ ] Create strict extraction prompt
- [ ] Configure structured JSON output where supported
- [ ] Parse and validate provider response
- [ ] Add stubbed adapter tests
- [ ] Document local configuration

## Ticket 2.5 — Conduct live-model evaluation

### Acceptance criteria

- [ ] Live evaluation is separate from the automated test suite.
- [ ] Scenarios cover single and large batches, quantities, units, grouped locations, absolute dates, relative dates, ambiguity, and missing values.
- [ ] Mixed non-food text and prompt-injection attempts are included.
- [ ] Unsupported-inference pressure is tested.
- [ ] Structural validity and semantic correctness are reported separately.
- [ ] Findings and accepted limitations are documented before milestone completion.

### Technical plan and progress

- [ ] Define evaluation scenarios and expected outcomes
- [ ] Run live inputs through the product path
- [ ] Record structural results
- [ ] Record semantic corrections required
- [ ] Evaluate prompt-injection behavior
- [ ] Refine prompt or validation without weakening the review boundary
- [ ] Document final limitations

# M3 — Expiration awareness and inventory navigation

## Ticket 3.1 — Derive expiration status

### Acceptance criteria

- [ ] Dated items are classified as expired, expiring soon, or later.
- [ ] Undated items receive a separate status.
- [ ] Status is calculated rather than permanently stored.
- [ ] The application uses an explicit timezone.
- [ ] Today and threshold boundaries are covered by tests.
- [ ] The interface does not claim that a date alone determines food safety.

### Technical plan and progress

- [ ] Confirm expiration threshold
- [ ] Implement status calculation
- [ ] Centralize application-date handling
- [ ] Add boundary tests
- [ ] Document date semantics

## Ticket 3.2 — Prioritize inventory by expiration

### Acceptance criteria

- [ ] Expired items appear before soon-to-expire items.
- [ ] Items within a dated group are ordered by date.
- [ ] Undated items remain discoverable.
- [ ] Status indicators do not rely solely on color.
- [ ] Ordering is deterministic and tested.

### Technical plan and progress

- [ ] Add expiration-aware ordering
- [ ] Design accessible indicators
- [ ] Update inventory view
- [ ] Add ordering tests
- [ ] Verify responsive presentation

## Ticket 3.3 — Filter and search the inventory

### Acceptance criteria

- [ ] Inventory can be filtered by storage location.
- [ ] Inventory can be filtered by expiration status.
- [ ] A user can search by item name.
- [ ] Active filters and search terms are visible.
- [ ] Filters can be cleared easily.
- [ ] Empty filtered results are distinct from an empty inventory.

### Technical plan and progress

- [ ] Define filter and search parameters
- [ ] Extend query and service
- [ ] Add controls
- [ ] Preserve active state
- [ ] Add filter and search tests

## Ticket 3.4 — Add the expiration overview

### Acceptance criteria

- [ ] Counts for expired, soon-to-expire, and undated items are immediately visible.
- [ ] Each count opens the corresponding inventory view.
- [ ] Counts match the filtered inventory results.
- [ ] The overview has a useful zero state.

### Technical plan and progress

- [ ] Add summary query or service calculation
- [ ] Build overview component
- [ ] Link counts to filters
- [ ] Add consistency tests

# M4 — Low-friction refinements

## Ticket 4.1 — Suggest previously used item names

### Acceptance criteria

- [ ] Item-name suggestions come from the household's existing or prior entries.
- [ ] Suggestions never create an item without selection and confirmation.
- [ ] Selecting a suggestion can prefill its commonly used location.
- [ ] Prefilled values remain visible and editable.
- [ ] Similar names are not silently merged.

### Technical plan and progress

- [ ] Define suggestion query
- [ ] Define safe prefill behavior
- [ ] Implement name suggestions
- [ ] Add keyboard interaction
- [ ] Add automated tests

## Ticket 4.2 — Detect possible inventory duplicates

### Acceptance criteria

- [ ] Draft rows can be compared with active inventory.
- [ ] Possible matches generate warnings rather than blocking confirmation.
- [ ] Users may keep both batches.
- [ ] No quantities or expiration dates are silently combined.

### Technical plan and progress

- [ ] Define conservative matching rules
- [ ] Add inventory comparison service
- [ ] Display possible matches in review
- [ ] Add false-positive and false-negative fixtures

## Ticket 4.3 — Refine keyboard, mobile, and recovery behavior

### Acceptance criteria

- [ ] Core batch entry can be completed with a keyboard.
- [ ] Focus moves predictably after row creation, deletion, and errors.
- [ ] Draft work survives expected validation and provider failures.
- [ ] Core workflows remain usable on a narrow mobile viewport.
- [ ] Loading, success, empty, and failure states are distinct.

### Technical plan and progress

- [ ] Audit keyboard flow
- [ ] Audit focus management
- [ ] Audit mobile batch editing
- [ ] Improve draft recovery
- [ ] Add targeted interface tests
- [ ] Complete manual accessibility review

# M5 — MVP verification and portfolio polish

## Ticket 5.1 — Complete validation, accessibility, and error review

### Acceptance criteria

- [ ] Invalid input produces specific and understandable messages.
- [ ] Known application failures do not expose implementation details.
- [ ] All controls have accessible names and labels.
- [ ] Status does not rely solely on color.
- [ ] Keyboard and focus behavior pass the documented review.
- [ ] Important failure paths are covered by tests.

### Technical plan and progress

- [ ] Review validation messages
- [ ] Review HTTP error mapping
- [ ] Review labels and accessible names
- [ ] Review color-independent indicators
- [ ] Review focus behavior
- [ ] Close test gaps

## Ticket 5.2 — Verify the complete MVP end to end

### Acceptance criteria

- [ ] A household can populate an initially empty inventory.
- [ ] At least 20 groceries can be entered in one manual batch.
- [ ] Natural-language input creates a correctable multi-item proposal.
- [ ] Provider failure permits retry or manual continuation without lost input.
- [ ] Corrected batches confirm without partial writes.
- [ ] Expired, soon-to-expire, later, and undated items are identifiable.
- [ ] Items can be searched, filtered, edited, used up, and discarded.
- [ ] The documented verification passes from a clean environment.

### Technical plan and progress

- [ ] Create clean-database verification procedure
- [ ] Create representative family grocery scenario
- [ ] Verify manual batch path
- [ ] Verify natural-language path
- [ ] Verify correction and confirmation
- [ ] Verify inventory navigation and expiration behavior
- [ ] Verify lifecycle removal
- [ ] Record evidence and remaining limitations

## Ticket 5.3 — Complete portfolio documentation and demo

### Acceptance criteria

- [ ] The README explains the problem, workflow, architecture, and MVP boundary.
- [ ] Setup and test instructions work from a clean environment.
- [ ] Architecture and significant decisions are documented.
- [ ] A reproducible seed or demo inventory is available.
- [ ] The demo covers both manual and natural-language intake.
- [ ] Future voice and receipt adapters are documented without being presented as completed functionality.
- [ ] The engineering log reflects actual implementation decisions and evaluation results.

### Technical plan and progress

- [ ] Finalize README
- [ ] Finalize architecture documentation
- [ ] Complete ADR set
- [ ] Create seed/demo scenario
- [ ] Add screenshots or concise walkthrough
- [ ] Finalize testing documentation
- [ ] Finalize engineering log
- [ ] Perform tracked-secret and machine-specific configuration review

# Post-MVP directions

Post-MVP milestones will be planned only after MVP completion and evidence from actual use. Candidate areas include:

- Voice intake through speech transcription and the existing natural-language analyzer
- Receipt-photo intake through OCR or vision extraction and the existing batch review workflow
- Barcode lookup
- Household accounts and collaboration
- Waste analytics based on used-up and discarded states
- Recipe and shopping assistance

These candidates do not expand the current MVP acceptance boundary.
