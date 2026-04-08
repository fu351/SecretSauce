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
import Image from "next/image"
import {
  Bell,
  ChevronRight,
  Clock,
  Crown,
  Heart,
  MessageCircle,
  Share2,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react"
import { RecipeCardCompact } from "@/components/recipe/cards/recipe-card-compact"
import { RecipeGrid } from "@/components/recipe/recipe-grid"
import { Recipe } from "@/lib/types"
import { useToast } from "@/hooks"

type HomePageRecipe = Recipe

export default function HomeReturningPage() {
  const { user, loading } = useAuth()
  const { theme } = useTheme()
  const { toast } = useToast()
  const [flavorsOfWeek, setFlavorsOfWeek] = useState<HomePageRecipe[]>([])
  const [recommendedRecipes, setRecommendedRecipes] = useState<HomePageRecipe[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(true)
  const [postDishOpen, setPostDishOpen] = useState(false)
  const [postDishTitle, setPostDishTitle] = useState("")
  const [postDishCaption, setPostDishCaption] = useState("")

  const fetchingRecipes = useRef(false)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!loading && isMounted.current && !fetchingRecipes.current) {
      fetchHomeRecipes()
    }
  }, [loading])

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
      if (isMounted.current) {
        setLoadingRecipes(false)
      }
      fetchingRecipes.current = false
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse relative size-[120px]">
          <Image
            src="/logo-warm.png"
            alt="Secret Sauce"
            width={120}
            height={120}
            className="dark:hidden block object-contain"
          />
          <Image
            src="/logo-dark.png"
            alt="Secret Sauce"
            width={120}
            height={120}
            className="hidden dark:block object-contain"
          />
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

  const friendsPosts = [
    {
      id: "post-1",
      name: "Ava",
      tag: "Challenge Winner",
      timeAgo: "3h ago",
      title: "Chili crisp noodles",
      quote: "Used leftovers and it slapped",
      likes: 24,
      comments: 4,
      image: "/placeholder.svg?height=800&width=1200",
    },
    {
      id: "post-2",
      name: "Maya",
      tag: "Pantry Rescue",
      timeAgo: "1d ago",
      title: "One-pan lemon chickpeas",
      quote: "10 minutes, zero stress.",
      likes: 41,
      comments: 7,
      image: "/placeholder.svg?height=800&width=1200",
    },
  ]

  const leaders = [
    { name: "Maya", pts: 420, me: false },
    { name: "Kevin", pts: 390, me: false },
    { name: "You", pts: 355, me: true },
  ]

  const SectionHeader = ({
    title,
    right,
  }: {
    title: string
    right?: React.ReactNode
  }) => (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg md:text-xl font-serif font-light text-foreground">
        {title}
      </h2>
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
        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">This week’s challenge</p>
                <h1 className="text-xl md:text-2xl font-serif font-light text-foreground">
                  Pantry Rescue
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> 2d left
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> 184 joined
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="h-3.5 w-3.5" /> #8 among friends
                  </span>
                </div>
              </div>
              <Badge className="bg-primary/15 text-primary border border-primary/20">
                +100 pts
              </Badge>
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" asChild>
                <Link href="/challenges/join">Join Challenge</Link>
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPostDishOpen(true)}
              >
                Post Your Dish
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={postDishOpen} onOpenChange={setPostDishOpen}>
          <DialogContent className="w-[96vw] max-w-md p-0 overflow-hidden">
            <DialogHeader className="px-4 py-3 border-b text-left">
              <DialogTitle className="text-base">Post your dish</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Share what you cooked this week. (Placeholder UI)
              </p>
            </DialogHeader>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Photo</Label>
                <div className="relative w-full aspect-[4/3] rounded-xl border bg-muted overflow-hidden">
                  <Image
                    src="/placeholder.svg?height=600&width=800&text=Upload+Photo"
                    alt="Upload placeholder"
                    fill
                    className="object-cover opacity-80"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Button variant="secondary" size="sm">
                      Choose image (placeholder)
                    </Button>
                  </div>
                </div>
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
                  placeholder="Lorem ipsum dolor sit amet, consectetur adipiscing elit..."
                />
              </div>

              <div className="rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Challenge</span>
                  <Badge variant="secondary">Pantry Rescue</Badge>
                </div>
              </div>
            </div>

            <div className="border-t bg-background/95 px-4 py-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setPostDishTitle("")
                    setPostDishCaption("")
                  }}
                >
                  Clear
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setPostDishOpen(false)
                    toast({
                      title: "Posted (placeholder)",
                      description: "Your dish post UI submitted successfully.",
                    })
                  }}
                >
                  Post
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

        {/* Made by your circle */}
        <div className="space-y-3">
          <SectionHeader title="Made by Your Circle" />
          <div className="space-y-4">
            {friendsPosts.map((post) => (
              <Card key={post.id} className="overflow-hidden">
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground">
                        {post.name[0]}
                      </div>
                      <div className="leading-tight">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{post.name}</span>
                          <Badge variant="secondary" className="h-5 text-[10px]">
                            {post.tag}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{post.timeAgo}</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon">
                      <Share2 className="h-4 w-4" />
                      <span className="sr-only">Share</span>
                    </Button>
                  </div>
                </CardHeader>
                <div className="relative w-full aspect-[16/10] bg-muted">
                  <Image src={post.image} alt={post.title} fill className="object-cover" />
                </div>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">{post.title}</h3>
                    <p className="text-sm text-muted-foreground">“{post.quote}”</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-4 w-4" /> {post.likes}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-4 w-4" /> {post.comments}
                    </span>
                    <Button variant="ghost" size="sm" className="ml-auto">
                      Save
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1">Cook this</Button>
                    <Button variant="outline" className="flex-1">
                      Add to My Week
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Leaders + signals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center justify-between">
                This Week’s Leaders
                <Crown className="h-4 w-4 text-primary" />
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="rounded-full">
                  Friends
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full">
                  Local
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full">
                  Global
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ol className="space-y-2">
                {leaders.map((l, i) => (
                  <li key={l.name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${l.me ? "bg-primary/10" : "bg-muted/30"}`}>
                    <span className="text-sm text-foreground">
                      <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                      {l.name}
                    </span>
                    <span className="text-sm font-medium text-foreground">{l.pts} pts</span>
                  </li>
                ))}
              </ol>
              <Button variant="ghost" className="mt-3 w-full justify-between">
                See full leaderboard <ChevronRight className="h-4 w-4" />
              </Button>
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
              <Separator />
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  18 people joined Pantry Rescue today
                </p>
                <p className="text-xs text-muted-foreground">
                  Your saved pasta is trending near campus
                </p>
              </div>
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
                    className={`w-full rounded-2xl bg-muted animate-pulse ${
                      i % 8 === 0
                        ? "aspect-[2/3]"
                        : i % 8 === 1
                          ? "aspect-[9/16]"
                          : i % 8 === 2
                            ? "aspect-[3/4]"
                            : i % 8 === 3
                              ? "aspect-[4/5]"
                              : i % 8 === 4
                                ? "aspect-square"
                                : i % 8 === 5
                                  ? "aspect-[5/6]"
                                  : i % 8 === 6
                                    ? "aspect-[7/9]"
                                    : "aspect-[10/13]"
                    }`}
                  />
                </div>
              ))}
            </div>
          ) : recommendedRecipes.length > 0 ? (
            <RecipeGrid
              recipes={recommendedRecipes}
              favorites={new Set<string>()}
              onFavoriteToggle={async () => {}}
              onRecipeClick={(id) => {
                window.location.href = `/recipes/${id}`
              }}
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
