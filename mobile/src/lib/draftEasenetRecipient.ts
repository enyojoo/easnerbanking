import type { Recipient } from '../types'
import type { PayeeAccountKind } from './easnerBrand'

/** Prefix for Easetag (P2P) recipients selected from hub search before DB persist. */
export const DRAFT_EASENET_ID_PREFIX = 'draft_easenet:'

export function isDraftEasenetRecipient(id: string): boolean {
  return String(id || '').startsWith(DRAFT_EASENET_ID_PREFIX)
}

export function buildDraftEasenetRecipient(params: {
  easetag: string
  fullName: string
  avatarUrl: string | null
  userId: string
  accountKind?: PayeeAccountKind | null
}): Recipient {
  const tag = params.easetag.trim().replace(/^@+/, '').toLowerCase()
  const id = `${DRAFT_EASENET_ID_PREFIX}${tag}`
  const now = new Date().toISOString()
  const accountKind = params.accountKind === 'business' ? 'business' : 'personal'
  return {
    id,
    user_id: params.userId,
    full_name: params.fullName.trim() || tag,
    account_number: tag,
    bank_name: `Easetag (@${tag})`,
    currency: 'USD',
    country_code: 'US',
    payee_easetag: tag,
    payee_avatar_url: params.avatarUrl ?? undefined,
    payee_account_kind: accountKind,
    created_at: now,
    updated_at: now,
  }
}
