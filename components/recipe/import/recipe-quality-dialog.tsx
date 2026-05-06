"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertTriangle } from "lucide-react"
import { QUALITY_ISSUE_LABELS, type QualityResult } from "@/lib/recipe-quality"

interface RecipeQualityDialogProps {
  open: boolean
  qualityResult: QualityResult | null
  onFix: () => void
  onCancel: () => void
}

export function RecipeQualityDialog({
  open,
  qualityResult,
  onFix,
  onCancel,
}: RecipeQualityDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Recipe Quality is Low
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This recipe scored{" "}
                <span className="font-semibold text-foreground">
                  {qualityResult ? Math.round(qualityResult.score * 100) : 0}%
                </span>{" "}
                The form will be pre-filled with what was detected — please review and fix the following before saving:
              </p>
              {qualityResult && qualityResult.issues.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {qualityResult.issues.map((issue) => (
                    <li key={issue} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                      <span>{QUALITY_ISSUE_LABELS[issue]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Try Again</AlertDialogCancel>
          <AlertDialogAction onClick={onFix}>Fix Recipe</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
