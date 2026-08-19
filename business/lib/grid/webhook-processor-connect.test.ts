import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("server-only", () => ({}))

const stripeSettlement = vi.hoisted(() => vi.fn())
const vaInbound = vi.hoisted(() => vi.fn())

vi.mock("./stripe-settlement-webhook", () => ({
  handleGridStripeSettlementWebhook: (...args: unknown[]) => stripeSettlement(...args),
}))

vi.mock("./grid-va-inbound-webhook", () => ({
  handleGridVaInboundDepositWebhook: (...args: unknown[]) => vaInbound(...args),
}))

const startSweep = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }))
const settleSweep = vi.hoisted(() => vi.fn().mockResolvedValue({ handled: false }))

vi.mock("./va-turnkey-sweep", () => ({
  startGridVaTurnkeySweepFromInbound: (...args: unknown[]) => startSweep(...args),
  settleGridVaTurnkeySweepFromOutgoing: (...args: unknown[]) => settleSweep(...args),
}))

import { applyGridWebhookSideEffects } from "./webhook-processor"

function dummyAdmin() {
  return { from: vi.fn() } as unknown as SupabaseClient
}

const incoming = {
  type: "INCOMING_PAYMENT.COMPLETED",
  data: {
    id: "Transaction:grid-1",
    customerId: "Customer:grid-1",
    status: "COMPLETED",
  },
}

describe("applyGridWebhookSideEffects Connect order", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not run VA inbound after a Connect settlement match", async () => {
    stripeSettlement.mockResolvedValue({ handled: true })
    vaInbound.mockResolvedValue({ handled: true })

    await applyGridWebhookSideEffects(dummyAdmin(), incoming)

    expect(stripeSettlement).toHaveBeenCalled()
    expect(vaInbound).not.toHaveBeenCalled()
    expect(startSweep).toHaveBeenCalled()
  })

  it("falls through to VA inbound when the inbound is not a Connect payout", async () => {
    stripeSettlement.mockResolvedValue({ handled: false })
    vaInbound.mockResolvedValue({ handled: true })

    await applyGridWebhookSideEffects(dummyAdmin(), incoming)

    expect(stripeSettlement).toHaveBeenCalled()
    expect(vaInbound).toHaveBeenCalled()
  })
})
