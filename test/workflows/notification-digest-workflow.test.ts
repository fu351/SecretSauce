import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

function readWorkflow(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath)
  return fs.readFileSync(absolutePath, "utf8")
}

describe("workflow contract for weekly notifications", () => {
  it("runs the weekly digest on a Monday schedule and calls the digest pipeline", () => {
    const workflow = readWorkflow(".github/workflows/weekly-notification-digest.yml")

    expect(workflow).toContain("name: Weekly Notification Digest")
    expect(workflow).toContain('cron: "0 15 * * 1"')
    expect(workflow).toContain("notification-digest-pipeline")
    expect(workflow).toContain("RESEND_API_KEY")
    expect(workflow).toContain("NOTIFICATIONS_FROM_EMAIL")
  })
})
