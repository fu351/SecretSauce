# Tutorial System: Current State and Roadmap

Last updated: 2026-02-13

## Goals

1. Increase tutorial start and completion rates.
2. Improve step reliability (selector matching, page transitions, resume behavior).
3. Keep completion state consistent across context, profile, and settings UI.
4. Add measurement and experimentation so tutorial changes are data-driven.

## Current Implementation Snapshot

### Entry flow

1. Signup typically routes users to `/auth/check-email`.
2. Email is verified by magic link or OTP code.
3. Auth callback routes:
- `/welcome` if profile has `primary_goal`
- `/onboarding` if `primary_goal` is missing
4. Welcome page starts or skips tutorial.
5. Tutorial overlay runs globally from `app/layout.tsx` via `TutorialProvider` + `TutorialOverlay`.

### Path mapping

`primary_goal` to tutorial path:
- `cooking` -> `cooking`
- `budgeting` -> `budgeting`
- `both` -> `health`

### Tutorial content

Defined in:
- `contents/tutorials/cooking.tsx`
- `contents/tutorials/budgeting.tsx`
- `contents/tutorials/health.tsx`

Current path sizes:
- Cooking: 3 steps / 10 substeps
- Budgeting: 3 steps / 7 substeps
- Health: 3 steps / 6 substeps

### Runtime behavior

Core runtime files:
- `contexts/tutorial-context.tsx`
- `components/tutorial/tutorial-overlay.tsx`

Overlay behavior includes:
- Highlight mask over target elements
- Step/substep progress
- Page-change loading/sync states
- Retry fallback when target selectors are missing
- Minimize/restore and skip confirmation

### Persistence

Local/session storage:
- `pending_verification_email`
- `verification_sent_at`
- `tutorial_dismissed_v1`
- `tutorial_state_v1`
- `sessionStorage.tutorial_prompt_dismissed`

Profile fields:
- `tutorial_completed`
- `tutorial_completed_at`
- `tutorial_path`

### Anchor Coverage Snapshot

Meal planner anchors now used by tutorial paths:
- `planner-overview`
- `planner-sidebar`
- `planner-smart`
- `planner-add`
- `planner-macros`

Store anchors now available on active `/store` UI:
- `store-overview`
- `store-add` (desktop + mobile quick add)
- `store-selector`
- `store-items`
- `store-replace`
- `store-missing`
- `store-total`
- `store-checkout`
- `store-refresh`
- `store-map-toggle`
- `store-map`

## What Was Recently Improved

Implemented in code:
- Tutorial completion now writes all completion metadata (`tutorial_completed`, `tutorial_completed_at`, `tutorial_path`) from context.
- Tutorial context now exposes and syncs `tutorialPath` and completion timestamp from profile.
- Settings now loads and displays tutorial path/completion timestamp from profile.
- Tutorial lifecycle analytics events are now emitted (`started`, `step_completed`, `completed`, `skipped`).
- Local tutorial state handling was tightened (clear stale state on complete/skip/reset, only save while active).
- Meal planner selector mapping was aligned (`planner-ai` -> `planner-smart`) and missing planner anchors were added.
- Store tutorial anchors were added to the live `/store` receipt flow and selector references were updated (`store-compare`/`store-sort` -> `store-selector`).
- Overlay selector resolution now prefers visible elements when multiple nodes match a selector (important for mobile + desktop duplicate anchors).

## Known Gaps and Risks (Current)

1. Completion endpoint duplication.
- `app/api/tutorial/complete/route.ts` still exists, while completion is now handled from tutorial context via `updateProfile`.
- The project should choose one canonical completion path.

2. No automated selector contract or E2E tutorial tests.
- Regressions can ship when UI markup changes.

3. Additional store anchors are present but not yet fully used in tutorial paths.
- Anchors such as `store-map-toggle`, `store-map`, `store-replace`, `store-missing`, and `store-total` are instrumented.
- Current `budgeting` and `health` store steps still cover only overview/add/selector-level guidance.

4. A/B testing integration is planned but not yet wired into tutorial surfaces.
- There is no reusable `use-ab-test` hook in use by tutorial entry points yet.

## A/B Testing Strategy for Tutorial

Use existing `ab_testing` infrastructure to validate changes before full rollout.

Tier policy:
- Only `free` and `premium` tiers.
- Do not target `enterprise`.

Experiment plumbing:
- Assignment: `assign_user_to_variant`
- Variant lookup: `get_active_experiments`
- Event tracking: `track_event` (with `experimentId` and `variantId` attached to tutorial interaction events)

Core funnel events:
- Exposure: tutorial entry UI rendered
- Click: start/skip/select path
- Conversion: tutorial started and tutorial completed
- Custom: step progression and selector timeout/recovery

## Prioritized Roadmap

### Phase 1: Data correctness and consistency

Status: largely complete.

Completed:
- Persist completion metadata (`completed`, `completed_at`, `path`).
- Settings binding for tutorial path/timestamp.

Remaining:
- Decide and enforce one canonical completion path (context write vs API route).

### Phase 2: Observability

Status: partially complete.

Completed:
- Lifecycle analytics events emitted from tutorial context.

Remaining:
- Funnel reporting by path and step.
- Selector-timeout telemetry dashboard.

### Phase 2.5: A/B experimentation layer

Status: planned.

