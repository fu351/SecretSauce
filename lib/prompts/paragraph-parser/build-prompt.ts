import { STRICT_JSON_RESPONSE_RULE } from "../shared/json-output"
import {
  OUTPUT_SCHEMA_SECTION,
  INSTRUCTIONS_RULES_SECTION,
  INGREDIENTS_RULES_SECTION,
  EDGE_CASES_SECTION,
} from "./sections"

export interface ParagraphParserPromptInput {
  text: string
}

export function buildParagraphParserPrompt({ text }: ParagraphParserPromptInput): string {
  return `
You are a recipe parsing engine for a cooking application.
Prompt version: paragraph-parser-v1.

${STRICT_JSON_RESPONSE_RULE}

${OUTPUT_SCHEMA_SECTION}

${INSTRUCTIONS_RULES_SECTION}

${INGREDIENTS_RULES_SECTION}

${EDGE_CASES_SECTION}

===============================================================
RECIPE TEXT TO PARSE:
===============================================================
---
${text}
---
`
}
