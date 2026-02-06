import { useUser } from "@clerk/nextjs"
import { supabase } from "@/lib/database/supabase"
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
  user_avatar_url?: string | null
}

interface RecipeReviewsProps {
  recipeId: string
}

export function RecipeReviews({ recipeId }: RecipeReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)
  const [loadingReviews, setLoadingReviews] = useState(true)
  const { user } = useUser()
  const { toast } = useToast()
  const mounted = useRef(true)
  const loadingRef = useRef(false)
  const { theme } = useTheme()
  const isDark = theme === "dark"

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
      // First get the reviews
      const { data: reviewsData, error: reviewsError } = await supabase
        .from("recipe_reviews")
        .select("*")
        .eq("recipe_id", recipeId)
        .order("created_at", { ascending: false })

      if (reviewsError) throw reviewsError

      if (!mounted.current) return

      // Then get user profiles for each review
      if (reviewsData && reviewsData.length > 0) {
        const userIds = [...new Set(reviewsData.map((r) => r.user_id))]
        const usersResponse = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds }),
        });

        if (usersResponse.ok && mounted.current) {
            const usersData = await usersResponse.json();
            const usersMap = new Map(usersData.map((u: any) => [u.id, u]));

            const enrichedReviews = reviewsData.map((review) => {
                const reviewUser = usersMap.get(review.user_id);
                return {
                    ...review,
                    user_email: reviewUser?.primaryEmailAddress || "Anonymous",
                    user_name: reviewUser?.fullName || null,
                    user_avatar_url: reviewUser?.imageUrl || null,
                }
            });
            setReviews(enrichedReviews);
        } else {
             setReviews(reviewsData); // fallback to reviews without user data
        }
      } else {
        setReviews([])
      }
    } catch (error) {
      console.error("Error loading reviews:", error)
      if (mounted.current) {
        setReviews([])
      }
    } finally {
      if (mounted.current) {
        setLoadingReviews(false)
      }
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

      if (mounted.current) {
        setHasReviewed(!!data)
      }
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

      toast({
        title: "Review submitted",
        description: "Thank you for your review!",
      })

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
      if (mounted.current) {
        setLoading(false)
      }
    }
  }

  const averageRating = reviews.length > 0 ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length : 0

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
          ) : reviews.length === 0 ? (
            <div className={emptyStateClass}>
              <Star className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No reviews yet. Be the first to review this recipe!</p>
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review.id} className={reviewCardClass}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={clsx(
                        "w-10 h-10 rounded-full flex items-center justify-center overflow-hidden",
                        isDark ? "bg-orange-100 text-orange-800" : "bg-orange-100 text-orange-600",
                      )}
                    >
                      {review.user_avatar_url ? (
                          <img src={review.user_avatar_url} alt={review.user_name || ''} className="w-full h-full object-cover" />
                      ) : (
                          <span className="font-semibold">
                              {review.user_name?.[0] || review.user_email?.[0] || "?"}
                          </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{review.user_name || review.user_email || "Anonymous"}</p>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm text-gray-500">{new Date(review.created_at).toLocaleDateString()}</span>
                </div>
                {review.comment && <p className="text-gray-700 mt-2">{review.comment}</p>}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
