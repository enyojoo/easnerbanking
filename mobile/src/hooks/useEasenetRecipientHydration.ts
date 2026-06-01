import { useLayoutEffect, useMemo, useState } from 'react'
import type { Recipient } from '../types'
import {
  fetchEasenetPublicProfileCached,
  peekEasenetPublicProfileMemory,
  type EasenetPublicProfile,
} from '../lib/easenetProfile'
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

function normEasetag(s: string | undefined): string {
  return String(s || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

/**
 * Merges saved recipient snapshot with live `/api/users/public-by-easetag` (same source as search preview):
 * business logo vs personal avatar, correct Business/Personal, display name.
 */
export function useEasenetRecipientHydration(recipient: Recipient | null | undefined): HydratedEasenetProfile {
  const tag = recipient ? resolveRecipientEasetagForUi(recipient) : ''
  const isEasenet = Boolean(recipient && isEasenetRecipientRecord(recipient))
  const shouldSkip = Boolean(recipient && shouldSkipEasenetPublicFetch(recipient))
  const recipientId = recipient?.id

  const [remote, setRemote] = useState<EasenetPublicProfile | null>(() => {
    if (!recipient || !isEasenetRecipientRecord(recipient)) return null
    const t = resolveRecipientEasetagForUi(recipient)
    if (!t || shouldSkipEasenetPublicFetch(recipient)) return null
    return peekEasenetPublicProfileMemory(t)
  })

  useLayoutEffect(() => {
    if (!isEasenet || !tag) {
      setRemote(null)
      return
    }
    if (shouldSkip) {
      setRemote(null)
      return
    }
    const mem = peekEasenetPublicProfileMemory(tag)
    if (mem) {
      setRemote(mem)
      return
    }
    let cancelled = false
    void fetchEasenetPublicProfileCached(tag).then((r) => {
      if (!cancelled) setRemote(r)
    })
    return () => {
      cancelled = true
    }
  }, [isEasenet, tag, shouldSkip, recipientId])

  return useMemo(() => {
    if (!recipient || !isEasenet || !tag) {
      return {
        fullName: recipient?.full_name ?? '',
        easetag: '',
        accountKind: undefined,
        avatarUrl: null,
      }
    }

    const remoteOk = remote?.found && normEasetag(remote.easetag) === tag

    if (remoteOk) {
      const remoteAvatar = remote.avatarUrl?.trim() || null
      return {
        fullName: remote.fullName.trim() || recipient.full_name,
        easetag: tag,
        accountKind: remote.accountKind,
        avatarUrl: remoteAvatar,
      }
    }

    return {
      fullName: recipient.full_name,
      easetag: tag,
      accountKind: undefined,
      avatarUrl: null,
    }
  }, [recipient, remote, isEasenet, tag])
}
