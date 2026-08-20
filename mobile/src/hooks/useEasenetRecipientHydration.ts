import { useLayoutEffect, useMemo, useState } from 'react'
import type { Recipient } from '../types'
import {
  fetchEasenetPublicProfileCached,
  peekEasenetPublicProfileMemory,
  subscribeEasenetPublicProfile,
  type EasenetPublicProfile,
} from '../lib/easenetProfile'
import { isEasenetRecipientRecord, resolveRecipientEasetagForUi } from '../lib/easenetRecipientUi'

export type HydratedEasenetProfile = {
  fullName: string
  easetag: string
  accountKind?: 'business' | 'personal' | null
  avatarUrl: string | null
}

function normEasetag(s: string | undefined): string {
  return String(s || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

/**
 * Merges saved recipient snapshot with live `/api/users/public-by-easetag` (same source as search preview):
 * business logo vs personal avatar, correct Business/Personal, display name.
 * Uses stale-while-revalidate – cached avatar/kind render instantly, network refresh updates in place.
 */
export function useEasenetRecipientHydration(recipient: Recipient | null | undefined): HydratedEasenetProfile {
  const tag = recipient ? resolveRecipientEasetagForUi(recipient) : ''
  const isEasenet = Boolean(recipient && isEasenetRecipientRecord(recipient))
  const recipientId = recipient?.id

  const [remote, setRemote] = useState<EasenetPublicProfile | null>(() => {
    if (!recipient || !isEasenetRecipientRecord(recipient)) return null
    const t = resolveRecipientEasetagForUi(recipient)
    if (!t) return null
    return peekEasenetPublicProfileMemory(t)
  })

  useLayoutEffect(() => {
    if (!isEasenet || !tag) {
      setRemote(null)
      return
    }

    const mem = peekEasenetPublicProfileMemory(tag)
    if (mem) setRemote(mem)

    const unsub = subscribeEasenetPublicProfile(tag, (profile) => {
      setRemote(profile)
    })

    let cancelled = false
    void fetchEasenetPublicProfileCached(tag).then((profile) => {
      if (!cancelled) setRemote(profile)
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [isEasenet, tag, recipientId])

  return useMemo(() => {
    if (!recipient || !isEasenet || !tag) {
      return {
        fullName: recipient?.full_name ?? '',
        easetag: '',
        accountKind: undefined,
        avatarUrl: null,
      }
    }

    const dbName = String(recipient.full_name || '').trim()
    const localAvatar = recipient.payee_avatar_url?.trim() || null
    const storedKind = recipient.payee_account_kind

    const remoteOk = remote?.found && normEasetag(remote.easetag) === tag

    if (remoteOk) {
      const remoteAvatar = remote.avatarUrl?.trim() || null
      return {
        fullName: dbName || remote.fullName.trim() || tag,
        easetag: tag,
        accountKind: remote.accountKind,
        avatarUrl: remoteAvatar ?? localAvatar,
      }
    }

    return {
      fullName: dbName || tag,
      easetag: tag,
      accountKind:
        storedKind === 'business' ? 'business' : storedKind === 'personal' ? 'personal' : undefined,
      avatarUrl: localAvatar,
    }
  }, [recipient, remote, isEasenet, tag])
}
