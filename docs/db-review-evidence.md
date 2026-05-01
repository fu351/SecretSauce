# Store-Comparison Investigation: Evidence Bundle

**Database:** `supabase-secretsauce` (bfycdolbspgmkezpeuly)  
**Date:** 2026-05-01  
**Scope:** `product_mappings` ↔ `standardized_ingredients` ↔ `shopping_list_items`

---

## Confidence Distribution (2,472 total mappings)

| Band | Total | Non-ingredient | Ingredient |
|------|-------|----------------|------------|
| < 0.25 (garbage) | 8 | **8** | 0 |
| 0.25–0.40 (very low) | 4 | **4** | 0 |
| 0.40–0.50 (low) | 25 | 0 | 25 |
| 0.50–0.65 (marginal) | 955 | 0 | 955 |
| 0.65–0.80 (good) | 1,084 | 0 | 1,084 |
| ≥ 0.80 (high) | 396 | 0 | 396 |

All 12 sub-0.40 mappings have `is_ingredient = false` correctly set. The 25 mappings in the 0.40–0.50 band are all `is_ingredient = true`, but several are semantically wrong.

---

## Bug Class 1 — Upstream mapping bug: Non-food products in the table (`is_ingredient=false`)

12 mappings. All correctly flagged `is_ingredient=false` by the classifier, but they exist in `product_mappings` because the scraper did not pre-filter non-food SKUs before queuing for standardization.

| product_mapping_id | raw_product_name | store | canonical | confidence |
|--------------------|-----------------|-------|-----------|------------|
| `313f3792` | Daily Facial Sunscreen SPF 40 1.7 Fl Oz | traderjoes | dairy free milk | 0.125 |
| `b847c40b` | Zinc Oxide Mineral Sunscreen Spray SPF 30 6 Oz | traderjoes | mineral water | 0.178 |
| `7877b37e` | Sunscreen Spray SPF 50+ 6 Oz | traderjoes | cooking spray | 0.214 |
| `9b763802` | Leave in Conditioner 6 Fl Oz | traderjoes | curry leaves | 0.214 |
| `376b7fcf` | Ultra Rich Body Wash Oil 16 Fl Oz | traderjoes | rice oil | 0.259 |
| `998d64bb` | Lavender Hand Sanitizer Spray 2 Fl Oz | traderjoes | honey lavender tea | 0.270 |
| `2d732390` | Hair Oil 1 Fl Oz | traderjoes | angel hair | 0.333 |
| `613ca0e9` | Wh Clover Mlm Spoon 11 In | 99ranch | whole cloves | 0.163 |
| `6bc2dfd4` | Wh Clover Mlm Bowl 6 In | 99ranch | meat lovers breakfast bowl | 0.170 |
| `df6150bf` | Wh Clover Mlm Bowl 8 In | 99ranch | meat lovers breakfast bowl | 0.170 |
| `d72e505e` | Golden Throat Lozenge -Honeysuckle | 99ranch | honey green tea | 0.170 |
| `4e74faf2` | 48ct Easter Plastic Eggs Mixed Pastel Colors | target | easter eggs | 0.314 |

**Root cause:** Trader Joe's and 99Ranch serve non-food products (beauty, kitchen utensils, medicine) in the same product feed. The standardizer classifies them correctly (`is_ingredient=false`) but does not delete them — they remain queryable.

**Risk:** If the store-comparison query does not apply `WHERE is_ingredient = true`, all 12 appear in results.

---

## Bug Class 2 — Upstream mapping bug: Wrong canonical assigned (`is_ingredient=true`, low confidence)

Real food products matched to the wrong canonical in `standardized_ingredients`.

| product_mapping_id | raw_product_name | store | canonical | confidence | verdict |
|--------------------|-----------------|-------|-----------|------------|---------|
| `b3f9f346` | Ready Veggies 12 Oz | traderjoes | **egg** | 0.400 | Wrong — veggie product matched to egg canonical |
| `c2930c70` | Fresh Raspberries - 6oz | target | **freeze dried raspberry** | 0.414 | Wrong canonical specificity — should be `raspberry` |
| `e33ea5c2` | Fresh Blueberries - 11.2oz | target | **blueberry pastries** | 0.423 | Wrong category — snack canonical for fresh produce |
| `066aff4f` | Mrs. Meyer's Basil Scented Hand Soap Refill - 33 fl oz | target | **basil** | 0.529 | Non-food product, misclassified as `is_ingredient=true` |

