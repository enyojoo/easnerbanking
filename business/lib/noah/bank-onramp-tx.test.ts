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
  const deriveVerificationDepositNarrationLabel = (input: {
    paymentReference?: string | null
    verificationBankName?: string | null
    fiatDepositSenderName?: string | null
    metadata?: Record<string, unknown> | null
  }) => {
    const meta = input.metadata || {}
    if (typeof meta.deposit_narration === "string" && meta.deposit_narration.trim()) {
      return meta.deposit_narration.trim()
    }
    const sentFrom = parseSentFromNarrationLabel(input.paymentReference)
    if (sentFrom) return sentFrom
    const bank =
      String(input.verificationBankName ?? "").trim() ||
      formatVerificationBankDisplayName(input.fiatDepositSenderName) ||
      "Your bank"
    return `Sent from ${bank}`
  }
  const formatVerificationBankDisplayName = (raw: string | null | undefined) => {
    const s = String(raw ?? "")
      .trim()
      .replace(/_XTRANSFR/gi, "")
      .replace(/ACCTVERIFY/gi, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (!s) return "Your bank"
    const known: Record<string, string> = { PNC: "PNC", TD: "TD", CHASE: "Chase" }
    const formatStem = (stem: string) => {
      const t = stem.trim()
      if (!t) return ""
      const upper = t.toUpperCase()
      if (known[upper]) return known[upper]
      if (t === upper && /^[A-Z]{2,6}$/.test(t)) return t
      return formatDisplayPersonName(t)
    }
    const words = s.split(/\s+/)
    if (words.length >= 2 && /^bank$/i.test(words[words.length - 1]!)) {
      const stem = formatStem(words.slice(0, -1).join(" "))
      return stem ? `${stem} Bank` : "Your bank"
    }
    if (!s.includes(" ") && /bank$/i.test(s) && s.length > 4) {
      const stem = formatStem(s.slice(0, -4))
      return stem ? `${stem} Bank` : "Your bank"
    }
    return formatDisplayPersonName(s) || "Your bank"
  }
  return {
    formatDisplayPersonName,
    formatVerificationBankDisplayName,
    parseSentFromNarrationLabel,
    deriveBankDepositInboundDisplayLabel,
    deriveBankDepositNarrationLabel,
    deriveVerificationDepositNarrationLabel,
    deriveBankDepositPaymentRail: () => "ach",
    deriveBankDepositSchemeLabel: () => "ACH",
    buildVerificationDepositMetadataFields: (input: {
      fiatAmount: number
      settledStablecoinAmount?: number | null
    }) => {
      const isVerification =
        input.fiatAmount >= 0 &&
        input.fiatAmount < 1 &&
        (input.settledStablecoinAmount == null || input.settledStablecoinAmount <= 0)
      if (!isVerification) {
        return { deposit_kind: "funding" as const, verification_bank_name: null }
      }
      return { deposit_kind: "verification" as const, verification_bank_name: "Test Bank" }
    },
  }
})

vi.mock("@easner/shared", () => sharedMock)

import {
  buildNoahBankPayInLedgerMetadata,
  buildNoahVerificationFiatDepositLedgerMetadata,
  deriveNoahBankPayInRemitterName,
  extractFiatDepositEnrichment,
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
    expect(meta.deposit_kind).toBe("funding")
  })

  it("tags sub-dollar pay-in without settlement as verification", () => {
    const microTx = {
      ...FIAT_PAY_IN,
      FiatPayment: { Amount: "0.32", FiatCurrency: "USD", FeeAmount: "0" },
      Breakdown: [],
      Amount: "0",
    } as Record<string, unknown>
    const e = extractNoahBankPayInEnrichment(microTx)!
    const meta = buildNoahBankPayInLedgerMetadata(microTx, e, {
      status: "settled",
      fiatDepositSenderName: "Samuel Odiba",
    })
    expect(meta.deposit_kind).toBe("verification")
    expect(meta.verification_bank_name).toBeTruthy()
  })

  it("builds verification metadata from FiatDeposit webhook payload", () => {
    const fiatDeposit = {
      ID: "4e821cbc-7fa6-590a-909a-650306f1d64f",
      Sender: { FullName: "PNCBANK_XTRANSFR" },
      Status: "Settled",
      FiatAmount: "0.2",
      FiatCurrency: "USD",
      Reference: "ACH Credit 063106148847119 PNCBANK_XTRANSFR ACCTVERIFY",
      PaymentMethodType: "BankAch",
      Created: "2026-05-26T08:01:48Z",
    } as Record<string, unknown>
    const e = extractFiatDepositEnrichment(fiatDeposit)!
    const meta = buildNoahVerificationFiatDepositLedgerMetadata(fiatDeposit, e, {
      completedAt: "2026-05-26T08:01:48Z",
    })
    expect(meta.source).toBe("webhook_fiat_deposit")
    expect(meta.deposit_kind).toBe("verification")
    expect(meta.payment_reference).toContain("PNCBANK_XTRANSFR")
    expect(meta.reference).toContain("PNCBANK_XTRANSFR")
    expect(meta.deposit_narration).toBe("Sent from PNC Bank")
    expect(meta.narration).toBe("Sent from PNC Bank")
    expect(meta.settled_amount).toBe(0)
  })
})
