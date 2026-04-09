"use client"

import { useCallback, useEffect, useRef, useState } from "react"

interface UseOverlayDragOptions {
  isActive: boolean
  isMobile: boolean
  overlayRef: React.RefObject<HTMLDivElement | null>
  /** Re-clamp when these values change (slot index, loading states, etc.) */
  clampDeps?: unknown[]
}

export function useOverlayDrag({
  isActive,
  isMobile,
  overlayRef,
  clampDeps = [],
}: UseOverlayDragOptions) {
  const [overlayPosition, setOverlayPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false)
  const overlayDragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startLeft: number
    startTop: number
  } | null>(null)

  const clampOverlayPosition = useCallback(
    (left: number, top: number) => {
      const overlayElement = overlayRef.current
      const overlayWidth = overlayElement?.offsetWidth ?? 320
      const overlayHeight = overlayElement?.offsetHeight ?? 240
      const margin = 12
      const maxLeft = Math.max(margin, window.innerWidth - overlayWidth - margin)
      const maxTop = Math.max(margin, window.innerHeight - overlayHeight - margin)
      return {
        left: Math.min(Math.max(margin, left), maxLeft),
        top: Math.min(Math.max(margin, top), maxTop),
      }
    },
    [overlayRef]
  )

  const ensureOverlayPosition = useCallback(() => {
    if (overlayPosition) return overlayPosition

    const overlayElement = overlayRef.current
    if (!overlayElement) {
      const fallback = clampOverlayPosition(12, 12)
      setOverlayPosition(fallback)
      return fallback
    }

    const rect = overlayElement.getBoundingClientRect()
    const nextPosition = clampOverlayPosition(rect.left, rect.top)
    setOverlayPosition(nextPosition)
    return nextPosition
  }, [clampOverlayPosition, overlayPosition, overlayRef])

  // Reset position when tutorial deactivates or device type changes
  useEffect(() => {
    if (isActive) return
    setOverlayPosition(null)
    setIsDraggingOverlay(false)
    overlayDragStateRef.current = null
  }, [isActive])

  useEffect(() => {
    setOverlayPosition(null)
  }, [isMobile])

  // Re-clamp when overlay size may have changed (slot change, loading states, etc.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!overlayPosition || !isActive) return

    const frameId = window.requestAnimationFrame(() => {
      const clamped = clampOverlayPosition(overlayPosition.left, overlayPosition.top)
      if (
        clamped.left !== overlayPosition.left ||
        clamped.top !== overlayPosition.top
      ) {
        setOverlayPosition(clamped)
      }
    })

    return () => window.cancelAnimationFrame(frameId)
    // clampDeps is intentionally spread here so callers control when re-clamping fires
  }, [clampOverlayPosition, isActive, overlayPosition, ...clampDeps])

  // Pointer move / up / cancel listeners (only attached while dragging)
  useEffect(() => {
    if (!isDraggingOverlay) return

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = overlayDragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return
      const nextLeft = dragState.startLeft + (event.clientX - dragState.startX)
      const nextTop = dragState.startTop + (event.clientY - dragState.startY)
      setOverlayPosition(clampOverlayPosition(nextLeft, nextTop))
    }

    const stopDragging = (event: PointerEvent) => {
      if (overlayDragStateRef.current?.pointerId !== event.pointerId) return
      overlayDragStateRef.current = null
      setIsDraggingOverlay(false)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopDragging)
    window.addEventListener("pointercancel", stopDragging)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopDragging)
      window.removeEventListener("pointercancel", stopDragging)
    }
  }, [clampOverlayPosition, isDraggingOverlay])

  /** onPointerDown handler to attach to the drag handle element */
  const handleDragStart = useCallback(
    (event: React.PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("button, a, input, textarea, select")) return

      const startPosition = ensureOverlayPosition()
      overlayDragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: startPosition.left,
        startTop: startPosition.top,
      }
      setIsDraggingOverlay(true)
    },
    [ensureOverlayPosition]
  )

  return {
    overlayPosition,
    isDraggingOverlay,
    handleDragStart,
  }
}
