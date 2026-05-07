"use client"

import { useFeaturePreferences } from "@/hooks/use-feature-preferences"
import { useFoundationFeatureFlag } from "@/hooks/use-feature-flag"
import {
  useCookCheckDrafts,
  useKitchenSyncFeed,
  usePublishCookCheck,
  useCookingJourneys,
  useRemixMealPlanShare,
  useSkipCookCheck,
  useSocialPreferences,
  useToggleCookCheckReaction,
} from "@/hooks/use-kitchen-sync"
import { KitchenPreferencesCard } from "@/components/social/kitchen-preferences-card"
import { CookCheckDraftCard } from "@/components/social/cook-check-draft-card"
import { KitchenSyncFeed } from "@/components/social/kitchen-sync-feed"
import { CookingJourneysPanel } from "@/components/social/cooking-journeys-panel"

export default function KitchenPage() {
  const socialFlag = useFoundationFeatureFlag("social_layer")
  const prefs = useFeaturePreferences()
  const socialPrefs = useSocialPreferences(socialFlag.isEnabled)
  const drafts = useCookCheckDrafts(socialFlag.isEnabled && prefs.preferences.socialEnabled)
  const feed = useKitchenSyncFeed(socialFlag.isEnabled && prefs.preferences.socialEnabled)
  const publish = usePublishCookCheck()
  const skip = useSkipCookCheck()
  const reactions = useToggleCookCheckReaction()
  const remixes = useRemixMealPlanShare()
  const journeys = useCookingJourneys(socialFlag.isEnabled && prefs.preferences.socialEnabled)

  if (!socialFlag.isEnabled || !prefs.preferences.socialEnabled) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Kitchen Sync is off</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Kitchen Sync is private by default. Enable social to opt in.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 pb-8 md:p-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Full social page</p>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Kitchen Sync</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Review drafts, manage cooking journeys, remix shared meal plans, and browse safe kitchen updates.
        </p>
      </div>
      <KitchenPreferencesCard
        preferences={socialPrefs.data?.preferences}
        onUpdate={(patch) => socialPrefs.updatePreferences(patch)}
        updating={socialPrefs.updating}
      />
      {(drafts.data?.drafts ?? []).map((draft: any) => (
        <CookCheckDraftCard
          key={draft.id}
          draft={draft}
          publishing={publish.isPending || skip.isPending}
          onPublish={(item) =>
            publish.mutate({ cookCheckId: item.id, caption: item.caption ?? "", visibility: item.visibility })}
          onSkip={(item) => skip.mutate(item.id)}
        />
      ))}
      <CookingJourneysPanel
        journeys={journeys.data?.journeys ?? []}
        creating={journeys.create.isPending}
        updating={journeys.progress.isPending}
        completing={journeys.complete.isPending}
        onCreate={(input) => journeys.create.mutate(input)}
        onProgress={(journeyId) => journeys.progress.mutate({ journeyId, progressDelta: 1, eventType: "manual_progress" })}
        onComplete={(input) => journeys.complete.mutate(input)}
      />
      <KitchenSyncFeed
        feed={feed.data?.feed ?? []}
        reacting={reactions.isPending}
        remixing={remixes.isPending}
        onToggleReaction={(input) => reactions.mutate(input)}
        onRemixMealPlan={(shareId) => remixes.mutate({ shareId })}
      />
    </div>
  )
}
