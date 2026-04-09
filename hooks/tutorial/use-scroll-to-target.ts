import { useCallback } from "react"
import {
  WINDOW_SCROLL_OVERSHOOT,
  WINDOW_SCROLL_PADDING,
  RECIPE_DETAIL_SCROLL_PADDING_MOBILE,
  RECIPE_DETAIL_SCROLL_PADDING_DESKTOP,
  isScrollableElement,
  isRectClippedByContainer,
  isRectOutsideViewport,
  shouldUseRecipeDetailScrollHelper,
  smoothScrollTo,
} from "@/lib/tutorial-utils"

interface UseScrollToTargetOptions {
  headerHeight: number
  isMobile: boolean
  pathname: string
  scheduleHighlightUpdate: (options?: { immediate?: boolean; minIntervalMs?: number }) => void
}

export function useScrollToTarget({
  headerHeight,
  isMobile,
  pathname,
  scheduleHighlightUpdate,
}: UseScrollToTargetOptions) {
  const scrollToTarget = useCallback(
    async (
      element: HTMLElement,
      scrollContainer?: HTMLElement | null,
      options?: { force?: boolean }
    ) => {
      const viewportTopPadding = headerHeight + WINDOW_SCROLL_PADDING
      const shouldForceScroll = options?.force === true
      const shouldUseRecipeDetailHelper = shouldUseRecipeDetailScrollHelper(
        element,
        pathname
      )
      const recipeDetailScrollPadding = isMobile
        ? RECIPE_DETAIL_SCROLL_PADDING_MOBILE
        : RECIPE_DETAIL_SCROLL_PADDING_DESKTOP

      // Phase 1: scroll the container so the element's viewport rect is stable for window scroll.
      if (scrollContainer && isScrollableElement(scrollContainer)) {
        const elementRect = element.getBoundingClientRect()
        const containerRect = scrollContainer.getBoundingClientRect()

        if (
          shouldForceScroll ||
          isRectClippedByContainer(elementRect, containerRect)
        ) {
          const elementCenterWithinContainer =
            elementRect.top -
            containerRect.top +
            scrollContainer.scrollTop +
            elementRect.height / 2
          const nextScrollTop = Math.max(
            0,
            elementCenterWithinContainer - scrollContainer.clientHeight / 2
          )
          await smoothScrollTo(scrollContainer, nextScrollTop)
        }
      }

      // Phase 2: after container scroll settles, scroll the window if needed.
      const targetViewportRect = element.getBoundingClientRect()
      const headerEl = document.querySelector("header")
      const elementIsInHeader = !!headerEl?.contains(element)
      const viewportTopBoundary = elementIsInHeader ? 0 : viewportTopPadding
      const viewportBottomBoundary = WINDOW_SCROLL_PADDING

      const windowScrollRange =
        document.documentElement.scrollHeight - window.innerHeight
      const windowIsEffectivelyFixed = windowScrollRange <= viewportTopPadding

      const needsWindowScroll = isRectOutsideViewport(
        targetViewportRect,
        viewportTopBoundary,
        viewportBottomBoundary
      )

      if (!windowIsEffectivelyFixed && (shouldForceScroll || needsWindowScroll)) {
        const elementAbsoluteTop =
          targetViewportRect.top + window.pageYOffset
        const visibleViewportHeight =
          window.innerHeight - viewportTopBoundary - viewportBottomBoundary

        const scrollPosition = shouldUseRecipeDetailHelper
          ? Math.max(
              0,
              elementAbsoluteTop - viewportTopBoundary - recipeDetailScrollPadding
            )
          : targetViewportRect.height > visibleViewportHeight
          ? Math.max(
              0,
              elementAbsoluteTop - viewportTopBoundary - WINDOW_SCROLL_PADDING
            )
          : (() => {
              const elementCenter =
                elementAbsoluteTop + targetViewportRect.height / 2
              const viewportCenter = window.innerHeight / 2
              const raw = elementCenter - viewportCenter
              const minScrollForHeader = Math.max(
                0,
                elementAbsoluteTop - viewportTopBoundary
              )
              return Math.max(
                minScrollForHeader,
                raw > 0 ? raw + WINDOW_SCROLL_OVERSHOOT : raw
              )
            })()

        await smoothScrollTo(window, scrollPosition)
      }

      scheduleHighlightUpdate({ immediate: true })
    },
    [headerHeight, isMobile, pathname, scheduleHighlightUpdate]
  )

  return { scrollToTarget }
}
