# Tutorial System

A guided, multi-path in-app tutorial that overlays the live UI. Users choose up to three goal-oriented paths, which are then interleaved into a single flat sequence of steps and played back page by page.

---

## Architecture Overview

```
TutorialProvider (context)
  └── builds flatSequence from rankedGoals + content files
  └── persists state to localStorage
  └── exposes nextStep / prevStep / skipTutorial / startRankedSession

TutorialOverlay (component)
  └── reads flatSequence + currentSlotIndex from context
  └── finds and measures the target DOM element (highlightSelector)
  └── renders: SVG backdrop mask, highlight border, control card
  └── drives mandatory-click detection and auto-advance logic
```

---

## Data Layer

### Type definitions — `lib/types/ui/tutorial.ts`

| Type | Purpose |
|---|---|
| `TutorialSubstep` | A single instruction panel, optionally tied to a UI element |
| `TutorialStep` | A named step within a path, grouping substeps for one page |
| `TutorialPath` | A complete goal-oriented path (cooking / budgeting / health) |
| `GeneralPageEntry` | Page-orientation slots shown to every user regardless of path |
| `GoalRank` | `1 \| 2 \| 3` — how deeply a path is explored |
| `RankedGoals` | Ordered array of 1–3 path IDs chosen by the user |

#### `TutorialSubstep` fields

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Unique within the parent step |
| `instruction` | `string` | Text shown in the control card |
| `highlightSelector` | `string?` | CSS selector for the element to spotlight (must be a `[data-tutorial='…']` attribute) |
| `scrollContainerSelector` | `string?` | Override which scrollable ancestor to use when auto-scrolling to the element |
| `action` | `'explore' \| 'click' \| 'navigate' \| 'highlight' \| 'search'?` | Hint for what the user should do; `'click'` causes Next to programmatically click the element |
| `essential` | `boolean?` | If true, shown even at rank 3 (minimal depth); otherwise rank 3 collapses to only the first substep |
| `mandatory` | `boolean?` | User must click the highlighted element before Next is enabled; the click also auto-advances |
| `blockClick` | `boolean?` | Renders a transparent intercept div over the highlight so the element is display-only and cannot be clicked |

---

### Content files

```
contents/
  tutorial-content.tsx          # barrel — re-exports tutorialPaths + generalPages
  tutorials/
    cooking.tsx                 # cookingPath (TutorialPath)
    budgeting.tsx               # budgetingPath (TutorialPath)
    health.tsx                  # healthPath (TutorialPath)
    general.ts                  # generalPages (GeneralPageEntry[])
```

#### Path content structure

Each path has a fixed set of `steps`, one per app page, in the same page order:

| Page | cooking | budgeting | health |
|---|---|---|---|
| `/dashboard` | Kitchen Dashboard | Budget Snapshot | Health Snapshot |
| `/recipes` | Recipe Discovery | Recipe Cost Control | Healthy Recipe Selection |
| `/recipes/*` | Recipe Detail | Recipe Detail | Recipe Detail |
| `/meal-planner` | Meal Planning | Budget-Friendly Plan | Nutrition Planning |
| `/store` | Store Checkout Prep | Store Comparison | Smart Shopping |
| `/settings` | Keep Preferences Current | Adjust as Budget Changes | Update When Needs Change |

