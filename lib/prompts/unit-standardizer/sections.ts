export const UNIT_STANDARDIZATION_RULES_SECTION = `
**UNIT STANDARDIZATION RULES:**
1. Resolve to one of the allowed unit labels exactly.
2. Resolve quantity as a positive numeric value.
3. If quantity is missing but unit is clear, default quantity to 1.
4. Use product name context to extract package quantity when raw unit text is ambiguous.
5. Do not invent impossible units.
`

export const UNIT_CONFIDENCE_SECTION = `
**CONFIDENCE SCORING:**
- **0.95-1.00**: Clear explicit quantity + exact unit match.
- **0.80-0.94**: Strong inferred match from product naming patterns.
- **0.60-0.79**: Plausible but partially ambiguous.
- **0.00-0.59**: Weak/uncertain extraction, should be treated as low confidence.
`

export const UNIT_OUTPUT_SECTION = `
**OUTPUT FORMAT:**
Return a JSON array only:

[
  {
    "id": "queue-row-id",
    "resolvedUnit": "oz",
    "resolvedQuantity": 16,
    "confidence": 0.93,
    "status": "success"
  }
]

If unresolved or invalid, return:
{
  "id": "queue-row-id",
  "resolvedUnit": null,
  "resolvedQuantity": null,
  "confidence": 0.0,
  "status": "error",
  "error": "short reason"
}
`
