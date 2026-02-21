export const PREPROCESSING_HINTS_SECTION = `
**PRE-PROCESSING HINTS:**
The recipe text has been pre-labeled with hints to help you parse it. Lines may be prefixed with:
- \`[INGREDIENT]\` — this line is almost certainly an ingredient entry; extract it into the ingredients array
- \`[STEP]\` — this line is almost certainly a cooking instruction; extract it into the instructions array
- \`[SECTION: <name>]\` — a section header (e.g. "Ingredients:", "Instructions:"); use it for context only, do not include it as a step or ingredient
- No prefix — classify the line yourself based on context

Treat these labels as strong hints, not absolute truth. If a \`[STEP]\` line is clearly just an ingredient (e.g. "Step 1: 2 cups flour"), extract it as an ingredient instead.
`

export const OUTPUT_SCHEMA_SECTION = `
**OUTPUT SCHEMA:**
Return ONLY a single valid JSON object with exactly two keys:

{
  "instructions": [
    { "step": 1, "description": "Full sentence describing this cooking step." },
    { "step": 2, "description": "..." }
  ],
  "ingredients": [
    { "name": "all-purpose flour", "quantity": 2, "unit": "cups" },
    { "name": "salt", "quantity": null, "unit": null }
  ]
}
`

export const INSTRUCTIONS_RULES_SECTION = `
**INSTRUCTIONS RULES:**
- Number steps sequentially starting from 1
- Each step must be a single, complete cooking action — not a fragment
- Preserve the original language as closely as possible; do not paraphrase or summarize
- If the input is already a numbered or bulleted list, re-emit each item as a step preserving its content
- If the input is continuous prose, split into logical steps at natural action boundaries (e.g. sentences that start with a verb)
- Do NOT create steps for ingredient listing — only cooking actions count as steps
- Merge trivially short fragments (fewer than 10 characters) into adjacent steps
- Maximum 30 steps; group closely related micro-steps if the recipe is very long
- If the input contains NO cooking actions (pure ingredient list), return instructions: []
`

export const INGREDIENTS_RULES_SECTION = `
**INGREDIENTS RULES:**
- Extract ALL ingredients mentioned anywhere in the text — both ingredient lists and embedded in instruction prose
- Deduplicate: if the same ingredient appears multiple times, include it once using the first-mentioned quantity
- name: lowercase, singular form ("tomato" not "tomatoes", "egg" not "eggs")
- name: strip preparation methods (no "chopped", "diced", "minced", "grated", "sliced")
- name: strip size qualifiers (no "large", "small", "medium")
- name: preserve important varieties ("chicken breast", "all-purpose flour", "olive oil", "cheddar cheese")
- quantity: number (use decimals for fractions) or null if no quantity is stated
- unit: string (e.g. "cups", "tablespoons", "teaspoons", "oz", "lbs", "cloves", "slices") or null if no unit
- "to taste" or "as needed" items: include the ingredient with quantity: null and unit: null
- Do NOT invent ingredients that are not mentioned in the input text
- If the text contains NO ingredients, return ingredients: []
`

export const EDGE_CASES_SECTION = `
**EDGE CASES:**
- Fractions: "1/2 cup" → quantity: 0.5, unit: "cups"
- Mixed fractions: "1 1/2 cups" → quantity: 1.5, unit: "cups"
- Range quantities: "2-3 cloves garlic" → quantity: 2 (use the lower bound)
- Compound items: "salt and pepper to taste" → two separate ingredients, both with quantity: null, unit: null
- Compound items with quantity: "2 tablespoons butter and oil" → "butter" with quantity: 2, unit: "tablespoons"; "oil" with quantity: null, unit: null
- Sub-recipes: if a step references a sub-recipe ("see sauce recipe below"), include it as a step as-is
- LLM quantity strings: if you emit quantity as a string like "0.5", it must still be a JSON number: 0.5
- Items that are both in an ingredient list and embedded in instructions: include once, use the quantity from the ingredient list if present
`
