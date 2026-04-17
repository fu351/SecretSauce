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
    ["butternut squash soup", "butternut squash", "butternut squash soup", "form_retention(missing_forms=soup)"],
    ["organic jumbo cinnamon rolls", "cinnamon", "cinnamon rolls", "form_retention(missing_forms=rolls)"],
    [
      "buttermilk brined half chicken",
      "buttermilk",
      "buttermilk brined half chicken",
      "protein_tail_retention(missing_forms=chicken)",
    ],
    ["orange peels", "orange", "orange peels", "form_retention(missing_forms=peels)"],
    ["lemon rinds", "lemon", "lemon rinds", "form_retention(missing_forms=rinds)"],
    ["garlic skins", "garlic", "garlic skins", "form_retention(missing_forms=skins)"],
    ["mint leaves", "mint", "mint leaves", "form_retention(missing_forms=leaves)"],
    ["celery stems", "celery", "celery stems", "form_retention(missing_forms=stems)"],
    ["pea pods", "pea", "pea pods", "form_retention(missing_forms=pods)"],
    ["broccoli florets", "broccoli", "broccoli florets", "form_retention(missing_forms=florets)"],
  ])(
    'keeps "%s" distinct from "%s"',
    (sourceSearchTerm, modelCanonical, expectedCanonical, expectedReason) => {
      expect(
        maybeRetainFormSpecificCanonical({
          sourceSearchTerm,
          modelCanonical,
        })
      ).toEqual({
        canonicalName: expectedCanonical,
        reason: expectedReason,
      })
    }
  )
})
