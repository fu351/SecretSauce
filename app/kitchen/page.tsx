"use client"

import { useFeaturePreferences } from "@/hooks/use-feature-preferences"
import { useFoundationFeatureFlag } from "@/hooks/use-feature-flag"
import {
  useCookCheckDrafts,
  useKitchenSyncFeed,
  usePublishCookCheck,
  useSkipCookCheck,
  useSocialPreferences,
  useToggleCookCheckReaction,
} from "@/hooks/use-kitchen-sync"
import { KitchenPreferencesCard } from "@/components/social/kitchen-preferences-card"
import { CookCheckDraftCard } from "@/components/social/cook-check-draft-card"
import { KitchenSyncFeed } from "@/components/social/kitchen-sync-feed"

export default function KitchenPage() {
  const socialFlag = useFoundationFeatureFlag("social_layer")
  const prefs = useFeaturePreferences()
  const socialPrefs = useSocialPreferences(socialFlag.isEnabled)
  const drafts = useCookCheckDrafts(socialFlag.isEnabled && prefs.preferences.socialEnabled)
  const feed = useKitchenSyncFeed(socialFlag.isEnabled && prefs.preferences.socialEnabled)
  const publish = usePublishCookCheck()
  const skip = useSkipCookCheck()
  const reactions = useToggleCookCheckReaction()

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
    <div className="mx-auto grid max-w-4xl gap-4 p-6">
      <h1 className="text-3xl font-semibold">Kitchen Sync</h1>
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
      <KitchenSyncFeed
        feed={feed.data?.feed ?? []}
        reacting={reactions.isPending}
        onToggleReaction={(input) => reactions.mutate(input)}
      />
    </div>
  )
}
