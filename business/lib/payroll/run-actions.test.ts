import { describe, expect, it } from "vitest"
import { getPayrollRunActions } from "./run-actions"
import type { PayrollRun, PayrollRunStatus } from "./types"

function run(
  status: PayrollRunStatus,
  counts: Partial<NonNullable<PayrollRun["lineStatusCounts"]>> = {},
): Pick<PayrollRun, "status" | "lineStatusCounts"> {
  return {
    status,
    lineStatusCounts: {
      pending: 0,
      quoting: 0,
      locked: 0,
      processing: 0,
      paid: 0,
      failed: 0,
      skipped: 0,
      ...counts,
    },
  }
}

describe("getPayrollRunActions", () => {
  it("allows preparers to edit, duplicate, submit, and delete drafts", () => {
    expect(getPayrollRunActions({
      run: run("draft"),
      canPrepare: true,
      canApprove: false,
    })).toEqual(["edit", "duplicate", "submit", "delete"])
  })

  it("does not bypass separate approval for a draft", () => {
    expect(getPayrollRunActions({
      run: run("draft"),
      canPrepare: true,
      canApprove: true,
      canSelfApprove: false,
    })).toEqual(["edit", "duplicate", "submit", "delete"])
  })

  it("returns submitted runs to draft instead of editing them directly", () => {
    expect(getPayrollRunActions({
      run: run("pending_approval"),
      canPrepare: true,
      canApprove: true,
    })).toEqual(["duplicate", "approve", "reject", "return_to_draft"])
  })

  it("allows a wholly failed run to be edited and deleted", () => {
    expect(getPayrollRunActions({
      run: run("failed", { failed: 2 }),
      canPrepare: true,
      canApprove: true,
    })).toEqual(["duplicate", "retry", "edit", "delete"])
  })

  it("protects paid history and offers a correction", () => {
    expect(getPayrollRunActions({
      run: run("partial", { paid: 1, failed: 1 }),
      canPrepare: true,
      canApprove: true,
    })).toEqual(["duplicate", "retry", "create_correction"])
  })

  it("gives viewers no mutation actions", () => {
    expect(getPayrollRunActions({
      run: run("completed", { paid: 2 }),
      canPrepare: false,
      canApprove: false,
    })).toEqual([])
  })

  it.each([
    ["approved", ["duplicate", "execute"]],
    ["scheduled", ["duplicate", "cancel"]],
    ["cancelled", ["duplicate", "return_to_draft"]],
    ["executing", ["duplicate", "view_progress"]],
    ["completed", ["duplicate"]],
  ] as const)("maps %s consistently", (status, expected) => {
    expect(getPayrollRunActions({
      run: run(status),
      canPrepare: true,
      canApprove: true,
    })).toEqual(expected)
  })

  it("lets viewers download retained pay stubs without mutation access", () => {
    expect(getPayrollRunActions({
      run: run("completed", { paid: 2 }),
      canPrepare: false,
      canApprove: false,
      hasPayStubs: true,
    })).toEqual(["download_pay_stubs"])
  })
})
