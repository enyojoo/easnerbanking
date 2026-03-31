"use client"

import { createSupabaseBrowser } from "@/lib/supabase/browser"
import type { Beneficiary } from "@/lib/mock-data"

type RecipientRow = {
  id: string
  user_id: string
  full_name: string
  account_number: string
  bank_name: string
  phone_number?: string | null
  currency: string
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
  swift_bic?: string | null
  transfer_type?: "ACH" | "Wire" | null
  checking_or_savings?: "checking" | "savings" | null
  address_line1?: string | null
  mobile_provider?: string | null
  wallet_network?: string | null
  wallet_memo_tag?: string | null
  created_at: string
  updated_at: string
}

export type RecipientUpsertInput = {
  recipientType: "bank" | "mobile" | "wallet"
  fullName: string
  accountNumber: string
  bankName: string
  currency: string
  phoneNumber?: string
  mobileProvider?: string
  walletAsset?: string
  walletNetwork?: string
  walletMemoTag?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  swiftBic?: string
  transferType?: "ACH" | "Wire"
  checkingOrSavings?: "checking" | "savings"
  addressLine1?: string
}

const countryByCurrency: Record<string, string> = {
  USD: "United States",
  GBP: "United Kingdom",
  EUR: "European Union",
}

export function toBeneficiary(row: RecipientRow): Beneficiary {
  const mobileMatch = row.bank_name.match(/^Mobile Money \((.*)\)$/i)
  const walletMatch = row.bank_name.match(/^Wallet \((.*)\)$/i)
  const walletDescriptor = walletMatch?.[1] || ""
  const [walletAssetFromLabel, walletNetworkFromLabel] = walletDescriptor.includes("/")
    ? walletDescriptor.split("/")
    : [undefined, walletDescriptor || undefined]
  return {
    id: row.id,
    name: row.full_name,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    fullAccountNumber: row.account_number,
    routingNumber: row.routing_number || undefined,
    iban: row.iban || undefined,
    bic: row.swift_bic || undefined,
    sortCode: row.sort_code || undefined,
    country: countryByCurrency[row.currency] || row.currency,
    currency: row.currency,
    email: "",
    phone: row.phone_number || "",
    createdAt: row.created_at,
    lastUsed: row.updated_at || row.created_at,
    transferType: row.transfer_type || undefined,
    checkingOrSavings: row.checking_or_savings || undefined,
    addressLine1: row.address_line1 || undefined,
    mobileProvider: row.mobile_provider || mobileMatch?.[1] || undefined,
    walletAsset: walletAssetFromLabel || undefined,
    walletNetwork: row.wallet_network || walletNetworkFromLabel || undefined,
    walletMemoTag: row.wallet_memo_tag || (walletMatch ? row.swift_bic || undefined : undefined),
  }
}

async function getSessionUserId(): Promise<string> {
  const supabase = createSupabaseBrowser()
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) throw new Error("User not authenticated")
  return userId
}

export async function listRecipients(): Promise<Beneficiary[]> {
  const supabase = createSupabaseBrowser()
  const userId = await getSessionUserId()
  const { data, error } = await supabase
    .from("recipients")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return ((data || []) as RecipientRow[]).map(toBeneficiary)
}

export async function createRecipient(input: RecipientUpsertInput): Promise<Beneficiary> {
  const supabase = createSupabaseBrowser()
  const userId = await getSessionUserId()
  const bankName =
    input.recipientType === "mobile" && input.mobileProvider
      ? `Mobile Money (${input.mobileProvider})`
      : input.recipientType === "wallet" && input.walletAsset && input.walletNetwork
        ? `Wallet (${input.walletAsset}/${input.walletNetwork})`
        : input.recipientType === "wallet" && input.walletNetwork
          ? `Wallet (${input.walletNetwork})`
          : input.bankName
  const payload = {
    user_id: userId,
    full_name: input.fullName,
    account_number: input.accountNumber,
    bank_name: bankName,
    phone_number: input.phoneNumber || null,
    currency: input.currency,
    routing_number: input.routingNumber || null,
    sort_code: input.sortCode || null,
    iban: input.iban || null,
    swift_bic: input.swiftBic || input.walletMemoTag || null,
    transfer_type: input.transferType || null,
    checking_or_savings: input.checkingOrSavings || null,
    address_line1: input.addressLine1 || null,
    mobile_provider: input.mobileProvider || null,
    wallet_network: input.walletNetwork || null,
    wallet_memo_tag: input.walletMemoTag || null,
  }
  const { data, error } = await supabase.from("recipients").insert(payload).select("*").single()
  if (error) throw error
  return toBeneficiary(data as RecipientRow)
}

export async function updateRecipient(recipientId: string, input: RecipientUpsertInput): Promise<Beneficiary> {
  const supabase = createSupabaseBrowser()
  const userId = await getSessionUserId()
  const bankName =
    input.recipientType === "mobile" && input.mobileProvider
      ? `Mobile Money (${input.mobileProvider})`
      : input.recipientType === "wallet" && input.walletAsset && input.walletNetwork
        ? `Wallet (${input.walletAsset}/${input.walletNetwork})`
        : input.recipientType === "wallet" && input.walletNetwork
          ? `Wallet (${input.walletNetwork})`
          : input.bankName
  const payload = {
    full_name: input.fullName,
    account_number: input.accountNumber,
    bank_name: bankName,
    phone_number: input.phoneNumber || null,
    currency: input.currency,
    routing_number: input.routingNumber || null,
    sort_code: input.sortCode || null,
    iban: input.iban || null,
    swift_bic: input.swiftBic || input.walletMemoTag || null,
    transfer_type: input.transferType || null,
    checking_or_savings: input.checkingOrSavings || null,
    address_line1: input.addressLine1 || null,
    mobile_provider: input.mobileProvider || null,
    wallet_network: input.walletNetwork || null,
    wallet_memo_tag: input.walletMemoTag || null,
  }
  const { data, error } = await supabase
    .from("recipients")
    .update(payload)
    .eq("id", recipientId)
    .eq("user_id", userId)
    .select("*")
    .single()
  if (error) throw error
  return toBeneficiary(data as RecipientRow)
}

export async function deleteRecipient(recipientId: string): Promise<void> {
  const supabase = createSupabaseBrowser()
  const userId = await getSessionUserId()
  const { error } = await supabase.from("recipients").delete().eq("id", recipientId).eq("user_id", userId)
  if (error) throw error
}
