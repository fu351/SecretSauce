import { describe, expect, it } from "vitest"

import { maybeRetainFormSpecificCanonical } from "../processor"

describe("maybeRetainFormSpecificCanonical", () => {
  it('keeps "tomato seeds" distinct from "tomato"', () => {
    expect(
      maybeRetainFormSpecificCanonical({
        sourceSearchTerm: "tomato seeds",
        modelCanonical: "tomato",
      })
    ).toEqual({
      canonicalName: "tomato seeds",
      reason: "form_retention(missing_forms=seeds)",
    })
  })

  it.each([
    ["orange peels", "orange", "peels"],
    ["lemon rinds", "lemon", "rinds"],
    ["garlic skins", "garlic", "skins"],
    ["mint leaves", "mint", "leaves"],
    ["celery stems", "celery", "stems"],
    ["pea pods", "pea", "pods"],
    ["broccoli florets", "broccoli", "florets"],
  ])('keeps "%s" distinct from "%s"', (sourceSearchTerm, modelCanonical, missingForm) => {
    expect(
      maybeRetainFormSpecificCanonical({
        sourceSearchTerm,
        modelCanonical,
      })
    ).toEqual({
      canonicalName: sourceSearchTerm,
      reason: `form_retention(missing_forms=${missingForm})`,
    })
  })
})
