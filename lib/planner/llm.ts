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

async function callOpenAI(messages: ChatMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY")
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      tools: TOOL_DEFS,
      temperature: 0.4,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${text}`)
  }

  const data = await response.json()
  return data
}

export async function generateWeeklyDinnerPlanLLM(userId: string): Promise<WeeklyDinnerPlan | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Plan a 7-day dinner schedule for userId=${userId}` },
  ]

  for (let step = 0; step < 4; step += 1) {
    const res = await callOpenAI(messages)
    const choice = res.choices?.[0]?.message
    if (!choice) break

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: choice.content || null,
        tool_calls: choice.tool_calls,
      })

      for (const toolCall of choice.tool_calls) {
        const name = toolCall.function?.name
        const args = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {}
        const impl = name ? TOOL_IMPL[name] : null

        if (!impl) continue
        const result = await impl(args)
        messages.push({
          role: "tool",
          name,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result ?? {}),
        })
      }
      continue
    }

    if (choice.content) {
      const plan = parsePlan(choice.content)
      if (plan) return plan
      messages.push({ role: "assistant", content: choice.content })
    }
  }

  return null
}
