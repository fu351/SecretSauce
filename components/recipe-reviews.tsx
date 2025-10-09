"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

interface Review {
  id: string
  user_id: string
  recipe_id: string
  rating: number
  comment: string
  created_at: string
  user_email?: string
}

interface RecipeReviewsProps {
  recipeId: string
}

export function RecipeReviews({ recipeId }: RecipeReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [newRating, setNewRating] = useState(0)
  const [newComment, setNewComment] = useState("")
  const [hoveredRating, setHoveredRating] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    loadReviews()
  }, [recipeId])

  const loadReviews = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("recipe_reviews")
        .select("*")
        .eq("recipe_id", recipeId)
        .order("created_at", { ascending: false })

      if (error) throw error

      setReviews(data || [])
    } catch (error) {
      console.error("Error loading reviews:", error)
    } finally {
      setLoading(false)
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

    if (newRating === 0) {
      toast({
        title: "Rating required",
        description: "Please select a rating.",
        variant: "destructive",
      })
      return
    }

    try {
      setSubmitting(true)

      const { error } = await supabase.from("recipe_reviews").insert({
        recipe_id: recipeId,
        user_id: user.id,
        rating: newRating,
        comment: newComment,
      })

      if (error) throw error

      // Update recipe rating
      const { data: allReviews } = await supabase.from("recipe_reviews").select("rating").eq("recipe_id", recipeId)

      if (allReviews) {
        const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
        await supabase
          .from("recipes")
          .update({
            rating_avg: avgRating,
            rating_count: allReviews.length,
          })
          .eq("id", recipeId)
      }

      toast({
        title: "Review submitted",
        description: "Thank you for your review!",
      })

      setNewRating(0)
      setNewComment("")
      loadReviews()
    } catch (error) {
      console.error("Error submitting review:", error)
      toast({
        title: "Error",
        description: "Failed to submit review. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const averageRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0

  return (
    <div className="space-y-6">
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="text-2xl">Reviews & Ratings</span>
            <div className="flex items-center gap-2">
              <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
              <span className="text-2xl font-bold">{averageRating.toFixed(1)}</span>
              <span className="text-gray-500">({reviews.length} reviews)</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {user && (
            <div className="space-y-4 p-6 bg-orange-50 rounded-lg">
              <h3 className="font-semibold text-lg">Leave a Review</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Your Rating:</span>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setNewRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= (hoveredRating || newRating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Share your experience with this recipe..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="min-h-[100px]"
              />
              <Button onClick={submitReview} disabled={submitting} className="bg-orange-500 hover:bg-orange-600">
                {submitting ? "Submitting..." : "Submit Review"}
              </Button>
            </div>
          )}

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No reviews yet. Be the first to review this recipe!</p>
              </div>
            ) : (
              reviews.map((review) => (
                <div key={review.id} className="flex gap-4 p-4 bg-white rounded-lg shadow-sm">
                  <Avatar>
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${review.user_id}`} />
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{review.user_email || "Anonymous"}</span>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${
                                i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">{new Date(review.created_at).toLocaleDateString()}</span>
                    </div>
                    {review.comment && <p className="text-gray-700">{review.comment}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
