import type { SupabaseClient } from "@supabase/supabase-js"
import { countryDisplayName, formatVerifiedAddressDisplay } from "@easner/shared"
import { firstNameFromFullName } from "@/lib/notifications/user-contact"
import { LEDGER_LIST_SELECT } from "@/lib/ledger/ledger-select"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import {
  buildActivityLine,
  impactInStatementCurrency,
  isCompletedFeedRow,
  needsEasetagSenderLookup,
  transferGroupIdOf,
} from "./activity"
import {
  clipPeriodToAccountOpen,
  formatAvailableAsOf,
  formatStatementCalendarDate,
  formatStatementMoney,
  formatStatementPeriodLabel,
  isoDateFromInstant,
  periodBoundsUtc,
  resolveTimeZone,
} from "./format"
import type { AssembleStatementInput, AssembledStatement, StatementBankFields } from "./types"

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function joinAddressParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(", ")
}

function formatPersonalAddress(row: Record<string, unknown> | null): string {
  if (!row) return ""
  const street = typeof row.kyc_address_street === "string" ? row.kyc_address_street.trim() : ""
  const cityLine = [
    typeof row.kyc_address_city === "string" ? row.kyc_address_city.trim() : "",
    typeof row.kyc_address_state === "string" ? row.kyc_address_state.trim() : "",
    typeof row.kyc_address_post_code === "string" ? row.kyc_address_post_code.trim() : "",
  ]
    .filter(Boolean)
    .join(", ")
  const country = countryDisplayName(String(row.kyc_address_country ?? row.residence_country ?? ""))
  return formatVerifiedAddressDisplay({
    addressLines: [street, cityLine].filter(Boolean),
    addressCountry: country ? { code: "", name: country } : null,
  })
}

function formatBusinessAddress(row: Record<string, unknown> | null): string {
  if (!row) return ""
  const registeredStreet = String(row.registered_address_line1 ?? "").trim()
  const operatingStreet = String(row.address_line1 ?? "").trim()
  const useRegistered = Boolean(registeredStreet)
  const street = useRegistered ? registeredStreet : operatingStreet
  const city = String(
    useRegistered ? row.registered_address_city ?? row.city : row.city,
  ).trim()
  const state = String(
    useRegistered ? row.registered_address_state ?? row.state : row.state,
  ).trim()
  const postal = String(
    useRegistered ? row.registered_address_postal_code ?? row.postal_code : row.postal_code,
  ).trim()
  const country = countryDisplayName(
    String(row.registration_country ?? row.country ?? ""),
  )
  return joinAddressParts([street, joinAddressParts([city, state, postal]), country])
}

async function loadCompletedLedgerRows(
  admin: SupabaseClient,
  input: { userId: string; businessId: string | null; currency: "USD" | "EUR" },
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  const page = 500
  for (;;) {
    let q = admin
      .from("transactions")
      .select(LEDGER_LIST_SELECT)
      .eq("hidden_from_feed", false)
      .eq("currency", input.currency)
      .order("occurred_at", { ascending: true })
      .range(from, from + page - 1)
    if (input.businessId) q = q.eq("business_id", input.businessId)
    else q = q.eq("user_id", input.userId).is("business_id", null)

    const { data, error } = await q
    if (error) throw error
    const batch = (data ?? []) as Record<string, unknown>[]
    for (const row of batch) {
      if (isCompletedFeedRow(row)) rows.push(row)
    }
    if (batch.length < page) break
    from += page
    if (from > 20_000) break
  }
  return rows
}

