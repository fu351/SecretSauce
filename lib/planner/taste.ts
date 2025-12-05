import { createServerClient } from "@/lib/supabase"

type TasteHistory = {
  likedRecipeIds: string[]
  likedTags: string[]
  avoidTags: string[]
}

export async function getTasteHistory(userId: string): Promise<TasteHistory> {
  const client = createServerClient()

  try {
    const [{ data: favorites }, { data: reviews }] = await Promise.all([
      client.from("recipe_favorites").select("recipe_id").eq("user_id", userId),
      client.from("recipe_reviews").select("recipe_id, rating").eq("user_id", userId),
    ])

    const likedRecipeIds = new Set<string>()
    favorites?.forEach((row: any) => row.recipe_id && likedRecipeIds.add(row.recipe_id))
    reviews?.forEach((row: any) => {
      if (row.rating >= 4 && row.recipe_id) likedRecipeIds.add(row.recipe_id)
    })

    // Infer simple tags from liked recipes (cuisine/dietary tags if present)
    let likedTags: string[] = []
    if (likedRecipeIds.size > 0) {
      const { data: recipes } = await client
        .from("recipes")
        .select("id, dietary_tags, cuisine")
        .in("id", Array.from(likedRecipeIds))
      likedTags = (recipes || [])
        .flatMap((r: any) => [...(r.dietary_tags || []), r.cuisine].filter(Boolean))
        .map((t: any) => String(t).toLowerCase())
    }

    // Avoid tags from poor ratings
    const avoidTags = (reviews || [])
      .filter((row: any) => row.rating && row.rating <= 2)
      .map((row: any) => `recipe:${row.recipe_id}`)

    return {
      likedRecipeIds: Array.from(likedRecipeIds),
      likedTags: Array.from(new Set(likedTags)),
      avoidTags,
    }
  } catch (error) {
    console.error("[planner] Failed to load taste history", error)
    return { likedRecipeIds: [], likedTags: [], avoidTags: [] }
  }
}
