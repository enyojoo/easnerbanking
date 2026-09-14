import type { SupabaseClient } from "@supabase/supabase-js"
import { persistBridgeVirtualAccount } from "./persist-virtual-accounts"
import { createBridgeVirtualAccount, listBridgeVirtualAccounts } from "./virtual-accounts"

export async function provisionBridgeVirtualAccounts(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  customerId: string
}): Promise<{ usd: boolean; eur: boolean }> {
  const customerId = input.customerId.trim()
  if (!customerId) return { usd: false, eur: false }

  const existing = await listBridgeVirtualAccounts(customerId).catch(() => [])
  const hasUsd = existing.some((va) => {
    const cur = String(va.source_deposit_instructions?.currency ?? va.destination?.currency ?? "").toLowerCase()
    return cur === "usd" || cur === "usdc"
  })
  const hasEur = existing.some((va) => {
    const cur = String(va.source_deposit_instructions?.currency ?? va.destination?.currency ?? "").toLowerCase()
    return cur === "eur" || cur === "eurc"
  })

  const created = [...existing]
  if (!hasUsd) {
    try {
      created.push(
        await createBridgeVirtualAccount({
          admin: input.admin,
          customerId,
          userId: input.userId,
          businessId: input.businessId,
          sourceCurrency: "usd",
          idempotencyKey: `bridge-va-usd:${input.businessId ?? input.userId}:${customerId}`,
        }),
      )
    } catch (error) {
      console.warn("[bridge] USD virtual account create failed", error)
    }
  }
  if (!hasEur) {
    try {
      created.push(
        await createBridgeVirtualAccount({
          admin: input.admin,
          customerId,
          userId: input.userId,
          businessId: input.businessId,
          sourceCurrency: "eur",
          idempotencyKey: `bridge-va-eur:${input.businessId ?? input.userId}:${customerId}`,
        }),
      )
    } catch (error) {
      console.warn("[bridge] EUR virtual account create failed", error)
    }
  }

  let usd = false
  let eur = false
  for (const account of created) {
    const ok = await persistBridgeVirtualAccount({
      admin: input.admin,
      userId: input.userId,
      businessId: input.businessId,
      customerId,
      account,
    })
    const cur = String(account.source_deposit_instructions?.currency ?? account.destination?.currency ?? "").toLowerCase()
    if (ok && (cur === "usd" || cur === "usdc")) usd = true
    if (ok && (cur === "eur" || cur === "eurc")) eur = true
  }
  return { usd, eur }
}
