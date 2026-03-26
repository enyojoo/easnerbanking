import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../_helpers"

type PmResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

function isEurCountry(code: string): boolean {
  const eu = new Set([
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",
    "IS",
    "LI",
    "NO",
    "CH",
  ])
  return eu.has(code.toUpperCase())
}

function matchesCurrency(pm: Record<string, unknown>, want: "usd" | "eur"): boolean {
  const country = String(pm.Country ?? "").toUpperCase()
  if (want === "usd") return country === "US"
  if (want === "eur") return isEurCountry(country)
  return false
}

export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const ctx = resolveNoahContext(user.id, request)
  const { noahCustomerId } = ctx

  const url = new URL(request.url)
  const currency = (url.searchParams.get("currency") || "usd").toLowerCase() as "usd" | "eur"
  if (currency !== "usd" && currency !== "eur") {
    return NextResponse.json({ error: "currency must be usd or eur" }, { status: 400 })
  }

  try {
    const all: Array<Record<string, unknown>> = []
    let token: string | undefined
    for (let i = 0; i < 5; i++) {
      const data = await noahFetch<PmResp>({
        method: "GET",
        path: "/payment-methods",
        query: { CustomerID: noahCustomerId, PageSize: 50, ...(token ? { PageToken: token } : {}) },
      })
      const items = data.Items ?? []
      all.push(...items)
      token = data.PageToken
      if (!token || items.length === 0) break
    }

    const candidates = all.filter((pm) => {
      const caps = pm.Capabilities as Record<string, unknown> | undefined
      if (caps && caps.PayinTo === false) return false
      return matchesCurrency(pm, currency)
    })

    const pm = candidates[0]
    if (!pm) {
      return NextResponse.json({
        hasAccount: false,
        currency,
      })
    }

    const details = pm.DisplayDetails as Record<string, unknown> | undefined
    const issuer = pm.IssuerDetails as { Name?: string } | undefined
    const holder = pm.AccountHolderDetails as { Name?: { FirstName?: string; LastName?: string } } | undefined

    const type = String(details?.Type ?? "")
    let accountNumber: string | undefined
    let routingNumber: string | undefined
    let iban: string | undefined
    let bic: string | undefined

    if (type === "FiatPaymentMethodBankDisplay") {
      accountNumber = details?.AccountNumber != null ? String(details.AccountNumber) : undefined
      const bankCode = details?.BankCode != null ? String(details.BankCode) : undefined
      if (currency === "usd") {
        routingNumber = bankCode
      } else {
        iban = accountNumber
        bic = bankCode
      }
    }

    const accountHolderName =
      holder?.Name?.FirstName || holder?.Name?.LastName
        ? `${holder?.Name?.FirstName ?? ""} ${holder?.Name?.LastName ?? ""}`.trim()
        : undefined

    return NextResponse.json({
      hasAccount: true,
      currency,
      accountNumber,
      routingNumber,
      iban,
      bic,
      bankName: issuer?.Name,
      accountHolderName,
      status: "active",
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
