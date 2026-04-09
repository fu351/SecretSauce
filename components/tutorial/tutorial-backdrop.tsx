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
  return (
    <>
      {/* Dimmed backdrop (desktop only) */}
      {!isMobile && (
        showVisibleHighlight ? (
          <svg className="fixed inset-0 z-[10030] pointer-events-none w-full h-full">
            <defs>
              <mask id="tutorial-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left - 10}
                  y={targetRect.top - 10}
                  width={targetRect.width + 20}
                  height={targetRect.height + 20}
                  rx="12"
                  fill="black"
                  className="transition-all duration-300 ease-out"
                />
                {/* When highlighting a header element, darken the rest of the header too.
                    Otherwise keep the full header unmasked so navigation remains visible. */}
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
              "fixed inset-0 z-[10030] pointer-events-none backdrop-blur-[2px] transition-opacity duration-500",
              isDark ? "bg-black/80" : "bg-slate-950/45"
            )}
          />
        )
      )}

      {/* Click blocker — sits over the highlighted element */}
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
