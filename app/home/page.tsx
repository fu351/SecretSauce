"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { measureTextBlockHeight } from "@/lib/pretext"
import { recipeDB } from "@/lib/database/recipe-db"
import { mealPlannerDB } from "@/lib/database/meal-planner-db"
import { pantryItemsDB } from "@/lib/database/pantry-items-db"
import { supabase } from "@/lib/database/supabase"
import { getCurrentWeekIndex, getDatesForWeek } from "@/lib/date-utils"
import Image from "next/image"
import {
  Bell,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock,
  Crown,
  Plus,
  Search,
  Sparkles,
  Star,
  Trophy,
  Upload,
  Users,
  Vote,
  X,
} from "lucide-react"
import { RecipeCardCompact } from "@/components/recipe/cards/recipe-card-compact"
import { RecipeGrid } from "@/components/recipe/recipe-grid"
import { Recipe } from "@/lib/types"
import { useToast } from "@/hooks"
import type { PostWithMeta } from "@/lib/database/post-db"
import type { Challenge, ChallengeEntry, ChallengeVote, LeaderboardEntry } from "@/lib/database/challenge-db"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type HomePageRecipe = Recipe
const HOME_FETCH_TTL_MS = 24 * 60 * 60 * 1000
type ComposerMode = "story" | "post"

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return "ended"
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h left`
  return `${Math.floor(hours / 24)}d left`
}

function getRecommendationSkeletonAspect(index: number): string {
  switch (index % 8) {
    case 0:
      return "aspect-[2/3]"
    case 1:
      return "aspect-[9/16]"
    case 2:
      return "aspect-[3/4]"
    case 3:
      return "aspect-[4/5]"
    case 4:
      return "aspect-square"
    case 5:
      return "aspect-[5/6]"
    case 6:
      return "aspect-[7/9]"
    default:
      return "aspect-[10/13]"
  }
}

export default function HomeReturningPage() {
  const { user, profile, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [flavorsOfWeek, setFlavorsOfWeek] = useState<HomePageRecipe[]>([])
  const [recommendedRecipes, setRecommendedRecipes] = useState<HomePageRecipe[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(true)
  const [loadingRecommendedMore, setLoadingRecommendedMore] = useState(false)
  const [hasMoreRecommended, setHasMoreRecommended] = useState(true)

  // Challenge state
  const [activeChallenge, setActiveChallenge] = useState<(Challenge & { participant_count: number }) | null>(null)
  const [challengeEntry, setChallengeEntry] = useState<ChallengeEntry | null>(null)
  const [challengeRank, setChallengeRank] = useState<number | null>(null)
  const [communityChallenges, setCommunityChallenges] = useState<(Challenge & { participant_count: number })[]>([])
  const [communityEntries, setCommunityEntries] = useState<Record<string, { entry: ChallengeEntry | null; vote: ChallengeVote | null }>>({})
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardScope, setLeaderboardScope] = useState<"friends" | "global">("friends")
  const [loadingChallenge, setLoadingChallenge] = useState(true)

  // Post creation
  const [postDishOpen, setPostDishOpen] = useState(false)
  const [composerMode, setComposerMode] = useState<ComposerMode>("post")
  const [postDishTitle, setPostDishTitle] = useState("")
  const [postDishCaption, setPostDishCaption] = useState("")
  const [postImage, setPostImage] = useState<File | null>(null)
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null)
  const [submittingPost, setSubmittingPost] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Feed
  const [feedPosts, setFeedPosts] = useState<PostWithMeta[]>([])
  const [loadingFeed, setLoadingFeed] = useState(true)
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null)
  const [storyTouchStart, setStoryTouchStart] = useState<{ x: number; y: number } | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{
    recipes: { id: string; title: string; difficulty?: string; rating_avg?: number; tags?: string[] }[]
    users: { id: string; full_name: string | null; username: string | null; avatar_url: string | null }[]
  }>({ recipes: [], users: [] })
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTitleMinHeight, setSearchTitleMinHeight] = useState<number>(20)
  const [searchLoading, setSearchLoading] = useState(false)
  const overlayInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [weekSummary, setWeekSummary] = useState<{
    loading: boolean
    dinnersLeft: number
    expiringSoon: number
  }>({ loading: false, dinnersLeft: 0, expiringSoon: 0 })

  const fetchingRecipes = useRef(false)
  const recipesFetchedAtRef = useRef<number | null>(null)
  const socialFetchedForUserRef = useRef<{ userId: string; fetchedAt: number } | null>(null)
  const recommendedOffsetRef = useRef(0)
  const recommendedSentinelRef = useRef<HTMLDivElement | null>(null)
  const recommendedObserverRef = useRef<IntersectionObserver | null>(null)
  const isMounted = useRef(true)

  const fetchRecommendedPage = useCallback(async (offset: number, limit: number) => {
    const res = await fetch(`/api/home/recommended?offset=${offset}&limit=${limit}`)
    if (!res.ok) throw new Error("Failed to load recommendations")
    return res.json() as Promise<{ items: HomePageRecipe[]; hasMore: boolean }>
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    setSearchOpen(true)

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

    if (!value.trim()) {
      setSearchResults({ recipes: [], users: [] })
      return
    }

    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`)
        if (res.ok) {
          const json = await res.json()
          setSearchResults({ recipes: json.recipes ?? [], users: json.users ?? [] })
        }
      } catch {
        // ignore
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery("")
    setSearchOpen(false)
    setSearchResults({ recipes: [], users: [] })
  }, [])

  const openMobileSearch = () => {
    setSearchOpen(true)
    setTimeout(() => overlayInputRef.current?.focus(), 50)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return
    const q = searchQuery.trim()
    if (!q) return
    if (q.startsWith("@")) {
      if (!user) return
      return
    }
    clearSearch()
    router.push(`/recipes?search=${encodeURIComponent(q)}`)
  }

  const resetPostDishForm = () => {
    setPostDishTitle("")
    setPostDishCaption("")
    setPostImage(null)
    setPostImagePreview(null)
  }

  const openPostDishDialog = (mode: ComposerMode = "post") => {
    setComposerMode(mode)
    setPostDishOpen(true)
  }

  const closePostDishDialog = () => {
    resetPostDishForm()
    setPostDishOpen(false)
    setComposerMode("post")
  }

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  useEffect(() => {
    if (!searchOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSearch()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [searchOpen, clearSearch])

  const fetchHomeRecipes = async () => {
    if (fetchingRecipes.current || !isMounted.current) return
    fetchingRecipes.current = true
    setLoadingRecipes(true)
    try {
      const [topRated, recommendedPage] = await Promise.all([
        recipeDB.fetchRecipes({ sortBy: "rating_avg", limit: 10 }),
        fetchRecommendedPage(0, 24),
      ])
      if (isMounted.current) {
        setFlavorsOfWeek(topRated?.slice(0, 8) ?? [])
        setRecommendedRecipes(recommendedPage.items ?? [])
        recommendedOffsetRef.current = recommendedPage.items?.length ?? 0
        setHasMoreRecommended(recommendedPage.hasMore)
      }
    } catch (error) {
      console.error("Error fetching recipes:", error)
    } finally {
      if (isMounted.current) setLoadingRecipes(false)
      fetchingRecipes.current = false
    }
  }

  const fetchActiveChallenge = async () => {
    setLoadingChallenge(true)
    try {
      const res = await fetch("/api/challenges/active")
      if (!res.ok) return
      const json = await res.json()
      if (!isMounted.current) return
      const star = json.starChallenge ?? null
      setActiveChallenge(star)
      setChallengeEntry(json.starEntry ?? null)
      setChallengeRank(json.starRank ?? null)
      setCommunityChallenges(json.communityChallenges ?? [])
      setCommunityEntries(json.communityEntries ?? {})
      const leaderboardChallenge = star ?? (json.communityChallenges ?? [])[0] ?? null
      if (leaderboardChallenge) {
        fetchLeaderboard(leaderboardChallenge.id, leaderboardScope)
      }
    } catch (error) {
      console.error("Error fetching active challenge:", error)
    } finally {
      if (isMounted.current) setLoadingChallenge(false)
    }
  }

  const fetchLeaderboard = async (challengeId: string, scope: "friends" | "global") => {
    try {
      const res = await fetch(`/api/challenges/${challengeId}/leaderboard?scope=${scope}&limit=10`)
      if (!res.ok) return
      const json = await res.json()
      if (isMounted.current) setLeaderboard(json.leaders ?? [])
    } catch (error) {
      console.error("Error fetching leaderboard:", error)
    }
  }

  const fetchFeed = async () => {
    setLoadingFeed(true)
    try {
      const res = await fetch("/api/posts/feed?limit=20")
      if (!res.ok) throw new Error("Feed fetch failed")
      const json = await res.json()
      if (isMounted.current) setFeedPosts(json.posts ?? [])
    } catch (error) {
      console.error("Error fetching feed:", error)
    } finally {
      if (isMounted.current) setLoadingFeed(false)
    }
  }

  useEffect(() => {
    if (loading || !isMounted.current || fetchingRecipes.current) return
    const now = Date.now()
    const isFresh =
      recipesFetchedAtRef.current != null &&
      now - recipesFetchedAtRef.current < HOME_FETCH_TTL_MS
    if (isFresh) return
    void fetchHomeRecipes()
      .then(() => {
        recipesFetchedAtRef.current = Date.now()
      })
      .catch(() => {
        // fetchHomeRecipes already handles logging/loading state.
      })
  }, [fetchRecommendedPage, loading])

  useEffect(() => {
    if (recommendedObserverRef.current) recommendedObserverRef.current.disconnect()
    if (loadingRecipes) return

    recommendedObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingRecommendedMore || !hasMoreRecommended) return
        setLoadingRecommendedMore(true)
        const currentOffset = recommendedOffsetRef.current
        fetchRecommendedPage(currentOffset, 24)
          .then(({ items, hasMore }) => {
            setRecommendedRecipes((prev) => [...prev, ...items])
            recommendedOffsetRef.current = currentOffset + items.length
            setHasMoreRecommended(hasMore)
          })
          .catch((error) => {
            console.error("Error loading more recommendations:", error)
          })
          .finally(() => setLoadingRecommendedMore(false))
      },
      { rootMargin: "400px" }
    )

    if (recommendedSentinelRef.current) {
      recommendedObserverRef.current.observe(recommendedSentinelRef.current)
    }

    return () => recommendedObserverRef.current?.disconnect()
  }, [fetchRecommendedPage, hasMoreRecommended, loadingRecommendedMore, loadingRecipes])

  useEffect(() => {
    if (loading || !isMounted.current) return
    const userId = user?.id ?? null

    if (!userId) {
      socialFetchedForUserRef.current = null
      setLoadingFeed(false)
      setLoadingChallenge(false)
      setFeedPosts([])
      setActiveChallenge(null)
      setLeaderboard([])
      setChallengeEntry(null)
      setChallengeRank(null)
      setWeekSummary({ loading: false, dinnersLeft: 0, expiringSoon: 0 })
      return
    }

    const now = Date.now()
    const cachedSocial = socialFetchedForUserRef.current
    const socialFresh =
      cachedSocial?.userId === userId &&
      now - cachedSocial.fetchedAt < HOME_FETCH_TTL_MS
    if (socialFresh) return

    socialFetchedForUserRef.current = { userId, fetchedAt: now }
    void Promise.all([fetchFeed(), fetchActiveChallenge()]).catch(() => {
      // Individual fetchers handle their own errors.
    })
  }, [loading, user?.id])

  useEffect(() => {
    if (loading || !isMounted.current || !user?.id) return

    let cancelled = false
    setWeekSummary((s) => ({ ...s, loading: true }))

    ;(async () => {
      try {
        const weekIndex = getCurrentWeekIndex()
        const weekDates = getDatesForWeek(weekIndex)
        const weekDateStrings = weekDates.map((d) => d.toISOString().split("T")[0])
        const weekStart = weekDateStrings[0]
        const weekEnd = weekDateStrings[weekDateStrings.length - 1]
        const todayStr = new Date().toISOString().split("T")[0]
        const countFrom = todayStr > weekStart ? todayStr : weekStart
        const daysForDinnerCount = weekDateStrings.filter((d) => d >= countFrom && d <= weekEnd)

        const [schedule, expiringSoon] = await Promise.all([
          mealPlannerDB.fetchMealScheduleByDateRange(user.id, weekStart, weekEnd),
          pantryItemsDB.findExpiringSoon(user.id, 7),
        ])

        const dinnerPlannedDates = new Set(
          schedule
            .filter(
              (m) =>
                m.meal_type === "dinner" &&
                m.recipe_id != null &&
                String(m.recipe_id).trim().length > 0
            )
            .map((m) => m.date)
        )
        const dinnersLeft = daysForDinnerCount.filter((d) => !dinnerPlannedDates.has(d)).length

        if (!cancelled) {
          setWeekSummary({
            loading: false,
            dinnersLeft,
            expiringSoon: expiringSoon.length,
          })
        }
      } catch (e) {
        console.error("[home] week summary fetch failed:", e)
        if (!cancelled) {
          setWeekSummary({ loading: false, dinnersLeft: 0, expiringSoon: 0 })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loading, user?.id])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please choose an image.", variant: "destructive" })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10 MB.", variant: "destructive" })
      return
    }
    setPostImage(file)
    setPostImagePreview(URL.createObjectURL(file))
  }

  const handlePostSubmit = async () => {
    if (!postImage || !postDishTitle.trim()) {
      toast({ title: "Missing fields", description: "Add a photo and a dish name.", variant: "destructive" })
      return
    }
    setSubmittingPost(true)
    try {
      // Upload image to Supabase Storage
      const ext  = postImage.name.split(".").pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("post-images")
        .upload(path, postImage, { upsert: false })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from("post-images")
        .getPublicUrl(path)

      // Create post via API
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: publicUrl,
          title:    postDishTitle.trim(),
          caption:  postDishCaption.trim() || undefined,
        }),
      })

      const postJson = await res.json()
      if (!res.ok) {
        throw new Error(postJson.error ?? "Failed to post")
      }

      // Link post to all active challenges
      const newPostId = postJson.post?.id
      if (newPostId) {
        const challengesToJoin = [
          ...(activeChallenge ? [{ id: activeChallenge.id, type: "star" as const }] : []),
          ...communityChallenges.map((c) => ({ id: c.id, type: "community" as const })),
        ]
        await Promise.all(
          challengesToJoin.map((c) =>
            fetch(`/api/challenges/${c.id}/join`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ postId: newPostId }),
            })
              .then((r) => r.json())
              .then((j) => {
                if (j.entry && c.type === "star") setChallengeEntry(j.entry)
              })
              .catch(() => {})
          )
        )
      }

      toast({
        title: composerMode === "story" ? "Story posted!" : "Posted!",
        description:
          composerMode === "story"
            ? "Your latest dish post is now your story for the next 24 hours."
            : "Your dish is live.",
      })
      closePostDishDialog()
      fetchFeed()
    } catch (error: any) {
      toast({ title: "Post failed", description: error.message, variant: "destructive" })
    } finally {
      setSubmittingPost(false)
    }
  }

  const handleLeaderboardScope = (scope: "friends" | "global") => {
    setLeaderboardScope(scope)
    if (activeChallenge) fetchLeaderboard(activeChallenge.id, scope)
  }

  const isLoggedIn = Boolean(user)

  const searchPlaceholder = isLoggedIn ? "Search recipes or @username…" : "Search recipes…"
  const suggestedRecipes = useMemo(
    () => (flavorsOfWeek.length > 0 ? flavorsOfWeek : recommendedRecipes).slice(0, 8),
    [flavorsOfWeek, recommendedRecipes]
  )
  const storyPosts = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const latestByAuthor = new Map<string, PostWithMeta>()

    for (const post of feedPosts) {
      const createdAt = new Date(post.created_at).getTime()
      if (Number.isNaN(createdAt) || createdAt < cutoff) continue

      const existing = latestByAuthor.get(post.author_id)
      if (!existing || new Date(existing.created_at).getTime() < createdAt) {
        latestByAuthor.set(post.author_id, post)
      }
    }

    return Array.from(latestByAuthor.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [feedPosts])
  const ownStory = useMemo(() => {
    if (!user?.id) return null
    return storyPosts.find((story) => story.author_id === user.id) ?? null
  }, [storyPosts, user?.id])
  const otherStoryPosts = useMemo(() => {
    if (!user?.id) return storyPosts
    return storyPosts.filter((story) => story.author_id !== user.id)
  }, [storyPosts, user?.id])
  const activeStory = activeStoryIndex != null ? storyPosts[activeStoryIndex] ?? null : null
  const currentProfileName = profile?.full_name || profile?.username || "You"
  const currentProfileInitials = currentProfileName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const openStoryById = useCallback((storyId: string | null) => {
    if (!storyId) return
    const index = storyPosts.findIndex((story) => story.id === storyId)
    if (index >= 0) setActiveStoryIndex(index)
  }, [storyPosts])
  const openOwnStory = useCallback(() => {
    if (ownStory) {
      openStoryById(ownStory.id)
      return
    }
    openPostDishDialog("story")
  }, [openStoryById, ownStory])
  const goToPreviousStory = useCallback(() => {
    if (storyPosts.length === 0) return
    setActiveStoryIndex((prev) => {
      if (prev == null) return 0
      return (prev - 1 + storyPosts.length) % storyPosts.length
    })
  }, [storyPosts.length])
  const goToNextStory = useCallback(() => {
    if (storyPosts.length === 0) return
    setActiveStoryIndex((prev) => {
      if (prev == null) return 0
      return (prev + 1) % storyPosts.length
    })
  }, [storyPosts.length])

  const handleStoryTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0]
    if (!touch) return
    setStoryTouchStart({ x: touch.clientX, y: touch.clientY })
  }

  const handleStoryTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!storyTouchStart) return
    const touch = e.changedTouches[0]
    if (!touch) return

    const deltaX = touch.clientX - storyTouchStart.x
    const deltaY = touch.clientY - storyTouchStart.y

    if (Math.abs(deltaY) > 90 && Math.abs(deltaY) > Math.abs(deltaX)) {
      setActiveStoryIndex(null)
      setStoryTouchStart(null)
      return
    }

    if (Math.abs(deltaX) > 70 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        goToNextStory()
      } else {
        goToPreviousStory()
      }
    }

    setStoryTouchStart(null)
  }

  useEffect(() => {
    let cancelled = false
    if (!searchOpen) {
      setSearchTitleMinHeight(20)
      return
    }

    const measureSearchRowsWithPretext = async () => {
      const sampleTitles = [
        ...searchResults.recipes.slice(0, 6).map((r) => r.title),
        ...suggestedRecipes.slice(0, 6).map((r) => r.title),
      ]
      if (sampleTitles.length === 0) {
        setSearchTitleMinHeight(20)
        return
      }

      try {
        const font = "400 14px Inter"
        const maxWidth = 240
        const lineHeight = 20
        let maxHeight = 20
        for (const title of sampleTitles) {
          const height = await measureTextBlockHeight(title, font, maxWidth, lineHeight)
          maxHeight = Math.max(maxHeight, height)
        }

        if (!cancelled) {
          setSearchTitleMinHeight(Math.min(Math.max(20, maxHeight), 40))
        }
      } catch {
        if (!cancelled) {
          setSearchTitleMinHeight(20)
        }
      }
    }

    void measureSearchRowsWithPretext()

    return () => {
      cancelled = true
    }
  }, [searchResults.recipes, suggestedRecipes])

  const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg md:text-xl font-serif font-light text-foreground">{title}</h2>
      {right}
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse relative size-[120px]">
          <Image src="/logo-warm.png" alt="Secret Sauce" width={120} height={120} className="dark:hidden block object-contain" />
          <Image src="/logo-dark.png" alt="Secret Sauce" width={120} height={120} className="hidden dark:block object-contain" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background" data-tutorial="home-overview">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6 md:space-y-10">

        {/* Top bar */}
        <>
          {/* Mobile top bar */}
          <div className="flex md:hidden items-center justify-between gap-2">
            {isLoggedIn ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-10 w-10 rounded-2xl border-border/70 bg-background/90 text-foreground shadow-none"
                      aria-label="Create"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuItem onClick={() => openPostDishDialog("story")}>
                      <ChefHat className="h-4 w-4" />
                      Add story
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openPostDishDialog("post")}>
                      <Plus className="h-4 w-4" />
                      Add post
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/upload-recipe")}>
                      <Star className="h-4 w-4" />
                      Add recipe
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={openMobileSearch} aria-label="Search recipes">
                    <Search className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="hover:bg-muted/60">
                    <Bell className="h-5 w-5" />
                    <span className="sr-only">Notifications</span>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="leading-tight min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">Discover recipes</div>
                  <div className="text-xs text-muted-foreground">Sign in for feed & challenges</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs" asChild>
                    <Link href="/auth/signin">Sign in</Link>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={openMobileSearch} aria-label="Search recipes">
                    <Search className="h-5 w-5" />
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Desktop top bar */}
          <div className="hidden md:flex items-center gap-3">
            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-11 w-11 rounded-2xl border-border/70 bg-background/90 text-foreground shadow-none"
                    aria-label="Create"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onClick={() => openPostDishDialog("story")}>
                    <ChefHat className="h-4 w-4" />
                    Add story
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openPostDishDialog("post")}>
                    <Plus className="h-4 w-4" />
                    Add post
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/upload-recipe")}>
                    <Star className="h-4 w-4" />
                    Add recipe
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm text-muted-foreground hidden lg:inline max-w-[200px]">
                  Sign in for your feed, challenges, and friends.
                </span>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/auth/signin">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/auth/signup">Sign up</Link>
                </Button>
              </div>
            )}

            <div className="flex-1 relative min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full h-9 pl-9 pr-8 rounded-full bg-muted text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none focus:ring-2 focus:ring-primary/30"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted-foreground/20 transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {isLoggedIn && (
              <Button variant="ghost" size="icon" className="flex-shrink-0 hover:bg-muted/60">
                <Bell className="h-5 w-5" />
                <span className="sr-only">Notifications</span>
              </Button>
            )}
          </div>

          {searchOpen && (
            <div className="fixed inset-0 z-[100] md:z-[90]" data-testid="home-search-overlay">
              <button
                type="button"
                className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
                onClick={clearSearch}
                aria-label="Close search overlay"
              />
              <div className="absolute inset-0 bg-background flex flex-col">
                <div className="border-b bg-background px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 md:px-6 md:pt-4">
                  <div className="max-w-4xl mx-auto flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        ref={overlayInputRef}
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder={searchPlaceholder}
                        className="h-10 pl-9 pr-9 rounded-full"
                        autoFocus
                      />
                      {searchQuery && (
                        <button
                          onClick={() => handleSearchChange("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted-foreground/20 transition-colors"
                          aria-label="Clear search"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearSearch}>Cancel</Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 pb-28 md:px-6 md:pb-24">
                  <div className="max-w-4xl mx-auto space-y-4">
                    {searchLoading ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">Searching…</div>
                    ) : searchQuery.trim() ? (
                      <>
                        {isLoggedIn && searchResults.users.length > 0 && (
                          <div className="rounded-xl border overflow-hidden">
                            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
                              People
                            </div>
                            {searchResults.users.map((u) => {
                              const name = u.full_name ?? u.username ?? "Chef"
                              const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                              return (
                                <Link
                                  key={u.id}
                                  href={`/user/${u.username ?? u.id}`}
                                  onClick={clearSearch}
                                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors"
                                >
                                  {u.avatar_url ? (
                                    <Image src={u.avatar_url} alt={name} width={32} height={32} className="rounded-full object-cover" />
                                  ) : (
                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-foreground flex-shrink-0">
                                      {initials}
                                    </div>
                                  )}
                                  <div className="leading-tight min-w-0">
                                    <div className="text-sm font-medium text-foreground truncate">{name}</div>
                                    {u.username && <div className="text-xs text-muted-foreground">@{u.username}</div>}
                                  </div>
                                </Link>
                              )
                            })}
                          </div>
                        )}

                        {searchResults.recipes.length > 0 ? (
                          <div className="rounded-xl border overflow-hidden">
                            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
                              Recipes
                            </div>
                            {searchResults.recipes.map((r) => (
                              <Link
                                key={r.id}
                                href={`/recipes/${r.id}`}
                                onClick={clearSearch}
                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors"
                              >
                                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <span className="text-sm text-foreground truncate leading-5" style={{ minHeight: `${searchTitleMinHeight}px` }}>{r.title}</span>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-sm text-muted-foreground text-center rounded-xl border">
                            No results for &quot;{searchQuery}&quot;
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl border overflow-hidden">
                        <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
                          Suggested recipes
                        </div>
                        {suggestedRecipes.map((r) => (
                          <Link
                            key={r.id}
                            href={`/recipes/${r.id}`}
                            onClick={clearSearch}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors"
                          >
                            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm text-foreground truncate leading-5" style={{ minHeight: `${searchTitleMinHeight}px` }}>{r.title}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6">
                  <div className="max-w-4xl mx-auto">
                    <Link
                      href={searchQuery.trim() ? `/recipes?search=${encodeURIComponent(searchQuery.trim())}` : "/recipes"}
                      onClick={clearSearch}
                      className="flex h-10 items-center justify-center rounded-full border text-sm font-medium transition-colors hover:bg-muted"
                    >
                      Browse all recipes
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>

        {isLoggedIn && (
          <div className="space-y-3">
            {loadingFeed ? (
              <div className="flex gap-3 pb-1">
                <div className="h-[5.75rem] w-[4.9rem] shrink-0 rounded-3xl bg-muted animate-pulse" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex gap-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="h-[5.75rem] w-[4.9rem] shrink-0 rounded-3xl bg-muted animate-pulse" />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 pb-1">
                <div className="shrink-0">
                  <div className="flex w-[4.9rem] flex-col items-center gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={openOwnStory}
                        className="rounded-[1.75rem] border border-border/70 bg-background p-1.5 shadow-sm transition-colors hover:bg-muted"
                        aria-label={ownStory ? "Open your story" : "Create a story"}
                      >
                        <div className="relative h-16 w-16 overflow-hidden rounded-full bg-muted">
                          {profile?.avatar_url ? (
                            <Image
                              src={profile.avatar_url}
                              alt={currentProfileName}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-foreground">
                              {currentProfileInitials}
                            </div>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => openPostDishDialog("story")}
                        className="absolute -bottom-1 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm"
                        aria-label="Add story"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="w-full px-1 text-center">
                      <p className="truncate text-xs font-medium text-foreground">You</p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1 overflow-x-auto pb-1 scrollbar-hide">
                  {otherStoryPosts.length > 0 ? (
                    <div className="flex gap-3">
                      {otherStoryPosts.map((story) => {
                        const storyIndex = storyPosts.findIndex((item) => item.id === story.id)
                        const authorName = story.author.full_name ?? "Chef"
                        const initials = authorName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)

                        return (
                          <button
                            key={story.id}
                            type="button"
                            onClick={() => setActiveStoryIndex(storyIndex)}
                            className="group flex w-[4.9rem] shrink-0 flex-col items-center gap-2"
                            aria-label={`Open story from ${authorName}`}
                          >
                            <div className="relative">
                              <div className="rounded-full bg-gradient-to-br from-orange-400 via-amber-500 to-primary p-[2px] shadow-sm">
                                <div className="rounded-full bg-background p-[3px]">
                                  <div className="relative h-16 w-16 overflow-hidden rounded-full bg-muted">
                                    {story.author.avatar_url ? (
                                      <Image
                                        src={story.author.avatar_url}
                                        alt={authorName}
                                        fill
                                        className="object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-foreground">
                                        {initials}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="absolute -bottom-1 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm">
                                <ChefHat className="h-3.5 w-3.5" />
                              </div>
                            </div>
                            <div className="w-full px-1 text-center">
                              <p className="truncate text-xs font-medium text-foreground">{authorName}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="p-4 text-sm text-muted-foreground">
                        No active stories from your circle yet.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Challenge hero (signed-in only) */}
        {isLoggedIn && (
          loadingChallenge ? (
            <Card><CardContent className="p-4 md:p-6 h-32 animate-pulse bg-muted/30" /></Card>
          ) : (activeChallenge || communityChallenges.length > 0) ? (
            <div className="space-y-3">
              {/* Star challenge — prominent */}
              {activeChallenge && (
                <Card className="border-amber-300/60 bg-gradient-to-r from-amber-50/80 to-amber-100/40 dark:from-amber-950/30 dark:to-amber-900/10">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Staff Pick Challenge</p>
                        </div>
                        <h1 className="text-xl md:text-2xl font-serif font-light text-foreground">
                          {activeChallenge.title}
                        </h1>
                        {activeChallenge.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{activeChallenge.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> {timeUntil(activeChallenge.ends_at)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> {activeChallenge.participant_count} joined
                          </span>
                          {challengeRank != null && (
                            <span className="inline-flex items-center gap-1">
                              <Trophy className="h-3.5 w-3.5" /> #{challengeRank} among friends
                            </span>
                          )}
                          <span className="text-amber-700 dark:text-amber-400">🏅 Challenger · 🏆 Winner badge</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      {challengeEntry?.post_id ? (
                        <Button variant="secondary" className="w-full gap-1.5" disabled>
                          <CheckCircle2 className="h-4 w-4" /> Dish Submitted
                        </Button>
                      ) : (
                        <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={openPostDishDialog}>
                          Post Your Dish to Enter
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Community challenges */}
              {communityChallenges.map((c) => {
                const communityEntry = communityEntries[c.id]?.entry ?? null
                const communityVote  = communityEntries[c.id]?.vote ?? null
                const hasSubmitted   = !!communityEntry?.post_id
                return (
                  <Card key={c.id} className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4 md:p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Vote className="h-3.5 w-3.5 text-primary/70" />
                            <p className="text-xs text-muted-foreground">Community Challenge</p>
                          </div>
                          <h2 className="text-base md:text-lg font-medium text-foreground">{c.title}</h2>
                          {c.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" /> {timeUntil(c.ends_at)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" /> {c.participant_count} joined
                            </span>
                            {communityVote
                              ? <span className="text-primary">🗳️ Voted</span>
                              : <span>🏅 Challenger badge</span>
                            }
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        {hasSubmitted ? (
                          <Button variant="secondary" className="w-full gap-1.5" disabled>
                            <CheckCircle2 className="h-4 w-4" /> Dish Submitted
                          </Button>
                        ) : (
                          <Button className="w-full" variant="outline" onClick={openPostDishDialog}>
                            Post Your Dish to Enter
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : null
        )}

        {/* Post Your Dish dialog */}
        {isLoggedIn && (
        <Dialog
          open={postDishOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetPostDishForm()
              setComposerMode("post")
            }
            setPostDishOpen(open)
          }}
        >
          <DialogContent className="w-[96vw] max-w-md max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] p-0 overflow-hidden">
            <DialogHeader className="px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] border-b text-left">
              <DialogTitle className="text-base">
                {composerMode === "story" ? "Add a story" : "Post your dish"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {composerMode === "story"
                  ? "Your newest dish post becomes your story for the next 24 hours."
                  : "Share what you cooked."}
              </p>
            </DialogHeader>
            <div className="p-4 space-y-4 overflow-y-auto overscroll-contain">
              <div className="space-y-2">
                <Label>Photo</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                />
                <button
                  type="button"
                  className="relative w-full aspect-[4/3] rounded-xl border bg-muted overflow-hidden flex items-center justify-center hover:bg-muted/80 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {postImagePreview ? (
                    <Image src={postImagePreview} alt="Preview" fill className="object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="h-8 w-8" />
                      <span className="text-sm">Tap to choose a photo</span>
                    </div>
                  )}
                </button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-title">Dish name</Label>
                <Input
                  id="post-title"
                  value={postDishTitle}
                  onChange={(e) => setPostDishTitle(e.target.value)}
                  placeholder="e.g., Chili crisp noodles"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-caption">Caption</Label>
                <Textarea
                  id="post-caption"
                  value={postDishCaption}
                  onChange={(e) => setPostDishCaption(e.target.value)}
                  placeholder="What's your secret?"
                  rows={3}
                />
              </div>

              {activeChallenge && (
                <div className="rounded-xl border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Challenge</span>
                    <Badge variant="secondary">{activeChallenge.title}</Badge>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={submittingPost}
                  onClick={closePostDishDialog}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={submittingPost || !postImage || !postDishTitle.trim()}
                  onClick={handlePostSubmit}
                >
                  {submittingPost ? "Posting…" : composerMode === "story" ? "Share story" : "Post"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        )}

        <Dialog
          open={activeStory != null}
          onOpenChange={(open) => {
            if (!open) setActiveStoryIndex(null)
          }}
        >
          <DialogContent className="inset-0 left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden border-0 bg-black p-0 sm:inset-1/2 sm:h-auto sm:max-h-[calc(100dvh-1.25rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:w-[calc(100vw-1.25rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg [&>button]:hidden">
            {activeStory ? (
              <div
                className="relative h-[100dvh] w-full bg-muted sm:h-auto sm:aspect-[9/16]"
                onTouchStart={handleStoryTouchStart}
                onTouchEnd={handleStoryTouchEnd}
              >
                <Image
                  src={activeStory.image_url}
                  alt={activeStory.title}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />

                <div className="absolute inset-x-0 top-0 z-10 space-y-3 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white">
                  <div className="flex gap-1">
                    {storyPosts.map((story, index) => (
                      <div
                        key={story.id}
                        className={`h-1 flex-1 rounded-full ${
                          index === activeStoryIndex ? "bg-white" : "bg-white/30"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      {activeStory.author.avatar_url ? (
                        <Image
                          src={activeStory.author.avatar_url}
                          alt={activeStory.author.full_name ?? "Chef"}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full object-cover ring-2 ring-white/70"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-semibold backdrop-blur">
                          {(activeStory.author.full_name ?? "Chef")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {activeStory.author.full_name ?? "Chef"}
                        </p>
                        <p className="text-xs text-white/80">
                          {Math.max(
                            1,
                            Math.floor(
                              (Date.now() - new Date(activeStory.created_at).getTime()) / 3600000
                            )
                          )}
                          h ago
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/10 hover:text-white"
                      onClick={() => setActiveStoryIndex(null)}
                      aria-label="Close story viewer"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  className="absolute inset-y-0 left-0 z-[1] w-1/2"
                  onClick={goToPreviousStory}
                  aria-label="Previous story"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 z-[1] w-1/2"
                  onClick={goToNextStory}
                  aria-label="Next story"
                />

                <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] text-white">
                  <div className="rounded-3xl bg-black/25 p-4 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold">{activeStory.title}</h3>
                    {activeStory.caption ? (
                      <p className="mt-2 text-sm text-white/90">{activeStory.caption}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Flavors of the Week */}
        <div className="space-y-3">
          <SectionHeader
            title="Flavors of the Week"
            right={
              <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/recipes" className="inline-flex items-center gap-1">
                  See all <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          />
          {loadingRecipes ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="min-w-[180px] h-[220px] rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {flavorsOfWeek.map((recipe) => (
                <Link key={recipe.id} href={`/recipes/${recipe.id}`} className="min-w-[200px] max-w-[200px]">
                  <RecipeCardCompact
                    id={recipe.id}
                    title={recipe.title}
                    content={recipe.content}
                    rating_avg={recipe.rating_avg || 0}
                    difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
                    comments={recipe.rating_count || 0}
                    tags={recipe.tags}
                    nutrition={recipe.nutrition}
                    initialIsFavorited={false}
                    skipFavoriteCheck
                    showFavorite={false}
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Leaders + challenge + week summary (signed-in only) */}
        {isLoggedIn && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center justify-between">
                This Week&apos;s Leaders
                <Crown className="h-4 w-4 text-primary" />
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={leaderboardScope === "friends" ? "secondary" : "ghost"}
                  className="rounded-full"
                  onClick={() => handleLeaderboardScope("friends")}
                >
                  Friends
                </Button>
                <Button
                  size="sm"
                  variant={leaderboardScope === "global" ? "secondary" : "ghost"}
                  className="rounded-full"
                  onClick={() => handleLeaderboardScope("global")}
                >
                  Global
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {leaderboard.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  {leaderboardScope === "friends" ? "No friends in this challenge yet." : "No entries yet. Be the first!"}
                </p>
              ) : (
                <ol className="space-y-2">
                  {leaderboard.map((l, i) => (
                    <li
                      key={l.profile_id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${l.is_viewer ? "bg-primary/10" : "bg-muted/30"}`}
                    >
                      <span className="text-sm text-foreground truncate">
                        <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                        {l.is_viewer ? "You" : (l.full_name ?? l.username ?? "Chef")}
                      </span>
                      <span className="text-sm font-medium text-foreground flex-shrink-0 ml-2">
                        {l.total_points} pts
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Keep your week moving
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {weekSummary.loading ? (
                  <>
                    <div className="rounded-xl border p-3 space-y-2">
                      <div className="h-4 w-44 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-full rounded bg-muted/70 animate-pulse" />
                      <div className="h-9 w-full rounded-md bg-muted animate-pulse mt-3" />
                    </div>
                    <div className="rounded-xl border p-3 space-y-2">
                      <div className="h-4 w-48 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-full rounded bg-muted/70 animate-pulse" />
                      <div className="h-9 w-full rounded-md bg-muted animate-pulse mt-3" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border p-3">
                      <p className="text-sm font-medium text-foreground">
                        {weekSummary.dinnersLeft > 0
                          ? `${weekSummary.dinnersLeft} dinner${weekSummary.dinnersLeft === 1 ? "" : "s"} left this week`
                          : "Dinners covered this week"}
                      </p>
                      <p className="hidden sm:block text-xs text-muted-foreground mt-1">
                        {weekSummary.dinnersLeft > 0
                          ? "Add them on your meal planner from today through Sunday."
                          : "Open the planner to tweak meals or jump ahead to next week."}
                      </p>
                      <Button className="mt-2 sm:mt-3 w-full" asChild>
                        <Link href="/meal-planner">
                          {weekSummary.dinnersLeft > 0 ? "Plan dinners" : "Meal planner"}
                        </Link>
                      </Button>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-sm font-medium text-foreground">
                        {weekSummary.expiringSoon > 0
                          ? `${weekSummary.expiringSoon} item${weekSummary.expiringSoon === 1 ? "" : "s"} expiring soon`
                          : "No pantry items expiring soon"}
                      </p>
                      <p className="hidden sm:block text-xs text-muted-foreground mt-1">
                        {weekSummary.expiringSoon > 0
                          ? "Use them soon or update dates on your pantry."
                          : "Track ingredients with dates to see reminders here."}
                      </p>
                      <Button className="mt-2 sm:mt-3 w-full" variant="outline" asChild>
                        <Link href="/pantry">{weekSummary.expiringSoon > 0 ? "Use pantry" : "Open pantry"}</Link>
                      </Button>
                    </div>
                  </>
                )}
              </div>
              {activeChallenge && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {activeChallenge.participant_count} people joined {activeChallenge.title} this week
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {timeUntil(activeChallenge.ends_at)} to submit your entry · +{activeChallenge.points} pts
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        )}

        {/* Recommended for you */}
        <div className="space-y-3">
          <SectionHeader title="Recommended for You" />
          {loadingRecipes ? (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-3 md:gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="mb-3 md:mb-4 break-inside-avoid">
                  <div
                    className={`w-full rounded-2xl bg-muted animate-pulse ${getRecommendationSkeletonAspect(i)}`}
                  />
                </div>
              ))}
            </div>
          ) : recommendedRecipes.length > 0 ? (
            <>
              <RecipeGrid
                recipes={recommendedRecipes}
                onRecipeClick={(id) => { window.location.href = `/recipes/${id}` }}
              />
              <div ref={recommendedSentinelRef} className="h-1" />
              {loadingRecommendedMore ? (
                <div className="mt-4 columns-2 md:columns-3 lg:columns-4 gap-3 md:gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="mb-3 md:mb-4 break-inside-avoid">
                      <div
                        className={`w-full rounded-2xl bg-muted animate-pulse ${getRecommendationSkeletonAspect(i)}`}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No recommendations yet — check back soon.
              </CardContent>
            </Card>
          )}
        </div>

      </div>
    </div>
  )
}
