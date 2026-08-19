"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import { fetchEasenetProfileByTag } from "@/lib/easenet-profile"
import { warmProfileImageUrl } from "@/lib/image-cache"
import {
  readEasenetPublicProfileCache,
  writeEasenetPublicProfileCache,
  type CachedEasenetPublicProfile,
} from "@/lib/easenet-public-profile-cache"
import type { PayeeAccountKind } from "@/lib/easner-brand"
import { isEasetagHandleValue } from "@easner/shared"
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
 * localStorage) so revisiting Settings /send pickers does not flash empty avatars; still
 * revalidates in the background when the row mounts.
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

  // Apply saved avatar from cache before paint (localStorage survives reloads; avoids Radix
  // avatar fallback flash when the initializer does not run again after SSR hydration).
  useLayoutEffect(() => {
    const propAvatar = String(avatarUrl || "").trim()
    if (propAvatar) {
      writeEasenetPublicProfileCache(easetag, {
        avatarUrl: propAvatar,
        fullName,
        accountKind: accountKind === "business" ? "business" : "personal",
      })
      warmProfileImageUrl(propAvatar)
      setRemote(null)
      return
    }

    const cached = readEasenetPublicProfileCache(easetag)
    if (cached) {
      warmProfileImageUrl(cached.avatarUrl)
      setRemote(cached)
    } else {
      setRemote(null)
    }
  }, [easetag, avatarUrl, fullName, accountKind])

  // Stale-while-revalidate: show cache/props instantly, always refresh from API in background.
  useEffect(() => {
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
      warmProfileImageUrl(next.avatarUrl)
      setRemote(next)
    })()
    return () => {
      cancelled = true
    }
  }, [easetag, avatarUrl, fullName, accountKind])

  const mergedAvatar = String(avatarUrl || "").trim() ? avatarUrl : remote?.avatarUrl ?? null
  const remoteName = String(remote?.fullName ?? "").trim()
  const propName = String(fullName ?? "").trim()
  const mergedName =
    remoteName ||
    (propName && !isEasetagHandleValue(propName, easetag) ? propName : "") ||
    propName
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
