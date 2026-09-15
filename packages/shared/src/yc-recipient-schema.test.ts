import { describe, expect, it } from "vitest"
import {
  buildYcSendMappingFromRecipient,
  formatPixKeyTypeLabel,
  GRID_STATIC_CORRIDOR_SCHEMAS,
  normalizeBrazilPixKey,
  normalizePixKeyType,
  normalizeRecipientYcMetadata,
  resolveBrazilRecipientTaxId,
  toGridPixKeyType,
  validateYcRecipientForCorridor,
  YC_STATIC_CORRIDOR_SCHEMAS,
  mergeYcMomoNetworksIntoSchema,
  mergeYcNetworksIntoSchema,
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

  it("attaches ZA Instant EFT branchCode on the destination", () => {
    const mapped = buildYcSendMappingFromRecipient(
      {
        country_code: "ZA",
        currency: "ZAR",
        full_name: "Akpomedaye Ambrose",
        account_number: "63099950123",
        bank_name: "First National Bank (South Africa)",
      },
      { networkId: "fnb-za", branchCode: "250655" },
    )
    expect(mapped.destination.networkId).toBe("fnb-za")
    expect(mapped.destination.branchCode).toBe("250655")
    expect(mapped.destination.accountNumber).toBe("63099950123")
  })

  it("maps Brazil pixKeyType on destination", () => {
    const mapped = buildYcSendMappingFromRecipient({
      country_code: "BR",
      currency: "BRL",
      full_name: "João",
      account_number: "123.456.789-01",
      bank_name: "Pix",
      metadata: { pix_key_type: "CPF" },
    })
    expect(mapped.destination.pixKeyType).toBe("CPF")
    expect(mapped.destination.accountNumber).toBe("12345678901")
  })

  it("keeps email Pix keys intact on Yellowcard destination", () => {
    const mapped = buildYcSendMappingFromRecipient({
      country_code: "BR",
      currency: "BRL",
      full_name: "João",
      account_number: "joao@example.com",
      bank_name: "Pix",
      metadata: { pix_key_type: "EMAIL" },
    })
    expect(mapped.destination.pixKeyType).toBe("EMAIL")
    expect(mapped.destination.accountNumber).toBe("joao@example.com")
    expect(mapped.root).toBeUndefined()
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

  it("maps Kenya MoMo with E.164 accountNumber when country_code omitted", () => {
    const mapped = buildYcSendMappingFromRecipient(
      {
        currency: "KES",
        full_name: "Jane Doe",
        phone_number: "712345678",
        mobile_provider: "M-Pesa",
        bank_name: "Mobile Money",
      },
      { networkId: "net-ke-mpesa" },
    )
    expect(mapped.destination.accountType).toBe("momo")
    expect(mapped.destination.accountNumber).toBe("+254712345678")
    expect(mapped.destination.phoneNumber).toBe("+254712345678")
    expect(mapped.destination.networkId).toBe("net-ke-mpesa")
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

  it("stores Grid RANDOM as RANDOM_KEY", () => {
    expect(normalizeRecipientYcMetadata({ pix_key_type: "RANDOM" })).toEqual({
      pix_key_type: "RANDOM_KEY",
    })
    expect(normalizeRecipientYcMetadata({ tax_id: "123.456.789-01" })).toEqual({
      tax_id: "12345678901",
    })
  })
})

describe("pix key type labels", () => {
  it("formats stored and Grid values for display", () => {
    expect(formatPixKeyTypeLabel("RANDOM_KEY")).toBe("Random")
    expect(formatPixKeyTypeLabel("RANDOM")).toBe("Random")
    expect(formatPixKeyTypeLabel("EMAIL")).toBe("Email")
    expect(formatPixKeyTypeLabel("PHONE")).toBe("Phone")
  })

  it("normalizes and maps Grid RANDOM", () => {
    expect(normalizePixKeyType("RANDOM")).toBe("RANDOM_KEY")
    expect(normalizePixKeyType("random_key")).toBe("RANDOM_KEY")
    expect(toGridPixKeyType("RANDOM_KEY")).toBe("RANDOM")
    expect(toGridPixKeyType("CPF")).toBe("CPF")
  })

  it("resolves Grid taxId from CPF Pix key or a separate tax_id", () => {
    expect(
      resolveBrazilRecipientTaxId({
        pixKeyType: "CPF",
        pixKey: "123.456.789-01",
      }),
    ).toBe("12345678901")
    expect(
      resolveBrazilRecipientTaxId({
        pixKeyType: "EMAIL",
        pixKey: "a@b.com",
        taxId: "12.345.678/0001-95",
      }),
    ).toBe("12345678000195")
    expect(
      resolveBrazilRecipientTaxId({
        pixKeyType: "RANDOM_KEY",
        pixKey: "123e4567-e89b-12d3-a456-426614174000",
      }),
    ).toBe("")
    expect(normalizeBrazilPixKey("CPF", "123.456.789-01")).toBe("12345678901")
    expect(normalizeBrazilPixKey("EMAIL", "a@b.com")).toBe("a@b.com")
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

  it("labels Brazil Pix RANDOM_KEY as Random", () => {
    const pixType = YC_STATIC_CORRIDOR_SCHEMAS["BR:BRL"]?.extra_fields?.find((f) => f.key === "pix_key_type")
    expect(pixType?.options).toEqual(
      expect.arrayContaining([{ value: "RANDOM_KEY", label: "Random" }]),
    )
    expect(GRID_STATIC_CORRIDOR_SCHEMAS["BR:BRL"]?.extra_fields?.find((f) => f.key === "pix_key_type")?.options).toEqual(
      expect.arrayContaining([{ value: "RANDOM_KEY", label: "Random" }]),
    )
  })
})

describe("validateYcRecipientForCorridor – Noah-only schema", () => {
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

describe("mergeYcNetworksIntoSchema", () => {
  const base = {
    status: "ready" as const,
    channel_type: "bank" as const,
    extra_fields: [],
  }

  it("keeps only active networks on the live send channel", () => {
    const merged = mergeYcNetworksIntoSchema(
      base,
      [
        {
          name: "First National Bank (South Africa)",
          status: "active",
          channelIds: ["za-eft"],
        },
        {
          name: "First National Bank Lesotho",
          status: "active",
          channelIds: ["za-old-bank"],
        },
        {
          name: "Absa Bank",
          status: "inactive",
          channelIds: ["za-eft"],
        },
        {
          name: "Manual Input",
          status: "active",
          channelIds: ["za-eft"],
        },
      ],
      { channelId: "za-eft" },
    )
    expect(merged.bank_enum).toEqual(["First National Bank (South Africa)"])
  })

  it("clears bank_enum when the live send channel has no networks", () => {
    const merged = mergeYcNetworksIntoSchema(
      { ...base, bank_enum: ["MTN_Rwanda"] },
      [
        {
          name: "MTN_Rwanda",
          status: "active",
          channelIds: ["rw-momo"],
        },
      ],
      { channelId: "rw-bank" },
    )
    expect(merged.bank_enum).toEqual([])
  })

  it("falls back to all active networks only when no send channel is provided", () => {
    const merged = mergeYcNetworksIntoSchema(base, [
      { name: "Absa Bank", status: "active" },
      { name: "Capitec Bank", status: "active" },
    ])
    expect(merged.bank_enum).toEqual(["Absa Bank", "Capitec Bank"])
  })
})

describe("mergeYcMomoNetworksIntoSchema", () => {
  it("keeps only live send-channel MoMo networks", () => {
    const merged = mergeYcMomoNetworksIntoSchema(
      {
        status: "ready",
        channel_type: "momo",
        momo_provider_enum: [{ value: "Airtel Money", label: "Airtel Money" }],
      },
      [
        { name: "MTN_Rwanda", status: "active", channelIds: ["rw-momo"] },
        { name: "Airtel Money", status: "active", channelIds: ["other"] },
      ],
      { channelId: "rw-momo" },
    )
    expect(merged.momo_provider_enum).toEqual([{ value: "MTN_Rwanda", label: "MTN_Rwanda" }])
  })

  it("drops generic Mobile Money catch-all networks", () => {
    const merged = mergeYcMomoNetworksIntoSchema(
      { status: "ready", channel_type: "momo" },
      [
        { name: "Airtel Mobile Money", status: "active", channelIds: ["ug-momo"] },
        { name: "MTN Mobile Money", status: "active", channelIds: ["ug-momo"] },
        { name: "Mobile Money", status: "active", channelIds: ["ug-momo"] },
      ],
      { channelId: "ug-momo" },
    )
    expect(merged.momo_provider_enum?.map((e) => e.label)).toEqual([
      "Airtel Mobile Money",
      "MTN Mobile Money",
    ])
  })
})
