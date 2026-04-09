# Tutorial System

The tutorial is now a single shared walkthrough that overlays the live UI. It follows one fixed page order, moves top to bottom within each page, and only changes pages when the next step requires it.

## Architecture

```text
TutorialProvider (context)
  └── builds flatSequence from contents/tutorials/general.ts
  └── persists currentSlotIndex in localStorage
  └── exposes startTutorial / nextStep / prevStep / skipTutorial / resetTutorial

TutorialOverlay (component)
  └── reads flatSequence + currentSlotIndex from context
  └── resolves the current highlight target in the DOM
  └── renders backdrop, highlight ring, and control card
  └── handles mandatory clicks, page transitions, and scroll prompts
```

## Content Model

All tutorial content lives in [general.ts](/Users/maddoxnoon/SecretSauce.nosync/contents/tutorials/general.ts).

Each page is defined as a `GeneralPageEntry`:

```ts
interface GeneralPageEntry {
  page: string
  title: string
  description: string
  substeps: TutorialSubstep[]
  postSubsteps?: TutorialSubstep[]
}
```

`substeps` are the main walkthrough for the page. `postSubsteps` are follow-up actions that still belong to that page, like opening a recipe card or navigating to the next page.

The current shared page order is:

1. `/dashboard`
2. `/recipes`
3. `/recipes/*`
4. `/meal-planner`
5. `/store`
6. `/home`

## State

The provider in [tutorial-context.tsx](/Users/maddoxnoon/SecretSauce.nosync/contexts/tutorial-context.tsx) owns:

- `isActive`
- `flatSequence`
- `currentSlotIndex`
- `currentSlot`
- `currentStep`
- `currentSubstep`
- `tutorialCompleted`
- `tutorialCompletedAt`

There is no longer any path ranking or branch selection in the tutorial runtime.

## Persistence

The active tutorial session is stored in `localStorage` under `tutorial_state_v1` as:

```json
{
  "version": 10,
  "currentSlotIndex": 0
}
```

Dismissal is still stored separately in `tutorial_dismissed_v1`.

## Start Flow

The start UI uses [tutorial-selection-modal.tsx](/Users/maddoxnoon/SecretSauce.nosync/components/tutorial/tutorial-selection-modal.tsx), but it is now a simple confirmation modal for the shared tour. Starting the tour calls `startTutorial()`.

`startTutorial()`:

1. Clears the dismiss flag
2. Resets `currentSlotIndex` to `0`
3. Activates the overlay
4. Navigates to the first tutorial page

## Step Navigation

`nextStep()` advances within `flatSequence`.

- If the next slot is on the same page, the overlay stays in place.
- If the next slot is on a different page, the provider navigates there automatically unless the step is a wildcard route like `/recipes/*`.
- When the last slot completes, the provider marks the tutorial complete and clears saved state.

`prevStep()` walks backward through `flatSequence` and skips wildcard routes if the current pathname cannot resolve them safely.

## Highlights And Scrolling

The highlight engine lives in [use-highlight-engine.ts](/Users/maddoxnoon/SecretSauce.nosync/hooks/tutorial/use-highlight-engine.ts).

It:

1. Resolves the current selector
2. Finds the first visible matching element
3. Waits for running animations to settle
4. Measures the target rect
5. Re-runs on resize, scroll, and DOM mutations

Scrolling support lives in [use-scroll-to-target.ts](/Users/maddoxnoon/SecretSauce.nosync/hooks/tutorial/use-scroll-to-target.ts) and [tutorial-utils.ts](/Users/maddoxnoon/SecretSauce.nosync/lib/tutorial-utils.ts).

The current system supports both:

- automatic scroll when a step transition needs to reveal the next target
- manual scroll prompts when the highlighted target is still off-screen or clipped

## Mandatory Steps

Mandatory actions are handled in [use-mandatory-completion.ts](/Users/maddoxnoon/SecretSauce.nosync/hooks/tutorial/use-mandatory-completion.ts).

A step can complete when:

- a `completionSelector` appears
- the highlighted element is clicked

The overlay disables `Next` until a mandatory substep completes.

## Analytics

Tutorial analytics are emitted as:

- `tutorial_started`
- `tutorial_step_completed`
- `tutorial_completed`
- `tutorial_skipped`

These events now describe the shared walkthrough rather than path-specific branches.

## Editing The Tutorial

To add or adjust the tutorial:

1. Edit [general.ts](/Users/maddoxnoon/SecretSauce.nosync/contents/tutorials/general.ts)
2. Add or update `data-tutorial="..."` attributes in the UI
3. Keep page content ordered top to bottom where possible
4. Avoid duplicate guidance that says the same thing in slightly different words

When adding a new highlighted step, prefer a selector that is stable and already visible in the intended layout. If the element only exists on mobile or desktop, use `mobileOnly` or `desktopOnly`.
