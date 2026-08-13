import AsyncStorage from '@react-native-async-storage/async-storage'
import { countryCodeForRecipientSave } from '@easner/shared'
import { supabase } from './supabase'
import { enrichEasenetRecipientFromCache, primeAndAttachEasenetSnapshot } from './enrichEasenetRecipient'
import { isEasenetRecipientRecord, resolveRecipientEasetagForUi } from './easenetRecipientUi'
import { buildRecipientInsertPayload, applyCadRoutingToRecipientMetadata } from './recipientPersistPayload'
import { mergeRecipientProviderBindings } from './recipientCatalog'
import type { Recipient } from '../types'

export type { Recipient }

export interface RecipientData {
  fullName: string
  accountNumber: string
  bankName: string
  currency: string
  countryCode?: string
  phoneNumber?: string
  email?: string
  mobileProvider?: string
  walletNetwork?: string
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
  metadata?: Record<string, unknown> | null
  /** Client-only Easenet snapshot — not written to Supabase. */
  payeeAvatarUrl?: string | null
  payeeAccountKind?: 'personal' | 'business'
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

/** Enrich list rows: Easetag tag from bank_name; wallet network from label when missing. */
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
  const payee_easetag = resolveRecipientEasetagForUi(row) || undefined
  return enrichEasenetRecipientFromCache({
    ...row,
    bank_name: mobileParsed.normalizedBankName || bankName,
    country_code: row.country_code || mobileParsed.countryCode || undefined,
    mobile_provider: row.mobile_provider || mobileMatch?.[1] || undefined,
    wallet_network: row.wallet_network || network || undefined,
    currency: (isWallet ? asset || row.currency : row.currency) || row.currency,
    payee_easetag,
  })
}

async function enrichEasenetAfterMutate(
  recipient: Recipient,
  snapshot: {
    fullName: string
    payeeAvatarUrl?: string | null
    payeeAccountKind?: 'personal' | 'business'
  },
): Promise<Recipient> {
  const normalized = normalizeRecipient(recipient)
  const tag = resolveRecipientEasetagForUi(normalized)
  if (!tag || !isEasenetRecipientRecord(normalized)) return normalized
  if (snapshot.payeeAccountKind !== 'business' && snapshot.payeeAccountKind !== 'personal') {
    return normalized
  }
  return primeAndAttachEasenetSnapshot(normalized, {
    easetag: tag,
    fullName: snapshot.fullName,
    avatarUrl: snapshot.payeeAvatarUrl,
    accountKind: snapshot.payeeAccountKind,
  })
}

