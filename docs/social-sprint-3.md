# Social Sprint 3: Meal Plan Sharing and Cooking Journeys

Last verified: 2026-05-06.

## Product Boundary

Sprint 3 adds practical, opt-in social activity around weekly meal plans and cooking goals.

- Meal plan sharing answers what friends are cooking, whether a plan can be copied, and what the plan helped accomplish.
- Cooking journeys answer what goal a user is working toward, current progress, and what was completed.
- This is not a generic posting system. There is no algorithmic ranking, chat, leaderboard, badge gallery, competition, pantry auto-deduct, or raw budget/spend exposure.

## Data Model

- `meal_plan_shares` stores a sanitized snapshot of a weekly `meal_schedule`, not a raw meal planner export.
- `meal_plan_remixes` records copies from a published share into the remixer's own `meal_schedule` week.
- `cooking_journeys` stores lightweight active/completed journey progress.
- `journey_events` stores idempotent progress events from clean sources such as recipe tries, streak days, meal plans, or manual progress.
- Published shares and completed journeys can create `social_activity_projections`; private source tables remain private.

## Meal Plan Share Flow

1. The user explicitly taps Share Week on `/meal-planner`.
2. The server resolves the authenticated profile and reads that profile's `meal_schedule` rows for the week.
3. `sanitizeMealPlanForShare` creates a compact summary with title, meal count, recipe titles, tags, slots, and optional sanitized display labels.
4. `meal_plan_shares` stores the snapshot with `private`, `followers`, or `public` visibility.
5. `buildMealPlanShareProjectionPayload` creates a safe `meal_plan_share.published` projection for Kitchen Sync.

## Remix Semantics

- A viewer can remix only a published share they can view.
- Remix copies recipe ids and meal slots into the viewer's target/current week.
- Existing occupied slots in the target week are skipped rather than overwritten.
- The remix creates user-owned `meal_schedule` rows and records `meal_plan_remixes`.

## Cooking Journey Semantics

- Supported journey types: `cooking_rhythm`, `meal_prep`, `budget_friendly`, `high_protein`, `recipe_exploration`, `custom`.
- Progress is count-based for Sprint 3.
- `journey_events` are idempotent by `(journey_id, idempotency_key)`.
- Completion is an explicit user action and can publish a sanitized `cooking_journey.published` projection.

## Projection Payload Rules

Allowed projection fields are display-safe: title, summary line, meal/recipe counts, recipe titles, tags, progress labels, and achievement labels.

Never project raw budget, spend logs, receipts, pantry inventory, AI confidence, or private verification metadata. The TypeScript sanitizer and database `social_projection_payload_is_safe` check both reject blocked key names.

## Deferred

- Badge engine/gallery
- Competitions and leaderboards
- Campus cups
- Push notifications
- Real-time chat
- Pantry auto-deduct
- AI-generated journey coaching
