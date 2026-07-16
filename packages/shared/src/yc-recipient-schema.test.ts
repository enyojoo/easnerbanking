import { describe, expect, it } from "vitest"
import {
  buildYcSendMappingFromRecipient,
  normalizeRecipientYcMetadata,
  validateYcRecipientForCorridor,
  YC_STATIC_CORRIDOR_SCHEMAS,
} from "./yc-recipient-schema"

describe("validateYcRecipientForCorridor", () => {
  it("requires 18-digit CLABE for Mexico", () => {
    const res = validateYcRecipientForCorridor({
      countryCode: "MX",
      currencyCode: "MXN",
      row: {
        full_name: "Jane Doe",
        account_number: "123",
        bank_name: "BBVA",
        currency: "MXN",
      },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/18 digits/)
  })

  it("accepts valid Mexico CLABE", () => {
    const res = validateYcRecipientForCorridor({
      countryCode: "MX",
      currencyCode: "MXN",
      row: {
        full_name: "Jane Doe",
        account_number: "012345678901234567",
        bank_name: "BBVA",
        currency: "MXN",
      },
    })
    expect(res.ok).toBe(true)
  })

  it("requires pix key type and valid CPF for Brazil", () => {
    const missingType = validateYcRecipientForCorridor({
      countryCode: "BR",
      currencyCode: "BRL",
      row: {
        full_name: "João",
        account_number: "12345678901",
        bank_name: "Pix",
        currency: "BRL",
      },
    })
    expect(missingType.ok).toBe(false)

    const res = validateYcRecipientForCorridor({
      countryCode: "BR",
      currencyCode: "BRL",
      row: {
        full_name: "João",
        account_number: "12345678901",
        bank_name: "Pix",
        currency: "BRL",
        metadata: { pix_key_type: "CPF" },
      },
    })
    expect(res.ok).toBe(true)
  })

  it("requires CUIT and 22-digit account for Argentina", () => {
    const res = validateYcRecipientForCorridor({
      countryCode: "AR",
      currencyCode: "ARS",
      row: {
        full_name: "Maria",
        account_number: "1".repeat(22),
        bank_name: "Bank",
        currency: "ARS",
        metadata: { cuit: "20123456789" },
      },
    })
    expect(res.ok).toBe(true)
  })

  it("requires COP identification fields", () => {
    const res = validateYcRecipientForCorridor({
      countryCode: "CO",
      currencyCode: "COP",
      row: {
        full_name: "Carlos",
        account_number: "123456789",
        bank_name: "Bancolombia",
        currency: "COP",
        metadata: {
          identification_type: "cc",
          identification_number: "1234567890",
        },
      },
    })
    expect(res.ok).toBe(true)
  })
})

describe("buildYcSendMappingFromRecipient", () => {
  it("maps Argentina root cuit and destination account", () => {
    const mapped = buildYcSendMappingFromRecipient({
      country_code: "AR",
      currency: "ARS",
      full_name: "Maria",
      account_number: "0000000000000000000011",
      bank_name: "Bank",
      metadata: { cuit: "20123456789" },
    })
    expect(mapped.destination.accountNumber).toBe("0000000000000000000011")
    expect(mapped.root?.cuit).toBe("20123456789")
  })

  it("maps Brazil pixKeyType on destination", () => {
    const mapped = buildYcSendMappingFromRecipient({
      country_code: "BR",
      currency: "BRL",
      full_name: "João",
      account_number: "12345678901",
      bank_name: "Pix",
      metadata: { pix_key_type: "CPF" },
    })
    expect(mapped.destination.pixKeyType).toBe("CPF")
    expect(mapped.destination.accountNumber).toBe("12345678901")
  })

  it("maps Colombia identification to send root", () => {
    const mapped = buildYcSendMappingFromRecipient({
      country_code: "CO",
      currency: "COP",
      full_name: "Carlos",
      account_number: "999",
      bank_name: "Bancolombia",
      metadata: {
        identification_type: "cc",
        identification_number: "12345",
        account_type: "ch",
      },
    })
    expect(mapped.root?.identificationType).toBe("cc")
    expect(mapped.root?.identificationNumber).toBe("12345")
    expect(mapped.root?.accountType).toBe("ch")
  })

  it("strips spaces from NG NUBAN before YC send", () => {
    const mapped = buildYcSendMappingFromRecipient({
      country_code: "NG",
      currency: "NGN",
      full_name: "Test account",
      account_number: "2020 0303 022",
      bank_name: "Paga",
    })
    expect(mapped.destination.accountNumber).toBe("20200303022")
    expect(mapped.destination.accountBank).toBe("Paga")
  })
})

describe("normalizeRecipientYcMetadata", () => {
  it("normalizes pix key type and cuit digits", () => {
    expect(
      normalizeRecipientYcMetadata({
        pix_key_type: "cpf",
        cuit: "20-12345678-9",
      }),
    ).toEqual({
      pix_key_type: "CPF",
      cuit: "20123456789",
    })
  })
})

describe("YC_STATIC_CORRIDOR_SCHEMAS", () => {
  it("includes MX BR AR CO and NG", () => {
    expect(YC_STATIC_CORRIDOR_SCHEMAS["MX:MXN"]?.status).toBe("ready")
    expect(YC_STATIC_CORRIDOR_SCHEMAS["BR:BRL"]?.extra_fields?.length).toBeGreaterThan(0)
    expect(YC_STATIC_CORRIDOR_SCHEMAS["AR:ARS"]?.extra_fields?.length).toBeGreaterThan(0)
    expect(YC_STATIC_CORRIDOR_SCHEMAS["CO:COP"]?.extra_fields?.length).toBeGreaterThan(0)
    expect(YC_STATIC_CORRIDOR_SCHEMAS["NG:NGN"]?.status).toBe("ready")
  })
})

describe("validateYcRecipientForCorridor — Noah-only schema", () => {
  const noahNgSchema = {
    channel_id: "ae1f871a-f2cd-5eab-84bf-5240091d9767",
    payment_method_type: "BankLocal",
    amount_field_mode: "note_optional_only" as const,
    bank_enum: ["Access Bank", "GTBank"],
  }

  it("accepts NG bank recipient when corridor has flat Noah fields_schema only", () => {
    const res = validateYcRecipientForCorridor({
      countryCode: "NG",
      currencyCode: "NGN",
      fieldsSchema: noahNgSchema,
      row: {
        full_name: "Jane Doe",
        account_number: "0123456789",
        bank_name: "Access Bank",
        currency: "NGN",
        country_code: "NG",
      },
    })
    expect(res.ok).toBe(true)
  })

  it("rejects when Noah bank is not in bank_enum", () => {
    const res = validateYcRecipientForCorridor({
      countryCode: "NG",
      currencyCode: "NGN",
      fieldsSchema: noahNgSchema,
      row: {
        full_name: "Jane Doe",
        account_number: "0123456789",
        bank_name: "Unknown Bank",
        currency: "NGN",
        country_code: "NG",
      },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/corridor list/)
  })

  it("accepts NG mobile money recipient with static schema fallback", () => {
    const res = validateYcRecipientForCorridor({
      countryCode: "NG",
      currencyCode: "NGN",
      row: {
        full_name: "Jane Doe",
        phone_number: "+2348012345678",
        mobile_provider: "MTN",
        bank_name: "Mobile Money",
        currency: "NGN",
        country_code: "NG",
      },
    })
    expect(res.ok).toBe(true)
  })
})
