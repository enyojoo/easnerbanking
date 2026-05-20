import { describe, expect, it, vi } from "vitest"

const sharedMock = vi.hoisted(() => {
  const formatDisplayPersonName = (name: unknown) => {
    const raw = String(name ?? "").trim()
    if (!raw) return ""
    return raw
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
  }
  const parseSentFromNarrationLabel = (text: string | null | undefined) => {
    const raw = String(text ?? "").trim()
    if (!raw) return null
    const parts = raw.split(/\bsent\s+from\s+/i)
    if (parts.length < 2) return null
    const origin = parts[parts.length - 1]!.trim()
    if (!origin) return null
    const label = formatDisplayPersonName(origin)
    return label ? `Sent from ${label}` : null
  }
  const deriveBankDepositInboundDisplayLabel = (input: {
    fiatDepositSenderName?: string | null
    metadata?: Record<string, unknown> | null
  }) => {
    const meta = input.metadata || {}
    const depositSender =
      input.fiatDepositSenderName ?? meta.noah_fiat_deposit_sender_name
    if (depositSender != null && String(depositSender).trim()) {
      return formatDisplayPersonName(String(depositSender))
    }
    return undefined
  }
  const deriveBankDepositNarrationLabel = (input: {
    paymentReference?: string | null
    metadata?: Record<string, unknown> | null
  }) => {
    const meta = input.metadata || {}
    if (typeof meta.deposit_narration === "string" && meta.deposit_narration.trim()) {
      return meta.deposit_narration.trim()
    }
    const ref = input.paymentReference ?? meta.reference
    if (ref == null) return undefined
    return parseSentFromNarrationLabel(String(ref)) ?? undefined
  }
  return {
    formatDisplayPersonName,
    parseSentFromNarrationLabel,
    deriveBankDepositInboundDisplayLabel,
    deriveBankDepositNarrationLabel,
    deriveBankDepositPaymentRail: () => "ach",
    deriveBankDepositSchemeLabel: () => "ACH",
  }
})

vi.mock("@easner/shared", () => sharedMock)

import {
  buildNoahBankPayInLedgerMetadata,
  deriveNoahBankPayInRemitterName,
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampFiatPayIn,
  isNoahBankOnrampOrchestrationOutLeg,
} from "./bank-onramp-tx"

const ACH_REF =
  "ACH Credit 026073154040278 Samuel Odiba Sent from Sent from Grey"

const FIAT_PAY_IN = {
  ID: "3141c65e-1832-5952-9383-a044a1b3cae9",
  Amount: "9.946",
  Status: "Settled",
  Network: "OffNetwork",
  Direction: "In",
  CryptoCurrency: "USDC",
  Breakdown: [
    { Type: "ChannelFee", Amount: "2.054" },
    { Type: "Remaining", Amount: "9.946" },
  ],
  FiatPayment: {
    Amount: "12",
    FeeAmount: "2.06",
    FiatCurrency: "USD",
    PaymentSystemID: "026073154040278",
  },
  FiatPaymentMethod: {
    AccountHolderDetails: {
      Name: { FirstName: "JANE", MiddleName: "QUINN", LastName: "PUBLIC" },
    },
  },
  Orchestration: {
    RuleExecutionID: "5a7b2c0b-ffe5-5e67-8ffb-f053632fd7f1",
  },
} as Record<string, unknown>

describe("bank-onramp-tx", () => {
  it("uses FiatDeposit sender for remitter, not narration", () => {
    expect(
      deriveNoahBankPayInRemitterName(FIAT_PAY_IN, {
        fiatDepositSenderName: "Samuel Odiba",
      }),
    ).toBe("Samuel Odiba")
  })

  it("builds metadata with sender and narration fields", () => {
    const e = extractNoahBankPayInEnrichment(FIAT_PAY_IN)!
    const meta = buildNoahBankPayInLedgerMetadata(FIAT_PAY_IN, e, {
      status: "settled",
      occurredAt: "2026-05-19T22:00:53Z",
      fiatDepositSenderName: "Samuel Odiba",
      paymentReference: ACH_REF,
    })
    expect(meta.sender_name).toBe("Samuel Odiba")
    expect(meta.noah_fiat_deposit_sender_name).toBe("Samuel Odiba")
    expect(meta.deposit_narration).toBe("Sent from Grey")
    expect(meta.reference).toBe(ACH_REF)
  })
})
