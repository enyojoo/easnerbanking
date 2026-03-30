import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import type { Recipient } from '../types'

export type { Recipient }

export interface RecipientData {
  fullName: string
  accountNumber: string
  bankName: string
  currency: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  swiftBic?: string
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

export const recipientService = {
  async create(userId: string, recipientData: RecipientData): Promise<Recipient> {
    const row: Recipient = {
      id: newId(),
      user_id: userId,
      full_name: recipientData.fullName,
      account_number: recipientData.accountNumber,
      bank_name: recipientData.bankName,
      currency: recipientData.currency,
      routing_number: recipientData.routingNumber || undefined,
      sort_code: recipientData.sortCode || undefined,
      iban: recipientData.iban || undefined,
      swift_bic: recipientData.swiftBic || undefined,
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
          currency: recipientData.currency,
          routing_number: recipientData.routingNumber || null,
          sort_code: recipientData.sortCode || null,
          iban: recipientData.iban || null,
          swift_bic: recipientData.swiftBic || null,
          noah_external_account_id: recipientData.noahExternalAccountId || null,
        })
        .select()
        .single()

      if (error) throw error
      if (data) return data as Recipient
    } catch (e) {
      if (!isMissingTableError(e)) throw e
    }

    const list = await loadLocalRecipients(userId)
    list.unshift(row)
    await saveLocalRecipients(userId, list)
    return row
  },

  async getByUserId(userId: string): Promise<Recipient[]> {
    try {
      const { data, error } = await supabase
        .from('recipients')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as Recipient[]) || []
    } catch (e) {
      if (isMissingTableError(e)) {
        return loadLocalRecipients(userId)
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
      routingNumber?: string
      sortCode?: string
      iban?: string
      swiftBic?: string
    },
  ): Promise<Recipient> {
    const updateData: Record<string, unknown> = {}
    if (updates.fullName !== undefined) updateData.full_name = updates.fullName
    if (updates.accountNumber !== undefined) updateData.account_number = updates.accountNumber
    if (updates.bankName !== undefined) updateData.bank_name = updates.bankName
    if (updates.routingNumber !== undefined) updateData.routing_number = updates.routingNumber || null
    if (updates.sortCode !== undefined) updateData.sort_code = updates.sortCode || null
    if (updates.iban !== undefined) updateData.iban = updates.iban || null
    if (updates.swiftBic !== undefined) updateData.swift_bic = updates.swiftBic || null
    updateData.updated_at = now()

    try {
      const { data, error } = await supabase
        .from('recipients')
        .update(updateData)
        .eq('id', recipientId)
        .select()
        .single()

      if (error) throw error
      if (data) return data as Recipient
    } catch (e) {
      if (!isMissingTableError(e)) throw e
    }

    const list = await loadLocalRecipients(userId)
    const idx = list.findIndex((r) => r.id === recipientId)
    if (idx === -1) throw new Error('Recipient not found')
    list[idx] = { ...list[idx], ...updateData, updated_at: now() } as Recipient
    await saveLocalRecipients(userId, list)
    return list[idx]!
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
