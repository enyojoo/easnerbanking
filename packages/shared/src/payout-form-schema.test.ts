import { describe, expect, it } from "vitest"
import {
  findPayoutFieldsSchema,
  formatPayoutArrivalHint,
  resolvePayoutProcessingSeconds,
  resolveSendConfirmArrivalHint,
  SEND_ARRIVAL_WITHIN_MINUTES,
  SEND_ARRIVAL_WITHIN_SECONDS,
  getSendAmountNoteFieldUi,
  validatePayoutAmountAgainstLimits,
  validateSendAmountFields,
} from "./payout-form-schema"
import type { PayoutCorridorPublic, PayoutFieldsSchemaHint } from "./payout-corridor"

describe("formatPayoutArrivalHint", () => {
  it("maps Noah manifest tiers to product copy", () => {
    expect(formatPayoutArrivalHint(50)).toBe(SEND_ARRIVAL_WITHIN_MINUTES)
    expect(formatPayoutArrivalHint(60)).toBe(SEND_ARRIVAL_WITHIN_MINUTES)
    expect(formatPayoutArrivalHint(3600)).toBe("Within a few hours")
    expect(formatPayoutArrivalHint(86400)).toBe("1 business day")
  })

  it("returns null for missing or non-positive values", () => {
    expect(formatPayoutArrivalHint(undefined)).toBeNull()
    expect(formatPayoutArrivalHint(0)).toBeNull()
  })

  it("pluralizes multi-day business estimates", () => {
    expect(formatPayoutArrivalHint(172800)).toBe("2 business days")
  })
})

describe("resolvePayoutProcessingSeconds", () => {
  it("passes through Noah seconds for all corridors", () => {
    expect(resolvePayoutProcessingSeconds({ countryCode: "ZA", rail: "bank_transfer", fromNoah: 86400 })).toBe(86400)
    expect(resolvePayoutProcessingSeconds({ countryCode: "NG", rail: "bank_transfer", fromNoah: 50 })).toBe(50)
    expect(resolvePayoutProcessingSeconds({ countryCode: "RW", rail: "mobile_money", fromNoah: 50 })).toBe(50)
  })

  it("does not rewrite stored seconds in findPayoutFieldsSchema", () => {
    const corridors = [
      {
        id: "za",
        rail: "bank_transfer" as const,
        country_code: "ZA",
        country_name: "South Africa",
        currency_code: "ZAR",
        currency_name: "Rand",
        sort_order: 0,
        providers: null,
        fields_schema: { amount_field_mode: "note_optional_only" as const, processing_seconds: 86400 },
      },
    ]
    expect(
      findPayoutFieldsSchema(corridors, { countryCode: "ZA", currencyCode: "ZAR", rail: "bank_transfer" })
        ?.processing_seconds,
    ).toBe(86400)
  })
})

describe("resolveSendConfirmArrivalHint", () => {
  it("uses Within seconds for Easetag and wallet", () => {
    expect(resolveSendConfirmArrivalHint({ isEasetag: true })).toBe(SEND_ARRIVAL_WITHIN_SECONDS)
    expect(resolveSendConfirmArrivalHint({ isWalletSend: true })).toBe(SEND_ARRIVAL_WITHIN_SECONDS)
  })

  it("uses Noah tiers for fiat payout", () => {
    expect(resolveSendConfirmArrivalHint({ processingSeconds: 60 })).toBe(SEND_ARRIVAL_WITHIN_MINUTES)
  })

  it("maps Noah processing_seconds to product copy for African corridors", () => {
    expect(
      resolveSendConfirmArrivalHint({
        countryCode: "NG",
        rail: "bank_transfer",
        processingSeconds: 50,
      }),
    ).toBe(SEND_ARRIVAL_WITHIN_MINUTES)
    expect(
      resolveSendConfirmArrivalHint({
        countryCode: "ZA",
        rail: "bank_transfer",
        processingSeconds: 86400,
      }),
    ).toBe("1 business day")
    expect(
      resolveSendConfirmArrivalHint({
        countryCode: "GH",
        rail: "bank_transfer",
        processingSeconds: 86400,
      }),
    ).toBe("1 business day")
    expect(
      resolveSendConfirmArrivalHint({
        countryCode: "RW",
        rail: "bank_transfer",
        processingSeconds: 86400,
      }),
    ).toBe("1 business day")
    expect(
      resolveSendConfirmArrivalHint({
        countryCode: "KE",
        rail: "bank_transfer",
        processingSeconds: 86400,
      }),
    ).toBe("1 business day")
    expect(
      resolveSendConfirmArrivalHint({
        countryCode: "GH",
        rail: "mobile_money",
        processingSeconds: 50,
      }),
    ).toBe(SEND_ARRIVAL_WITHIN_MINUTES)
    expect(
      resolveSendConfirmArrivalHint({
        countryCode: "KE",
        rail: "mobile_money",
        processingSeconds: 86400,
      }),
    ).toBe("1 business day")
  })

  it("uses formatPayoutArrivalHint when only currency is set", () => {
    expect(
      resolveSendConfirmArrivalHint({
        currencyCode: "NGN",
        rail: "bank_transfer",
        processingSeconds: 50,
      }),
    ).toBe(SEND_ARRIVAL_WITHIN_MINUTES)
    expect(
      resolveSendConfirmArrivalHint({
        currencyCode: "ZAR",
        rail: "bank_transfer",
        processingSeconds: 86400,
      }),
    ).toBe("1 business day")
  })
})

