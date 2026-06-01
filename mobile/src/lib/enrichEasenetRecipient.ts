import type { PayeeAccountKind } from './easnerBrand'
import { peekEasenetPublicProfileMemory, primeEasenetPublicProfileCache } from './easenetProfile'
import { isEasenetRecipientRecord, resolveRecipientEasetagForUi } from './easenetRecipientUi'
import type { Recipient } from '../types'

/** Client-only Easetag snapshot (not stored on `recipients` in Supabase). */
export type EasenetRecipientSnapshot = {
  easetag: string
  fullName: string
  avatarUrl?: string | null
  accountKind?: PayeeAccountKind | null
}

/** Merge in-memory / disk Easenet public profile cache onto a recipient row. */
export function enrichEasenetRecipientFromCache(row: Recipient): Recipient {
  if (!isEasenetRecipientRecord(row)) return row
  const tag = resolveRecipientEasetagForUi(row)
  if (!tag) return row

  const cached = peekEasenetPublicProfileMemory(tag)
  const payee_easetag = tag
  const payee_avatar_url =
    row.payee_avatar_url || (cached?.found ? cached.avatarUrl ?? undefined : undefined)
  const payee_account_kind =
    row.payee_account_kind ||
    (cached?.found ? cached.accountKind : undefined)
  const full_name =
    String(row.full_name || '').trim() ||
    (cached?.found ? cached.fullName : row.full_name)

  if (
    payee_easetag === row.payee_easetag &&
    payee_avatar_url === row.payee_avatar_url &&
    payee_account_kind === row.payee_account_kind &&
    full_name === row.full_name
  ) {
    return row
  }

  return {
    ...row,
    payee_easetag,
    payee_avatar_url,
    payee_account_kind,
    full_name,
  }
}

export async function primeAndAttachEasenetSnapshot(
  recipient: Recipient,
  snapshot: EasenetRecipientSnapshot,
): Promise<Recipient> {
  const tag = String(snapshot.easetag || '').trim().replace(/^@+/, '').toLowerCase()
  if (!tag) return recipient
  const accountKind: PayeeAccountKind =
    snapshot.accountKind === 'business' ? 'business' : 'personal'
  await primeEasenetPublicProfileCache(tag, {
    fullName: snapshot.fullName,
    avatarUrl: snapshot.avatarUrl ?? null,
    accountKind,
  })
  return enrichEasenetRecipientFromCache({
    ...recipient,
    payee_easetag: tag,
    payee_avatar_url: snapshot.avatarUrl ?? undefined,
    payee_account_kind: accountKind,
    full_name: snapshot.fullName.trim() || recipient.full_name,
  })
}
