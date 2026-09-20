import type { CryptoDestinationPublic, PayoutCorridorPublic, SendDestinationsResponse } from "@easner/shared"
import { buildSendDestinationsCatalog } from "@/lib/send-destinations/build-catalog"

export const PLATFORM_PAYMENT_METHODS = [
  {
    id: "bank",
    type: "bank",
    direction: "send",
    label: "Bank",
    methods: ["ACH", "SEPA Instant", "Faster Payments", "Local transfer"],
    currencies: ["USD", "EUR"],
  },
  {
    id: "mobile_money",
    type: "mobile_money",
    direction: "send",
    label: "Mobile money",
    methods: ["Local transfer"],
    currencies: ["USD", "EUR"],
  },
  {
    id: "wallet",
    type: "wallet",
    direction: "send",
    label: "Wallet",
    assets: [
      { asset: "USDC", networks: ["solana", "ethereum", "base"] },
      { asset: "USDT", networks: ["tron", "ethereum", "solana"] },
      { asset: "EURC", networks: ["solana"] },
    ],
  },
  {
    id: "easetag",
    type: "easetag",
    direction: "send",
    label: "Easetag",
    methods: ["Easetag"],
  },
  {
    id: "virtual_account",
    type: "bank",
    direction: "receive",
    label: "Virtual account",
    methods: ["ACH", "SEPA"],
    currencies: ["USD", "EUR"],
  },
  {
    id: "deposit_address",
    type: "wallet",
    direction: "receive",
    label: "Wallet address",
    assets: [
      { asset: "USDC", networks: ["solana"] },
      { asset: "EURC", networks: ["solana"] },
    ],
  },
  {
    id: "onramp",
    type: "onramp",
    direction: "receive",
    label: "Card onramp",
    currencies: ["USD", "EUR"],
  },
] as const

export type PlatformCorridorPublic = {
  id: string
  rail: "bank" | "mobile_money"
  country: string
  country_name: string
  currency: string
  currency_name: string
  networks: unknown
  fields?: unknown
}

export type PlatformPaymentCatalog = {
  catalog_version: string
  currencies: { code: string; available: boolean }[]
  fiat: {
    bank: PlatformCorridorPublic[]
    mobile_money: PlatformCorridorPublic[]
  }
  crypto: { asset: string; name: string; networks: string[] }[]
}

export function publicPlatformCorridor(row: PayoutCorridorPublic): PlatformCorridorPublic {
  return {
    id: row.id,
    rail: row.rail === "mobile_money" ? "mobile_money" : "bank",
    country: row.country_code,
    country_name: row.country_name,
    currency: row.currency_code,
    currency_name: row.currency_name,
    networks: row.providers ?? null,
    ...(row.fields_schema != null ? { fields: row.fields_schema } : {}),
  }
}

export function publicPlatformCatalog(body: SendDestinationsResponse): PlatformPaymentCatalog {
  return {
    catalog_version: body.catalog_version,
    currencies: (body.balance_currencies ?? []).map((row) => ({
      code: row.code,
      available: Boolean(row.available),
    })),
    fiat: {
      bank: (body.fiat.bank_transfer ?? []).map(publicPlatformCorridor),
      mobile_money: (body.fiat.mobile_money ?? []).map(publicPlatformCorridor),
    },
    crypto: (body.crypto ?? []).map((row: CryptoDestinationPublic) => ({
      asset: row.asset_code,
      name: row.asset_name,
      networks: row.networks,
    })),
  }
}

export async function buildPlatformPaymentCatalog(): Promise<PlatformPaymentCatalog> {
  const { body } = await buildSendDestinationsCatalog({
    annotateProviders: false,
    executableOnly: true,
    surface: "business",
  })
  return publicPlatformCatalog(body)
}
