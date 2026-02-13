# Documentation Conventions

## Agent Metadata

- `Doc Kind`: `policy`
- `Canonicality`: `canonical`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `docs/*.md`
- `Update Trigger`: Documentation structure, trust model, or routing expectations change.

## Agent Use

- `Read this when`: creating a new doc or editing any existing doc in `docs/`.
- `Stop reading when`: you need domain behavior details; switch to the relevant domain doc.
- `Escalate to`: `docs/agent-canonical-context.md` for policy conflicts, `docs/agent-directory.md` for routing.

## Purpose

This file defines a single, machine-friendly structure for docs so AI agents can route quickly, assess trust level, and avoid mixing roadmap material with implemented behavior.

## Required Top-of-File Structure

Every document in `docs/` should start with this order:

1. `# <Title>`
2. `## Agent Metadata`
3. `## Agent Use`
4. Domain content (`## Purpose`, `## Overview`, etc.)

## Filename Convention

Use lowercase kebab-case filenames for all docs in `docs/`:

- format: `<topic>-<type>.md`
- examples:
  - `agent-canonical-context.md`
  - `api-entrypoints-directory.md`
  - `subscription-quick-reference.md`

Avoid uppercase, underscores, and ambiguous abbreviations in filenames.

## Required `Agent Metadata` Fields

Use exactly these keys:

- `Doc Kind`: one of `policy`, `routing-index`, `orientation`, `directory`, `guide`, `reference`, `operations-guide`, `status`, `migration-plan`, `roadmap`.
- `Canonicality`: one of `canonical`, `routing`, `reference`, `implementation-guide`, `status`, `advisory`, `proposed`.
- `Owner`: team or function responsible for updates.
- `Last Reviewed`: ISO date (`YYYY-MM-DD`).
- `Primary Surfaces`: 1-5 key files/modules/docs this document maps to.
- `Update Trigger`: concrete condition that requires refreshing this document.

## Required `Agent Use` Fields

Use exactly these keys:

- `Read this when`: the task types where this doc is high-value.
- `Stop reading when`: condition to switch docs to avoid over-reading.
- `Escalate to`: canonical doc(s) or source files when certainty is required.

## Trust and Conflict Rules

- `canonical` docs define non-negotiable policy.
- `routing` docs define discovery order.
- `reference` and `implementation-guide` docs describe current implementation and can lag.
- `status`, `advisory`, `proposed`, `roadmap`, and `migration-plan` docs are informational and not proof of implementation.
- If any docs conflict:
  1. Use `docs/agent-canonical-context.md`.
  2. Then use implementation code.
  3. Then use domain docs.

## Writing Rules for Agent Readability

- Use absolute repository paths in backticks (for example, `app/api/grocery-search/route.ts`).
- Use ISO dates only (`YYYY-MM-DD`) for reviewed/updated timestamps.
- Prefer stable section names and avoid decorative heading changes.
- Keep examples short and tied to real file paths.
- Call out legacy/disabled behavior explicitly.
- Mark speculative plans as non-canonical.

## Maintenance Checklist (Per Doc Edit)

1. Confirm `Agent Metadata` exists and fields are complete.
2. Confirm `Agent Use` fields are complete and task-focused.
3. Update `Last Reviewed` with the edit date.
4. Verify `Primary Surfaces` paths still exist.
5. If trust level changed, update `Canonicality`.
6. If new docs are added, update `docs/agent-directory.md`.
