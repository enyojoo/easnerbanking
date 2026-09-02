import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { WalletSendComplianceRail } from "@easner/shared"
import { isWalletSendComplianceCode } from "@easner/shared"
import { ledgerAmountToUsd } from "./ledger-usd"
import { resolveSendAllowance } from "./resolve-send-allowance"

export type OutboundComplianceDeny = {
  ok: false
  code: string
  status: 403
  message: string
}

export class OutboundComplianceError extends Error {
  readonly code: string
  readonly status = 403 as const

  constructor(code: string, message: string) {
    super(message)
    this.name = "OutboundComplianceError"
    this.code = code
  }
}

export function outboundComplianceErrorResponse(deny: OutboundComplianceDeny): NextResponse {
  return NextResponse.json({ error: deny.message, code: deny.code }, { status: deny.status })
}

export function outboundComplianceCatchResponse(err: unknown): NextResponse | null {
  if (err instanceof OutboundComplianceError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 403 })
  }
  return null
}

/** Map executeSendDestination / similar failures to a 403 compliance response. */
export function outboundComplianceSendFailureResponse(result: {
  state?: string
  code?: string | null
  message?: string | null
}): NextResponse | null {
  if (result.state !== "failed") return null
  const code = String(result.code || "").trim()
  const message = String(result.message || "").trim()
  if (!code || !isWalletSendComplianceCode(code) || !message) return null
  return NextResponse.json({ error: message, code }, { status: 403 })
}

export async function assertOutboundComplianceAllows(
  admin: SupabaseClient,
  input: {
    businessId: string | null | undefined
    rail: WalletSendComplianceRail
    amountUsd: number
  },
): Promise<{ ok: true } | OutboundComplianceDeny> {
  const allowance = await resolveSendAllowance(admin, input)
  if (allowance.allowed) return { ok: true }
  return {
    ok: false,
    code: allowance.code && isWalletSendComplianceCode(allowance.code) ? allowance.code : "WALLET_SEND_DAILY_LIMIT",
    status: 403,
    message: allowance.message || "This transfer exceeds your current send limit.",
  }
}

export async function requireOutboundComplianceAllows(
  admin: SupabaseClient,
  input: {
    businessId: string | null | undefined
    rail: WalletSendComplianceRail
    amountUsd: number
  },
): Promise<{ ok: true } | NextResponse> {
  const result = await assertOutboundComplianceAllows(admin, input)
  if (!result.ok) return outboundComplianceErrorResponse(result)
  return result
}

export async function assertOutboundComplianceOrThrow(
  admin: SupabaseClient,
  input: {
    businessId: string | null | undefined
    rail: WalletSendComplianceRail
    amount: number
    currency?: string | null
  },
): Promise<void> {
  const amountUsd = ledgerAmountToUsd(input.amount, input.currency)
  const result = await assertOutboundComplianceAllows(admin, {
    businessId: input.businessId,
    rail: input.rail,
    amountUsd,
  })
  if (!result.ok) throw new OutboundComplianceError(result.code, result.message)
}
