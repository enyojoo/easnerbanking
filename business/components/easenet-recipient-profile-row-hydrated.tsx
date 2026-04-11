"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import { fetchEasenetProfileByTag } from "@/lib/easenet-profile"
import {
  readEasenetPublicProfileCache,
  writeEasenetPublicProfileCache,
  type CachedEasenetPublicProfile,
} from "@/lib/easenet-public-profile-cache"
import type { PayeeAccountKind } from "@/lib/easner-brand"
import { EasenetRecipientProfileRow } from "@/components/easenet-recipient-profile-row"

type Props = {
  fullName: string
  easetag: string
  accountKind?: PayeeAccountKind | null
  avatarUrl?: string | null
  className?: string
  textColClassName?: string
  nameClassName?: string
  subtitleClassName?: string
  subtitleWrapperClassName?: string
}

/**
 * Fills missing Easetag avatars from the public API. Persists resolved profiles (memory +
 * sessionStorage) so revisiting Settings /send pickers does not refetch or flash empty avatars.
 */
export function EasenetRecipientProfileRowHydrated({
  fullName,
  easetag,
  accountKind,
  avatarUrl,
  className,
  textColClassName,
  nameClassName,
  subtitleClassName,
  subtitleWrapperClassName,
}: Props) {
  const [remote, setRemote] = useState<CachedEasenetPublicProfile | null>(null)

  // Apply saved avatar from cache before paint (sessionStorage survives reloads; avoids Radix
  // avatar fallback flash when the initializer does not run again after SSR hydration).
  useLayoutEffect(() => {
    const propAvatar = String(avatarUrl || "").trim()
    if (propAvatar) {
      writeEasenetPublicProfileCache(easetag, {
        avatarUrl: propAvatar,
        fullName,
        accountKind: accountKind === "business" ? "business" : "personal",
      })
      setRemote(null)
      return
    }

    const cached = readEasenetPublicProfileCache(easetag)
    if (cached) {
      setRemote(cached)
    } else {
      setRemote(null)
    }
  }, [easetag, avatarUrl, fullName, accountKind])

  useEffect(() => {
    const propAvatar = String(avatarUrl || "").trim()
    if (propAvatar) return

    const cached = readEasenetPublicProfileCache(easetag)
    if (cached && String(cached.avatarUrl || "").trim()) return

    let cancelled = false
    void (async () => {
      const res = await fetchEasenetProfileByTag(easetag)
      if (cancelled || !res.found) return
      const next: CachedEasenetPublicProfile = {
        avatarUrl: res.avatarUrl,
        fullName: res.fullName,
        accountKind: res.accountKind,
      }
      writeEasenetPublicProfileCache(easetag, next)
      setRemote(next)
    })()
    return () => {
      cancelled = true
    }
  }, [easetag, avatarUrl])

  const mergedAvatar = String(avatarUrl || "").trim() ? avatarUrl : remote?.avatarUrl ?? null
  const mergedName = fullName
  const mergedKind = accountKind ?? remote?.accountKind

  return (
    <EasenetRecipientProfileRow
      fullName={mergedName}
      easetag={easetag}
      accountKind={mergedKind}
      avatarUrl={mergedAvatar}
      className={className}
      textColClassName={textColClassName}
      nameClassName={nameClassName}
      subtitleClassName={subtitleClassName}
      subtitleWrapperClassName={subtitleWrapperClassName}
    />
  )
}
