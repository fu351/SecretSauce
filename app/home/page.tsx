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
import { useTheme } from "@/contexts/theme-context"
import { recipeDB } from "@/lib/database/recipe-db"
import { mealPlannerDB } from "@/lib/database/meal-planner-db"
import { pantryItemsDB } from "@/lib/database/pantry-items-db"
import { supabase } from "@/lib/database/supabase"
import { getCurrentWeekIndex, getDatesForWeek } from "@/lib/date-utils"
import Image from "next/image"
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  Heart,
  Repeat2,
  Search,
  Share2,
  Sparkles,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react"
import { RecipeCardCompact } from "@/components/recipe/cards/recipe-card-compact"
import { RecipeGrid } from "@/components/recipe/recipe-grid"
import { Recipe } from "@/lib/types"
import { useToast } from "@/hooks"
import type { PostWithMeta } from "@/lib/database/post-db"
import type { Challenge, ChallengeEntry, LeaderboardEntry } from "@/lib/database/challenge-db"

type HomePageRecipe = Recipe

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

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
  const { user, loading } = useAuth()
  const { theme } = useTheme()
  const { toast } = useToast()
  const router = useRouter()
  const [flavorsOfWeek, setFlavorsOfWeek] = useState<HomePageRecipe[]>([])
  const [recommendedRecipes, setRecommendedRecipes] = useState<HomePageRecipe[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(true)

  // Challenge state
  const [activeChallenge, setActiveChallenge] = useState<(Challenge & { participant_count: number }) | null>(null)
  const [challengeEntry, setChallengeEntry] = useState<ChallengeEntry | null>(null)
  const [challengeRank, setChallengeRank] = useState<number | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardScope, setLeaderboardScope] = useState<"friends" | "global">("friends")
  const [loadingChallenge, setLoadingChallenge] = useState(true)

  // Post creation
  const [postDishOpen, setPostDishOpen] = useState(false)
  const [postDishTitle, setPostDishTitle] = useState("")
  const [postDishCaption, setPostDishCaption] = useState("")
  const [postImage, setPostImage] = useState<File | null>(null)
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null)
  const [submittingPost, setSubmittingPost] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Feed
  const [feedPosts, setFeedPosts] = useState<PostWithMeta[]>([])
  const [loadingFeed, setLoadingFeed] = useState(true)

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
  const isMounted = useRef(true)

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

  const openPostDishDialog = () => setPostDishOpen(true)

  const closePostDishDialog = () => {
    resetPostDishForm()
    setPostDishOpen(false)
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
      const [topRated, newest] = await Promise.all([
        recipeDB.fetchRecipes({ sortBy: "rating_avg", limit: 10 }),
        recipeDB.fetchRecipes({ sortBy: "created_at", limit: 24 }),
      ])
      if (isMounted.current) {
        setFlavorsOfWeek(topRated?.slice(0, 8) ?? [])
        setRecommendedRecipes(newest ?? [])
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
      setActiveChallenge(json.challenge ?? null)
      setChallengeEntry(json.entry ?? null)
      setChallengeRank(json.rank ?? null)
      if (json.challenge) {
        fetchLeaderboard(json.challenge.id, leaderboardScope)
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
    void fetchHomeRecipes()
  }, [loading])

  useEffect(() => {
    if (loading || !isMounted.current) return
    if (!user) {
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
    void fetchFeed()
    void fetchActiveChallenge()
  }, [loading, user])

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

      // Link post to active challenge if one exists
      if (activeChallenge) {
        const newPostId = postJson.post?.id
        if (newPostId) {
          await fetch(`/api/challenges/${activeChallenge.id}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postId: newPostId }),
          }).then((r) => r.json()).then((j) => {
            if (j.entry) setChallengeEntry(j.entry)
          }).catch(() => {})
        }
      }

      toast({ title: "Posted!", description: "Your dish is live." })
      closePostDishDialog()
      fetchFeed()
    } catch (error: any) {
      toast({ title: "Post failed", description: error.message, variant: "destructive" })
    } finally {
      setSubmittingPost(false)
    }
  }

  const handleLike = async (postId: string) => {
    // Optimistic update
    setFeedPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
            ...p,
            liked_by_viewer: !p.liked_by_viewer,
            like_count: p.liked_by_viewer ? p.like_count - 1 : p.like_count + 1,
          }
          : p
      )
    )
    try {
      await fetch(`/api/posts/${postId}/like`, { method: "POST" })
    } catch {
      // revert on failure
      setFeedPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
              ...p,
              liked_by_viewer: !p.liked_by_viewer,
              like_count: p.liked_by_viewer ? p.like_count - 1 : p.like_count + 1,
            }
            : p
        )
      )
    }
  }

  const handleRepost = async (postId: string) => {
    // Optimistic update
    setFeedPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
            ...p,
            reposted_by_viewer: !p.reposted_by_viewer,
            repost_count: p.reposted_by_viewer ? p.repost_count - 1 : p.repost_count + 1,
          }
          : p
      )
    )
    try {
      await fetch(`/api/posts/${postId}/repost`, { method: "POST" })
    } catch {
      setFeedPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
              ...p,
              reposted_by_viewer: !p.reposted_by_viewer,
              repost_count: p.reposted_by_viewer ? p.repost_count - 1 : p.repost_count + 1,
            }
            : p
        )
      )
    }
  }

  const handleLeaderboardScope = (scope: "friends" | "global") => {
    setLeaderboardScope(scope)
    if (activeChallenge) fetchLeaderboard(activeChallenge.id, scope)
  }

  const isDark = theme === "dark"
  const isLoggedIn = Boolean(user)
  const firstName =
    (user as any)?.firstName ||
    (user as any)?.name?.split?.(" ")?.[0] ||
    user?.email?.split("@")[0] ||
    "there"

  const searchPlaceholder = isLoggedIn ? "Search recipes or @username…" : "Search recipes…"
  const suggestedRecipes = useMemo(
    () => (flavorsOfWeek.length > 0 ? flavorsOfWeek : recommendedRecipes).slice(0, 8),
    [flavorsOfWeek, recommendedRecipes]
  )

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
        const { prepare, layout } = await import("@chenglou/pretext")
        const font = "400 14px Inter"
        const maxWidth = 240
        const lineHeight = 20
        const maxHeight = sampleTitles.reduce((currentMax, title) => {
          const prepared = prepare(title, font)
          const { height } = layout(prepared, maxWidth, lineHeight)
          return Math.max(currentMax, height)
        }, 20)

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
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground shrink-0">
                    {(firstName?.[0] || "A").toUpperCase()}
                  </div>
                  <div className="leading-tight min-w-0">
                    <div className="text-[11px] text-muted-foreground">Good evening,</div>
                    <div className="text-sm font-medium text-foreground truncate">{firstName}</div>
                  </div>
                </div>
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
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground">
                  {(firstName?.[0] || "A").toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="text-[11px] text-muted-foreground">Good evening,</div>
                  <div className="text-sm font-medium text-foreground">{firstName}</div>
                </div>
              </div>
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

        {/* Weekly challenge hero (signed-in only) */}
        {isLoggedIn && (
          loadingChallenge ? (
            <Card><CardContent className="p-4 md:p-6 h-32 animate-pulse bg-muted/30" /></Card>
          ) : activeChallenge ? (
            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">This week&apos;s challenge</p>
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
                    </div>
                  </div>
                  <Badge className="bg-primary/15 text-primary border border-primary/20 flex-shrink-0">
                    +{activeChallenge.points} pts
                  </Badge>
                </div>
                <div className="mt-4">
                  {challengeEntry?.post_id ? (
                    <Button variant="secondary" className="w-full gap-1.5" disabled>
                      <CheckCircle2 className="h-4 w-4" /> Dish Submitted
                    </Button>
                  ) : (
                    <Button className="w-full" onClick={openPostDishDialog}>
                      Post Your Dish to Enter
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null
        )}

        {/* Post Your Dish dialog */}
        {isLoggedIn && (
        <Dialog
          open={postDishOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetPostDishForm()
            }
            setPostDishOpen(open)
          }}
        >
          <DialogContent className="w-[96vw] max-w-md p-0 overflow-hidden">
            <DialogHeader className="px-4 py-3 border-b text-left">
              <DialogTitle className="text-base">Post your dish</DialogTitle>
              <p className="text-xs text-muted-foreground">Share what you cooked.</p>
            </DialogHeader>
            <div className="p-4 space-y-4">
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

            <div className="border-t bg-background/95 px-4 py-3">
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
                  {submittingPost ? "Posting…" : "Post"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        )}

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

        {/* Made by Your Circle — signed-in social feed */}
        {isLoggedIn && (
        <div className="space-y-3">
          <SectionHeader
            title="Made by Your Circle"
            right={
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={openPostDishDialog}
              >
                Post Your Dish
              </Button>
            }
          />

          {loadingFeed ? (
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="rounded-2xl bg-muted animate-pulse h-[420px]" />
              ))}
            </div>
          ) : feedPosts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  No posts yet. Follow people or be the first to post a dish!
                </p>
                <Button onClick={openPostDishDialog}>Post Your Dish</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {feedPosts.map((post) => {
                const authorName = post.author.full_name ?? "Chef"
                const initials = authorName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

                return (
                  <Card key={post.id} className="overflow-hidden" data-testid={`feed-post-${post.id}`}>
                    <CardHeader className="p-4 pb-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {post.author.avatar_url ? (
                            <Image
                              src={post.author.avatar_url}
                              alt={authorName}
                              width={36}
                              height={36}
                              className="rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground">
                              {initials}
                            </div>
                          )}
                          <div className="leading-tight">
                            <span className="text-sm font-medium text-foreground">{authorName}</span>
                            <div className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon">
                          <Share2 className="h-4 w-4" />
                          <span className="sr-only">Share</span>
                        </Button>
                      </div>
                    </CardHeader>

                    <div className="relative w-full aspect-[16/10] bg-muted">
                      <Image src={post.image_url} alt={post.title} fill className="object-cover" />
                    </div>

                    <CardContent className="p-4 space-y-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-foreground">{post.title}</h3>
                        {post.caption && (
                          <p className="text-sm text-muted-foreground">&quot;{post.caption}&quot;</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <button
                          onClick={() => handleLike(post.id)}
                          data-testid={`feed-like-button-${post.id}`}
                          aria-label={`Like ${post.title}`}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted ${
                            post.liked_by_viewer ? "text-red-500" : ""
                          }`}
                        >
                          <Heart
                            className={`h-4 w-4 ${post.liked_by_viewer ? "fill-red-500 text-red-500" : ""}`}
                          />
                          <span data-testid={`feed-like-count-${post.id}`}>{post.like_count}</span>
                        </button>

                        <button
                          onClick={() => handleRepost(post.id)}
                          data-testid={`feed-repost-button-${post.id}`}
                          aria-label={`Repost ${post.title}`}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted ${
                            post.reposted_by_viewer ? "text-green-500" : ""
                          }`}
                        >
                          <Repeat2
                            className={`h-4 w-4 ${post.reposted_by_viewer ? "text-green-500" : ""}`}
                          />
                          <span data-testid={`feed-repost-count-${post.id}`}>{post.repost_count}</span>
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
        )}

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
                          ? `${weekSummary.dinnersLeft} dinner${weekSummary.dinnersLeft === 1 ? "" : "s"} left to plan this week`
                          : "Dinners are planned for the rest of this week"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {weekSummary.dinnersLeft > 0
                          ? "Add them on your meal planner from today through Sunday."
                          : "Open the planner to tweak meals or jump ahead to next week."}
                      </p>
                      <Button className="mt-3 w-full" asChild>
                        <Link href="/meal-planner">
                          {weekSummary.dinnersLeft > 0 ? "Continue planning" : "Open meal planner"}
                        </Link>
                      </Button>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-sm font-medium text-foreground">
                        {weekSummary.expiringSoon > 0
                          ? `${weekSummary.expiringSoon} pantry item${weekSummary.expiringSoon === 1 ? "" : "s"} expiring in the next 7 days`
                          : "No pantry items expiring in the next week"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {weekSummary.expiringSoon > 0
                          ? "Use them soon or update dates on your pantry."
                          : "Track ingredients with dates to see reminders here."}
                      </p>
                      <Button className="mt-3 w-full" variant="outline" asChild>
                        <Link href="/pantry">{weekSummary.expiringSoon > 0 ? "Review pantry" : "Open pantry"}</Link>
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
            <RecipeGrid
              recipes={recommendedRecipes}
              favorites={new Set<string>()}
              onFavoriteToggle={async () => {}}
              onRecipeClick={(id) => { window.location.href = `/recipes/${id}` }}
            />
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
