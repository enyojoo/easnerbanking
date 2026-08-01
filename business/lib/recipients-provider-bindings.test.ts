import { describe, expect, it } from "vitest"
import { attachProviderBindingsToPayload } from "./recipients-provider-bindings"

describe("attachProviderBindingsToPayload", () => {
  it("writes provider_bindings for all resolvable providers on save", () => {
    const payload = {
      country_code: "NG",
      currency: "NGN",
      bank_name: "Kuda",
      mobile_provider: null as string | null,
      metadata: {} as Record<string, unknown>,
    }
    attachProviderBindingsToPayload({
      payload,
      corridor: {
        fields_schema: {
          noah: { amount_field_mode: "note_optional_only", bank_enum: ["GTBank", "Kuda Microfinance Bank"] },
          yellowcard: {
            status: "ready",
            channel_type: "bank",
            bank_enum: ["Access Bank", "Kuda Microfinance Bank"],
          },
          grid: {
            status: "ready",
            channel_type: "bank",
            bank_enum: ["Kuda Microfinance Bank", "GT Bank"],
          },
        },
        providers: ["Kuda Microfinance Bank"],
      },
      rail: "bank_transfer",
    })

    const bindings = (payload.metadata?.provider_bindings ?? {}) as Record<
      string,
      { bankName?: string }
    >
    expect(bindings.grid?.bankName).toBe("Kuda Microfinance Bank")
    expect(bindings.yellowcard?.bankName).toBe("Kuda Microfinance Bank")
    expect(bindings.noah?.bankName).toBe("Kuda Microfinance Bank")
  })
})