async function resolveMissingEasetagSenders(
  admin: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<Map<string, string>> {
  const handles = new Map<string, string>()
  const groupIds = new Set<string>()
  for (const row of rows) {
    if (!needsEasetagSenderLookup(row)) continue
    const gid = transferGroupIdOf(row)
    if (gid) groupIds.add(gid)
  }
  if (groupIds.size === 0) return handles

  for (const gid of groupIds) {
    const { data, error } = await admin
      .from("transactions")
      .select("business_id,user_id,direction,metadata")
      .eq("direction", "out")
      .contains("metadata", { transfer_group_id: gid })
      .limit(1)
      .maybeSingle()
    if (error || !data) continue
    const handle = await resolveCounterpartyHandle(admin, data as Record<string, unknown>)
    if (handle) handles.set(gid, handle)
  }
  return handles
}

async function resolveCounterpartyHandle(
  admin: SupabaseClient,
  leg: Record<string, unknown>,
): Promise<string | null> {
  const meta = asRecord(leg.metadata)
  const stored = typeof meta.sender_easetag === "string" ? meta.sender_easetag.trim().replace(/^@+/, "") : ""
  if (stored) return stored
  const businessId = typeof leg.business_id === "string" ? leg.business_id : null
  if (businessId) {
    const { data } = await admin.from("businesses").select("easetag").eq("id", businessId).maybeSingle()
    const tag = typeof data?.easetag === "string" ? data.easetag.trim().replace(/^@+/, "") : ""
    return tag || null
  }
  const userId = typeof leg.user_id === "string" ? leg.user_id : null
  if (userId) {
    const { data } = await admin.from("users").select("easetag").eq("id", userId).maybeSingle()
    const tag = typeof data?.easetag === "string" ? data.easetag.trim().replace(/^@+/, "") : ""
    return tag || null
  }
  return null
}

async function readAvailable(
  admin: SupabaseClient,
  input: { userId: string; businessId: string | null; currency: "USD" | "EUR" },
): Promise<number> {
  let q = admin
    .from("wallet_balances")
    .select("available_balance")
    .eq("currency", input.currency)
    .limit(1)
  if (input.businessId) q = q.eq("business_id", input.businessId)
  else q = q.eq("user_id", input.userId).is("business_id", null)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  const n = Number(data?.available_balance ?? 0)
  return Number.isFinite(n) ? n : 0
}

function bankFieldsFromVa(
  currency: "USD" | "EUR",
  va: Awaited<ReturnType<typeof getVirtualAccountDisplayFromDb>>,
): StatementBankFields | null {
  if (!va?.hasAccount) return null
  if (currency === "USD") {
    if (!va.accountNumber && !va.routingNumber && !va.iban) return null
    return {
      accountNumber: va.accountNumber,
      routingNumber: va.routingNumber,
      bic: va.bic,
      bankName: va.bankName,
      bankAddress: va.bankAddress,
    }
  }
  if (!va.iban) return null
  return {
    iban: va.iban,
    bic: va.bic,
    bankName: va.bankName,
    bankAddress: va.bankAddress,
  }
}

export async function assembleStatement(
  admin: SupabaseClient,
  input: AssembleStatementInput,
): Promise<AssembledStatement> {
  const now = input.now ?? new Date()
  const todayIso = now.toISOString().slice(0, 10)
  const timeZone = resolveTimeZone(input.timeZone)
  const scope = input.businessId ? "business" : "personal"

  let holderName = ""
  let holderEmail = ""
  let holderFirstName: string | null = null
  let address = ""
  let accountOpenedIso: string | null = null

  if (input.businessId) {
    const { data: biz, error } = await admin
      .from("businesses")
      .select(
        "name,created_at,address_line1,city,state,postal_code,country,registered_address_line1,registered_address_city,registered_address_state,registered_address_postal_code,registration_country,support_email",
      )
      .eq("id", input.businessId)
      .maybeSingle()
    if (error) throw error
    holderName = String(biz?.name ?? "").trim()
    address = formatBusinessAddress(biz as Record<string, unknown> | null)
    accountOpenedIso = isoDateFromInstant(biz?.created_at != null ? String(biz.created_at) : null)
    const { data: owner } = await admin
      .from("users")
      .select("email,full_name")
      .eq("id", input.userId)
      .maybeSingle()
    holderEmail = String(owner?.email ?? biz?.support_email ?? "").trim()
    holderFirstName = firstNameFromFullName(owner?.full_name) ?? null
  } else {
    const { data: user, error } = await admin
      .from("users")
      .select(
        "full_name,email,created_at,residence_country,kyc_address_street,kyc_address_city,kyc_address_state,kyc_address_post_code,kyc_address_country",
      )
      .eq("id", input.userId)
      .maybeSingle()
    if (error) throw error
    holderName = String(user?.full_name ?? "").trim()
    holderEmail = String(user?.email ?? "").trim()
    holderFirstName = firstNameFromFullName(user?.full_name) ?? null
    address = formatPersonalAddress(user as Record<string, unknown> | null)
    accountOpenedIso = isoDateFromInstant(user?.created_at != null ? String(user.created_at) : null)
  }

  const ledger = await loadCompletedLedgerRows(admin, input)
  const firstTxIso = ledger[0] ? isoDateFromInstant(String(ledger[0].occurred_at ?? ledger[0].created_at ?? "")) : null
  if (firstTxIso && (!accountOpenedIso || firstTxIso < accountOpenedIso)) {
    accountOpenedIso = firstTxIso
  }

  const clipped = clipPeriodToAccountOpen({
    fromIso: input.fromIso,
    toIso: input.toIso,
    accountOpenedIso,
    todayIso,
  })
  const bounds = periodBoundsUtc(clipped.fromIso, clipped.toIso)
  const periodStartMs = bounds.start.getTime()
  const periodEndMs = bounds.end.getTime()

  const senderHandles = await resolveMissingEasetagSenders(admin, ledger)
  const available = await readAvailable(admin, input)

  let moneyIn = 0
  let moneyOut = 0
  let netFromPeriodStart = 0
  const linesNewestFirst: AssembledStatement["lines"] = []

  for (const row of ledger) {
    const when = new Date(String(row.occurred_at ?? row.created_at ?? ""))
    if (Number.isNaN(when.getTime())) continue
    const ms = when.getTime()
    if (ms < periodStartMs) continue

    const signed =
      (String(row.direction ?? "").toLowerCase() === "in" ? 1 : -1) *
      impactInStatementCurrency(row, input.currency)
    netFromPeriodStart += signed

    if (ms > periodEndMs) continue

    if (signed > 0) moneyIn += signed
    else if (signed < 0) moneyOut += -signed

    const dateLabel = formatStatementCalendarDate(when.toISOString().slice(0, 10))
    const gid = transferGroupIdOf(row)
    const override = gid ? senderHandles.get(gid) ?? null : null
    const line = buildActivityLine(row, dateLabel, override)
    linesNewestFirst.push({
      date: line.dateLabel,
      type: line.type,
      details: line.details,
      moneyIn: line.moneyIn,
      moneyOut: line.moneyOut,
    })
  }

  linesNewestFirst.reverse()
  const opening = Math.round((available - netFromPeriodStart) * 100) / 100

  const va = await getVirtualAccountDisplayFromDb(admin, {
    currency: input.currency.toLowerCase() as "usd" | "eur",
    userId: input.businessId ? undefined : input.userId,
    businessId: input.businessId,
  })

  return {
    statementId: input.statementId,
    scope,
    currency: input.currency,
    timeZone,
    periodFrom: clipped.fromIso,
    periodTo: clipped.toIso,
    periodLabel: formatStatementPeriodLabel(clipped.fromIso, clipped.toIso),
    availableAsOf: now.toISOString(),
    availableAsOfLabel: formatAvailableAsOf(now, timeZone),
    holderName,
    holderEmail,
    holderFirstName,
    addressLabel: scope === "business" ? "Business Address" : "Residential Address",
    address,
    bank: bankFieldsFromVa(input.currency, va),
    opening,
    moneyIn: Math.round(moneyIn * 100) / 100,
    moneyOut: Math.round(moneyOut * 100) / 100,
    available,
    openingLabel: formatStatementMoney(opening, input.currency),
    moneyInLabel: formatStatementMoney(moneyIn, input.currency),
    moneyOutLabel: formatStatementMoney(moneyOut, input.currency),
    availableLabel: formatStatementMoney(available, input.currency),
    lines: linesNewestFirst,
  }
}
