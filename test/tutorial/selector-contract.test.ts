/**
 * Selector Contract Tests
 *
 * Statically verifies that every data-tutorial attribute referenced in tutorial
 * content definitions actually exists somewhere in the app or components source.
 * No rendering — pure source file analysis.
 *
 * If a test fails here, a tutorial step will silently time out in production.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { globSync } from "glob"
import path from "node:path"

import { tutorialPaths } from "../../contents/tutorial-content"

const ROOT = path.resolve(__dirname, "../..")

// Build a map of attribute value → list of files it appears in
function buildSelectorIndex(): Map<string, string[]> {
  const files = globSync("**/*.{tsx,ts}", {
    cwd: ROOT,
    ignore: [
      "node_modules/**",
      ".next/**",
      "test/**",
      "e2e/**",
      "contents/tutorials/**", // exclude the definition files themselves
    ],
  })

  const index = new Map<string, string[]>()

  for (const relPath of files) {
    const absPath = path.join(ROOT, relPath)
    let src: string
    try {
      src = readFileSync(absPath, "utf-8")
    } catch {
      continue
    }

    if (!src.includes("data-tutorial")) continue

    // Match static: data-tutorial="value" or data-tutorial='value'
    const staticMatches = src.matchAll(/data-tutorial=["']([^"']+)["']/g)
    for (const [, value] of staticMatches) {
      if (!index.has(value)) index.set(value, [])
      index.get(value)!.push(relPath)
    }

    // Match dynamic JSX expressions: data-tutorial={expr}
    // Collect attribute names used in the file by scanning for their string literals
    // near a data-tutorial attribute. Strategy: find all lines with data-tutorial and
    // extract any quoted string on that line.
    for (const line of src.split("\n")) {
      if (!line.includes("data-tutorial")) continue
      const lineMatches = line.matchAll(/["']([a-z][a-z0-9-]+)["']/g)
      for (const [, value] of lineMatches) {
        // Filter to plausible tutorial IDs (lowercase, hyphenated, no spaces)
        if (/^[a-z][a-z0-9-]+$/.test(value)) {
          if (!index.has(value)) index.set(value, [])
          if (!index.get(value)!.includes(relPath)) index.get(value)!.push(relPath)
        }
      }
    }
  }

  return index
}

// Build a map of page route → whether an app directory exists for it
function buildPageIndex(): Set<string> {
  const appDirs = globSync("app/**/page.{tsx,ts}", {
    cwd: ROOT,
    ignore: ["node_modules/**", ".next/**"],
  })

  const routes = new Set<string>()
  for (const f of appDirs) {
    // Convert "app/dashboard/page.tsx" → "/dashboard"
    const parts = f.replace(/\/page\.(tsx|ts)$/, "").replace(/^app/, "")
    routes.add(parts === "" ? "/" : parts)
  }
  return routes
}

// Extract the attribute value from a selector string like "[data-tutorial='foo']"
function extractAttr(selector: string): string | null {
  const m = selector.match(/data-tutorial=["']([^"']+)["']/)
  return m ? m[1] : null
}

const selectorIndex = buildSelectorIndex()
const pageIndex = buildPageIndex()

describe("Tutorial selector contracts", () => {
  for (const [pathId, tutorialPath] of Object.entries(tutorialPaths)) {
    describe(`${pathId} path`, () => {
      for (const step of tutorialPath.steps) {
        describe(`Step ${step.id}: ${step.title}`, () => {
          it(`page "${step.page}" maps to a real app route`, () => {
            expect(
              pageIndex.has(step.page),
              `Step ${step.id} references page "${step.page}" but no app directory was found for it`
            ).toBe(true)
          })

          if (step.highlightSelector) {
            const attr = extractAttr(step.highlightSelector)
            it(`step highlightSelector "[data-tutorial='${attr}']" exists in source`, () => {
              expect(
                attr,
                `Could not parse attribute from selector: ${step.highlightSelector}`
              ).not.toBeNull()
              expect(
                selectorIndex.has(attr!),
                `data-tutorial="${attr}" is not present in any source file (used in step ${step.id} of ${pathId})`
              ).toBe(true)
            })
          }

          for (const substep of step.substeps ?? []) {
            if (!substep.highlightSelector) continue
            const attr = extractAttr(substep.highlightSelector)
            it(`substep ${substep.id} "[data-tutorial='${attr}']" exists in source`, () => {
              expect(
                attr,
                `Could not parse attribute from selector: ${substep.highlightSelector}`
              ).not.toBeNull()
              expect(
                selectorIndex.has(attr!),
                `data-tutorial="${attr}" is not present in any source file (used in substep ${substep.id} of step ${step.id}, path ${pathId})`
              ).toBe(true)
            })
          }
        })
      }
    })
  }
})
