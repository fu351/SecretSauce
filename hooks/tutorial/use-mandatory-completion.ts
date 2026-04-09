"use client"

import { useEffect, useState } from "react"
import type { TutorialSubstep } from "@/lib/types/ui/tutorial"
import { findFirstVisibleElement } from "@/lib/tutorial-utils"

interface UseMandatoryCompletionOptions {
  isActive: boolean
  currentSubstep: TutorialSubstep | null | undefined
  currentSlotIndex: number
  completionSelector: string | null
  expectedSelector: string | null
  isLastStep: boolean
  nextStep: () => void
}

export function useMandatoryCompletion({
  isActive,
  currentSubstep,
  currentSlotIndex,
  completionSelector,
  expectedSelector,
  isLastStep,
  nextStep,
}: UseMandatoryCompletionOptions) {
  const [completedMandatorySlotIndex, setCompletedMandatorySlotIndex] =
    useState<number | null>(null)

  const isMandatoryCompleted = completedMandatorySlotIndex === currentSlotIndex

  // Watch for completion: either via completionSelector (element appearing in DOM)
  // or via a click on the expectedSelector element.
  useEffect(() => {
    if (!isActive || !currentSubstep?.mandatory) return

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

    if (!expectedSelector) return
    const el = findFirstVisibleElement(expectedSelector)
    if (!el) return

    const handler = () => setCompletedMandatorySlotIndex(currentSlotIndex)
    el.addEventListener("click", handler)
    return () => el.removeEventListener("click", handler)
  }, [isActive, completionSelector, currentSubstep, currentSlotIndex, expectedSelector])

  // Auto-advance when the last step's mandatory action completes
  useEffect(() => {
    if (!isActive || !isLastStep) return
    if (!currentSubstep?.mandatory || !isMandatoryCompleted) return
    nextStep()
  }, [isActive, isLastStep, currentSubstep, isMandatoryCompleted, nextStep])

  // Reset completion tracking on every slot change
  useEffect(() => {
    if (!isActive) return
    setCompletedMandatorySlotIndex(null)
  }, [isActive, currentSlotIndex])

  return {
    isMandatoryCompleted,
    completedMandatorySlotIndex,
    setCompletedMandatorySlotIndex,
  }
}
