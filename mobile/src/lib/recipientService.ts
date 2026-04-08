import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import type { Recipient } from '../types'

export type { Recipient }

export interface RecipientData {
  fullName: string
  accountNumber: string
  bankName: string
  currency: string
  countryCode?: string
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
  city?: string
  state?: string
  postalCode?: string
  payeeEasetag?: string
  payeeAvatarUrl?: string | null
  payeeAccountKind?: 'personal' | 'business'
  noahExternalAccountId?: string
}

function isMissingTableError(e: unknown): boolean {
  const any = e as { code?: string; message?: string }
  return any?.code === 'PGRST205' || String(any?.message || '').includes('schema cache')
}

function isMissingColumnError(e: unknown): boolean {
  const any = e as { code?: string; message?: string; details?: string }
  const text = `${any?.message || ''} ${any?.details || ''}`.toLowerCase()
  return any?.code === '42703' || text.includes('column') || text.includes('schema cache')
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

function buildMobileBankName(provider: string, countryCode?: string) {
  const cleanProvider = String(provider || '').trim()
  const cc = String(countryCode || '').trim().toUpperCase()
  if (!cleanProvider) return 'Mobile Money'
  if (!cc) return `Mobile Money (${cleanProvider})`
  return `Mobile Money (${cleanProvider}|CC:${cc})`
}

function parseMobileBankName(bankName: string): { provider?: string; countryCode?: string; normalizedBankName: string } {
  const match = String(bankName || '').match(/^Mobile Money \((.*)\)$/i)
  if (!match) return { normalizedBankName: bankName }
  const inner = match[1] || ''
  const ccIdx = inner.lastIndexOf('|CC:')
  if (ccIdx < 0) {
    const provider = inner.trim()
    return { provider, normalizedBankName: `Mobile Money (${provider})` }
  }
  const provider = inner.slice(0, ccIdx).trim()
  const countryCode = inner.slice(ccIdx + 4).trim().toUpperCase()
  return {
    provider,
    countryCode: countryCode || undefined,
    normalizedBankName: `Mobile Money (${provider})`,
  }
}

function normalizeRecipient(row: Recipient): Recipient {
  const bankName = row.bank_name || ''
  const mobileParsed = parseMobileBankName(bankName)
  const mobileMatch = mobileParsed.provider ? [undefined, mobileParsed.provider] : bankName.match(/^Mobile Money \((.*)\)$/i)
  const walletMatch = bankName.match(/^Wallet \((.*)\)$/i)
  const walletDescriptor = walletMatch?.[1] || ''
  const [asset, network] = walletDescriptor.includes('/')
    ? walletDescriptor.split('/')
    : [undefined, walletDescriptor || undefined]
  const isWallet = Boolean(walletMatch)
  return {
    ...row,
    bank_name: mobileParsed.normalizedBankName || bankName,
    country_code: row.country_code || mobileParsed.countryCode || undefined,
    mobile_provider: row.mobile_provider || mobileMatch?.[1] || undefined,
    wallet_network: row.wallet_network || network || undefined,
    wallet_memo_tag: row.wallet_memo_tag || (walletMatch ? row.swift_bic || undefined : undefined),
    // For legacy wallet rows, bank_name may be the only source of truth for asset/network.
    currency: (isWallet ? asset || row.currency : row.currency) || row.currency,
  }
}

export const recipientService = {
  async create(userId: string, recipientData: RecipientData): Promise<Recipient> {
    const derivedSwiftBic = recipientData.swiftBic || recipientData.walletMemoTag
    const bankNameForPersist = recipientData.mobileProvider
      ? buildMobileBankName(recipientData.mobileProvider, recipientData.countryCode)
      : recipientData.bankName
    const row: Recipient = {
      id: newId(),
      user_id: userId,
      full_name: recipientData.fullName,
      account_number: recipientData.accountNumber,
      bank_name: bankNameForPersist,
      phone_number: recipientData.phoneNumber || undefined,
      currency: recipientData.currency,
      country_code: recipientData.countryCode || undefined,
      routing_number: recipientData.routingNumber || undefined,
      sort_code: recipientData.sortCode || undefined,
      iban: recipientData.iban || undefined,
      swift_bic: derivedSwiftBic || undefined,
      transfer_type: recipientData.transferType || undefined,
      checking_or_savings: recipientData.checkingOrSavings || undefined,
      address_line1: recipientData.addressLine1 || undefined,
      city: recipientData.city || undefined,
      state: recipientData.state || undefined,
      postal_code: recipientData.postalCode || undefined,
      payee_easetag: recipientData.payeeEasetag || undefined,
      payee_avatar_url: recipientData.payeeAvatarUrl || undefined,
      payee_account_kind: recipientData.payeeAccountKind || undefined,
      mobile_provider: recipientData.mobileProvider || undefined,
      wallet_network: recipientData.walletNetwork || undefined,
      wallet_memo_tag: recipientData.walletMemoTag || undefined,
      noah_external_account_id: recipientData.noahExternalAccountId,
      created_at: now(),
      updated_at: now(),
    }

    try {
      const payload = {
          user_id: userId,
          full_name: recipientData.fullName,
          account_number: recipientData.accountNumber,
          bank_name: bankNameForPersist,
          phone_number: recipientData.phoneNumber || null,
          currency: recipientData.currency,
          country_code: recipientData.countryCode || null,
          routing_number: recipientData.routingNumber || null,
          sort_code: recipientData.sortCode || null,
          iban: recipientData.iban || null,
          swift_bic: derivedSwiftBic || null,
          transfer_type: recipientData.transferType || null,
          checking_or_savings: recipientData.checkingOrSavings || null,
          address_line1: recipientData.addressLine1 || null,
          city: recipientData.city || null,
          state: recipientData.state || null,
          postal_code: recipientData.postalCode || null,
          payee_easetag: recipientData.payeeEasetag || null,
          payee_avatar_url: recipientData.payeeAvatarUrl ?? null,
          payee_account_kind: recipientData.payeeAccountKind || null,
          noah_external_account_id: recipientData.noahExternalAccountId || null,
        }
      const { data, error } = await supabase
        .from('recipients')
        .insert(payload)
        .select()
        .single()

      if (error) throw error
      if (data) return normalizeRecipient(data as Recipient)
    } catch (e) {
      if (isMissingColumnError(e)) {
        const payload = {
          user_id: userId,
          full_name: recipientData.fullName,
          account_number: recipientData.accountNumber,
          bank_name: bankNameForPersist,
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
        }
        const { data, error } = await supabase.from('recipients').insert(payload).select().single()
        if (!error && data) return normalizeRecipient(data as Recipient)
        if (error) throw error
      }
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
      countryCode?: string
      walletNetwork?: string
      walletMemoTag?: string
      routingNumber?: string
      sortCode?: string
      iban?: string
      swiftBic?: string
      transferType?: "ACH" | "Wire"
      checkingOrSavings?: "checking" | "savings"
      addressLine1?: string
      city?: string
      state?: string
      postalCode?: string
      payeeEasetag?: string
      payeeAvatarUrl?: string | null
      payeeAccountKind?: 'personal' | 'business'
    },
  ): Promise<Recipient> {
    const derivedSwiftBic = updates.swiftBic ?? updates.walletMemoTag
    const derivedBankName =
      updates.bankName !== undefined
        ? updates.bankName
        : updates.mobileProvider !== undefined
          ? buildMobileBankName(updates.mobileProvider, updates.countryCode)
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
    if (updates.countryCode !== undefined) updateData.country_code = updates.countryCode || null
    if (updates.transferType !== undefined) updateData.transfer_type = updates.transferType || null
    if (updates.checkingOrSavings !== undefined) updateData.checking_or_savings = updates.checkingOrSavings || null
    if (updates.addressLine1 !== undefined) updateData.address_line1 = updates.addressLine1 || null
    if (updates.city !== undefined) updateData.city = updates.city || null
    if (updates.state !== undefined) updateData.state = updates.state || null
    if (updates.postalCode !== undefined) updateData.postal_code = updates.postalCode || null
    if (updates.payeeEasetag !== undefined) updateData.payee_easetag = updates.payeeEasetag || null
    if (updates.payeeAvatarUrl !== undefined) updateData.payee_avatar_url = updates.payeeAvatarUrl ?? null
    if (updates.payeeAccountKind !== undefined) updateData.payee_account_kind = updates.payeeAccountKind || null
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
      if (isMissingColumnError(e)) {
        const fallback = { ...updateData }
        delete fallback.country_code
        delete fallback.payee_account_kind
        const { data, error } = await supabase
          .from('recipients')
          .update(fallback)
          .eq('id', recipientId)
          .select()
          .single()
        if (!error && data) return normalizeRecipient(data as Recipient)
        if (error) throw error
      }
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
