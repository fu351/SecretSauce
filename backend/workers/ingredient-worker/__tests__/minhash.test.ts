import { describe, expect, it } from "vitest"

import { charKgrams, computeMinHash } from "../minhash/compute"

describe("computeMinHash", () => {
  it("returns stable signatures for equivalent casing and punctuation", () => {
    expect(computeMinHash("Chickpea Flour!", { bands: 16 })).toEqual(
      computeMinHash("chickpea flour", { bands: 16 })
    )
  })

  it("uses the requested number of bands", () => {
    expect(computeMinHash("olive oil", { bands: 32 })).toHaveLength(32)
  })

  it("extracts unique character k-grams from normalized text", () => {
    expect(charKgrams("aa aa", 2)).toEqual(expect.arrayContaining([" a", "aa", "a "]))
  })
})