Planned:
- Add reusable `hooks/use-ab-test.ts`.
- Add typed tutorial experiment registry (`lib/experiments/tutorial.ts`).
- Wire welcome/dashboard tutorial entry surfaces to experiment variants.

### Phase 3: Reliability hardening

Status: planned.

Planned:
- Selector contract tests for all tutorial `highlightSelector` values.
- E2E smoke tests for `cooking`, `budgeting`, `health` completion paths.
- Version local tutorial state payload (`tutorial_state_v2` with content version).

### Phase 4: UX improvements

Status: planned.

Planned:
- Better timeout recovery actions in overlay.
- Tutorial copy polish and consistency pass.
- Stronger rewatch/re-entry affordances for returning users.

## Initial A/B Experiment Backlog

1. Welcome CTA messaging test.
- Surface: `app/welcome/page.tsx`
- Metric: tutorial start rate from welcome.

2. Skip friction test.
- Surface: welcome + overlay skip confirmation.
- Metric: tutorial completion rate among exposed users.

3. Dashboard prompt framing test.
- Surface: `app/dashboard/page.tsx`
- Metric: tutorial start rate from dashboard banner.

4. Timeout recovery test.
- Surface: `components/tutorial/tutorial-overlay.tsx`
- Metric: completion rate after selector timeout.

## Additional Components to Include in Tutorial (Recommended Next Steps)

These are high-value components/flows that are either underrepresented or missing in current tutorial content.

1. Meal planner smart plan action.
- File: `components/meal-planner/controls/planner-actions.tsx`
- Anchor: existing `data-tutorial="planner-smart"`
- Why: this is a primary differentiator and high-intent action; users should explicitly learn it.

2. Meal planner weekly grid and meal-slot interaction.
- Files: `components/meal-planner/views/weekly-view.tsx`, `components/meal-planner/cards/meal-slot-card.tsx`
- Suggested anchors: `planner-overview`, `planner-slot`
- Why: drag/drop and slot-editing are central planner mechanics and should be taught directly.

3. Meal planner recipe side panel (browse/filter/select while planning).
- File: `components/meal-planner/panels/recipe-search-panel.tsx`
- Suggested anchors: `planner-sidebar`, `planner-sidebar-filter`
- Why: users often fail to discover this panel and therefore underuse planning workflow.

4. Store selector and store badges (cheapest/best/closest).
- File: `components/store/store-selector.tsx`
- Anchor: existing `data-tutorial="store-selector"`
- Why: this is where cost-comparison value is made concrete for users.

5. Store quick-add actions (custom item + add recipe).
- Files: `app/store/page.tsx`, `components/store/mobile-quick-add-panel.tsx`
- Anchors: existing `data-tutorial="store-add"` and `data-tutorial="store-add-recipe"`
- Why: ensures users can add both ad-hoc and recipe-driven items directly from the store experience.

6. Store receipt item actions and replacement.
- Files: `components/store/shopping-receipt-view.tsx`, `components/store/receipt-item.tsx`
- Anchors: existing `data-tutorial="store-items"` and `data-tutorial="store-replace"`
- Why: replacement flow is a high-value action when items are unavailable or overpriced.

7. Store missing-items and total summary.
- File: `components/store/shopping-receipt-view.tsx`
- Anchors: existing `data-tutorial="store-missing"` and `data-tutorial="store-total"`
- Why: helps users interpret availability tradeoffs vs final price before checkout.

8. Store map and refresh controls.
- File: `components/store/shopping-receipt-view.tsx`
- Anchors: existing `data-tutorial="store-map-toggle"`, `data-tutorial="store-map"`, and `data-tutorial="store-refresh"`
- Why: location context and price refresh behavior are currently under-taught.

9. Recipe detail modal/list conversion action.
- File: `components/recipe/detail/recipe-detail-modal.tsx`
- Suggested anchors: `recipe-detail-overview`, `recipe-add-to-list`
- Why: bridges exploration to action by teaching “Add to List” from recipe context.

10. Recipe nutrition panel on recipe detail.
- File: `app/recipes/[id]/page.tsx`
- Anchor: existing `data-tutorial="nutrition-info"`
- Why: this is relevant for health-oriented paths and currently not emphasized.

11. Dashboard tutorial re-entry prompt controls.
- File: `app/dashboard/page.tsx`
- Suggested anchors: `tutorial-banner-start`, `tutorial-banner-dismiss`
- Why: skipped users need an explicit, easy restart path to improve eventual completion.

12. Settings rewatch tutorial action.
- File: `app/settings/page.tsx`
- Suggested anchor: `settings-tutorial-rewatch`
- Why: users returning later can self-onboard without waiting for contextual prompts.

## Component Prioritization Order

1. `planner-smart`
2. Weekly grid/slot interaction
3. `store-add` + `store-selector`
4. `store-replace` + `store-total`
5. Settings rewatch + dashboard re-entry anchors

## Metrics to Track

1. Tutorial start rate
2. Tutorial completion rate
3. Median time-to-complete
4. Step-level abandonment by path
5. Selector timeout rate
6. Variant lift for start/completion (A/B)
7. Guardrail deltas by variant (bounce, retention, first-core-action)

## Success Targets

1. +15% tutorial completion rate in 30 days.
2. <3% selector-timeout rate.
3. 100% of completed tutorials with populated `tutorial_path` and `tutorial_completed_at`.
