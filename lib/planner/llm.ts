import {
  tool_get_user_profile,
  tool_get_user_pantry,
  tool_list_candidate_stores,
  tool_search_price_aware_recipes,
  tool_estimate_week_basket_cost,
  tool_get_taste_history,
} from "./tools"
import type { WeeklyDinnerPlan } from "./types"

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: any[]
}

const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "tool_get_user_profile",
      description: "Fetch user profile and preferences",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tool_get_user_pantry",
      description: "Fetch user pantry items",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tool_list_candidate_stores",
      description: "List stores to consider for the weekly basket",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tool_search_price_aware_recipes",
      description: "Find recipes with cost estimates per store",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          filters: { type: "object" },
          limit: { type: "integer" },
        },
        required: ["query", "filters", "limit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tool_estimate_week_basket_cost",
      description: "Estimate total basket cost for a set of recipes at one store",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string" },
          storeId: { type: "string" },
          recipeIds: { type: "array", items: { type: "string" } },
          servingsPerRecipe: { type: "integer" },
        },
        required: ["userId", "storeId", "recipeIds", "servingsPerRecipe"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tool_get_taste_history",
      description: "Fetch liked recipes/tags and avoid tags for the user",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string" },
        },
        required: ["userId"],
      },
    },
  },
]

const SYSTEM_PROMPT = `You are an AI meal planner for a 7-day dinner plan.
Constraints:
- Use a single cheapest store for the entire week.
- Prefer reuse of ingredients to reduce waste and cost.
- Maintain protein variety: use at least 2-3 different main proteins and avoid the same protein more than 2 nights in a row.
- IMPORTANT: Respect the user's profile preferences from onboarding:
  * Dietary restrictions (dietaryPreferences): MUST filter out recipes that conflict
  * Cuisine preferences (cuisinePreferences): STRONGLY prefer these cuisines
  * Cooking time preference (cookingTimePreference): if "quick", limit to recipes under 40 minutes total time
  * Budget range (budgetRange): stay within budget constraints
- Consider user taste history: prefer liked tags and avoid disliked recipes from reviews.
- Use provided tools only; do not invent data.
Process:
1) Fetch profile, pantry, taste history, and candidate stores.
2) For each candidate store, call tool_search_price_aware_recipes with combined filters (dietType from profile.dietaryPreferences, maxTimeMinutes based on profile.cookingTimePreference, avoidTags, likedTags, pantryItems) to get cost-per-serving and pantryMatchScore.
3) Pick 7 dinners that:
   - Match user's cuisine preferences (from profile.cuisinePreferences)
   - Span 2-3 proteins for variety (avoid same protein >2 nights in a row)
   - Maximize pantryMatchScore and likedTags alignment
   - Minimize estimated cost while staying in budget
4) Call tool_estimate_week_basket_cost once on the chosen set to validate totalCost. If over budget or poor variety, swap one or two recipes and re-check at most once.
Output JSON with: { "storeId": string, "totalCost": number, "dinners": [{ "dayIndex": number, "recipeId": string }], "explanation": string }.
In the explanation, mention how you used the user's profile preferences (cuisine, cooking time, dietary needs).
Keep totalCost as a number (no currency symbol).`

const parsePlan = (text: string): WeeklyDinnerPlan | null => {
  try {
    const jsonMatch = text.match(/{[\s\S]*}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.storeId || !Array.isArray(parsed.dinners)) return null
    return parsed
  } catch (error) {
    return null
  }
}

const TOOL_IMPL: Record<string, (args: any) => Promise<any>> = {
  tool_get_user_profile,
  tool_get_user_pantry,
  tool_list_candidate_stores,
  tool_search_price_aware_recipes,
  tool_estimate_week_basket_cost,
  tool_get_taste_history,
}

async function callOpenAI(messages: ChatMessage[], useTools: boolean = true) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY")
  }

  const body: any = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages,
    temperature: 0.3, // Lower temperature for faster, more deterministic responses
    max_tokens: 1500, // Limit response size for speed
  }

  if (useTools) {
    body.tools = TOOL_DEFS
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${text}`)
  }

  const data = await response.json()
  return data
}

export async function generateWeeklyDinnerPlanLLM(userId: string): Promise<WeeklyDinnerPlan | null> {
  const startTime = Date.now()

  // PRE-FETCH all data upfront to reduce tool call roundtrips
  console.log("[llm] Pre-fetching user data...")
  const [profile, pantry, stores, tasteHistory] = await Promise.all([
    tool_get_user_profile({ userId }),
    tool_get_user_pantry({ userId }),
    tool_list_candidate_stores({ userId }),
    tool_get_taste_history({ userId }),
  ])

  // Pre-fetch recipes with user preferences
  const recipes = await tool_search_price_aware_recipes({
    query: "",
    filters: {
      dietType: profile?.dietaryPreferences?.[0],
      preferredCuisines: profile?.cuisinePreferences || [],
      maxTimeMinutes: profile?.cookingTimePreference === "quick" ? 40 : undefined,
    },
    limit: 20,
  })

  console.log(`[llm] Pre-fetched data in ${Date.now() - startTime}ms`)

  // Build context with pre-fetched data
  const contextData = {
    profile,
    pantry: pantry?.slice(0, 10), // Limit pantry items
    stores: stores?.slice(0, 3), // Limit stores
    tasteHistory,
    availableRecipes: recipes?.slice(0, 15), // Limit recipes shown
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Plan a 7-day dinner schedule for userId=${userId}.

Here is the pre-fetched data (no need to call tools for this):
${JSON.stringify(contextData, null, 2)}

Based on this data, directly output your 7-day dinner plan as JSON. Pick 7 recipes from availableRecipes that match the user's preferences. Ensure protein variety.`
    },
  ]

  // Single LLM call with all context - no tool calls needed
  const res = await callOpenAI(messages, false) // No tools needed
  const choice = res.choices?.[0]?.message

  if (choice?.content) {
    const plan = parsePlan(choice.content)
    if (plan) {
      console.log(`[llm] Generated plan in ${Date.now() - startTime}ms`)
      return plan
    }
  }

  // Fallback: Allow 1 more iteration with tools if direct approach failed
  console.log("[llm] Direct approach failed, trying with tools...")
  messages.push({ role: "assistant", content: choice?.content || "I need to search for recipes." })

  for (let step = 0; step < 2; step += 1) {
    const res2 = await callOpenAI(messages, true)
    const choice2 = res2.choices?.[0]?.message
    if (!choice2) break

    if (choice2.tool_calls && choice2.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: choice2.content || null,
        tool_calls: choice2.tool_calls,
      })

      // Execute tool calls in parallel for speed
      const toolResults = await Promise.all(
        choice2.tool_calls.map(async (toolCall: any) => {
          const name = toolCall.function?.name
          const args = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {}
          const impl = name ? TOOL_IMPL[name] : null
          if (!impl) return { toolCall, result: {} }
          const result = await impl(args)
          return { toolCall, result }
        })
      )

      for (const { toolCall, result } of toolResults) {
        messages.push({
          role: "tool",
          name: toolCall.function?.name,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result ?? {}),
        })
      }
      continue
    }

    if (choice2.content) {
      const plan = parsePlan(choice2.content)
      if (plan) {
        console.log(`[llm] Generated plan (with tools) in ${Date.now() - startTime}ms`)
        return plan
      }
    }
  }

  console.log(`[llm] Failed to generate plan after ${Date.now() - startTime}ms`)
  return null
}
