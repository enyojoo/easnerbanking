"use client"

import { useEffect } from "react"
import { fetchEasenetProfileByTag } from "@/lib/easenet-profile"
import { writeEasenetPublicProfileCache } from "@/lib/easenet-public-profile-cache"
import { useEasenetPublicProfileCacheSnapshot } from "@/hooks/use-easenet-public-profile-cache-snapshot"
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
 * Fills missing Easetag avatars from the public API. Uses memory + localStorage cache so repeat
 * visits to Settings /send pickers show avatars immediately without waiting on the network.
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
  const cached = useEasenetPublicProfileCacheSnapshot(easetag)

  useEffect(() => {
    const propAvatar = String(avatarUrl || "").trim()
    if (propAvatar) {
      writeEasenetPublicProfileCache(easetag, {
        avatarUrl: propAvatar,
        fullName,
        accountKind: accountKind === "business" ? "business" : "personal",
      })
      return
    }

    if (cached && String(cached.avatarUrl || "").trim()) {
      return
    }

    let cancelled = false
    void (async () => {
      const res = await fetchEasenetProfileByTag(easetag)
      if (cancelled || !res.found) return
      writeEasenetPublicProfileCache(easetag, {
        avatarUrl: res.avatarUrl,
        fullName: res.fullName,
        accountKind: res.accountKind,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [easetag, avatarUrl, fullName, accountKind, cached])

  const mergedAvatar = String(avatarUrl || "").trim() ? avatarUrl : cached?.avatarUrl ?? null
  const mergedName = fullName
  const mergedKind = accountKind ?? cached?.accountKind

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
