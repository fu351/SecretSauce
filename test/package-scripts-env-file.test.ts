import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("package.json tsx scripts", () => {
  it("use --env-file=.env.local for runtime workers/scripts", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json")
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts: Record<string, string>
    }

    const tsxScripts = Object.entries(packageJson.scripts).filter(([, command]) => /\btsx\b/.test(command))
    expect(tsxScripts.length).toBeGreaterThan(0)

    for (const [, command] of tsxScripts) {
      expect(command).toContain("tsx --env-file=.env.local")
    }
  })
})
