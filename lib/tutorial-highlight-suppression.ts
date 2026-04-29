/**
 * Tutorial Highlight Suppression
 *
 * Module-level flag that pauses the tutorial overlay's highlight engine.
 * Import suppressTutorialHighlight / releaseTutorialHighlightSuppression
 * from any component or hook - no React context required.
 *
 * When suppression is released (either manually or via the optional duration),
 * the overlay fires an immediate highlight update so the position is correct.
 *
 * Usage:
 *   suppressTutorialHighlight(300)   // suppress for 300 ms then auto-release
 *   suppressTutorialHighlight()      // suppress indefinitely
 *   releaseTutorialHighlightSuppression()  // release manually
 */

let _suppressed = false
let _suppressionTimer: ReturnType<typeof setTimeout> | null = null
let _releaseCallback: (() => void) | null = null

export function suppressTutorialHighlight(durationMs?: number): void {
  if (_suppressionTimer !== null) {
    clearTimeout(_suppressionTimer)
    _suppressionTimer = null
  }
  _suppressed = true
  if (durationMs !== undefined && durationMs > 0) {
    _suppressionTimer = setTimeout(releaseTutorialHighlightSuppression, durationMs)
  }
}

export function releaseTutorialHighlightSuppression(): void {
  if (_suppressionTimer !== null) {
    clearTimeout(_suppressionTimer)
    _suppressionTimer = null
  }
  _suppressed = false
  _releaseCallback?.()
}

export function isTutorialHighlightSuppressed(): boolean {
  return _suppressed
}

/**
 * Called once by TutorialOverlay on mount to register the callback that fires
 * an immediate highlight update whenever suppression is released.
 * Not intended for use outside the overlay.
 */
export function _registerHighlightReleaseCallback(fn: () => void): void {
  _releaseCallback = fn
}
