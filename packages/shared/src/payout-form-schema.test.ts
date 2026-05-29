import { describe, expect, it } from "vitest"
import {
  getSendAmountNoteFieldUi,
  validatePayoutAmountAgainstLimits,
  validateSendAmountFields,
} from "./payout-form-schema"
import type { PayoutFieldsSchemaHint } from "./payout-corridor"

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
