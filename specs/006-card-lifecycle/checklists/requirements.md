# Specification Quality Checklist: Card lifecycle (archive, restore, delete, undelete)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-20
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Validated in one pass on 2026-10-20.
- Role names (owner, maintainer, editor, reader) and the review-queue terms (proposal, Publish, Discard) are product vocabulary from earlier phases, not implementation detail.
- FR-013 ("know which kind of client asked") and FR-017 (deck links built in one place) are deliberately stated as outcomes; the mechanisms are in `plan.md` (D130, D143).
- Open product questions carried as assumptions rather than clarification markers: editors publishing directly, and image files of purged cards waiting for Phase 7. Both are listed under "Settle before starting" in `plan.md`.