describe("findPayoutFieldsSchema", () => {
  it("does not throw when catalog rows omit country_code", () => {
    const corridors = [
      {
        id: "bad",
        rail: "bank_transfer",
        country_code: null as unknown as string,
        country_name: "Bad",
        currency_code: "NGN",
        currency_name: "Naira",
        sort_order: 0,
        providers: null,
      },
      {
        id: "ng",
        rail: "bank_transfer",
        country_code: "NG",
        country_name: "Nigeria",
        currency_code: "NGN",
        currency_name: "Naira",
        sort_order: 1,
        providers: null,
        fields_schema: { amount_field_mode: "note" as const },
      },
    ] satisfies PayoutCorridorPublic[]

    expect(() =>
      findPayoutFieldsSchema(corridors, {
        countryCode: "NG",
        currencyCode: "NGN",
        rail: "bank_transfer",
      }),
    ).not.toThrow()
    expect(
      findPayoutFieldsSchema(corridors, {
        countryCode: "NG",
        currencyCode: "NGN",
        rail: "bank_transfer",
      }),
    ).toEqual({ amount_field_mode: "note" })
  })
})

describe("USD optional reference on send amount", () => {
  const usOptionalHints = {
    reference_required: false,
    reference_optional: true,
    amount_field_mode: "note_optional_only",
  } as PayoutFieldsSchemaHint

  it("shows optional Note label even when stale mode is note", () => {
    const stale = {
      ...usOptionalHints,
      amount_field_mode: "note" as const,
    }
    expect(getSendAmountNoteFieldUi({ hints: stale })).toEqual({
      mode: "note_optional_only",
      label: "Note",
      placeholder: "Note",
    })
  })

  it("allows continue without note when reference is optional", () => {
    expect(
      validateSendAmountFields({
        hints: { ...usOptionalHints, amount_field_mode: "note" },
        note: "",
        paymentPurpose: "",
      }),
    ).toEqual({ ok: true })
  })

  it("allows continue for USD ACH even when corridor hints are stale", () => {
    expect(
      validateSendAmountFields({
        hints: {
          reference_required: true,
          reference_optional: false,
          amount_field_mode: "note",
          payment_method_type: "BankAch",
        } as PayoutFieldsSchemaHint,
        note: "",
        paymentPurpose: "",
        receiveCurrency: "USD",
      }),
    ).toEqual({ ok: true })
  })

  it("skips Noah payout minimum for Easetag P2P", () => {
    expect(
      validatePayoutAmountAgainstLimits({
        amount: 1,
        hints: null,
        currencyCode: "USD",
        isEasetag: true,
      }),
    ).toEqual({ ok: true })
    expect(
      validatePayoutAmountAgainstLimits({
        amount: 1,
        hints: null,
        currencyCode: "USD",
      }),
    ).toEqual({ ok: false, message: "Minimum send amount is 10 USD." })
  })

  it("still requires reference for EUR corridors", () => {
    expect(
      validateSendAmountFields({
        hints: {
          reference_required: true,
          amount_field_mode: "note",
        } as PayoutFieldsSchemaHint,
        note: "",
        paymentPurpose: "",
      }),
    ).toEqual({ ok: false, message: "Enter a payment reference to continue." })
  })
})
