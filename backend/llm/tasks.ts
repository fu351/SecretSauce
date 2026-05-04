export type LlmTask =
  | "recipe.paragraph.parse"
  | "ingredient.standardize"
  | "unit.standardize"
  | "scraper.product.extract"

export interface LlmTaskDefaults {
  envPrefix: string
  defaultModel: string
  timeoutMs: number
  maxTokens: number
  temperature: number
  responseFormat?: { type: "json_object" }
}

export const LLM_TASK_DEFAULTS: Record<LlmTask, LlmTaskDefaults> = {
  "recipe.paragraph.parse": {
    envPrefix: "RECIPE_PARAGRAPH_PARSE",
    defaultModel: "gemma3:4b",
    timeoutMs: 30_000,
    maxTokens: 4_000,
    temperature: 0,
    responseFormat: { type: "json_object" },
  },
  "ingredient.standardize": {
    envPrefix: "INGREDIENT_STANDARDIZE",
    defaultModel: "gemma3:4b",
    timeoutMs: 20_000,
    maxTokens: 4_096,
    temperature: 0,
  },
  "unit.standardize": {
    envPrefix: "UNIT_STANDARDIZE",
    defaultModel: "gemma3:4b",
    timeoutMs: 20_000,
    maxTokens: 1_000,
    temperature: 0,
  },
  "scraper.product.extract": {
    envPrefix: "SCRAPER_PRODUCT_EXTRACT",
    defaultModel: "gemma3:4b",
    timeoutMs: 20_000,
    maxTokens: 2_000,
    temperature: 0.1,
  },
}
