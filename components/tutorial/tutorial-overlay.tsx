"use client"

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTutorial, pageMatches } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { X, Minus, ChevronUp, ChevronRight, ChevronLeft, ChevronDown, Lightbulb, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/ui/use-toast"
import {
  isTutorialHighlightSuppressed,
  _registerHighlightReleaseCallback,
} from "@/lib/tutorial-highlight-suppression"
import clsx from "clsx"
import { useIsMobile } from "@/hooks"

declare global {
  interface Window {
    __TUTORIAL_DEBUG_SCROLL__?: boolean
  }
}

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const WINDOW_SCROLL_OVERSHOOT = 80;
const WINDOW_SCROLL_PADDING = 24;
const CONTAINER_SCROLL_PADDING = 0;
const SCROLL_HIGHLIGHT_INTERVAL = 48;
const tutorialDebugCache = new Map<string, string>()
const activeScrollAnimations = new WeakMap<object, () => void>()

function smoothScrollTo(target: HTMLElement | Window, toValue: number, durationMs = 600): Promise<void> {
  return new Promise((resolve) => {
    const targetKey = target as object
    activeScrollAnimations.get(targetKey)?.()

    const isWindow = target === window
    const getPos = () => isWindow ? window.scrollY : (target as HTMLElement).scrollTop
    const start = getPos()
    const delta = toValue - start
    if (Math.abs(delta) < 2) {
      activeScrollAnimations.delete(targetKey)
      resolve()
      return
    }

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
    const cancelCurrentAnimation = () => {
      settle()
    }

    activeScrollAnimations.set(targetKey, cancelCurrentAnimation)

    const startTime = performance.now()
    // Ease-out cubic: starts at full speed, decelerates to stop
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    const step = (now: number) => {
      if (settled) return
      const elapsed = Math.min((now - startTime) / durationMs, 1)
      const pos = start + delta * ease(elapsed)
      if (isWindow) window.scrollTo(0, pos)
      else (target as HTMLElement).scrollTop = pos
      if (elapsed < 1) {
        frameId = requestAnimationFrame(step)
      } else {
        settle()
      }
    }
    frameId = requestAnimationFrame(step)
  })
}

function debugTutorialScroll(event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return
  if (typeof window === "undefined" || window.__TUTORIAL_DEBUG_SCROLL__ !== true) return

  const serialized = JSON.stringify(payload)
  if (tutorialDebugCache.get(event) === serialized) return

  tutorialDebugCache.set(event, serialized)
  console.log(`[tutorial-scroll] ${event}`, payload)
}

function describeElement(element: HTMLElement | null) {
  if (!element) return null

  return {
    tag: element.tagName,
    tutorial: element.getAttribute("data-tutorial"),
    id: element.id || null,
    className: element.className || null,
  }
}

function isHTMLElement(value: Element | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

function isScrollableElement(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const overflowY = styles.overflowY;
  return (
    (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
    element.scrollHeight > element.clientHeight + 1
  );
}

function findScrollableAncestor(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current) {
    if (isScrollableElement(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function isPinnedWithinScrollContainer(targetElement: HTMLElement, scrollContainer: HTMLElement) {
  let current: HTMLElement | null = targetElement

  while (current && current !== scrollContainer) {
    const styles = window.getComputedStyle(current)
    if (styles.position === "sticky" || styles.position === "fixed") {
      return true
    }
    current = current.parentElement
  }

  return false
}

function isTutorialPageScrollRoot(element: HTMLElement) {
  return element.getAttribute("data-tutorial-scroll-root") === "page"
}

function resolveScrollContainer(targetElement: HTMLElement, selector?: string | null): HTMLElement | null {
  const selectScrollableContainer = (candidate: HTMLElement | null, mode: "closest" | "explicit" | "fallback") => {
    if (!candidate) {
      return null
    }

    if (mode === "fallback" && isTutorialPageScrollRoot(candidate)) {
      debugTutorialScroll("resolve-scroll-container-rejected", {
        selector,
        mode,
        target: describeElement(targetElement),
        container: describeElement(candidate),
        reason: "page-scroll-root",
      })
      return null
    }

    if (isPinnedWithinScrollContainer(targetElement, candidate)) {
      debugTutorialScroll("resolve-scroll-container-rejected", {
        selector,
        mode,
        target: describeElement(targetElement),
        container: describeElement(candidate),
        reason: "target-pinned-within-container",
      })
      return null
    }

    return candidate
  }

  if (selector) {
    const closestContainer = targetElement.closest(selector)
    if (isHTMLElement(closestContainer)) {
      const resolvedContainer = selectScrollableContainer(closestContainer, "closest")
      if (!resolvedContainer) {
        return null
      }

      debugTutorialScroll("resolve-scroll-container", {
        mode: "closest",
        selector,
        target: describeElement(targetElement),
        container: describeElement(resolvedContainer),
      })
      return resolvedContainer
    }

    const explicitContainer = document.querySelector(selector);
    // Only use the explicit container if it is actually an ancestor of the target,
    // not a sibling or descendant (which would cause inverted clipping checks).
    if (isHTMLElement(explicitContainer) && explicitContainer.contains(targetElement)) {
      const resolvedContainer = selectScrollableContainer(explicitContainer, "explicit")
      if (!resolvedContainer) {
        return null
      }

      debugTutorialScroll("resolve-scroll-container", {
        mode: "explicit",
        selector,
        target: describeElement(targetElement),
        container: describeElement(resolvedContainer),
      })
      return resolvedContainer;
    }

    debugTutorialScroll("resolve-scroll-container-rejected", {
      selector,
      target: describeElement(targetElement),
      container: isHTMLElement(explicitContainer) ? describeElement(explicitContainer) : null,
      reason: isHTMLElement(explicitContainer) ? "not-ancestor" : "missing-or-not-element",
    })
  }

  const fallbackContainer = findScrollableAncestor(targetElement);
  const resolvedFallbackContainer = selectScrollableContainer(fallbackContainer, "fallback")
  debugTutorialScroll("resolve-scroll-container", {
    mode: "fallback",
    selector,
    target: describeElement(targetElement),
    container: describeElement(resolvedFallbackContainer),
  })
  return resolvedFallbackContainer;
}

// Returns true if any part of the rect is not fully visible within the padded viewport.
// This ensures the element is completely on screen, not just partially.
function isRectOutsideViewport(
  rect: DOMRect,
  topPadding = 0,
  bottomPadding = 0,
) {
  return rect.top < topPadding || rect.bottom > window.innerHeight - bottomPadding;
}

function isRectWithinHeader(rect: DOMRect, headerHeight: number) {
  return rect.top < headerHeight && rect.bottom > 0
}

function isRectClippedByContainer(rect: DOMRect, containerRect: DOMRect, padding = CONTAINER_SCROLL_PADDING) {
  return rect.top < containerRect.top + padding || rect.bottom > containerRect.bottom - padding;
}

export function TutorialOverlay() {
  const {
    isActive,
    flatSequence,
    currentSlotIndex,
    currentSlot,
    currentStep,
    currentSubstep,
    nextStep,
    prevStep,
    skipTutorial,
  } = useTutorial()
  const { toast } = useToast()

  const { theme } = useTheme()
  const pathname = usePathname()
  const router = useRouter()
  const isMobile = useIsMobile()

  // --- State Management ---
  const [isMinimized, setIsMinimized] = useState(false)
  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [activeScrollContainer, setActiveScrollContainer] = useState<HTMLElement | null>(null)
  const targetElementRef = useRef<HTMLElement | null>(null)
  const targetRectRef = useRef<DOMRect | null>(null)
  const activeScrollContainerRef = useRef<HTMLElement | null>(null)
  const setTargetElementBoth = (element: HTMLElement | null) => {
    targetElementRef.current = element
    setTargetElement(element)
  }
  const setTargetRectBoth = (rect: DOMRect | null) => {
    targetRectRef.current = rect
    setTargetRect(rect)
  }
  const setActiveScrollContainerBoth = (container: HTMLElement | null) => {
    activeScrollContainerRef.current = container
    setActiveScrollContainer(container)
  }
  const [isChangingPage, setIsChangingPage] = useState(false)

  // Retry Logic: Attempt to find element before timing out
  const [syncRetries, setSyncRetries] = useState(0)
  const [hasSyncTimedOut, setHasSyncTimedOut] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [completedMandatorySlotIndex, setCompletedMandatorySlotIndex] = useState<number | null>(null)

  const MAX_RETRIES = 15;
  const overlayRef = useRef<HTMLDivElement>(null);
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const updateHighlightRef = useRef<() => void>(() => {});
  const autoScrollKeyRef = useRef<string | null>(null);
  const pendingNextAutoScrollRef = useRef(false);
  const lastPathnameRef = useRef(pathname);
  const [headerHeight, setHeaderHeight] = useState(0);
  const highlightFrameRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const lastHighlightRunAtRef = useRef(0);
  const isDark = theme === "dark"

  const pageNames: Record<string, string> = {
    "/recipes": "Recipes",
    "/meal-planner": "Meal Planner",
    "/store": "Shopping",
    "/settings": "Settings",
    "/dashboard": "Dashboard",
    "/home": "Home",
  }

  const totalSteps = flatSequence.length
  const completedSteps = currentSlotIndex + 1
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
  const isLastStep = currentSlotIndex === totalSteps - 1
  const isMandatoryCompleted = completedMandatorySlotIndex === currentSlotIndex
  const stepHighlightSelector = currentStep && 'highlightSelector' in currentStep ? currentStep.highlightSelector : undefined
  const stepScrollContainerSelector = currentStep && "scrollContainerSelector" in currentStep ? currentStep.scrollContainerSelector : undefined
  const nextSlot = currentSlotIndex < flatSequence.length - 1 ? flatSequence[currentSlotIndex + 1] : null
  const isPageTransition =
    isActive &&
    nextSlot !== null &&
    currentSlot !== null &&
    nextSlot.page !== currentSlot.page &&
    !nextSlot.page.endsWith("*") &&
    (!currentSubstep?.mandatory || isMandatoryCompleted)
  const transitionNavSelector = isPageTransition ? `[data-tutorial-nav="${nextSlot!.page}"]` : null
  const expectedSelector = transitionNavSelector ?? currentSubstep?.highlightSelector ?? stepHighlightSelector ?? null
  const completionSelector = currentSubstep?.completionSelector ?? null
  const expectedScrollContainerSelector = currentSubstep?.scrollContainerSelector ?? stepScrollContainerSelector ?? null
  const nextStepScrollContainerSelector =
    nextSlot?.substep.scrollContainerSelector ??
    (nextSlot?.step && "scrollContainerSelector" in nextSlot.step ? nextSlot.step.scrollContainerSelector : undefined) ??
    null
  const shouldAutoScrollNextWithinPage =
    !!nextSlot &&
    !!currentSlot &&
    nextSlot.page === currentSlot.page &&
    (
      !!nextStepScrollContainerSelector ||
      currentSlot.page === "/recipes/*"
    )

  const handleGoToExpectedPage = useCallback(() => {
    if (!currentStep?.page || currentStep.page.endsWith("*")) return
    const expectedPage = currentStep.page
    setSyncRetries(0)
    setHasSyncTimedOut(false)
    setIsChangingPage(true)
    router.push(expectedPage)

    // Fallback if client navigation fails to fire from the overlay context.
    window.setTimeout(() => {
      if (!pageMatches(expectedPage, window.location.pathname)) {
        window.location.assign(expectedPage)
      }
    }, 350)
  }, [currentStep?.page, router])

  /**
   * 0. Detect Header Height
   */
  useEffect(() => {
    const detectHeaderHeight = () => {
      const header = document.querySelector('header');
      if (header) {
        setHeaderHeight(header.offsetHeight);
      }
    };
    detectHeaderHeight();
    window.addEventListener('resize', detectHeaderHeight);
    return () => window.removeEventListener('resize', detectHeaderHeight);
  }, []);

  const clearScheduledHighlightUpdate = useCallback(() => {
    if (typeof window === "undefined") return

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = null
    }

    if (highlightFrameRef.current !== null) {
      window.cancelAnimationFrame(highlightFrameRef.current)
      highlightFrameRef.current = null
    }
  }, [])

  const scheduleHighlightUpdate = useCallback((options?: {
    immediate?: boolean
    minIntervalMs?: number
  }) => {
    if (typeof window === "undefined") return

    const shouldRunImmediately = options?.immediate === true
    const minIntervalMs = options?.minIntervalMs ?? 0

    if (shouldRunImmediately) {
      clearScheduledHighlightUpdate()
      lastHighlightRunAtRef.current = Date.now()
      updateHighlightRef.current()
      return
    }

    if (highlightTimerRef.current !== null || highlightFrameRef.current !== null) {
      return
    }

    const elapsed = Date.now() - lastHighlightRunAtRef.current
    const waitMs = Math.max(0, minIntervalMs - elapsed)
    const queueFrame = () => {
      highlightFrameRef.current = window.requestAnimationFrame(() => {
        highlightFrameRef.current = null
        lastHighlightRunAtRef.current = Date.now()
        updateHighlightRef.current()
      })
    }

    if (waitMs > 0) {
      highlightTimerRef.current = window.setTimeout(() => {
        highlightTimerRef.current = null
        queueFrame()
      }, waitMs)
      return
    }

    queueFrame()
  }, [clearScheduledHighlightUpdate])

  useEffect(() => clearScheduledHighlightUpdate, [clearScheduledHighlightUpdate])

  /**
   * 1. Stability-Aware Scroll Calculation
   */
  const scrollToTarget = useCallback(async (
    element: HTMLElement,
    scrollContainer?: HTMLElement | null,
    options?: { force?: boolean },
  ) => {
    const viewportTopPadding = headerHeight + WINDOW_SCROLL_PADDING;
    const shouldForceScroll = options?.force === true;

    // Step 1: Container scroll first so the element's viewport rect is stable for window scroll.
    if (scrollContainer && isScrollableElement(scrollContainer)) {
      const elementRect = element.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      if (shouldForceScroll || isRectClippedByContainer(elementRect, containerRect)) {
        const elementCenterWithinContainer =
          elementRect.top - containerRect.top + scrollContainer.scrollTop + elementRect.height / 2;
        const nextScrollTop = Math.max(
          0,
          elementCenterWithinContainer - scrollContainer.clientHeight / 2
        );

        debugTutorialScroll("scroll-container", {
          target: describeElement(element),
          container: describeElement(scrollContainer),
          elementRect: {
            top: elementRect.top,
            bottom: elementRect.bottom,
            height: elementRect.height,
          },
          containerRect: {
            top: containerRect.top,
            bottom: containerRect.bottom,
            height: containerRect.height,
          },
          currentScrollTop: scrollContainer.scrollTop,
          nextScrollTop,
          force: shouldForceScroll,
        })
        await smoothScrollTo(scrollContainer, nextScrollTop);
      }
    }

    // Step 2: After container scroll settles, re-measure and scroll window if needed.
    // Always account for the header regardless of whether a scroll container was used.
    const targetViewportRect = element.getBoundingClientRect();
    // Use a DOM containment check, NOT a rect overlap check: rect overlap returns true for
    // any element scrolled behind the header, which would incorrectly suppress window scroll.
    // We only want to suppress window scroll for elements that actually live inside the header
    // (e.g. nav links), which genuinely can't be scrolled into the viewport.
    const headerEl = document.querySelector('header');
    const elementIsInHeader = !!headerEl?.contains(element);
    const viewportTopBoundary = elementIsInHeader ? 0 : viewportTopPadding;
    const viewportBottomBoundary = WINDOW_SCROLL_PADDING;

    // Skip window scroll on pages whose main content lives in its own scroll container
    // that fills the viewport (e.g. meal planner). On those pages the window can only
    // scroll by ~headerHeight px, and forcing it there traps scroll events inside the
    // overflow-hidden/overscroll-none wrapper so users can't scroll back.
    const windowScrollRange = document.documentElement.scrollHeight - window.innerHeight;
    const windowIsEffectivelyFixed = windowScrollRange <= viewportTopPadding;

    // Never force window scroll — isRectOutsideViewport is always reliable for the page.
    // force is only meaningful for container scrolls (element clipped by inner panel).
    if (!windowIsEffectivelyFixed && isRectOutsideViewport(targetViewportRect, viewportTopBoundary, viewportBottomBoundary)) {
      const elementAbsoluteTop = targetViewportRect.top + window.pageYOffset;
      const visibleViewportHeight = window.innerHeight - viewportTopBoundary - viewportBottomBoundary;
      const scrollPosition = targetViewportRect.height > visibleViewportHeight
        ? Math.max(0, elementAbsoluteTop - viewportTopBoundary - WINDOW_SCROLL_PADDING)
        : (() => {
            const elementCenter = elementAbsoluteTop + targetViewportRect.height / 2;
            const viewportCenter = window.innerHeight / 2;
            const raw = elementCenter - viewportCenter;
            const minScrollForHeader = Math.max(0, elementAbsoluteTop - viewportTopBoundary);
            return Math.max(minScrollForHeader, raw > 0 ? raw + WINDOW_SCROLL_OVERSHOOT : raw);
          })()
      debugTutorialScroll("scroll-window", {
        target: describeElement(element),
        scrollContainer: describeElement(scrollContainer ?? null),
        targetViewportRect: {
          top: targetViewportRect.top,
          bottom: targetViewportRect.bottom,
          height: targetViewportRect.height,
        },
        viewportTopBoundary,
        viewportBottomBoundary,
        currentScrollY: window.scrollY,
        nextScrollY: scrollPosition,
        force: shouldForceScroll,
      })
      await smoothScrollTo(window, scrollPosition);
    }

    scheduleHighlightUpdate({ immediate: true });
  }, [headerHeight, scheduleHighlightUpdate]);

  /**
   * 2. Loading State Detector
   */
  useEffect(() => {
    if (!isActive) return;

    const detectPageLoading = () => {
      const getAllWithClass = (selector: string) => {
        return Array.from(document.querySelectorAll(selector)).filter(el => {
          return !overlayRef.current?.contains(el);
        });
      };
      const hasLoadingSpinner = getAllWithClass('[class*="animate-spin"]').length > 0;
      const hasSkeletonLoader = getAllWithClass('[class*="animate-pulse"]').length > 0;
      const hasLoadingClass = getAllWithClass('[class*="loading"]').length > 0;
      setIsPageLoading(!!(hasLoadingSpinner || hasSkeletonLoader || hasLoadingClass));
    };

    detectPageLoading();

    let debounceTimer: NodeJS.Timeout | null = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(detectPageLoading, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [isActive]);

  /**
   * 2b. Tutorial Activation State Reset
   */
  useEffect(() => {
    if (!isActive) return;
    setShowSkipConfirmation(false);
    setIsMinimized(false);
    if (currentStep?.page && !pageMatches(currentStep.page, pathname)) {
      setTargetElementBoth(null);
      setTargetRectBoth(null);
      setActiveScrollContainerBoth(null);
    }
    setSyncRetries(0);
    setHasSyncTimedOut(false);
    setIsPageLoading(false);
    setIsChangingPage(false);
    autoScrollKeyRef.current = null;
  }, [isActive, currentStep?.page, pathname]);

  useEffect(() => {
    const previousPathname = lastPathnameRef.current
    lastPathnameRef.current = pathname

    if (!isActive || !currentStep) return
    if (previousPathname === pathname) return
    if (!pageMatches(currentStep.page, pathname)) return

    pendingNextAutoScrollRef.current = false
    autoScrollKeyRef.current = null
    setActiveScrollContainerBoth(null)
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })

    let frameId: number | null = null
    let nestedFrameId: number | null = null
    frameId = window.requestAnimationFrame(() => {
      const pageScrollRoot = document.querySelector("[data-tutorial-scroll-root='page']")
      if (isHTMLElement(pageScrollRoot)) {
        pageScrollRoot.scrollTo({ top: 0, left: 0, behavior: "auto" })
      }

      nestedFrameId = window.requestAnimationFrame(() => {
        const latestPageScrollRoot = document.querySelector("[data-tutorial-scroll-root='page']")
        if (isHTMLElement(latestPageScrollRoot)) {
          latestPageScrollRoot.scrollTo({ top: 0, left: 0, behavior: "auto" })
        }
      })
    })

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (nestedFrameId !== null) window.cancelAnimationFrame(nestedFrameId)
    }
  }, [isActive, currentStep, pathname])

  /**
   * 2c. Reset state on every slot change — intentionally keep targetRect so the
   * backdrop stays visible while updateHighlight finds the new element (avoids flicker).
   */
  useEffect(() => {
    if (!isActive) return;
    setSyncRetries(0);
    setHasSyncTimedOut(false);
    setCompletedMandatorySlotIndex(null);
    autoScrollKeyRef.current = null;
    // Clear the scroll container so stale container rect from the previous substep
    // doesn't incorrectly trigger isTargetAboveContainer/isTargetBelowContainer on
    // the next substep before updateHighlight re-evaluates it.
    setActiveScrollContainerBoth(null);
  }, [isActive, currentSlotIndex]);

  /**
   * 2f. Mandatory step — listen for a click on the highlighted element to unlock Next
   */
  useEffect(() => {
    if (!isActive || !currentSubstep?.mandatory) return;

    if (completionSelector) {
      const markCompletedIfMatched = () => {
        const completionEl = document.querySelector(completionSelector)
        if (!completionEl) return false
        setCompletedMandatorySlotIndex(currentSlotIndex)
        return true
      }

      if (markCompletedIfMatched()) return

      const observer = new MutationObserver(() => {
        if (markCompletedIfMatched()) {
          observer.disconnect()
        }
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      })

      return () => observer.disconnect()
    }

    if (!expectedSelector) return;
    const el = document.querySelector(expectedSelector);
    if (!el) return;
    const handler = () => setCompletedMandatorySlotIndex(currentSlotIndex);
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [isActive, completionSelector, currentSubstep, currentSlotIndex, expectedSelector]);

  /**
   * 2d. Kick off highlight after a short delay on each slot or substep change.
   * Covers cases where the element isn't in the DOM yet (e.g. sidebar opening after
   * a mandatory click advances the substep without changing the slot index).
   */
  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => scheduleHighlightUpdate({ immediate: true }), 150);
    return () => clearTimeout(timer);
  }, [isActive, currentSlotIndex, currentSubstep?.id, scheduleHighlightUpdate]);

  /**
   * 2e. Re-trigger highlight when page loading clears — updateHighlight exits early
   * while isPageLoading is true, so we need an explicit retry once it settles.
   */
  useEffect(() => {
    if (!isActive || isPageLoading) return;
    scheduleHighlightUpdate({ immediate: true });
  }, [isActive, isPageLoading, scheduleHighlightUpdate]);

  useEffect(() => {
    if (!isActive || !activeScrollContainer) return;

    const handleScroll = () => scheduleHighlightUpdate({ minIntervalMs: SCROLL_HIGHLIGHT_INTERVAL });
    activeScrollContainer.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      activeScrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, [isActive, activeScrollContainer, scheduleHighlightUpdate]);

  useEffect(() => {
    if (!isActive) return

    const overlayElement = overlayRef.current
    if (!overlayElement) return

    const preventScrollChaining = (event: WheelEvent | TouchEvent) => {
      event.preventDefault()
    }

    overlayElement.addEventListener("wheel", preventScrollChaining, { passive: false })
    overlayElement.addEventListener("touchmove", preventScrollChaining, { passive: false })

    return () => {
      overlayElement.removeEventListener("wheel", preventScrollChaining)
      overlayElement.removeEventListener("touchmove", preventScrollChaining)
    }
  }, [isActive, currentSlotIndex, isMinimized])

  /**
   * 3. Page Navigation & Transition Management
   */
  useEffect(() => {
    if (!isActive || !currentStep) return;
    if (!pageMatches(currentStep.page, pathname)) {
      setIsChangingPage(true);
      setTargetElementBoth(null);
      setTargetRectBoth(null);
      setActiveScrollContainerBoth(null);
      setSyncRetries(0);
      setHasSyncTimedOut(false);
      setIsPageLoading(false);
    } else {
      setIsChangingPage(false);
    }
  }, [isActive, currentStep?.page, pathname]);

  /**
   * 4. Stabilized Highlight Engine
   */
  const updateHighlight = useCallback(() => {
    if (!isActive || !currentStep || isMinimized || isPageLoading) return;
    if (isTutorialHighlightSuppressed()) return;

    const stepSel = currentStep && "highlightSelector" in currentStep ? currentStep.highlightSelector : undefined
    const selector = transitionNavSelector ?? currentSubstep?.highlightSelector ?? stepSel;
    if (!selector) {
      setTargetElementBoth(null);
      setTargetRectBoth(null);
      setActiveScrollContainerBoth(null);
      setIsChangingPage(false);
      return;
    }

    const candidates = Array.from(document.querySelectorAll(selector)) as HTMLElement[]
    const element = candidates.find((candidate) => {
      const style = window.getComputedStyle(candidate)
      if (style.display === "none" || style.visibility === "hidden") return false
      const rect = candidate.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }) || candidates[0] || null

    if (!element) {
      if (syncRetries < MAX_RETRIES && !isPageLoading) {
        const delayMs = Math.min(300 * Math.pow(1.8, syncRetries), 8000);
        const retryTimer = setTimeout(() => {
          setSyncRetries(prev => prev + 1);
          updateHighlight();
        }, delayMs);
        return () => clearTimeout(retryTimer);
      } else if (!isPageLoading) {
        setHasSyncTimedOut(true);
        setIsChangingPage(false);
        return;
      }
      return;
    }

    setIsChangingPage(false);
    setHasSyncTimedOut(false);
    setSyncRetries(0);

    const scrollContainer = resolveScrollContainer(element, expectedScrollContainerSelector);

    // If the element or any ancestor has a running CSS transition/animation, wait for it
    // to finish before locking in the rect — otherwise we capture a mid-animation position
    // (e.g. a sidebar sliding open returns an intermediate width/offset).
    let animEl: Element | null = element;
    while (animEl && animEl !== document.documentElement) {
      const running = animEl.getAnimations().filter(a => a.playState === 'running');
      if (running.length > 0) {
        Promise.all(running.map(a => a.finished.catch(() => {}))).then(() => {
          scheduleHighlightUpdate({ immediate: true });
        });
        return; // Don't capture a mid-animation rect — wait for the callback above
      }
      animEl = animEl.parentElement;
    }

    const newRect = element.getBoundingClientRect();
    const containerRect = scrollContainer?.getBoundingClientRect() ?? null;
    const needsContainerScroll =
      !!scrollContainer &&
      isScrollableElement(scrollContainer) &&
      !!containerRect &&
      isRectClippedByContainer(newRect, containerRect);

    const autoScrollKey = `${currentSlotIndex}:${selector}:${expectedScrollContainerSelector ?? ""}`;
    debugTutorialScroll("update-highlight", {
      selector,
      expectedScrollContainerSelector,
      target: describeElement(element),
      targetRect: {
        top: newRect.top,
        bottom: newRect.bottom,
        height: newRect.height,
      },
      scrollContainer: describeElement(scrollContainer),
      containerRect: containerRect
        ? {
            top: containerRect.top,
            bottom: containerRect.bottom,
            height: containerRect.height,
          }
        : null,
      needsContainerScroll,
      autoScrollKey,
      autoScrollSeen: autoScrollKeyRef.current,
      pendingNextAutoScroll: pendingNextAutoScrollRef.current,
      windowScrollY: typeof window !== "undefined" ? window.scrollY : null,
    })
    const shouldAutoScrollForNext = pendingNextAutoScrollRef.current && autoScrollKeyRef.current !== autoScrollKey
    if ((needsContainerScroll || shouldAutoScrollForNext) && autoScrollKeyRef.current !== autoScrollKey) {
      autoScrollKeyRef.current = autoScrollKey;
      scrollToTarget(element, scrollContainer, { force: shouldAutoScrollForNext });
      pendingNextAutoScrollRef.current = false;
    }

    setTargetElementBoth(element);
    setActiveScrollContainerBoth(scrollContainer);

    const prev = targetRectRef.current;
    const hasMoved = !prev ||
      Math.abs(newRect.top - prev.top) > 2 ||
      Math.abs(newRect.left - prev.left) > 2;

    if (hasMoved) {
      setTargetRectBoth(newRect);
    }
  }, [
    isActive,
    currentStep,
    currentSubstep,
    currentSlotIndex,
    expectedScrollContainerSelector,
    isMinimized,
    isPageLoading,
    scrollToTarget,
    syncRetries,
    transitionNavSelector,
  ]);

  /** Keep a stable ref so delayed callbacks always call the latest version */
  useEffect(() => { updateHighlightRef.current = updateHighlight; }, [updateHighlight]);

  /** Register the release callback so suppression auto-triggers a re-run on release. */
  useEffect(() => {
    _registerHighlightReleaseCallback(() => scheduleHighlightUpdate({ immediate: true }));
    return () => _registerHighlightReleaseCallback(() => {});
  }, [scheduleHighlightUpdate]);

  /**
   * 5. Filtered Mutation Observer
   */
  useIsomorphicLayoutEffect(() => {
    if (!isActive || isMinimized) return;

    let lastMutationTime = Date.now();
    let lastHighlightAttempt = 0;
    const DEBOUNCE_INTERVAL = 150;
    const MIN_HIGHLIGHT_INTERVAL = 500;

    const observer = new MutationObserver((mutations) => {
      const isInternal = mutations.every(m => overlayRef.current?.contains(m.target));
      if (isInternal) return;
      if (isTutorialHighlightSuppressed()) return;
      const now = Date.now();
      if (now - lastHighlightAttempt < MIN_HIGHLIGHT_INTERVAL) return;
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      const timeSinceLastMutation = now - lastMutationTime;
      const delay = Math.max(0, DEBOUNCE_INTERVAL - timeSinceLastMutation);
      stabilityTimerRef.current = setTimeout(() => {
        lastHighlightAttempt = Date.now();
        scheduleHighlightUpdate({ immediate: true });
        lastMutationTime = Date.now();
      }, delay);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const handleResize = () => scheduleHighlightUpdate({ immediate: true });
    const handleWindowScroll = () => scheduleHighlightUpdate({ minIntervalMs: SCROLL_HIGHLIGHT_INTERVAL });
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleWindowScroll, { capture: true, passive: true });

    if (Date.now() - lastHighlightAttempt > MIN_HIGHLIGHT_INTERVAL) {
      lastHighlightAttempt = Date.now();
      scheduleHighlightUpdate({ immediate: true });
    }

    return () => {
      observer.disconnect();
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleWindowScroll, true);
    };
  }, [isActive, isMinimized, currentSlotIndex, pathname, currentStep?.page, scheduleHighlightUpdate]);

  /**
   * 5b. When a mandatory step completes and flips isPageTransition to true, Effect 5's
   * deps don't include the transition selector change, so we explicitly re-run the
   * highlight engine here to pick up the new nav-link selector.
   */
  useEffect(() => {
    if (!isActive || !isPageTransition) return;
    scheduleHighlightUpdate({ immediate: true });
  }, [isActive, isPageTransition, scheduleHighlightUpdate]);

  /**
   * 6. Auto-advance when user navigates to the next page via the highlighted nav link
   */
  useEffect(() => {
    if (!isPageTransition || !nextSlot) return
    if (pageMatches(nextSlot.page, pathname)) {
      nextStep()
    }
  }, [isPageTransition, nextSlot, pathname, nextStep])

  /**
   * 6b. Auto-advance when a mandatory click completes on the same page (no navigation).
   * Page-transition cases (isPageTransition=true or wildcard next page) are handled by
   * effects 6 and 6c respectively — this covers in-page mandatory actions like opening
   * a sidebar, switching tabs, or closing a panel.
   */
  useEffect(() => {
    if (!isMandatoryCompleted || !nextSlot || !currentSlot) return
    if (!currentSubstep?.mandatory) return  // only advance from the substep that was mandatory
    if (isPageTransition) return  // handled by effect 6
    if (nextSlot.page !== currentSlot.page) return  // cross-page: handled by 6c
    nextStep()
  }, [isMandatoryCompleted, isPageTransition, nextSlot, currentSlot, currentSubstep, nextStep])

  /**
   * 6c. Auto-advance when a mandatory click navigates to a wildcard next page.
   * Only fires when the current slot is still on the source page — once nextStep()
   * increments the slot index, currentSlot.page will match the wildcard page and
   * this guard prevents it from firing again and skipping the overview.
   */
  useEffect(() => {
    if (!isMandatoryCompleted || !nextSlot || !currentSlot) return
    if (nextSlot.page === currentSlot.page) return
    if (!nextSlot.page.endsWith("*")) return
    if (!pageMatches(currentSlot.page, pathname) && pageMatches(nextSlot.page, pathname)) {
      nextStep()
    }
  }, [isMandatoryCompleted, nextSlot, currentSlot, pathname, nextStep])

  // Avoid inline styles for the progress bar width (linter rule).
  // We bucket to 10% steps so Tailwind can statically include the classes.
  const progressBucket = Math.max(0, Math.min(100, Math.round(progress / 10) * 10))
  const progressWidthClass =
    progressBucket === 0
      ? "w-0"
      : progressBucket === 10
        ? "w-[10%]"
        : progressBucket === 20
          ? "w-[20%]"
          : progressBucket === 30
            ? "w-[30%]"
            : progressBucket === 40
              ? "w-[40%]"
              : progressBucket === 50
                ? "w-[50%]"
                : progressBucket === 60
                  ? "w-[60%]"
                  : progressBucket === 70
                    ? "w-[70%]"
                    : progressBucket === 80
                      ? "w-[80%]"
                      : progressBucket === 90
                        ? "w-[90%]"
                        : "w-full"

  const windowHeight = typeof window !== "undefined" ? window.innerHeight : 800
  const viewportTopPadding = headerHeight + WINDOW_SCROLL_PADDING
  const activeScrollContainerRect = activeScrollContainer?.getBoundingClientRect() ?? null
  const targetIsWithinHeader = !!targetRect && isRectWithinHeader(targetRect, headerHeight)
  const viewportTopBoundary = activeScrollContainer || targetIsWithinHeader ? 0 : viewportTopPadding
  const viewportBottomBoundary = activeScrollContainer ? 0 : WINDOW_SCROLL_PADDING
  // Only treat page targets as off-screen when they are fully above or fully below
  // the visible viewport. Large targets like the sticky recipe filter sidebar can
  // legitimately extend beyond the fold while still needing to be highlighted.
  const isTargetAbove = !!targetRect && targetRect.bottom <= viewportTopBoundary
  const isTargetBelow = !!targetRect && targetRect.top >= windowHeight - viewportBottomBoundary
  // Use bottom/top thresholds (fully hidden) rather than a loose overlap check,
  // so sticky-at-top elements inside the container aren't incorrectly flagged.
  const isTargetAboveContainer =
    !!targetRect &&
    !!activeScrollContainerRect &&
    targetRect.bottom <= activeScrollContainerRect.top + CONTAINER_SCROLL_PADDING
  const isTargetBelowContainer =
    !!targetRect &&
    !!activeScrollContainerRect &&
    targetRect.top >= activeScrollContainerRect.bottom - CONTAINER_SCROLL_PADDING
  const isTargetOffScreen = isTargetAbove || isTargetBelow
  const isTargetClippedByContainer = isTargetAboveContainer || isTargetBelowContainer
  const showTutorialBackdrop = !isMinimized && !isChangingPage && !isPageLoading && !!targetRect && !hasSyncTimedOut
  const showVisibleHighlight = showTutorialBackdrop && !isTargetOffScreen && !isTargetClippedByContainer
  const showScrollPrompt = showTutorialBackdrop && (isTargetOffScreen || isTargetClippedByContainer)
  const scrollPromptLabel = isTargetClippedByContainer
    ? "Scroll the filter panel to the highlighted option"
    : isTargetAbove
      ? "Scroll up to highlighted element"
      : "Scroll down to highlighted element"
  const scrollPromptDirectionUp = isTargetClippedByContainer ? isTargetAboveContainer : isTargetAbove

  useEffect(() => {
    if (!isActive || !targetRect) return

    debugTutorialScroll("visibility-state", {
      target: describeElement(targetElement),
      scrollContainer: describeElement(activeScrollContainer),
      targetRect: {
        top: targetRect.top,
        bottom: targetRect.bottom,
        height: targetRect.height,
      },
      activeScrollContainerRect: activeScrollContainerRect
        ? {
            top: activeScrollContainerRect.top,
            bottom: activeScrollContainerRect.bottom,
            height: activeScrollContainerRect.height,
          }
        : null,
      viewportTopBoundary,
      viewportBottomBoundary,
      isTargetAbove,
      isTargetBelow,
      isTargetAboveContainer,
      isTargetBelowContainer,
      isTargetOffScreen,
      isTargetClippedByContainer,
      showVisibleHighlight,
      showScrollPrompt,
      scrollPromptLabel,
      windowScrollY: typeof window !== "undefined" ? window.scrollY : null,
    })
  }, [
    activeScrollContainer,
    activeScrollContainerRect,
    isActive,
    isTargetAbove,
    isTargetAboveContainer,
    isTargetBelow,
    isTargetBelowContainer,
    isTargetClippedByContainer,
    isTargetOffScreen,
    scrollPromptLabel,
    showScrollPrompt,
    showVisibleHighlight,
    targetElement,
    targetRect,
    viewportBottomBoundary,
    viewportTopBoundary,
  ])

  if (isMobile || !isActive || !currentSlot) return null;

  return (
    <>
      {/* Background Mask */}
      {showTutorialBackdrop && (
        <>
          {showVisibleHighlight ? (
            <svg className="fixed inset-0 z-40 pointer-events-none w-full h-full">
              <defs>
                <mask id="tutorial-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect
                    x={targetRect!.left - 10}
                    y={targetRect!.top - 10}
                    width={targetRect!.width + 20}
                    height={targetRect!.height + 20}
                    rx="12"
                    fill="black"
                    className="transition-all duration-300 ease-out"
                  />
                  {/* When highlighting a header element, darken the rest of the header too.
                      Otherwise, keep the full header unmasked so navigation remains visible. */}
                  {!targetIsWithinHeader && (
                    <rect x="0" y="0" width="100%" height={headerHeight} fill="black" />
                  )}
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill={isDark ? "rgba(0,0,0,0.78)" : "rgba(17,24,39,0.45)"}
                mask="url(#tutorial-mask)"
                className="backdrop-blur-[2px] transition-opacity duration-500"
              />
            </svg>
          ) : (
            <div
              className={clsx(
                "fixed inset-0 z-40 pointer-events-none backdrop-blur-[2px] transition-opacity duration-500",
                isDark ? "bg-black/80" : "bg-slate-950/45"
              )}
            />
          )}

          {showVisibleHighlight && currentSubstep?.blockClick && (
            <div
              className="fixed z-[45] pointer-events-auto"
              style={{
                top: targetRect!.top,
                left: targetRect!.left,
                width: targetRect!.width,
                height: targetRect!.height,
              }}
            />
          )}

          {showVisibleHighlight && (
            <div
              className="fixed z-[45] pointer-events-none rounded-[18px] border-2 border-blue-400 transition-all duration-300 ease-out"
              style={{
                top: targetRect!.top - 12,
                left: targetRect!.left - 12,
                width: targetRect!.width + 24,
                height: targetRect!.height + 24,
                boxShadow: isDark
                  ? "0 0 0 2px rgba(96,165,250,0.9), 0 0 24px rgba(96,165,250,0.55)"
                  : "0 0 0 2px rgba(37,99,235,0.9), 0 0 24px rgba(59,130,246,0.35)",
                // Only clip the highlight border when it overlaps the header from below.
                // Header link targets are fully within the header so no clipping needed.
                clipPath: targetIsWithinHeader
                  ? undefined
                  : `inset(${Math.max(0, headerHeight - (targetRect!.top - 12))}px 0px 0px 0px round 18px)`,
              }}
            >
              <div className="absolute inset-0 rounded-[16px] border border-white/50" />
            </div>
          )}
        </>
      )}


      {/* Main Control Card */}
      <div
        ref={overlayRef}
        data-testid="tutorial-overlay"
        className={clsx(
          "fixed bottom-4 right-4 sm:bottom-8 sm:right-8 z-50 transition-all duration-500 ease-in-out shadow-2xl rounded-2xl border overflow-hidden",
          isDark ? "bg-[#1c1c16] border-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white border-gray-200 text-gray-900",
          isMinimized ? "w-72 max-w-[calc(100vw-2rem)]" : "w-[calc(100vw-2rem)] max-w-[400px]"
        )}
      >
        <div className="h-1.5 w-full bg-gray-200/20">
          <div className={`h-full bg-blue-500 transition-all duration-500 ${progressWidthClass}`} />
        </div>

        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500/10 text-blue-500 p-1.5 rounded-lg">
              {isChangingPage || isPageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-50">
              {isMinimized
                ? `Paused · ${completedSteps}/${totalSteps}`
                : (isPageLoading ? "Loading content..." : (isChangingPage ? "Syncing UI..." : (currentSlot.isGeneral ? "Overview" : "Tutorial")))}
            </span>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMinimized(!isMinimized)}>
              {isMinimized ? <ChevronUp className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-500/20" onClick={() => setShowSkipConfirmation(true)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-6">
          {isMinimized ? (
            <div className="px-1 py-1 flex items-center justify-between bg-blue-500/5 group cursor-pointer" onClick={() => setIsMinimized(false)}>
              <p className="text-xs font-medium opacity-70 group-hover:opacity-100 transition-opacity">Click to resume tutorial</p>
              <RefreshCw className="w-3 h-3 text-blue-500 animate-spin-slow" />
            </div>
          ) : isPageLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-sm font-medium opacity-60">Waiting for page to load...</p>
            </div>
          ) : isChangingPage ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-sm font-medium opacity-60">Preparing next step...</p>
            </div>
          ) : !!expectedSelector && !targetRect && !hasSyncTimedOut ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-sm font-medium opacity-70">Scanning for element…</p>
              <p className="text-[10px] opacity-40 mt-1">
                Attempt {syncRetries + 1} of {MAX_RETRIES}
              </p>
            </div>
          ) : hasSyncTimedOut ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
              <h4 className="font-bold text-lg mb-1">We lost track</h4>
              {currentStep?.page && !pageMatches(currentStep.page, pathname) ? (
                <>
                  <p className="text-xs opacity-60 mb-1">Not on the right page?</p>
                  <p className="text-[10px] opacity-40 mb-6">Expected: <span className="font-mono">{currentStep?.page}</span> · Current: <span className="font-mono">{pathname}</span></p>
                  <div className="flex gap-3 w-full">
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleGoToExpectedPage}>
                      Go There
                    </Button>
                    <Button size="sm" className="flex-1 bg-blue-600" onClick={nextStep}>
                      Continue Anyway
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs opacity-60 mb-2">We couldn't find the UI element for this step.</p>
                  <p className="text-[10px] opacity-40 mb-6">
                    Step {completedSteps} of {totalSteps}
                    {expectedSelector ? <> · Selector: <span className="font-mono">{expectedSelector}</span></> : null}
                  </p>
                  <div className="flex gap-3 w-full">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSyncRetries(0); setHasSyncTimedOut(false); updateHighlight(); }}>
                      Retry
                    </Button>
                    <Button size="sm" className="flex-1 bg-blue-600" onClick={nextStep}>
                      Continue Anyway
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <p className={clsx("text-[11px] uppercase tracking-[0.18em] mb-2 font-semibold", isDark ? "text-[#e8dcc4]/55" : "text-gray-500")}>
                Step {completedSteps} of {totalSteps}
              </p>
              <h3 className="text-xl font-bold mb-2 leading-tight">{currentStep?.title}</h3>
              <p className={clsx("text-sm leading-relaxed mb-6", isDark ? "text-gray-400" : "text-gray-600")}>
                {isPageTransition
                  ? `You're done here. Use the navigation to go to ${pageNames[nextSlot!.page] ?? nextSlot!.page}.`
                  : (currentSubstep?.instruction ?? currentStep?.description)}
              </p>

              {/* Tips — only shown at rank 1 (primary goal), not on general slots */}
              {!currentSlot.isGeneral && currentSlot.rank === 1 && currentStep && 'tips' in currentStep && currentStep.tips && currentStep.tips.length > 0 && (
                <div className={clsx("mb-6 p-3 rounded-lg", isDark ? "bg-blue-500/10" : "bg-blue-50")}>
                  <p className="text-xs font-semibold mb-1 opacity-60">Tips</p>
                  <ul className="space-y-1">
                    {currentStep.tips.map((tip, i) => (
                      <li key={i} className="text-xs opacity-70">{tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              {showScrollPrompt ? (
                <button
                  onClick={() => {
                    if (!targetElement) return
                    scrollToTarget(targetElement, activeScrollContainer)
                  }}
                  className={clsx(
                    "w-full flex items-center gap-3 rounded-xl border px-4 py-3 animate-bounce transition-colors",
                    isDark ? "border-blue-400/25 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
                    {scrollPromptDirectionUp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                  <span className="text-sm font-medium">{scrollPromptLabel}</span>
                </button>
              ) : isPageTransition ? (
                <div className={clsx("flex items-center gap-3 rounded-xl px-4 py-3 border", isDark ? "bg-blue-500/10 border-blue-400/25 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-700")}>
                  <ChevronUp className="w-4 h-4 shrink-0" />
                  <p className="text-xs font-medium leading-snug">
                    Click <strong>{pageNames[nextSlot!.page] ?? nextSlot!.page}</strong> in the navigation above to continue
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={prevStep} disabled={currentSlotIndex === 0}>
                    <ChevronLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button
                    disabled={!!currentSubstep?.mandatory && !isMandatoryCompleted}
                    onClick={() => {
                      if (currentSubstep?.action === "click" && expectedSelector) {
                        const el = document.querySelector(expectedSelector) as HTMLElement | null
                        if (el) el.click()
                      }
                      pendingNextAutoScrollRef.current = shouldAutoScrollNextWithinPage
                      nextStep()
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isLastStep ? "Finish" : "Next"}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Skip Confirmation Modal */}
      {showSkipConfirmation && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <div className={clsx("w-full max-w-sm p-8 rounded-3xl border shadow-2xl", isDark ? "bg-[#1c1c16] border-[#e8dcc4]/20" : "bg-white border-gray-200")}>
            <h2 className="text-2xl font-bold mb-2">End Tutorial?</h2>
            <div className="flex gap-3 mt-8">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowSkipConfirmation(false)}>Keep Going</Button>
              <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => {
                skipTutorial()
                toast({ title: "Tutorial ended", description: "You can restart it anytime from Settings → Learning & Tutorials." })
              }}>Exit</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
