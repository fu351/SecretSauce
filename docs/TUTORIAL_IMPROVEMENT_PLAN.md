# Tutorial Improvement Plan

Last updated: 2026-02-13

## Goals

1. Increase tutorial completion rate.
2. Improve reliability of step highlighting/navigation.
3. Make tutorial state and completion metadata consistent.
4. Add clear observability for start, drop-off, and failure points.

## A/B Testing Strategy

Use the existing `ab_testing` infrastructure to validate tutorial changes before global rollout.

Tier targeting policy:
- Only `free` and `premium` tiers are valid.
- Do not create tutorial experiments targeting `enterprise` (deprecated).

Experiment instrumentation policy:
- Assignment: `assign_user_to_variant`
- Variant lookup: `get_active_experiments`
- Event logging: `track_event` (via analytics wrapper or direct RPC)

Core experiment funnel events:
- Exposure: tutorial entry UI shown
- Click: start/skip/tutorial-choice interactions
- Conversion: tutorial started and tutorial completed
- Custom: step-level telemetry and timeout/error states

## Priority Roadmap

## Phase 1: Data Correctness and Flow Integrity (High Impact, Low Effort)

1. Persist full completion metadata from tutorial context.
What to change: In `contexts/tutorial-context.tsx`, update completion writes to include `tutorial_completed`, `tutorial_completed_at`, and `tutorial_path`.
Why: Current completion only writes `tutorial_completed`, which breaks downstream UX/reporting consistency.
Success criteria: Profile rows contain all three fields after finishing a tutorial.

2. Resolve duplicate completion paths.
What to change: Either use `app/api/tutorial/complete/route.ts` as the canonical completion path or remove it and keep profile updates client-driven in one place.
Why: There is currently an unused API route with fuller logic than active code.
Success criteria: One clear completion path in codebase; no dead or conflicting completion logic.

3. Fix settings tutorial summary data binding.
What to change: In `app/settings/page.tsx`, populate and display `tutorial_path` and `tutorial_completed_at` from profile fetch.
Why: “Learning & Tutorials” UI expects values that are not fully set/read.
Success criteria: Settings reliably shows last completed tutorial and date after refresh/login.

## Phase 2: Observability and Measurement (High Impact, Medium Effort)

1. Emit tutorial analytics events at lifecycle points.
What to change: Wire `tutorial_started`, `tutorial_step_completed`, `tutorial_completed`, and `tutorial_skipped` in `contexts/tutorial-context.tsx` and/or `components/tutorial/tutorial-overlay.tsx`.
Why: Event types exist, but tutorial flow is not currently instrumented.
Success criteria: Events visible in analytics with correct payloads (`path`, step index, steps completed).

2. Add funnel reporting for tutorial health.
What to change: Create a lightweight dashboard/query view for `start -> step progression -> complete/skip`.
Why: Enables precise prioritization of UX fixes.
Success criteria: Team can identify top drop-off step per path weekly.

3. Add error telemetry for selector sync failures.
What to change: Log when overlay hits timeout or “Element Not Found”.
Why: Missing selector issues are currently user-visible but not measurable.
Success criteria: Timeout rate is tracked by path and step.

## Phase 2.5: A/B Experimentation Layer (High Impact, Medium Effort)

1. Implement reusable A/B hook for client surfaces.
What to change: Add `hooks/use-ab-test.ts` aligned with `docs/AB_TESTING_GUIDE.md` for assignment, exposure tracking, and variant config access.
Why: Standardizes experiment plumbing and avoids one-off RPC logic in pages.
Success criteria: Welcome and dashboard can read active variant/config via one hook.

2. Create tutorial experiment registry.
What to change: Add typed experiment IDs and config schema (for example in `lib/experiments/tutorial.ts`).
Why: Prevents hardcoded strings and drift between DB and app code.
Success criteria: All tutorial experiments referenced from one typed module.

3. Ship first tutorial experiment set.
What to change: Launch controlled experiments for entry copy, skip affordance, and modal default behavior.
Why: These are high-leverage, low-risk changes that can improve starts/completions quickly.
Success criteria: Each experiment has clear hypothesis, primary metric, and guardrail metrics.

4. Add experiment result review cadence.
What to change: Weekly review using `get_experiment_results` and funnel summaries.
Why: Ensures decisions are data-driven and experiments are closed/rolled out promptly.
Success criteria: Every active experiment has owner, decision date, and rollout/archive outcome.

## Phase 3: Reliability Hardening (Medium Impact, Medium Effort)

