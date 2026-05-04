"use client"

import Intercom, { shutdown, update } from "@intercom/messenger-js-sdk"
import * as React from "react"
import type { User } from "@supabase/supabase-js"
import { useAuth } from "@/lib/auth-context"

type IntercomRegion = "us" | "eu" | "ap"

function parseIntercomRegion(raw: string | undefined): IntercomRegion {
  const r = (raw ?? "us").trim().toLowerCase()
  if (r === "eu") return "eu"
  if (r === "ap" || r === "au") return "ap"
  return "us"
}

function displayNameFromUser(user: User): string | undefined {
  const meta = user.user_metadata as Record<string, unknown> | undefined
  if (typeof meta?.name === "string") {
    const n = meta.name.trim()
    if (n) return n
  }
  const first = typeof meta?.first_name === "string" ? meta.first_name : ""
  const last = typeof meta?.last_name === "string" ? meta.last_name : ""
  const joined = [first, last].filter(Boolean).join(" ").trim()
  return joined || undefined
}

function createdAtUnixSeconds(user: User): number | undefined {
  const c = user.created_at
  if (!c) return undefined
  const ms = Date.parse(c)
  if (Number.isNaN(ms)) return undefined
  return Math.floor(ms / 1000)
}

function intercomAppIdFromEnv(): string {
  return (
    process.env.NEXT_PUBLIC_INTERCOM_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_INTERCOM_APPID?.trim() ||
    ""
  )
}

/**
 * Intercom Messenger for signed-in business users (client-only).
 * Matches the official pattern: https://www.intercom.com/help/en/articles/167-use-the-messenger
 *
 * Requires `NEXT_PUBLIC_INTERCOM_APP_ID` in the **build** environment (Vercel
 * → same name for Production and Preview). Without it, the script never loads.
 */
export function BusinessIntercom() {
  const { user, isLoading } = useAuth()
  const appId = React.useMemo(() => intercomAppIdFromEnv(), [])
  const region = React.useMemo(
    () => parseIntercomRegion(process.env.NEXT_PUBLIC_INTERCOM_REGION),
    [],
  )

  const name = React.useMemo(() => (user ? displayNameFromUser(user) : undefined), [user])

  const prevUserIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (typeof window === "undefined") return

    if (!appId) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[Intercom] Missing NEXT_PUBLIC_INTERCOM_APP_ID — add it to business/.env.local and Vercel env, then redeploy.",
        )
      }
      return
    }

    if (isLoading) return

    if (!user) {
      shutdown()
      prevUserIdRef.current = null
      return
    }

    const createdAt = createdAtUnixSeconds(user)
    const payload = {
      user_id: user.id,
      email: user.email ?? undefined,
      ...(name ? { name } : {}),
      ...(createdAt !== undefined ? { created_at: createdAt } : {}),
    }

    // Same user: attribute updates only.
    if (prevUserIdRef.current === user.id) {
      update(payload)
      return
    }

    // Different user or first login: full initializer (official SDK export).
    if (prevUserIdRef.current) {
      shutdown()
    }
    prevUserIdRef.current = user.id

    Intercom({
      app_id: appId,
      region,
      ...payload,
    })
  }, [appId, region, user, isLoading, name])

  return null
}
