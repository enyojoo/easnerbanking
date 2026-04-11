import { useEffect, useMemo, useState } from 'react'
import type { Recipient } from '../types'
import { fetchEasenetPublicProfileCached, type EasenetPublicProfile } from '../lib/easenetProfile'
import {
  isEasenetRecipientRecord,
  resolveRecipientEasetagForUi,
  shouldSkipEasenetPublicFetch,
} from '../lib/easenetRecipientUi'

export type HydratedEasenetProfile = {
  fullName: string
  easetag: string
  accountKind?: 'business' | 'personal' | null
  avatarUrl: string | null
}

/**
 * Merges saved recipient snapshot with live `/api/users/public-by-easetag` (same source as search preview):
 * business logo vs personal avatar, correct Business/Personal, display name.
 */
export function useEasenetRecipientHydration(recipient: Recipient | null | undefined): HydratedEasenetProfile {
  const tag = recipient ? resolveRecipientEasetagForUi(recipient) : ''
  const isEasenet = Boolean(recipient && isEasenetRecipientRecord(recipient))
  const [remote, setRemote] = useState<EasenetPublicProfile | null>(null)

  useEffect(() => {
    if (!isEasenet || !tag) {
      setRemote(null)
      return
    }
    if (recipient && shouldSkipEasenetPublicFetch(recipient)) {
      setRemote(null)
      return
    }
    let cancelled = false
    void fetchEasenetPublicProfileCached(tag).then((r) => {
      if (!cancelled) setRemote(r)
    })
    return () => {
      cancelled = true
    }
  }, [isEasenet, tag, recipient])

  return useMemo(() => {
    if (!recipient || !isEasenet || !tag) {
      return {
        fullName: recipient?.full_name ?? '',
        easetag: '',
        accountKind: undefined,
        avatarUrl: null,
      }
    }

    const localAvatar = recipient.payee_avatar_url?.trim() || null
    const storedKind = recipient.payee_account_kind

    if (remote?.found) {
      const remoteAvatar = remote.avatarUrl?.trim() || null
      return {
        fullName: remote.fullName.trim() || recipient.full_name,
        easetag: tag,
        accountKind: remote.accountKind,
        avatarUrl: remoteAvatar ?? localAvatar,
      }
    }

    return {
      fullName: recipient.full_name,
      easetag: tag,
      accountKind:
        storedKind === 'business' ? 'business' : storedKind === 'personal' ? 'personal' : undefined,
      avatarUrl: localAvatar,
    }
  }, [recipient, remote, isEasenet, tag])
}