**Root cause:** Embedding nearest-neighbor is pulling semantically adjacent but wrong canonicals. `freeze dried raspberry` and `blueberry pastries` exist as canonicals whose vectors sit closer to the fresh berry product name than the simpler `raspberry`/`blueberry` canonicals. `Ready Veggies` → `egg` is a pure embedding failure. The hand soap case is a classifier miss — `is_ingredient` should be `false` but was set `true`.

---

## Bug Class 3 — Store-ranking bug: Correct canonicals, suspicious confidence floor

25 mappings (all `is_ingredient=true`, confidence exactly `0.400`). Most are semantically correct — lemons→lemon, onions→onion, eggs→egg — but they all share the same floor confidence score. This indicates the scoring formula bottoms out at 0.40 rather than discriminating within this band.

**Effect on store comparison:** The ranking query cannot distinguish "Jumbo Yellow Onions" (correct match for `onion`) from "Ready Veggies" (wrong match for `egg`) — both score 0.400. Top-pick selection is arbitrary at this confidence level.

---

## Bug Class 4 — Store-ranking bug: Correct ingredient, over-broad candidate pool

For shopping item `"10 fresh basil leaves"` → canonical `basil`, the candidate pool contains 15+ mappings including:

| product_mapping_id | raw_product_name | store | confidence |
|--------------------|-----------------|-------|------------|
| `066aff4f` | Mrs. Meyer's **Basil Scented Liquid Hand Soap** Refill 33 fl oz | target | 0.529 |
| `0c494da5` | Italian Whole Peeled Tomatoes **with Basil Leaf** 28 Oz | traderjoes | 0.567 |
| `1d7a19f0` | Badia Minced Garlic Lemon Basil Spice | target | 0.583 |
| `cbf3e045` | Organic Basil - 0.6oz (Good & Gather) | target | **0.714** ✓ |
| `b9cfe438` | Basil Leaves - 0.62oz (Good & Gather) | target | **0.731** ✓ |
| `bd086677` | Basil 1 count | kroger | **1.000** ✓ |

Good products are present and ranked higher. If selection is `MAX(confidence) per store_brand` the right product surfaces. The problem is that the hand soap (0.529) beats several correct dried-basil products — if the cutoff or selection is not strictly max-per-store, a wrong result appears.

---

## Bug Class 5 — Not a reuse bug: Duplicate shopping list entries

The same product_mapping IDs appear twice per shopping item because the shopping list contains two copies of the same recipe's ingredients (e.g. `"10 fresh basil leaves"` as both `415b56f1` and `a6de6165`). This is a shopping list duplication issue upstream, not product_mapping reuse.

---

## Per-mismatch classification summary

| Mismatch | Classification |
|----------|---------------|
| Sunscreen/soap/utensils in product_mappings | **Upstream mapping bug** — scraper doesn't pre-filter non-food SKUs |
| Mrs. Meyer's hand soap classified `is_ingredient=true` | **Upstream mapping bug** — is_ingredient classifier missed a non-food product |
| Ready Veggies → egg | **Upstream mapping bug** — wrong canonical from embedding NN |
| Fresh Raspberries → freeze dried raspberry | **Upstream mapping bug** — wrong canonical specificity in embedding space |
| Fresh Blueberries → blueberry pastries | **Upstream mapping bug** — wrong canonical category in embedding space |
| 0.400 confidence floor across 25 correct+incorrect mappings | **Store-ranking bug** — scoring bottoms out, no discrimination within band |
| Basil hand soap ranking above some real basil products | **Store-ranking bug** — non-food product not filtered before ranking |

---

## Recommended follow-up (code changes, not data)

1. **Filter:** Store-comparison query must enforce `WHERE is_ingredient = true` — verify this guard is applied everywhere.
2. **Threshold:** Drop any candidate with `ingredient_confidence < 0.45` from store-comparison results.
3. **Canonical quality:** Investigate why `freeze dried raspberry`, `blueberry pastries`, and `easter eggs` exist as canonicals that attract fresh produce — these look like incorrectly created probationary canonicals that should have been rejected or merged.
4. **Scraper filter:** Add a pre-queue non-food keyword blocklist (sunscreen, lotion, sanitizer, conditioner, utensil, etc.) so these never enter the standardizer pipeline.
