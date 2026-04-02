import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

function readWorkflow(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), relativePath)
  return fs.readFileSync(absolutePath, "utf8")
}

describe("workflow contracts for embedding infrastructure", () => {
  it("keeps nightly embedding queue batched with one resolver cycle per batch", () => {
    const workflow = readWorkflow(".github/workflows/nightly-embedding-queue.yml")

    expect(workflow).toContain("name: Nightly Embedding Queue")
    expect(workflow).toContain("EMBEDDING_QUEUE_MAX_CYCLES=\"1\" npm --prefix backend/scripts run embedding-queue-pipeline")
    expect(workflow).toContain("embedding_source_type:")
    expect(workflow).toContain("- ingredient")
    expect(workflow).toContain("- recipe")
    expect(workflow).toContain("- any")
  })

  it("keeps monthly cleanup workflow dry-run safe by default", () => {
    const workflow = readWorkflow(".github/workflows/monthly-embedding-queue-cleanup.yml")

    expect(workflow).toContain("name: Monthly Embedding Queue Cleanup")
    expect(workflow).toContain("default: dry-run")
    expect(workflow).toContain("const isDryRun = (process.env.DRY_RUN || 'execute') !== 'execute'")
    expect(workflow).toContain("DRY RUN complete")
  })

  it("keeps confidence audit workflow read-only and optionally fail-gated", () => {
    const workflow = readWorkflow(".github/workflows/product-mapping-confidence-audit.yml")

    expect(workflow).toContain("name: Product Mapping Confidence Audit")
    expect(workflow).toContain("absolute_threshold:")
    expect(workflow).toContain("default: '0.995'")
    expect(workflow).toContain("High-Confidence Critical Analysis")
    expect(workflow).toContain("ingredient_match_queue drill-down")
    expect(workflow).toContain("fail_on_critical:")
    expect(workflow).toContain("default: false")
    expect(workflow).toContain("if: ${{ env.FAIL_ON_CRITICAL == 'true' && env.CRITICAL_COUNT != '0' }}")
  })
})
