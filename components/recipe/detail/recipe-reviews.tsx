"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import clsx from "clsx"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Star, UserCheck } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/database/supabase"
import { profileDB } from "@/lib/database/profile-db"
import { useToast } from "@/hooks"
import { RecipeReviewsSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { useTheme } from "@/contexts/theme-context"

interface Review {
  id: string
  rating: number
  comment: string
  created_at: string
  user_id: string
  user_email?: string
  user_name?: string
  user_avatar?: string | null
  user_username?: string | null
}

interface RecipeReviewsProps {
  recipeId: string
  /** Profile UUIDs of people the viewer follows — used to sort + badge friend reviews */
  friendProfileIds?: string[]
}

function ReviewerAvatar({ review }: { review: Review }) {
  const initial = review.user_name?.[0] ?? review.user_email?.[0] ?? "?"
  return review.user_avatar ? (
    <Image
      src={review.user_avatar}
      alt={review.user_name ?? "Chef"}
      width={40}
      height={40}
      className="rounded-full object-cover flex-shrink-0"
    />
  ) : (
    <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">
      <span className="font-semibold text-sm">{initial.toUpperCase()}</span>
    </div>
  )
}

export function RecipeReviews({ recipeId, friendProfileIds = [] }: RecipeReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)
  const [loadingReviews, setLoadingReviews] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()
  const mounted = useRef(true)
  const loadingRef = useRef(false)
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const friendSet = new Set(friendProfileIds)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (recipeId && mounted.current) {
      loadReviews()
    }

    if (user && recipeId && mounted.current) {
      checkIfReviewed()
    }
  }, [recipeId, user])

  const loadReviews = async () => {
    if (loadingRef.current || !mounted.current) return

    loadingRef.current = true
    setLoadingReviews(true)

    try {
      const { data: reviewsData, error: reviewsError } = await supabase
        .from("recipe_reviews")
        .select("*")
        .eq("recipe_id", recipeId)
        .order("created_at", { ascending: false })

      if (reviewsError) throw reviewsError

      if (!mounted.current) return

      if (reviewsData && reviewsData.length > 0) {
        const userIds = [...new Set(reviewsData.map((r) => r.user_id))]

        const profilesData = await profileDB.fetchProfilesBatch(userIds, [
          "id",
          "email",
          "full_name",
          "avatar_url",
          "username",
        ])

        if (profilesData && mounted.current) {
          const profilesMap = new Map(profilesData.map((p: any) => [p.id, p]))

          const enrichedReviews = reviewsData.map((review) => {
            const p: any = profilesMap.get(review.user_id)
            return {
              ...review,
              user_email: p?.email || "Anonymous",
              user_name: p?.full_name || null,
              user_avatar: p?.avatar_url || null,
              user_username: p?.username || null,
            }
          })

          setReviews(enrichedReviews)
        } else {
          setReviews(reviewsData)
        }
      } else {
        setReviews([])
      }
    } catch (error) {
      console.error("Error loading reviews:", error)
      if (mounted.current) setReviews([])
    } finally {
      if (mounted.current) setLoadingReviews(false)
      loadingRef.current = false
    }
  }

  const checkIfReviewed = async () => {
    if (!user || !recipeId || !mounted.current) return

    try {
      const { data, error } = await supabase
        .from("recipe_reviews")
        .select("id")
        .eq("recipe_id", recipeId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (error && error.code !== "PGRST116") {
        console.error("Error checking review:", error)
        return
      }

      if (mounted.current) setHasReviewed(!!data)
    } catch (error) {
      console.error("Error checking if reviewed:", error)
    }
  }

  const submitReview = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to leave a review.",
        variant: "destructive",
      })
      return
    }

    if (rating === 0) {
      toast({
        title: "Rating required",
        description: "Please select a rating before submitting.",
        variant: "destructive",
      })
      return
    }

    if (!mounted.current) return

    setLoading(true)
    try {
      const { error } = await supabase.from("recipe_reviews").insert({
        recipe_id: recipeId,
        user_id: user.id,
        rating,
        comment: comment.trim() || null,
      })

      if (error) throw error

      if (!mounted.current) return

      toast({ title: "Review submitted", description: "Thank you for your review!" })

      setRating(0)
      setComment("")
      setHasReviewed(true)
      await loadReviews()
    } catch (error) {
      console.error("Error submitting review:", error)
      if (mounted.current) {
        toast({
          title: "Error",
          description: "Failed to submit review. Please try again.",
          variant: "destructive",
        })
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  // Sort: friends first, then by date
  const sortedReviews = [...reviews].sort((a, b) => {
    const aFriend = friendSet.has(a.user_id) ? 1 : 0
    const bFriend = friendSet.has(b.user_id) ? 1 : 0
    if (aFriend !== bFriend) return bFriend - aFriend
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const friendReviewCount = sortedReviews.filter((r) => friendSet.has(r.user_id)).length
  const averageRating =
    reviews.length > 0 ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length : 0

  const cardClassName = clsx(
    "shadow-lg border rounded-2xl transition-colors",
    isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0",
  )
  const reviewFormClass = clsx(
    "space-y-4 p-4 rounded-lg border",
    isDark ? "bg-secondary/70 border-border text-foreground" : "bg-orange-50 border-orange-100 text-gray-800",
  )
  const reviewedMessageClass = clsx(
    "p-4 rounded-lg text-center border",
    isDark ? "bg-secondary/70 border-border text-foreground" : "bg-green-50 border-green-200 text-green-900",
  )
  const reviewCardClass = clsx(
    "p-4 rounded-lg border transition-colors",
    isDark ? "bg-card border-border text-foreground" : "bg-white/80 border-white/50 text-gray-800",
  )
  const friendReviewCardClass = clsx(
    "p-4 rounded-lg border-2 transition-colors",
    isDark
      ? "bg-blue-900/20 border-blue-500/30 text-foreground"
      : "bg-blue-50/60 border-blue-200 text-gray-800",
  )
  const emptyStateClass = clsx(
    "text-center py-8 rounded-lg border",
    isDark ? "bg-secondary/70 border-border text-muted-foreground" : "bg-white/80 border-white/50 text-gray-500",
  )

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Reviews & Ratings</span>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <span className="text-2xl font-bold">{averageRating.toFixed(1)}</span>
              <span className="text-sm text-gray-500">({reviews.length} reviews)</span>
            </div>
          )}
        </CardTitle>
        {friendReviewCount > 0 && (
          <p className={clsx("text-sm flex items-center gap-1.5 mt-1", isDark ? "text-blue-400" : "text-blue-600")}>
            <UserCheck className="h-4 w-4" />
            {friendReviewCount === 1
              ? "1 person you follow reviewed this"
              : `${friendReviewCount} people you follow reviewed this`}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {user && !hasReviewed && (
          <div className={reviewFormClass}>
            <div>
              <label className="text-sm font-medium mb-2 block">Your Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-8 w-8 ${
                        star <= (hoverRating || rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Your Review (optional)</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience with this recipe..."
                className="min-h-[100px]"
              />
            </div>

            <Button onClick={submitReview} disabled={loading || rating === 0} className="w-full">
              {loading ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        )}

        {hasReviewed && user && (
          <div className={reviewedMessageClass}>
            Thank you for your review! You've already reviewed this recipe.
          </div>
        )}

        <div className="space-y-4">
          {loadingReviews ? (
            <RecipeReviewsSkeleton />
          ) : sortedReviews.length === 0 ? (
            <div className={emptyStateClass}>
              <Star className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No reviews yet. Be the first to review this recipe!</p>
            </div>
          ) : (
            sortedReviews.map((review) => {
              const isFriend = friendSet.has(review.user_id)
              return (
                <div key={review.id} className={isFriend ? friendReviewCardClass : reviewCardClass}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ReviewerAvatar review={review} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium leading-none">
                            {review.user_name || review.user_email || "Anonymous"}
                          </p>
                          {isFriend && (
                            <span
                              className={clsx(
                                "inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                isDark
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-blue-100 text-blue-600",
                              )}
                            >
                              <UserCheck className="h-2.5 w-2.5" />
                              Following
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 mt-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3.5 w-3.5 ${
                                star <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {review.comment && (
                    <p className={clsx("mt-2 text-sm leading-relaxed", isDark ? "text-muted-foreground" : "text-gray-700")}>
                      {review.comment}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}
