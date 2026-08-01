import { describe, expect, it } from "vitest"
import {
  applyProviderBindingToRecipient,
  mergeProviderBindingsIntoMetadata,
  resolveRecipientProviderBindings,
} from "./recipient-provider-bindings"

describe("resolveRecipientProviderBindings", () => {
  it("maps Grid display label to YC and Noah bank bindings for NG", () => {
    const bindings = resolveRecipientProviderBindings({
      countryCode: "NG",
      currencyCode: "NGN",
      rail: "bank_transfer",
      bankName: "Kuda",
      fieldsSchema: {
        noah: { amount_field_mode: "note_optional_only", bank_enum: ["GTBank", "Kuda Microfinance Bank"] },
        yellowcard: { status: "ready", channel_type: "bank", bank_enum: ["Access Bank", "Kuda Microfinance Bank"] },
        grid: { status: "ready", channel_type: "bank", bank_enum: ["Kuda Microfinance Bank", "GT Bank"] },
      },
    })
    expect(bindings.grid?.bankName).toBe("Kuda Microfinance Bank")
    expect(bindings.yellowcard?.bankName).toBe("Kuda Microfinance Bank")
    expect(bindings.noah?.bankName).toBe("Kuda Microfinance Bank")
  })

  it("resolves MoMo network aliases per provider", () => {
    const bindings = resolveRecipientProviderBindings({
      countryCode: "KE",
      currencyCode: "KES",
      rail: "mobile_money",
      mobileProvider: "M-PESA",
      fieldsSchema: {
        grid: {
          status: "ready",
          channel_type: "momo",
          momo_provider_enum: [{ value: "M-Pesa", label: "M-Pesa" }],
        },
        yellowcard: {
          status: "ready",
          channel_type: "momo",
          momo_provider_enum: [{ value: "MPESA", label: "M-PESA" }],
        },
      },
    })
    expect(bindings.grid?.network).toBe("M-Pesa")
    expect(bindings.yellowcard?.network).toBeTruthy()
  })

  it("omits provider key when schema missing", () => {
    const bindings = resolveRecipientProviderBindings({
      countryCode: "NG",
      currencyCode: "NGN",
      rail: "bank_transfer",
      bankName: "GTBank",
      fieldsSchema: {
        noah: { amount_field_mode: "note_optional_only", bank_enum: ["GTBank"] },
      },
    })
    expect(bindings.noah?.bankName).toBe("GTBank")
    expect(bindings.grid).toBeUndefined()
    expect(bindings.yellowcard).toBeUndefined()
  })
})

describe("applyProviderBindingToRecipient", () => {
  it("overlays yellowcard binding without changing unrelated fields", () => {
    const row = {
      bank_name: "Kuda",
      mobile_provider: null,
      metadata: mergeProviderBindingsIntoMetadata(
        {},
        { yellowcard: { bankName: "Kuda Microfinance Bank" } },
      ),
    }
    const bound = applyProviderBindingToRecipient(row, "yellowcard")
    expect(bound.bank_name).toBe("Kuda Microfinance Bank")
  })
})
