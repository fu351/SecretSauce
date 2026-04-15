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
import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { recipeDB } from "@/lib/database/recipe-db"
import { supabase } from "@/lib/database/supabase"
import Image from "next/image"
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  Heart,
  Repeat2,
  Share2,
  Sparkles,
  Trophy,
  Upload,
  Users,
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

  const fetchingRecipes = useRef(false)
  const isMounted = useRef(true)

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
    void fetchFeed()
    void fetchActiveChallenge()
  }, [loading])

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

  const isDark = theme === "dark"
  const firstName =
    (user as any)?.firstName ||
    (user as any)?.name?.split?.(" ")?.[0] ||
    user?.email?.split("@")[0] ||
    "there"

  const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg md:text-xl font-serif font-light text-foreground">{title}</h2>
      {right}
    </div>
  )

  return (
    <div className="min-h-screen bg-background" data-tutorial="home-overview">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6 md:space-y-10">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground">
              {(firstName?.[0] || "A").toUpperCase()}
            </div>
            <div className="leading-tight">
              <div className="text-[11px] text-muted-foreground">Good evening,</div>
              <div className="text-sm font-medium text-foreground">{firstName}</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className={isDark ? "hover:bg-muted/60" : "hover:bg-muted/60"}>
            <Bell className="h-5 w-5" />
            <span className="sr-only">Notifications</span>
          </Button>
        </div>

        {/* Weekly challenge hero */}
        {loadingChallenge ? (
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
        ) : null}

        {/* Post Your Dish dialog */}
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

        {/* Made by Your Circle — real posts feed */}
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
                  <Card key={post.id} className="overflow-hidden">
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
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted ${
                            post.liked_by_viewer ? "text-red-500" : ""
                          }`}
                        >
                          <Heart
                            className={`h-4 w-4 ${post.liked_by_viewer ? "fill-red-500 text-red-500" : ""}`}
                          />
                          {post.like_count}
                        </button>

                        <button
                          onClick={() => handleRepost(post.id)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted ${
                            post.reposted_by_viewer ? "text-green-500" : ""
                          }`}
                        >
                          <Repeat2
                            className={`h-4 w-4 ${post.reposted_by_viewer ? "text-green-500" : ""}`}
                          />
                          {post.repost_count}
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Leaders + signals */}
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
                <div className="rounded-xl border p-3">
                  <p className="text-sm font-medium text-foreground">2 dinners left to plan</p>
                  <p className="text-xs text-muted-foreground mt-1">Lock in your week in under 60 seconds.</p>
                  <Button className="mt-3 w-full" asChild>
                    <Link href="/meal-planner">Continue Planning</Link>
                  </Button>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-sm font-medium text-foreground">3 pantry items expiring soon</p>
                  <p className="text-xs text-muted-foreground mt-1">Rescue them with a quick recipe.</p>
                  <Button className="mt-3 w-full" variant="outline" asChild>
                    <Link href="/pantry">Check Pantry</Link>
                  </Button>
                </div>
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
