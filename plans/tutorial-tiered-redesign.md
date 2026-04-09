# Tutorial Tiered Redesign

## Overview

Upgrade the tutorial system from a single-path selection model to a reactive, drag-to-rank tiered system where the user orders all three goals and the system runs them back-to-back in one continuous session. Depth (number of tips and substeps shown) is proportional to rank.

## Design Rules

- **Drag-to-rank** on onboarding: user orders all 3 goals (cooking, budgeting, health)
- **One continuous session**: all 3 paths run back-to-back in ranked order
- **Silent transitions**: no modal, no banner between paths — header updates automatically
- **Depth proportional to rank**:

| Rank | Tips shown | Substeps shown |
|------|-----------|----------------|
| 1 (Primary) | All | All |
| 2 (Secondary) | First 1 | All |
| 3 (Tertiary) | None | `essential` substeps only |

---

## Implementation Order

| # | File | Change |
|---|------|--------|
| 1 | `pnpm add @dnd-kit/sortable` | New package — `@dnd-kit/core` and `@dnd-kit/utilities` already present |
| 2 | `supabase/migrations/20260325000000_add_tutorial_goals_ranking.sql` | Add `tutorial_goals_ranking text[]` column to `profiles` |
| 3 | `lib/database/supabase.ts` | Add `tutorial_goals_ranking: string[] \| null` to Row/Insert/Update shapes |
| 4 | `lib/database/profile-db.ts` | Map new column in `PROFILE_SAFE_COLUMNS` and `map()` |
| 5 | `lib/types/ui/tutorial.ts` | Add `essential?: boolean` to `TutorialSubstep`; add `GoalRank` and `RankedGoals` types |
| 6 | `lib/analytics/event-types.ts` | Add `tutorial_path_advanced` event |
| 7 | `contents/tutorials/cooking.tsx` | Tag `essential: true` on first substep of each step |
| 8 | `contents/tutorials/budgeting.tsx` | Tag `essential: true` on first substep of each step |
| 9 | `contents/tutorials/health.tsx` | Tag `essential: true` on first substep of each step |
| 10 | `contexts/tutorial-context.tsx` | Core state machine rewrite (see below) |
| 11 | `app/onboarding/page.tsx` | Replace single-choice goal with `DndContext` drag-to-rank list |
| 12 | `app/welcome/page.tsx` | Call `startRankedSession(profile.tutorial_goals_ranking)` |
| 13 | `components/tutorial/tutorial-overlay.tsx` | Depth-filtered tips/substeps; session-wide progress bar |
| 14 | `components/tutorial/tutorial-selection-modal.tsx` | Minor copy update |
| 15 | `app/settings/page.tsx` | Rewatch uses saved ranking |
| 16 | `e2e/fixtures/tutorial-helpers.ts` | Add `startRankedTutorialSession` and `expectOverlayPathName` helpers |

---

## Key File Changes

### `lib/types/ui/tutorial.ts`

```ts
// Add to TutorialSubstep:
essential?: boolean

// New types:
export type GoalRank = 1 | 2 | 3

export type RankedGoals = [
  'cooking' | 'budgeting' | 'health',
  'cooking' | 'budgeting' | 'health',
  'cooking' | 'budgeting' | 'health',
]
```

### `contexts/tutorial-context.tsx`

New state:
```ts
rankedGoals: RankedGoals | null        // full ordered session
currentPlanIndex: number               // 0, 1, or 2
// currentPathId becomes derived: rankedGoals[currentPlanIndex]
// currentRank becomes derived: (currentPlanIndex + 1) as GoalRank
```

New functions:
- `startRankedSession(ranked: RankedGoals)` — replaces `startTutorial` as the primary entry point
- `startTutorial(pathId)` — kept as shim for settings rewatch; builds ranked session with chosen path at rank 1
- `getVisibleSubsteps(step, rank)` — pure helper filtering substeps by depth
- `getVisibleTips(step, rank)` — pure helper filtering tips by depth

`nextStep` cross-path logic:
1. Advance substep → 2. Advance step → 3. If last step of current plan AND more plans remain: increment `currentPlanIndex`, reset step/substep, navigate silently to next path's first page → 4. If last plan: call `completeTutorial()`

localStorage bumped to version 2; v1 payloads discarded.

### `app/onboarding/page.tsx`

- `goals` array updated: `id: "both"` → `id: "health"`
- New state: `goalRanking` (ordered array, defaults to `["cooking", "budgeting", "health"]`)
- Drag powered by `DndContext` + `SortableContext` + `useSortable`
- `handleComplete` saves `tutorial_goals_ranking: tutorialRanking` to profile
- `isStepComplete("goal")` is always `true` (all 3 always present)

### `components/tutorial/tutorial-overlay.tsx`

- Progress bar spans full session (sum of visible substeps across all 3 ranked plans)
- Tips rendered only when `currentRank === 1`
- Substeps filtered via `getVisibleSubsteps(currentStep, currentRank)`
- Header derives from `currentPath.name` — updates silently on plan transition
- "Finish" label triggers only on last substep of last plan, not just last path

### `app/welcome/page.tsx`

```ts
// Reads profile.tutorial_goals_ranking and calls startRankedSession
// Falls back to legacy primary_goal derivation for existing users
```

---

## DB Migration

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tutorial_goals_ranking text[] DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_tutorial_goals_ranking
  ON profiles USING gin (tutorial_goals_ranking);
```

---

## Analytics Events

| Event | Payload |
|-------|---------|
| `tutorial_started` | `{ path }` — fires for rank-1 path at session start |
| `tutorial_path_advanced` | `{ from_path, to_path, plan_index }` — fires on silent transition |
| `tutorial_step_completed` | `{ path, step_index, depth }` |
| `tutorial_completed` | `{ paths_completed, total_steps }` |
| `tutorial_skipped` | `{ path, step_abandoned }` |
| `tutorial_goals_ranked` | `{ priorities }` — fires on onboarding submit |

---

## Invariants

1. `isActive` stays `true` throughout the entire 3-path session — overlay never unmounts between paths
2. `prevStep` is disabled at `currentStepIndex === 0 && currentSubstepIndex === 0`; no back-navigation across plan boundaries
3. `tutorial_path` column preserved as rank-1 path ID for backward compatibility
4. Version 1 localStorage payloads silently discarded; user restarts from welcome page
