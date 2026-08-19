import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("server-only", () => ({}))

const retrieveGridQuote = vi.hoisted(() => vi.fn())
const executeSweep = vi.hoisted(() => vi.fn())
const enqueueMissing = vi.hoisted(() => vi.fn())
const creditFund = vi.hoisted(() => vi.fn())

vi.mock("./quote-funding", () => ({
  retrieveGridQuote: (...args: unknown[]) => retrieveGridQuote(...args),
}))

vi.mock("./va-turnkey-sweep", () => ({
  GRID_VA_TURNKEY_SWEEP_MODE: "va_turnkey_sweep",
  executeGridVaTurnkeySweep: (...args: unknown[]) => executeSweep(...args),
  enqueueMissingGridVaTurnkeySweeps: (...args: unknown[]) => enqueueMissing(...args),
}))

vi.mock("./fund-balance-credit", () => ({
  creditGridFundBalanceFromWebhook: (...args: unknown[]) => creditFund(...args),
}))

vi.mock("./webhook-processor", () => ({
  handleGridCrossBorderSendWebhook: vi.fn(),
}))

import { processStuckGridFundBalanceTransfers } from "./process-stuck-grid-fund-balance"

function adminWithRows(rows: Array<Record<string, unknown>>) {
  const from = vi.fn(() => {
    const api: Record<string, unknown> = {}
    const chain = () => api
    api.select = vi.fn(chain)
    api.in = vi.fn(chain)
    api.lt = vi.fn(chain)
    api.order = vi.fn(chain)
    api.limit = vi.fn(async () => ({ data: rows }))
    api.update = vi.fn(chain)
    api.eq = vi.fn(chain)
    return api
  })
  return { from } as unknown as SupabaseClient
}

describe("processStuckGridFundBalanceTransfers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enqueueMissing.mockResolvedValue({ enqueued: 1 })
    executeSweep.mockResolvedValue({ ok: true })
    retrieveGridQuote.mockResolvedValue({ status: "PENDING" })
  })

  it("retries va_turnkey_sweep without a quote instead of marking failed", async () => {
    const admin = adminWithRows([
      {
        id: "sweep-1",
        transaction_id: null,
        mode: "va_turnkey_sweep",
        status: "pending",
        grid_quote_id: null,
        grid_transaction_id: null,
        expires_at: null,
      },
    ])

    const result = await processStuckGridFundBalanceTransfers(admin, { olderThanMs: 1 })
    expect(enqueueMissing).toHaveBeenCalled()
    expect(executeSweep).toHaveBeenCalledWith(admin, "sweep-1")
    expect(retrieveGridQuote).not.toHaveBeenCalled()
    expect(result).toMatchObject({ processed: 1, completed: 1, failed: 0, healed: 1 })
  })

  it("still marks fund_balance missing quote as failed", async () => {
    const admin = adminWithRows([
      {
        id: "fb-1",
        transaction_id: "tx-1",
        mode: "fund_balance",
        status: "pending",
        grid_quote_id: null,
        grid_transaction_id: null,
        expires_at: null,
      },
    ])

    const result = await processStuckGridFundBalanceTransfers(admin, { olderThanMs: 1 })
    expect(executeSweep).not.toHaveBeenCalled()
    expect(result).toMatchObject({ processed: 1, failed: 1 })
  })
})
