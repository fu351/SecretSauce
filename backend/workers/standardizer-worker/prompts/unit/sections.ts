export const UNIT_ALIASES_CONTEXT_SECTION = `
**UNIT ALIASES AND PATTERNS:**
Common raw unit strings you'll encounter and their standard mappings:

Weight Units:
- "oz", "ounce", "ounces" → oz
- "lb", "lbs", "pound", "pounds" → lb
- "g", "gram", "grams" → gram
- "kg", "kilogram" → kg (note: not in core supported units, use gram conversion)
- "mg", "milligram" → mg (note: not in core supported units)

Volume Units:
- "fl oz", "fl. oz", "floz", "fluid ounce", "fluid ounces", "fo", "foz" → fl oz
- "ml", "milliliter", "milliliters" → ml
- "gal", "gallon", "gallons" → gal
- "l", "liter", "liters" → liter (note: not in core supported units, use ml conversion)
- "qt", "quart", "quarts" → quart (note: not in core supported units)
- "pt", "pint" → pint (note: not in core supported units)
- "cup" → cup (note: not in core supported units)
- "tbsp", "tablespoon" → tablespoon (note: not in core supported units)
- "tsp", "teaspoon" → teaspoon (note: not in core supported units)

Count Units:
- "ct", "count", "cnt" → ct
- "each", "ea", "pc", "piece" → each
- "dz", "dozen" → dozen (note: not in core supported units, use ct with quantity=12)
- "pk", "pack", "package", "pkg" → ct (packages are counted items)
- "bunch" → bunch

Product Name Patterns:
- "12 oz pack" → quantity: 12, unit: oz (ignore "pack")
- "16-fl-oz" → quantity: 16, unit: fl oz (handle hyphens)
- "750ml" → quantity: 750, unit: ml (no space)
- "6 ct" → quantity: 6, unit: ct
- "1 gallon" → quantity: 1, unit: gal
- "ea box" → quantity: 1, unit: each (ignore "box")
- "g pack" → extract grams, ignore "pack"
`

export const UNIT_STANDARDIZATION_RULES_SECTION = `
**UNIT STANDARDIZATION RULES:**

1. **Extract from merged context**: The \`rawProductName\` field contains both the product name and raw unit merged together. Extract unit signals from the full text.

2. **Resolve to allowed units only**: Your \`resolvedUnit\` MUST be one of the allowed unit labels provided in the prompt. Do not invent units.

3. **Quantity extraction**:
   - Look for numeric values followed by or near unit text: "12 oz", "16-fl-oz", "750ml"
   - If quantity is missing but unit is clear, default to 1
   - Quantity must be a positive number (> 0)
   - Handle decimal quantities: "0.5 lb", "1.5 gal"

4. **Multi-unit products**: When products have multiple units (e.g., "12 oz / 6 pk"), prefer the primary unit:
   - "12 oz / 6 pk" → 12 oz (weight is primary for beverages/food)
   - "6 ct 12 oz" → 6 ct (count is primary for multi-packs)
   - Use product name and ingredient context to decide

5. **Package terminology**: Words like "pack", "pkg", "package", "box" typically indicate count:
   - "6 pack" → 6 ct
   - "12 pk" → 12 ct
   - "1 box" → 1 each

6. **Unit embedded in product name**: Extract from anywhere in the text:
   - "Coca-Cola 12oz Can" → 12 oz
   - "Milk 1 Gallon Whole" → 1 gal
   - "Bananas Bunch" → 1 bunch

7. **Use ingredient context**: If \`knownIngredientCanonicalName\` is provided, use it to inform unit selection:
   - "eggs" → likely ct, each, or dozen
   - "milk" → likely fl oz, gal, or ml
   - "chicken breast" → likely lb or oz

8. **Validation**:
   - For source="scraper": resolved unit MUST appear in raw text (rawUnit or rawProductName). Do not guess.
   - For source="recipe": if there is no explicit unit token but quantity + culinary context imply a plausible unit, you may infer the closest allowed unit and lower confidence appropriately.
`

export const UNIT_CONFIDENCE_SECTION = `
**CONFIDENCE SCORING:**

High confidence resolutions (≥0.75) are learned and stored for future deterministic lookups. Score accurately:

- **0.95-1.00**: Exact match
  - Clear explicit quantity + exact unit match from allowed list
  - "16 oz" → 16 oz (confidence: 0.98)
  - "1 gallon" → 1 gal (confidence: 0.97)

- **0.80-0.94**: Strong inference
  - Unit and quantity clearly extractable from product name patterns
  - "Milk 1 Gal Whole" → 1 gal (confidence: 0.88)
  - "12-fl-oz Can" → 12 fl oz (confidence: 0.85)

- **0.60-0.79**: Plausible but ambiguous
  - Multiple possible interpretations, chose most likely
  - "6 pk 12 oz" → could be 6 ct or 12 oz (confidence: 0.70)
  - Missing quantity but unit is clear → 1 oz (confidence: 0.68)

- **0.00-0.59**: Weak/uncertain
  - Very ambiguous or incomplete information
  - Should likely error instead of low-confidence guess

**Confidence thresholds:**
- ≥0.75: Resolution is learned and used for future deterministic matching
- <0.75: Not learned, may be queued for human review
`

