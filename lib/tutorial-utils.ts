/**
 * Shared utility functions and constants for the tutorial overlay system.
 * Consumed by both the overlay component and the tutorial hooks.
 */

// Constants

export const WINDOW_SCROLL_OVERSHOOT = 80
export const WINDOW_SCROLL_PADDING = 24
export const CONTAINER_SCROLL_PADDING = 0
export const SCROLL_HIGHLIGHT_INTERVAL = 48
export const RECIPE_DETAIL_SCROLL_PADDING_MOBILE = 12
export const RECIPE_DETAIL_SCROLL_PADDING_DESKTOP = 32
export const MAX_RETRIES = 15

export const RECIPE_DETAIL_TOP_ALIGN_TARGETS = new Set([
  "nutrition-info",
  "recipe-detail-tags",
  "recipe-detail-pricing",
  "recipe-detail-ingredients",
  "recipe-detail-instructions",
])

export const DASHBOARD_AUTO_SCROLL_SELECTORS = new Set([
  "[data-tutorial='dashboard-actions']",
  "[data-tutorial='dashboard-recents']",
])

// Type guards

export function isHTMLElement(value: Element | null): value is HTMLElement {
  return value instanceof HTMLElement
}

// DOM helpers

export function findFirstVisibleElement(selector: string): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll(selector)
  ) as HTMLElement[]
  return (
    candidates.find((candidate) => {
      const style = window.getComputedStyle(candidate)
      if (style.display === "none" || style.visibility === "hidden") return false
      const rect = candidate.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }) ??
    candidates[0] ??
    null
  )
}

export function isScrollableElement(element: HTMLElement): boolean {
  const styles = window.getComputedStyle(element)
  const overflowY = styles.overflowY
  return (
    (overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay") &&
    element.scrollHeight > element.clientHeight + 1
  )
}

export function findScrollableAncestor(
  element: HTMLElement | null
): HTMLElement | null {
  let current = element?.parentElement ?? null
  while (current) {
    if (isScrollableElement(current)) return current
    current = current.parentElement
  }
  return null
}

export function isPinnedWithinScrollContainer(
  targetElement: HTMLElement,
  scrollContainer: HTMLElement
): boolean {
  let current: HTMLElement | null = targetElement
  while (current && current !== scrollContainer) {
    const styles = window.getComputedStyle(current)
    if (styles.position === "sticky" || styles.position === "fixed") return true
    current = current.parentElement
  }
  return false
}

export function isTutorialPageScrollRoot(element: HTMLElement): boolean {
  return element.getAttribute("data-tutorial-scroll-root") === "page"
}

export function isRectOutsideViewport(
  rect: DOMRect,
  topPadding = 0,
  bottomPadding = 0
): boolean {
  return (
    rect.top < topPadding || rect.bottom > window.innerHeight - bottomPadding
  )
}

export function isRectWithinHeader(
  rect: DOMRect,
  headerHeight: number
): boolean {
  return rect.top < headerHeight && rect.bottom > 0
}

export function isRectClippedByContainer(
  rect: DOMRect,
  containerRect: DOMRect,
  padding = CONTAINER_SCROLL_PADDING
): boolean {
  return (
    rect.top < containerRect.top + padding ||
    rect.bottom > containerRect.bottom - padding
  )
}

export function shouldUseRecipeDetailScrollHelper(
  element: HTMLElement,
  pathname: string
): boolean {
  if (!pathname.startsWith("/recipes/")) return false
  const tutorialTarget = element.getAttribute("data-tutorial")
  return tutorialTarget !== null && RECIPE_DETAIL_TOP_ALIGN_TARGETS.has(tutorialTarget)
}

export function isMealPlannerLayoutTransitionElement(
  element: HTMLElement | null,
  pathname: string
): boolean {
  if (pathname !== "/meal-planner") return false
  return element?.getAttribute("data-tutorial") === "planner-sidebar-shell"
}

export function describeElement(
  element: HTMLElement | null
): Record<string, string | null> | null {
  if (!element) return null
  return {
    tag: element.tagName,
    tutorial: element.getAttribute("data-tutorial"),
    id: element.id || null,
    className: element.className || null,
  }
}

// Scroll container resolution

export function resolveScrollContainer(
  targetElement: HTMLElement,
  selector?: string | null
): HTMLElement | null {
  const selectScrollableContainer = (
    candidate: HTMLElement | null,
    mode: "closest" | "explicit" | "fallback"
  ): HTMLElement | null => {
    if (!candidate) return null

    if (mode === "fallback" && isTutorialPageScrollRoot(candidate)) {
      return null
    }

    if (isPinnedWithinScrollContainer(targetElement, candidate)) {
      return null
    }

    return candidate
  }

  if (selector) {
    const closestContainer = targetElement.closest(selector)
    if (isHTMLElement(closestContainer)) {
      return selectScrollableContainer(closestContainer, "closest")
    }

    const explicitContainer = document.querySelector(selector)
    if (
      isHTMLElement(explicitContainer) &&
      explicitContainer.contains(targetElement)
    ) {
      return selectScrollableContainer(explicitContainer, "explicit")
    }
  }

  const fallbackContainer = findScrollableAncestor(targetElement)
  return selectScrollableContainer(fallbackContainer, "fallback")
}

// Smooth scroll

const activeScrollAnimations = new WeakMap<object, () => void>()

export function smoothScrollTo(
  target: HTMLElement | Window,
  toValue: number,
  durationMs?: number
): Promise<void> {
  return new Promise((resolve) => {
    const targetKey = target as object
    activeScrollAnimations.get(targetKey)?.()

    const isWindow = target === window
    const getPos = () =>
      isWindow ? window.scrollY : (target as HTMLElement).scrollTop
    const start = getPos()
    const delta = toValue - start
    if (Math.abs(delta) < 2) {
      activeScrollAnimations.delete(targetKey)
      resolve()
      return
    }

    const resolvedDurationMs =
      durationMs ??
      Math.max(450, Math.min(950, 420 + Math.abs(delta) * 0.18))

    let frameId: number | null = null
    let settled = false

    const settle = () => {
      if (settled) return
      settled = true
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
        frameId = null
      }
      if (activeScrollAnimations.get(targetKey) === cancelCurrentAnimation) {
        activeScrollAnimations.delete(targetKey)
      }
      resolve()
    }

    const cancelCurrentAnimation = () => settle()
    activeScrollAnimations.set(targetKey, cancelCurrentAnimation)

    const startTime = performance.now()
    const ease = (t: number) =>
      t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2
    const step = (now: number) => {
      if (settled) return
      const elapsed = Math.min((now - startTime) / resolvedDurationMs, 1)
      const pos = start + delta * ease(elapsed)
      if (isWindow) window.scrollTo(0, pos)
      else (target as HTMLElement).scrollTop = pos
      if (elapsed < 1) {
        frameId = requestAnimationFrame(step)
      } else {
        if (isWindow) window.scrollTo(0, toValue)
        else (target as HTMLElement).scrollTop = toValue
        settle()
      }
    }
    frameId = requestAnimationFrame(step)
  })
}
