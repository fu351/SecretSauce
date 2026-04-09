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
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { generalPages } from "../../contents/tutorial-content"

const ROOT = path.resolve(__dirname, "../..")

function collectFiles(
  startDir: string,
  {
    includeFile,
    ignoreDir,
  }: {
    includeFile: (relPath: string) => boolean
    ignoreDir: (relPath: string) => boolean
  }
): string[] {
  const files: string[] = []

  const visit = (relDir: string) => {
    const absDir = path.join(ROOT, relDir)
    const entries = readdirSync(absDir, { withFileTypes: true })

    for (const entry of entries) {
      const relPath = relDir ? path.join(relDir, entry.name) : entry.name

      if (entry.isDirectory()) {
        if (ignoreDir(relPath)) continue
        visit(relPath)
        continue
      }

      if (includeFile(relPath)) {
        files.push(relPath)
      }
    }
  }

  visit(startDir)
  return files
}

// Build a map of attribute value → list of files it appears in
function buildSelectorIndex(): Map<string, string[]> {
  const files = collectFiles("", {
    includeFile: (relPath) =>
      /\.(tsx|ts)$/.test(relPath) &&
      !relPath.startsWith("test/") &&
      !relPath.startsWith("e2e/") &&
      !relPath.startsWith("contents/tutorials/"),
    ignoreDir: (relPath) =>
      relPath === "node_modules" ||
      relPath === ".next" ||
      relPath === "test" ||
      relPath === "e2e" ||
      relPath === "contents/tutorials",
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

    if (!src.includes("data-tutorial") && !src.includes("dataTutorial")) continue

    // Match static: data-tutorial="value" or data-tutorial='value'
    const staticMatches = src.matchAll(/data-tutorial=["']([^"']+)["']/g)
    for (const [, value] of staticMatches) {
      if (!index.has(value)) index.set(value, [])
      index.get(value)!.push(relPath)
    }

    const navMatches = src.matchAll(/data-tutorial-nav=["']([^"']+)["']/g)
    for (const [, value] of navMatches) {
      if (!index.has(value)) index.set(value, [])
      index.get(value)!.push(relPath)
    }

    const camelMatches = src.matchAll(/dataTutorial=["']([^"']+)["']/g)
    for (const [, value] of camelMatches) {
      if (!index.has(value)) index.set(value, [])
      index.get(value)!.push(relPath)
    }

    // Match dynamic JSX expressions: data-tutorial={expr}
    // Collect attribute names used in the file by scanning for their string literals
    // near a data-tutorial attribute. Strategy: find all lines with data-tutorial and
    // extract any quoted string on that line.
    for (const line of src.split("\n")) {
      if (!line.includes("data-tutorial") && !line.includes("dataTutorial")) continue
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
  const appDirs = collectFiles("app", {
    includeFile: (relPath) => /\/page\.(tsx|ts)$/.test(relPath),
    ignoreDir: (relPath) => relPath === "node_modules" || relPath === ".next",
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
  const m = selector.match(/data-tutorial(?:-nav)?=["']([^"']+)["']/)
  return m ? m[1] : null
}

const selectorIndex = buildSelectorIndex()
const pageIndex = buildPageIndex()

describe("Tutorial selector contracts", () => {
  for (const [pageIndexValue, page] of generalPages.entries()) {
    describe(`Page ${pageIndexValue + 1}: ${page.title}`, () => {
      it(`page "${page.page}" maps to a real app route`, () => {
        const routeToCheck = page.page.endsWith("*") ? page.page.slice(0, -2) : page.page

        expect(
          pageIndex.has(routeToCheck),
          `Page "${page.page}" references route "${routeToCheck}" but no app directory was found for it`
        ).toBe(true)
      })

      for (const substep of page.steps ?? []) {
        if (!substep.highlightSelector) continue
        const attr = extractAttr(substep.highlightSelector)
        it(`step ${substep.id} "[data-tutorial='${attr}']" exists in source`, () => {
          expect(
            attr,
            `Could not parse attribute from selector: ${substep.highlightSelector}`
          ).not.toBeNull()
          expect(
            selectorIndex.has(attr!),
            `data-tutorial="${attr}" is not present in any source file (used in step ${substep.id} of page ${page.page})`
          ).toBe(true)
        })
      }
    })
  }
})
