import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import type { Recipient } from '../types'

export type { Recipient }

export interface RecipientData {
  fullName: string
  accountNumber: string
  bankName: string
  currency: string
  phoneNumber?: string
  mobileProvider?: string
  walletNetwork?: string
  walletMemoTag?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  swiftBic?: string
  transferType?: "ACH" | "Wire"
  checkingOrSavings?: "checking" | "savings"
  addressLine1?: string
  noahExternalAccountId?: string
}

function isMissingTableError(e: unknown): boolean {
  const any = e as { code?: string; message?: string }
  return any?.code === 'PGRST205' || String(any?.message || '').includes('schema cache')
}

const LOCAL_KEY = (uid: string) => `easner_local_recipients_${uid}`

async function loadLocalRecipients(userId: string): Promise<Recipient[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as Recipient[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function saveLocalRecipients(userId: string, list: Recipient[]) {
  await AsyncStorage.setItem(LOCAL_KEY(userId), JSON.stringify(list))
}

function newId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function now() {
  return new Date().toISOString()
}

function normalizeRecipient(row: Recipient): Recipient {
  const bankName = row.bank_name || ''
  const mobileMatch = bankName.match(/^Mobile Money \((.*)\)$/i)
  const walletMatch = bankName.match(/^Wallet \((.*)\)$/i)
  const walletDescriptor = walletMatch?.[1] || ''
  const [asset, network] = walletDescriptor.includes('/')
    ? walletDescriptor.split('/')
    : [undefined, walletDescriptor || undefined]
  return {
    ...row,
    mobile_provider: row.mobile_provider || mobileMatch?.[1] || undefined,
    wallet_network: row.wallet_network || network || undefined,
    wallet_memo_tag: row.wallet_memo_tag || (walletMatch ? row.swift_bic || undefined : undefined),
    currency: row.currency || asset || row.currency,
  }
}

export const recipientService = {
  async create(userId: string, recipientData: RecipientData): Promise<Recipient> {
    const derivedSwiftBic = recipientData.swiftBic || recipientData.walletMemoTag
    const row: Recipient = {
      id: newId(),
      user_id: userId,
      full_name: recipientData.fullName,
      account_number: recipientData.accountNumber,
      bank_name: recipientData.bankName,
      phone_number: recipientData.phoneNumber || undefined,
      currency: recipientData.currency,
      routing_number: recipientData.routingNumber || undefined,
      sort_code: recipientData.sortCode || undefined,
      iban: recipientData.iban || undefined,
      swift_bic: derivedSwiftBic || undefined,
      transfer_type: recipientData.transferType || undefined,
      checking_or_savings: recipientData.checkingOrSavings || undefined,
      address_line1: recipientData.addressLine1 || undefined,
      mobile_provider: recipientData.mobileProvider || undefined,
      wallet_network: recipientData.walletNetwork || undefined,
      wallet_memo_tag: recipientData.walletMemoTag || undefined,
      noah_external_account_id: recipientData.noahExternalAccountId,
      created_at: now(),
      updated_at: now(),
    }

    try {
      const { data, error } = await supabase
        .from('recipients')
        .insert({
          user_id: userId,
          full_name: recipientData.fullName,
          account_number: recipientData.accountNumber,
          bank_name: recipientData.bankName,
          phone_number: recipientData.phoneNumber || null,
          currency: recipientData.currency,
          routing_number: recipientData.routingNumber || null,
          sort_code: recipientData.sortCode || null,
          iban: recipientData.iban || null,
          swift_bic: derivedSwiftBic || null,
          transfer_type: recipientData.transferType || null,
          checking_or_savings: recipientData.checkingOrSavings || null,
          address_line1: recipientData.addressLine1 || null,
          noah_external_account_id: recipientData.noahExternalAccountId || null,
        })
        .select()
        .single()

      if (error) throw error
      if (data) return normalizeRecipient(data as Recipient)
    } catch (e) {
      if (!isMissingTableError(e)) throw e
    }

    const list = await loadLocalRecipients(userId)
    list.unshift(row)
    await saveLocalRecipients(userId, list)
    return normalizeRecipient(row)
  },

  async getByUserId(userId: string): Promise<Recipient[]> {
    try {
      const { data, error } = await supabase
        .from('recipients')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return ((data as Recipient[]) || []).map(normalizeRecipient)
    } catch (e) {
      if (isMissingTableError(e)) {
        const localRows = await loadLocalRecipients(userId)
        return localRows.map(normalizeRecipient)
      }
      throw e
    }
  },

  async update(
    recipientId: string,
    userId: string,
    updates: {
      fullName?: string
      accountNumber?: string
      bankName?: string
      phoneNumber?: string
      mobileProvider?: string
      walletNetwork?: string
      walletMemoTag?: string
      routingNumber?: string
      sortCode?: string
      iban?: string
      swiftBic?: string
      transferType?: "ACH" | "Wire"
      checkingOrSavings?: "checking" | "savings"
      addressLine1?: string
    },
  ): Promise<Recipient> {
    const derivedSwiftBic = updates.swiftBic ?? updates.walletMemoTag
    const derivedBankName =
      updates.bankName !== undefined
        ? updates.bankName
        : updates.mobileProvider !== undefined
          ? `Mobile Money (${updates.mobileProvider})`
          : updates.walletNetwork !== undefined
            ? `Wallet (${updates.walletNetwork})`
            : undefined
    const updateData: Record<string, unknown> = {}
    if (updates.fullName !== undefined) updateData.full_name = updates.fullName
    if (updates.accountNumber !== undefined) updateData.account_number = updates.accountNumber
    if (derivedBankName !== undefined) updateData.bank_name = derivedBankName
    if (updates.phoneNumber !== undefined) updateData.phone_number = updates.phoneNumber || null
    if (updates.routingNumber !== undefined) updateData.routing_number = updates.routingNumber || null
    if (updates.sortCode !== undefined) updateData.sort_code = updates.sortCode || null
    if (updates.iban !== undefined) updateData.iban = updates.iban || null
    if (derivedSwiftBic !== undefined) updateData.swift_bic = derivedSwiftBic || null
    if (updates.mobileProvider !== undefined) updateData.mobile_provider = updates.mobileProvider || null
    if (updates.walletNetwork !== undefined) updateData.wallet_network = updates.walletNetwork || null
    if (updates.walletMemoTag !== undefined) updateData.wallet_memo_tag = updates.walletMemoTag || null
    if (updates.transferType !== undefined) updateData.transfer_type = updates.transferType || null
    if (updates.checkingOrSavings !== undefined) updateData.checking_or_savings = updates.checkingOrSavings || null
    if (updates.addressLine1 !== undefined) updateData.address_line1 = updates.addressLine1 || null
    updateData.updated_at = now()

    try {
      const { data, error } = await supabase
        .from('recipients')
        .update(updateData)
        .eq('id', recipientId)
        .select()
        .single()

      if (error) throw error
      if (data) return normalizeRecipient(data as Recipient)
    } catch (e) {
      if (!isMissingTableError(e)) throw e
    }

    const list = await loadLocalRecipients(userId)
    const idx = list.findIndex((r) => r.id === recipientId)
    if (idx === -1) throw new Error('Recipient not found')
    list[idx] = { ...list[idx], ...updateData, updated_at: now() } as Recipient
    await saveLocalRecipients(userId, list)
    return normalizeRecipient(list[idx]!)
  },

  async delete(recipientId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase.from('recipients').delete().eq('id', recipientId)
      if (error) throw error
      return
    } catch (e) {
      if (!isMissingTableError(e)) throw e
    }

    const list = (await loadLocalRecipients(userId)).filter((r) => r.id !== recipientId)
    await saveLocalRecipients(userId, list)
  },
}