export const recipientService = {
  async create(userId: string, recipientData: RecipientData): Promise<Recipient> {
    const bankNameForPersist = recipientData.mobileProvider
      ? buildMobileBankName(recipientData.mobileProvider, recipientData.countryCode)
      : recipientData.bankName
    const countryCode = countryCodeForRecipientSave({
      countryCode: recipientData.countryCode,
      currencyCode: recipientData.currency,
    })
    const row: Recipient = {
      id: newId(),
      user_id: userId,
      full_name: recipientData.fullName,
      account_number: recipientData.accountNumber,
      bank_name: bankNameForPersist,
      phone_number: recipientData.phoneNumber || undefined,
      email: recipientData.email || undefined,
      currency: recipientData.currency,
      country_code: countryCode || undefined,
      routing_number: recipientData.routingNumber || undefined,
      sort_code: recipientData.sortCode || undefined,
      iban: recipientData.iban || undefined,
      swift_bic: recipientData.swiftBic || undefined,
      transfer_type: recipientData.transferType || undefined,
      checking_or_savings: recipientData.checkingOrSavings || undefined,
      address_line1: recipientData.addressLine1 || undefined,
      city: recipientData.city || undefined,
      state: recipientData.state || undefined,
      postal_code: recipientData.postalCode || undefined,
      mobile_provider: recipientData.mobileProvider || undefined,
      wallet_network: recipientData.walletNetwork || undefined,
      created_at: now(),
      updated_at: now(),
    }

    try {
      const payload = buildRecipientInsertPayload(
        userId,
        recipientData,
        bankNameForPersist,
        recipientData.swiftBic,
        countryCode,
      )
      const { data, error } = await supabase
        .from('recipients')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      if (data) {
        return enrichEasenetAfterMutate(data as Recipient, {
          fullName: recipientData.fullName,
          payeeAvatarUrl: recipientData.payeeAvatarUrl,
          payeeAccountKind: recipientData.payeeAccountKind,
        })
      }
    } catch (e) {
      if (!isMissingTableError(e)) throw e
    }

    const list = await loadLocalRecipients(userId)
    const enriched = await enrichEasenetAfterMutate(row, {
      fullName: recipientData.fullName,
      payeeAvatarUrl: recipientData.payeeAvatarUrl,
      payeeAccountKind: recipientData.payeeAccountKind,
    })
    list.unshift(enriched)
    await saveLocalRecipients(userId, list)
    return enriched
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
      email?: string
      mobileProvider?: string
      countryCode?: string
      walletNetwork?: string
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
  metadata?: Record<string, unknown> | null
  /** Client-only Easenet snapshot — not written to Supabase. */
      payeeAvatarUrl?: string | null
      payeeAccountKind?: 'personal' | 'business'
    },
  ): Promise<Recipient> {
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
    if (updates.email !== undefined) updateData.email = updates.email || null
    if (updates.routingNumber !== undefined) updateData.routing_number = updates.routingNumber || null
    if (updates.sortCode !== undefined) updateData.sort_code = updates.sortCode || null
    if (updates.iban !== undefined) updateData.iban = updates.iban || null
    if (updates.swiftBic !== undefined) updateData.swift_bic = updates.swiftBic || null
    if (updates.mobileProvider !== undefined) updateData.mobile_provider = updates.mobileProvider || null
    if (updates.walletNetwork !== undefined) updateData.wallet_network = updates.walletNetwork || null
    if (updates.countryCode !== undefined) {
      updateData.country_code = String(updates.countryCode || '').trim().toUpperCase() || null
    }
    if (updates.transferType !== undefined) updateData.transfer_type = updates.transferType || null
    if (updates.checkingOrSavings !== undefined) updateData.checking_or_savings = updates.checkingOrSavings || null
    if (updates.addressLine1 !== undefined) updateData.address_line1 = updates.addressLine1 || null
    if (updates.city !== undefined) updateData.city = updates.city || null
    if (updates.state !== undefined) updateData.state = updates.state || null
    if (updates.postalCode !== undefined) updateData.postal_code = updates.postalCode || null
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata
    updateData.updated_at = now()

    const mergedCountry =
      updates.countryCode !== undefined
        ? String(updates.countryCode || '').trim().toUpperCase()
        : undefined
    const mergedBank =
      derivedBankName !== undefined ? derivedBankName : undefined
    const mergedMobile =
      updates.mobileProvider !== undefined ? updates.mobileProvider : undefined

    try {
      const { data: existingRow } = await supabase
        .from('recipients')
        .select('country_code,currency,bank_name,mobile_provider,metadata,routing_number,sort_code')
        .eq('id', recipientId)
        .maybeSingle()

      const cc = mergedCountry ?? String(existingRow?.country_code ?? '').trim().toUpperCase()
      const cur = String(existingRow?.currency ?? '').trim().toUpperCase()
      const bankName = mergedBank ?? String(existingRow?.bank_name ?? '')
      const mobileProvider = mergedMobile ?? String(existingRow?.mobile_provider ?? '')
      const rail = mobileProvider ? ('mobile_money' as const) : ('bank_transfer' as const)
      if (cc && cur && (bankName || mobileProvider)) {
        updateData.metadata = applyCadRoutingToRecipientMetadata({
          countryCode: cc,
          currency: cur,
          routingNumber:
            updates.routingNumber !== undefined
              ? updates.routingNumber
              : (existingRow as { routing_number?: string } | null)?.routing_number,
          sortCode:
            updates.sortCode !== undefined
              ? updates.sortCode
              : (existingRow as { sort_code?: string } | null)?.sort_code,
          metadata: mergeRecipientProviderBindings({
            countryCode: cc,
            currencyCode: cur,
            rail,
            bankName,
            mobileProvider: mobileProvider || null,
            metadata: (updateData.metadata as Record<string, unknown> | undefined) ??
              (existingRow?.metadata as Record<string, unknown> | undefined) ??
              {},
          }),
        })
      }
    } catch {
      // best-effort binding refresh on update
    }

    try {
      const { data, error } = await supabase
        .from('recipients')
        .update(updateData)
        .eq('id', recipientId)
        .select()
        .single()

      if (error) throw error
      if (data) {
        return enrichEasenetAfterMutate(data as Recipient, {
          fullName: String(updates.fullName ?? (data as Recipient).full_name ?? ''),
          payeeAvatarUrl: updates.payeeAvatarUrl,
          payeeAccountKind: updates.payeeAccountKind,
        })
      }
    } catch (e) {
      if (isMissingColumnError(e)) {
        const fallback = { ...updateData }
        const { data, error } = await supabase
          .from('recipients')
          .update(fallback)
          .eq('id', recipientId)
          .select()
          .single()
        if (!error && data) {
          return enrichEasenetAfterMutate(data as Recipient, {
            fullName: String(updates.fullName ?? (data as Recipient).full_name ?? ''),
            payeeAvatarUrl: updates.payeeAvatarUrl,
            payeeAccountKind: updates.payeeAccountKind,
          })
        }
        if (error) throw error
      }
      if (!isMissingTableError(e)) throw e
    }

    const list = await loadLocalRecipients(userId)
    const idx = list.findIndex((r) => r.id === recipientId)
    if (idx === -1) throw new Error('Recipient not found')
    list[idx] = { ...list[idx], ...updateData, updated_at: now() } as Recipient
    await saveLocalRecipients(userId, list)
    return enrichEasenetAfterMutate(list[idx]!, {
      fullName: String(updates.fullName ?? list[idx]!.full_name ?? ''),
      payeeAvatarUrl: updates.payeeAvatarUrl,
      payeeAccountKind: updates.payeeAccountKind,
    })
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
