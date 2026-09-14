"use client"

import { useMemo } from "react"
import {
  findPayoutFieldsSchema,
  resolvePayoutCountryCode,
  type PayoutFieldsSchemaHint,
  type PayoutRail,
} from "@easner/shared"
import { useSendDestinations } from "@/lib/use-send-destinations"

export function usePayoutFormSchema(input: {
  countryCode?: string | null
  currencyCode?: string | null
  rail?: PayoutRail
}): { hints: PayoutFieldsSchemaHint | null; loading: boolean } {
  const { bankCorridors, mobileCorridors, loading } = useSendDestinations({ poll: true })
  const cc = resolvePayoutCountryCode({
    countryCode: input.countryCode,
    currencyCode: input.currencyCode || "",
  })
  const cur = String(input.currencyCode || "").trim().toUpperCase()
  const rail = input.rail ?? "bank_transfer"

  const hints = useMemo(() => {
    if (!cc || !cur) return null
    const corridors = rail === "mobile_money" ? mobileCorridors : bankCorridors
    return findPayoutFieldsSchema(corridors, { countryCode: cc, currencyCode: cur, rail })
  }, [cc, cur, rail, bankCorridors, mobileCorridors])

  return { hints, loading }
}
