# Tutorial Current State

Last updated: 2026-02-12

## Scope

This document describes the tutorial experience as currently implemented, starting from `app/auth/check-email/page.tsx` and continuing through onboarding, welcome, and in-app tutorial execution.

## High-Level Flow

1. User signs up and is usually sent to `/auth/check-email`.
2. User verifies email via link or OTP code.
3. Auth callback redirects:
   - To `/welcome` when profile has `primary_goal`.
   - To `/onboarding` when `primary_goal` is missing.
4. Welcome page offers start/skip tutorial.
5. Tutorial overlay runs across product pages (`/dashboard`, `/recipes`, `/meal-planner`, `/store`, `/settings`) based on selected path.

## Check Email Page (Current Behavior)

File: `app/auth/check-email/page.tsx`

- Supports two verification modes via tabs:
  - `Email Link`: resend signup verification link.
  - `Code`: request and submit a 6-digit OTP.
- Email source priority:
  - `useAuth().user.email`
  - `localStorage.pending_verification_email`
- Shared resend cooldown:
  - 60-second countdown (`countdown` state) used by both tabs.
- OTP verification:
  - Uses `supabase.auth.verifyOtp({ type: "signup" })`.
  - On success: clears pending verification keys and routes to `/welcome`.
- UX text positions this as the "Final Step" before profile completion/tutorial.

## Tutorial Entry Points

### 1) Auto path from onboarding goal

Files:
- `app/onboarding/page.tsx`
- `app/welcome/page.tsx`
- `contexts/tutorial-context.tsx`

Current mapping:
- `primary_goal = "cooking"` -> tutorial path `cooking`
- `primary_goal = "budgeting"` -> tutorial path `budgeting`
- `primary_goal = "both"` -> tutorial path `health`

### 2) Welcome page CTA

File: `app/welcome/page.tsx`

- "Start the tour" calls `startTutorial(path)` then routes to `/dashboard`.
- "Skip for now" calls `skipTutorial()` then routes to `/dashboard`.

### 3) Dashboard prompt and manual selector

Files:
- `app/dashboard/page.tsx`
- `components/tutorial/tutorial-selection-modal.tsx`

- If `profile.tutorial_completed` is false and tutorial is inactive, dashboard shows a "Take a Quick Tour" prompt.
- Users can open a modal and manually select one of three tutorial tracks.

## Tutorial Paths (Current Content)

Files:
- `contents/tutorials/cooking.tsx`
- `contents/tutorials/budgeting.tsx`
- `contents/tutorials/health.tsx`

### Cooking (`Mastering the Craft`)

- 3 major steps, 10 substeps total
- Pages: `/dashboard` -> `/recipes` -> `/meal-planner`

### Budgeting (`Optimize Resources`)

- 3 major steps, 7 substeps total
- Pages: `/dashboard` -> `/meal-planner` -> `/store`

### Health (`Elevate Your Journey`)

- 3 major steps, 6 substeps total
- Pages: `/settings` -> `/meal-planner` -> `/store`

All steps currently use highlight-driven guidance via `data-tutorial` selectors.

## Runtime Mechanics

Files:
- `contexts/tutorial-context.tsx`
- `components/tutorial/tutorial-overlay.tsx`
- `app/layout.tsx`

- Tutorial context is globally mounted in `app/layout.tsx` with `TutorialOverlay`.
- Overlay behavior includes:
  - Target highlighting with mask cutout.
  - Step/substep progress bar.
  - Page-transition waiting states.
  - Retry logic when target selectors are not found.
  - Minimize/resume and skip confirmation modal.

## Persistence and State

### Local/session storage

- `pending_verification_email` (auth flow)
- `verification_sent_at` (cleared on OTP success)
- `tutorial_dismissed_v1` (skip state)
- `tutorial_state_v1` (path + step + substep restore)
- `sessionStorage.tutorial_prompt_dismissed` (dashboard banner dismissal for session)

### Profile fields

Profile schema includes:
- `tutorial_completed`
- `tutorial_completed_at`
- `tutorial_path`

## Current Gaps / Inconsistencies

1. Completion persistence mismatch  
`completeTutorial()` in `contexts/tutorial-context.tsx` updates only `tutorial_completed: true` through `updateProfile`. It does not write `tutorial_path` or `tutorial_completed_at`.

2. Unused completion API  
`app/api/tutorial/complete/route.ts` writes all three completion fields correctly, but there is no call site using this endpoint.

3. Settings "Learning & Tutorials" data not fully populated  
In `app/settings/page.tsx`, tutorial completion card conditionally expects `tutorialPath` and `tutorialCompletedAt`, but:
- `tutorialPath` is declared and read, but never set.
- `tutorialCompletedAt` is only synced from tutorial context, not loaded from profile in `fetchUserPreferences()`.

4. Analytics events defined but not emitted in tutorial flow  
Tutorial analytics event types exist in `lib/analytics/event-types.ts`, but the current tutorial context/overlay code does not emit them.

## Summary

The tutorial system is functional and user-visible end-to-end (entry, overlay execution, step navigation, skip behavior). The main gaps are around completion metadata consistency (`path`/`timestamp`), settings display fidelity, and missing analytics instrumentation for tutorial lifecycle events.