The page order is always derived from the **rank-1 path** (the user's primary goal).

#### General page entries (`general.ts`)

Every page also has a `GeneralPageEntry` with orientation `substeps` (shown first on the page, before path-specific content) and optional `postSubsteps` (shown last, after all path content).

Current general content:

| Page | Substeps (orientation) | PostSubsteps (interactive) |
|---|---|---|
| `/dashboard` | 1 — dashboard overview | — |
| `/recipes` | 1 — search/filter intro; 2 — recipe card highlight (blockClick) | 1 — **mandatory** click recipe card |
| `/recipes/*` | 1 — detail page overview | 1 — **mandatory** favorite the recipe |
| `/meal-planner` | 1 — planner intro; 2 — today column; 3 — **mandatory** click dinner slot; 4 — sidebar overview; 5 — **mandatory** switch to Saved; 6 — **mandatory** tap recipe card; 7 — **mandatory** close sidebar | — |

---

## State Management — `contexts/tutorial-context.tsx`

### `TutorialProvider`

Owns all tutorial state. Mounted at the app root.

**State:**
- `isActive: boolean` — whether the tutorial overlay is showing
- `rankedGoals: RankedGoals | null` — the user's ordered path selection
- `currentSlotIndex: number` — position within `flatSequence`

**Derived:**
- `flatSequence` — built from `rankedGoals` on every render via `buildFlatSequence()`
- `currentSlot / currentStep / currentSubstep` — indexed from `flatSequence`

**Persistence:** State is written to `localStorage` (`tutorial_state_v1`) on every change and restored on mount. Dismissed state is stored separately under `tutorial_dismissed_v1`. Version-mismatch on restore causes a silent discard and re-prompt.

**Completion:** Written to the user's database profile via `updateProfile` with `tutorial_completed`, `tutorial_completed_at`, `tutorial_path`, and `tutorial_goals_ranking`. Completion clears localStorage and deactivates the overlay.

### `buildFlatSequence(rankedGoals)`

Produces the ordered list of `FlatTutorialSlot` objects. For each page (in the rank-1 path's page order):

1. General orientation substeps (`general.substeps`)
2. For each ranked goal in order: path substeps filtered by rank depth
3. General post-substeps (`general.postSubsteps`)

**Rank depth:**
- Rank 1 — all substeps
- Rank 2 — first substep only
- Rank 3 — `essential: true` substeps only (falls back to first if none marked)

### `pageMatches(stepPage, pathname)`

Supports an exact match or a wildcard suffix: `"/recipes/*"` matches any `/recipes/[slug]` URL.

---

## Overlay Component — `components/tutorial/tutorial-overlay.tsx`

### Constants

| Constant | Value | Purpose |
|---|---|---|
| `MAX_RETRIES` | 15 | Attempts before showing "We lost track" error |
| `SCROLL_HIGHLIGHT_INTERVAL` | 48ms | Minimum interval between highlight updates during scroll |
| `WINDOW_SCROLL_OVERSHOOT` | 80px | Extra scroll distance added when centering an element |
| `WINDOW_SCROLL_PADDING` | 24px | Bottom viewport padding for scroll calculations |

### Key effects (numbered in source)

| Effect | Trigger | Purpose |
|---|---|---|
| 0 | mount | Measure header height |
| 2 | `isActive` + page change | Reset UI state when page changes |
| 2b | `isActive` | Reset skip/minimize UI |
| 2c | `currentSlotIndex` | Reset sync retries and mandatory state on every slot change |
| 2d | `currentSlotIndex`, `currentSubstep.id` | Schedule a highlight update 150ms after slot/substep change (handles elements not yet in DOM) |
| 2e | `isPageLoading` → false | Re-trigger highlight after loading clears |
| 2f | `mandatory`, `expectedSelector` | Attach click listener on the highlighted element; sets `isMandatoryCompleted` on click |
| 3 | pathname | Detect page changes; show loading state if navigating |
| 4 | — | `updateHighlight` — the core highlight engine (see below) |
| 5 | `currentSlotIndex`, pathname | MutationObserver + resize/scroll listeners to re-run highlight on DOM changes |
| 5b | `isPageTransition` | Re-run highlight when mandatory click triggers a page transition (selector changes) |
| 6 | pathname | Auto-advance when user navigates to the next page via the highlighted nav link |
| 6b | `isMandatoryCompleted` | Auto-advance when mandatory click happens on same page (no navigation) |
| 6c | `isMandatoryCompleted` + pathname | Auto-advance when mandatory click navigates to a wildcard next page |

### `updateHighlight` — the highlight engine

Called whenever the target element might have moved or changed.

1. **Guard:** returns early if `!isActive`, `isMinimized`, or `isPageLoading`
2. **Selector resolution:** `transitionNavSelector` (page-transition nav link) → `currentSubstep.highlightSelector` → `step.highlightSelector`
3. **Element search:** `querySelectorAll(selector)` → first candidate with non-zero dimensions and visible computed style; falls back to `candidates[0]`
4. **Not found:** retries with exponential backoff (`300ms × 1.8^n`, max 8s); after `MAX_RETRIES` sets `hasSyncTimedOut`
5. **Animation detection:** walks up the element's ancestor chain calling `getAnimations()`. If any ancestor has a running (non-finished) animation, waits for all to finish via `Promise.all(a.finished)` then reschedules. This prevents capturing a mid-animation rect (e.g. the sidebar sliding open).
6. **Scroll container resolution:** `resolveScrollContainer()` finds the nearest scrollable ancestor, with optional override via `scrollContainerSelector`
7. **Auto-scroll:** if the element is clipped by its scroll container or a new slot requires scrolling, calls `scrollToTarget()`
8. **Rect capture:** compares new rect to previous; only updates state if `top` or `left` changed by more than 2px (avoids sub-pixel jitter)

### `isPageLoading` detection

A `MutationObserver` watches `document.body` for class changes. If any non-overlay element has a class containing `animate-spin`, `animate-pulse`, or `loading`, `isPageLoading` is set to `true`. This pauses the highlight engine until content settles.

### Page transition flow

When the tutorial needs the user to navigate to a new page:
- `isPageTransition` is derived as `true` when the *next* slot is on a different page and (if the current step has a mandatory action) `isMandatoryCompleted` is also true
- `expectedSelector` becomes `[data-tutorial-nav="/target-page"]` — the nav link
- Effect 6 watches `pathname`; when it matches the next slot's page, `nextStep()` is called automatically

### Visibility states

| State | Condition | UI shown |
|---|---|---|
| `showTutorialBackdrop` | not minimized, not loading, `targetRect` set, no timeout | SVG backdrop mask |
| `showVisibleHighlight` | backdrop + target is within viewport + not clipped | Highlight border + `blockClick` intercept |
| `showScrollPrompt` | backdrop + target is off-screen or clipped by container | Scroll prompt button |

### Highlight rendering

- **Backdrop:** SVG with a `<mask>` that cuts a transparent hole 10px larger than `targetRect` on all sides (rounded 12px). Header area is also masked out unless the target is inside the header.
- **Highlight border:** absolute `div` with `border-2 border-blue-400`, 12px larger than `targetRect` on all sides, `pointer-events-none`. Has a white inner ring for contrast.
- **blockClick intercept:** `pointer-events-auto` transparent `div` exactly over `targetRect`, z-index 45, rendered when `currentSubstep.blockClick` is true. Sits above the SVG backdrop (z-40) but has no visible appearance.

### Control card states

| State | Display |
|---|---|
| Minimized | Compact "Click to resume" strip |
| `isPageLoading` | Spinner + "Waiting for page to load…" |
| `isChangingPage` | Spinner + "Preparing next step…" |
| Element not found (searching) | Spinner + attempt counter |
| `hasSyncTimedOut` | Error state with Retry + Continue Anyway buttons |
| `isPageTransition` | "Click [Page] in the navigation above" hint; no Next button |
| `showScrollPrompt` | Scroll prompt button replaces Next |
| Normal | Instruction text, optional Tips, Back / Next buttons |

**Next button** is disabled when `currentSubstep.mandatory && !isMandatoryCompleted`. When `action === 'click'` and Next is clicked, the overlay programmatically clicks the highlighted element before calling `nextStep()`.

---

## Selection Modal — `components/tutorial/tutorial-selection-modal.tsx`

A drag-to-rank modal (using `@dnd-kit/core`) that lets users order the three tutorial paths before starting. Submits a `RankedGoals` array to `startRankedSession()`.

---

## Adding Tutorial Content

### Adding a substep to an existing page

Edit the relevant path file (`cooking.tsx`, `health.tsx`, `budgeting.tsx`) or `general.ts`. Add a new object to `substeps` or `postSubsteps` with a sequential `id` and an `instruction` string. If the substep should spotlight a UI element, add `highlightSelector: "[data-tutorial='your-key']"` and put `data-tutorial="your-key"` on the target element.

### Adding a new `data-tutorial` attribute

1. Add `data-tutorial="new-key"` to the target JSX element.
2. Reference it with `highlightSelector: "[data-tutorial='new-key']"` in a substep.
3. Run `pnpm test test/tutorial/selector-contract.test.ts` to confirm the selector is found in source.

### Mandatory (interactive) substeps

Set `mandatory: true` to require the user to click the highlighted element before Next enables. The click is detected via a DOM event listener on the element, not React's synthetic events. `nextStep()` is called automatically after the click (unless the step requires page navigation, in which case the navigation itself triggers advance).

### Display-only highlights (blockClick)

Set `blockClick: true` when you want to point at an element without letting the user click it. Commonly used for the first appearance of the recipe card, where the tutorial later uses a dedicated mandatory step to drive the click.

### Scroll containers

If the target element lives inside a scrollable panel (not the page itself), set `scrollContainerSelector` to either the closest scrollable ancestor selector or a parent containing element. The engine uses `closest()` first, then falls back to explicit containment check. Without this, auto-scroll may not work correctly inside inner panels.

---

## Selector Contract Test — `test/tutorial/selector-contract.test.ts`

A static (no-render) Vitest test that:
1. Scans all `.tsx`/`.ts` source files for `data-tutorial` attribute values
2. Checks that every `highlightSelector` in every path and substep references an attribute that actually exists in source
3. Checks that every step's `page` maps to a real Next.js app route

Run with: `pnpm test test/tutorial/selector-contract.test.ts`

This test catches dead selectors before they silently time out in production.

---

## localStorage Keys

| Key | Value | Purpose |
|---|---|---|
| `tutorial_state_v1` | JSON `{version, rankedGoals, currentSlotIndex}` | Resume position across page reloads |
| `tutorial_dismissed_v1` | `"1"` | Suppress auto-restore after skip |

Version field is `TUTORIAL_STATE_VERSION = 4`. Increment this constant when the payload shape changes; old payloads are silently discarded.

---

## Analytics Events

| Event | Properties | When |
|---|---|---|
| `tutorial_started` | `{path}` | `startRankedSession` called |
| `tutorial_step_completed` | `{path, step_index}` | Each `nextStep()` call for a path slot |
| `tutorial_completed` | `{path, steps_completed}` | Final step complete |
| `tutorial_skipped` | `{path, step_abandoned}` | User exits via the X button |

---

## Known Behaviors and Edge Cases

**Animation detection:** `updateHighlight` walks the target element's ancestor chain and calls `getAnimations()` on each. If any ancestor has a running CSS transition or animation, it waits for all to resolve via `Promise.all(finished)` before capturing the rect. This handles the meal planner sidebar's 300ms `transition-[width]` animation. It does not currently filter infinite animations (`animate-spin`, `animate-pulse`) — if such an animation appears on an ancestor of the target element while `isPageLoading` is false, the Promise.all will never resolve.

**Duplicate `data-tutorial="planner-sidebar"`:** This attribute appears on two distinct elements and the intended target differs by device.

_Desktop_ — `app/meal-planner/page.tsx`:
```jsx
<aside
  className="hidden md:flex ... transition-[width] duration-300 ease-in-out overflow-hidden"
  style={{ contain: 'layout paint size' }}
  data-tutorial="planner-sidebar"
>
  {showRecipeSidebar && (
    <div className="w-[380px] h-full overflow-hidden">
      <RecipeSearchPanel … />  {/* also has data-tutorial="planner-sidebar" */}
    </div>
  )}
</aside>
```

_Mobile_ — the `<aside>` is never shown (`hidden` until `md:`). The same `RecipeSearchPanel` is rendered inside a `<Sheet>` portal instead, and its root `<div data-tutorial="planner-sidebar">` is the only matching element in the DOM.

**How `updateHighlight` resolves the ambiguity:**

`querySelectorAll("[data-tutorial='planner-sidebar']")` returns elements in document tree order (depth-first pre-order). On desktop, the `<aside>` is an ancestor of the `RecipeSearchPanel` div, so it appears first in the result array. The visibility filter (`rect.width > 0 && rect.height > 0`) then selects the first element that has non-zero dimensions.

- **Sidebar closed** (`showRecipeSidebar = false`): Only the `<aside>` is in the DOM (the inner content is conditionally unmounted). The aside has `width: 0` at rest, so it fails the size check. The filter finds no passing candidate and falls back to `candidates[0]` — the aside itself. At that point no CSS transition is running on it, so `updateHighlight` captures a zero-width rect. In practice this only matters briefly because whenever substep 4 (`planner-sidebar`) is active, the mandatory click in substep 3 has already set `showRecipeSidebar = true` and the sidebar is animating open.

- **Sidebar opening** (300ms CSS transition on the `<aside>`): The aside's width is between 0 and 380px. It passes the `rect.width > 0` check partway through. `getAnimations()` on the aside returns the running `transition-[width]` animation. `updateHighlight` waits for it to finish before locking in the rect, so the highlight snaps to the full open sidebar rather than an intermediate width.

- **Sidebar open** (`showRecipeSidebar = true`): Both the `<aside>` and the inner `RecipeSearchPanel` div are in the DOM. The aside is found first and selected. Its rect covers the full 380px sidebar panel. The inner div is ignored.

- **Mobile** (`aside` has `display: none`): `getComputedStyle().display === 'none'` causes the aside to be filtered out. `querySelectorAll` still returns both elements but the aside fails the computed-style check. The inner div inside the `<Sheet>` portal is selected. The Sheet slides in with its own animation; `getAnimations()` on the inner div's ancestors should detect it, but the Sheet uses Radix UI's `data-[state=open]` attribute-driven animations which may or may not register as WAAPI animations depending on how the CSS is structured.

**`isPageLoading` breadth:** The loading detector matches any element with `animate-spin`, `animate-pulse`, or `loading` in its class anywhere in the document (excluding overlay internals). This is intentionally broad to catch lazy-loaded panel skeletons but can delay the highlight engine if a persistent decorative animation exists anywhere on the page.

**MutationObserver debounce:** After a highlight runs, DOM mutations within 500ms (`MIN_HIGHLIGHT_INTERVAL`) are ignored to prevent jitter. This means if a panel animates open and its content loads within 500ms of the last highlight, the mutation will be skipped — the retry timer in effect 2d (150ms) is the primary recovery path.

**`hasMoved` check:** Only compares `top` and `left` (threshold: 2px). Width and height changes (e.g. an element resizing) do not trigger a rect update. The element must move for the highlight to reposition.

**Toast suppression:** `setTutorialToastSuppression(true)` is called while the tutorial is active to reduce visual noise from background operations.
