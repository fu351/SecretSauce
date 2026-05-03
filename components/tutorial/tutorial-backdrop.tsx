"use client"

import clsx from "clsx"

interface TutorialBackdropProps {
  targetRect: DOMRect
  headerHeight: number
  targetIsWithinHeader: boolean
  isDark: boolean
  isMobile: boolean
  showVisibleHighlight: boolean
  blockClick: boolean
}

/**
 * Renders the dimmed backdrop, the highlight ring around the target element,
 * and an optional click-blocking overlay when `blockClick` is set.
 *
 * Only rendered on desktop (isMobile=false) for the backdrop;
 * the highlight ring is rendered on all viewports.
 */
export function TutorialBackdrop({
  targetRect,
  headerHeight,
  targetIsWithinHeader,
  isDark,
  isMobile,
  showVisibleHighlight,
  blockClick,
}: TutorialBackdropProps) {
  const padding = 10
  const cutoutTop = Math.max(0, targetRect.top - padding)
  const cutoutLeft = Math.max(0, targetRect.left - padding)
  const cutoutRight = targetRect.right + padding
  const cutoutBottom = targetRect.bottom + padding
  const dimTop = targetIsWithinHeader ? 0 : headerHeight
  const dimClassName = clsx(
    "fixed z-[10030] pointer-events-none backdrop-blur-[2px] transition-opacity duration-500",
    isDark ? "bg-black/80" : "bg-slate-950/45"
  )

  return (
    <>
      {/* Dimmed backdrop (desktop only) */}
      {!isMobile && (
        showVisibleHighlight ? (
          <>
            <div
              data-testid="tutorial-backdrop-panel"
              className={dimClassName}
              style={{
                top: dimTop,
                left: 0,
                right: 0,
                height: Math.max(0, cutoutTop - dimTop),
              }}
            />
            <div
              data-testid="tutorial-backdrop-panel"
              className={dimClassName}
              style={{
                top: cutoutTop,
                left: 0,
                width: cutoutLeft,
                height: Math.max(0, cutoutBottom - cutoutTop),
              }}
            />
            <div
              data-testid="tutorial-backdrop-panel"
              className={dimClassName}
              style={{
                top: cutoutTop,
                left: cutoutRight,
                right: 0,
                height: Math.max(0, cutoutBottom - cutoutTop),
              }}
            />
            <div
              data-testid="tutorial-backdrop-panel"
              className={dimClassName}
              style={{
                top: cutoutBottom,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
          </>
        ) : (
          <div
            className={dimClassName}
            style={{ inset: 0 }}
          />
        )
      )}

      {/* Click blocker - sits over the highlighted element */}
      {showVisibleHighlight && blockClick && (
        <div
          className="fixed z-[10040] pointer-events-auto"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}

      {/* Highlight ring */}
      {showVisibleHighlight && (
        <div
          data-testid="tutorial-highlight-ring"
          className="fixed z-[10040] pointer-events-none rounded-[18px] border-2 border-blue-400 transition-all duration-300 ease-out"
          style={{
            top: targetRect.top - 12,
            left: targetRect.left - 12,
            width: targetRect.width + 24,
            height: targetRect.height + 24,
            boxShadow: isDark
              ? "0 0 0 2px rgba(96,165,250,0.9), 0 0 24px rgba(96,165,250,0.55)"
              : "0 0 0 2px rgba(37,99,235,0.9), 0 0 24px rgba(59,130,246,0.35)",
            // Clip the highlight border when it overlaps the header from below.
            // Header link targets are fully within the header so no clipping needed.
            clipPath: targetIsWithinHeader
              ? undefined
              : `inset(${Math.max(0, headerHeight - (targetRect.top - 12))}px 0px 0px 0px round 18px)`,
          }}
        >
          <div className="absolute inset-0 rounded-[16px] border border-white/50" />
        </div>
      )}
    </>
  )
}