export const EXAMPLES_SECTION = `
**EXAMPLES:**

✓ Clear cases:
- Input: rawProductName="Bananas 1 lb", rawUnit="lb"
  Output: { unit: "lb", quantity: 1, confidence: 0.97 }

- Input: rawProductName="Coca-Cola 12 fl oz Can", rawUnit="fl oz"
  Output: { unit: "fl oz", quantity: 12, confidence: 0.95 }

- Input: rawProductName="Eggs Large 12 ct", rawUnit="ct"
  Output: { unit: "ct", quantity: 12, confidence: 0.96 }

✓ Embedded units:
- Input: rawProductName="Milk 1 Gallon Whole", rawUnit=""
  Output: { unit: "gal", quantity: 1, confidence: 0.90 }

- Input: rawProductName="Chicken Breast 2.5lb Pack", rawUnit=""
  Output: { unit: "lb", quantity: 2.5, confidence: 0.88 }

✓ Normalized aliases:
- Input: rawProductName="Cheese 8 ounces", rawUnit="ounces"
  Output: { unit: "oz", quantity: 8, confidence: 0.94 }

- Input: rawProductName="Water 750ml Bottle", rawUnit="ml"
  Output: { unit: "ml", quantity: 750, confidence: 0.95 }

✓ Count patterns:
- Input: rawProductName="Apples 6 pack", rawUnit="pack"
  Output: { unit: "ct", quantity: 6, confidence: 0.85 }

- Input: rawProductName="Bell Pepper Each", rawUnit="each"
  Output: { unit: "each", quantity: 1, confidence: 0.92 }

✗ Invalid cases (return error):
- Input: rawProductName="Organic Spinach", rawUnit=""
  Output: { status: "error", error: "No unit found in raw text" }

- Input: rawProductName="Mystery Product XYZ", rawUnit="unknown"
  Output: { status: "error", error: "Unit 'unknown' not in allowed list" }

~ Recipe-only inference case (allowed with lower confidence):
- Input: rawProductName="1 glug extra virgin olive oil", rawUnit="", source="recipe"
  Output: { unit: "fl oz", quantity: 1, confidence: 0.76 }
`

export const EDGE_CASES_SECTION = `
**EDGE CASES:**

1. **Multi-pack confusion**:
   - "6 pk 12 oz" → Primary unit depends on product type:
     - For beverages/individual items: 12 oz (per item size)
     - For counted packs: 6 ct (number of items)
   - Use ingredient context to decide

2. **Missing quantity**:
   - "lb" with no number → default to 1 lb (confidence: 0.68)
   - "each" with no number → default to 1 each (confidence: 0.75)

3. **Attached units**:
   - "12oz" (no space) → 12 oz
   - "16-fl-oz" (hyphens) → 16 fl oz
   - "750ml" → 750 ml

4. **Abbreviated units**:
   - "fo", "foz" → fl oz (fluid ounce abbreviation)
   - "cnt" → ct (count abbreviation)

5. **Compound descriptors**:
   - "oz pack" → oz (ignore "pack")
   - "g pack" → gram (ignore "pack")
   - "ea box" → each (ignore "box")

6. **Conversion needed** (not in core supported units):
   - "kg" → error or convert to gram if allowed
   - "liter" → error or convert to ml if allowed
   - "dozen" → 12 ct (convert count)

7. **Ambiguous weight vs volume**:
   - "oz" alone could be weight or fluid
   - Use ingredient context:
     - Liquids → fl oz (milk, juice, water)
     - Solids → oz (cheese, meat, produce)

8. **Recipe vs scraper context**:
   - Recipe ingredients may use cooking units (cup, tbsp, tsp)
   - Scraper products use packaging units (oz, lb, ct, gal)
   - Adjust expectations based on source field
`

export const UNIT_OUTPUT_SECTION = `
**OUTPUT FORMAT:**
Return a JSON array with one entry per input, matching by \`id\`. Always return all inputs.

Successful resolution:
[
  {
    "id": "queue-row-id",
    "resolvedUnit": "oz",
    "resolvedQuantity": 16,
    "confidence": 0.93,
    "status": "success"
  }
]

Error case:
{
  "id": "queue-row-id",
  "resolvedUnit": null,
  "resolvedQuantity": null,
  "confidence": 0.0,
  "status": "error",
  "error": "No unit found in raw text"
}

**Required fields:**
- \`id\`: Must match input row id exactly
- \`resolvedUnit\`: One of allowed units (or null if error)
- \`resolvedQuantity\`: Positive number (or null if error)
- \`confidence\`: Float between 0.0 and 1.0
- \`status\`: "success" or "error"
- \`error\`: String explaining failure (only if status="error")

**Critical rules:**
- Return ONLY valid JSON (no markdown, no explanations)
- Match input order and count
- Confidence ≥0.75 will be learned for future use
`