1. Create selector contract checks for tutorial paths.
What to change: Add test coverage to verify each `highlightSelector` exists on its target page.
Why: Tutorial quality depends on `data-tutorial` anchors remaining stable.
Success criteria: CI fails when a tutorial selector is removed/renamed.

2. Add end-to-end smoke tests for each path.
What to change: Add Playwright flows for `cooking`, `budgeting`, and `health` through completion.
Why: Prevent regressions in navigation, overlay behavior, and completion.
Success criteria: All three tutorials pass on CI with deterministic finish.

3. Version local tutorial state.
What to change: Move from `tutorial_state_v1` to a versioned payload with path/content version.
Why: Prevent broken resume behavior after step content/selector changes.
Success criteria: Old stale states auto-reset safely after tutorial content updates.

## Phase 4: UX Improvements (Medium Impact, Medium Effort)

1. Improve failure recovery in overlay.
What to change: Expand “Element Not Found” options with “Go to expected page” and “Jump to next major step”.
Why: Current fallback is retry or skip step only.
Success criteria: Lower abandonment after sync timeout events.

2. Improve tutorial copy quality and consistency.
What to change: Clean up instruction text and typos in `contents/tutorials/*.tsx`.
Why: Copy quality affects trust and comprehension.
Success criteria: Content pass with consistent tone, no spelling/grammar errors.

3. Add explicit rewatch entry for all users.
What to change: Consider showing tutorial chooser in settings even when tutorial is not completed, not only when completed.
Why: Gives users control to self-onboard later.
Success criteria: Increased restarts and eventual completion from returning users.

## Initial Tutorial Experiments

1. Welcome CTA Messaging Test
Hypothesis: action-oriented CTA copy increases tutorial start rate.
Surface: `app/welcome/page.tsx`
Variants:
- Control: current "Start the tour"
- Variant A: "Start my 2-minute setup"
Primary metric: tutorial start rate from welcome page.
Guardrails: skip rate, bounce to dashboard without start.

2. Skip Friction Test
Hypothesis: adding light friction to skip improves completion without hurting retention.
Surface: welcome + overlay skip flow.
Variants:
- Control: current skip behavior
- Variant A: confirmation copy emphasizing 2-3 minute duration
Primary metric: tutorial completion rate among exposed users.
Guardrails: day-1 return rate, time-to-first-core-action.

3. Dashboard Prompt Presentation Test
Hypothesis: prompt framing and button order affects tutorial starts for non-completers.
Surface: `app/dashboard/page.tsx`
Variants:
- Control: current prompt
- Variant A: stronger value proposition + "Start now" first
Primary metric: tutorial start rate from dashboard prompt.
Guardrails: prompt dismiss rate, session length.

4. Overlay Recovery Test
Hypothesis: better recovery actions reduce abandonment after selector failures.
Surface: `components/tutorial/tutorial-overlay.tsx`
Variants:
- Control: retry/skip step
- Variant A: add "Go to expected page" action
Primary metric: completion rate after timeout event.
Guardrails: repeated timeout count, rage-click proxy events.

## A/B Implementation Checklist

1. Define experiments in `ab_testing.experiments` with explicit `hypothesis`, `primary_metric`, and `target_user_tiers`.
2. Create variants with weighted rollout (for example 90/10, then 50/50 after validation).
3. Use a single session key for anonymous assignment continuity.
4. Track exposure once per page-view/surface render.
5. Attach `experimentId` and `variantId` on related click/conversion events.
6. Use rollout gates: 10% -> 25% -> 50% -> 100% only after guardrails pass.
7. Archive losing variants and remove stale code paths after rollout.

## Recommended PR Sequence

1. PR 1: Completion metadata + settings binding + completion-path cleanup.
2. PR 2: Analytics event emission + basic funnel queries.
3. PR 3: `use-ab-test` hook + tutorial experiment registry + first experiment wiring.
4. PR 4: Selector contract tests + tutorial E2E smoke tests.
5. PR 5: Overlay recovery UX + copy polish (ship by experiment, then roll out winner).

## Metrics to Track

1. Tutorial start rate: `% of eligible users who start`.
2. Completion rate: `% of started tutorials completed`.
3. Median completion time by path.
4. Step abandonment rate by path/step.
5. Selector timeout rate (`Element Not Found` occurrences / starts).
6. Variant lift for tutorial start/completion (with confidence intervals in experiment reporting).
7. Guardrail delta by variant (bounce rate, retention, and first-core-action completion).

## Target Outcomes (Initial)

1. +15% tutorial completion rate within 30 days.
2. <3% selector-timeout rate across all starts.
3. 100% completion records with populated `tutorial_path` and `tutorial_completed_at`.
