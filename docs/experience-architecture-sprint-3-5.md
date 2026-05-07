# Sprint 3.5 Experience Architecture

Last verified: 2026-05-06.

## Widget model

- `/dashboard` is the signed-in action surface. Budget and streak APIs are consumed there as compact widgets instead of forcing users into separate destinations.
- Savings shows owner-safe goal progress, current-week totals, and a bank weekly savings action only when the surplus is allocatable.
- Cooking rhythm shows current count, weekly cook progress, pending confirmations, and the `I cooked today` action.
- Kitchen Sync preview, active journey, and pending actions use existing social endpoints and stay hidden when the social feature or user preference is disabled.

## Profile and detail responsibilities

- `/user/[username]` owns the social-facing Kitchen Sync expression through a compact read-only Kitchen activity section.
- `GET /api/users/[username]/kitchen-activity` returns profile-scoped cook checks, shared meal plans, and completed journeys from `social_activity_projections`.
- `/kitchen` remains an owner management/full-feed route for drafts, journeys, remixes, and feed review.
- `/budget` and `/streaks` remain backwards-compatible routes, but the main product workflow is dashboard/contextual action first.

## Privacy rules

- Profile Kitchen activity applies target profile access and per-projection visibility.
- Returned payloads are whitelisted display fields only. Raw budgets, spend logs, deficits, jar internals, pantry inventory, AI confidence, private media paths, receipts, and private verification metadata are not returned.
- Budget and streak data stay owner-only unless a later sprint adds an explicit sanitized projection.

## Navigation and mobile notes

- Top-level navigation stays compact: Dashboard/Home, Recipes, Meal Planner, Shopping, and Settings.
- The mobile overflow menu does not duplicate Discover because Home remains `/home`.
- Savings, rhythm, and Kitchen Sync are reached from widgets, profile owner actions, and contextual CTAs.
- Badge Sprint 4, competitions, leaderboards, cups, pantry auto-deduct, and push notifications remain deferred.
