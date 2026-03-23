# Documentation Index

Last verified against code on 2026-03-20.

This directory was consolidated to reduce drift. Start with this index, then jump to the focused docs below.

## Core docs

- [`architecture-and-surfaces.md`](./architecture-and-surfaces.md)
  - Current repository layout, runtime boundaries, and feature surfaces.
- [`api-and-integrations.md`](./api-and-integrations.md)
  - Current `app/api/*` routes and external service contracts.
- [`queue-and-standardization.md`](./queue-and-standardization.md)
  - Ingredient queue, embedding queue, vector matching, and standardization internals.
- [`operations-and-workflows.md`](./operations-and-workflows.md)
  - Scripts, workflows, and runbook-level operational commands.

## Scope and source of truth

- These docs describe **implemented** behavior in current source.
- Historical plans and migration proposals were removed; use git history if prior context is needed.
- If code and docs disagree, code wins. Update docs in the same change when behavior changes.

## Quick start

1. Read `architecture-and-surfaces.md`.
2. If touching APIs/integrations, read `api-and-integrations.md`.
3. If touching queue/matching/scoring, read `queue-and-standardization.md`.
4. If touching jobs/scripts/deploy automation, read `operations-and-workflows.md`.
