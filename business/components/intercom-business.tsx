"use client"

import Intercom, { hide, shutdown, update } from "@intercom/messenger-js-sdk"
import * as React from "react"
import type { User } from "@supabase/supabase-js"
import { useAuth } from "@/lib/auth-context"
import { intercomJwtPayloadFromUser } from "@/lib/intercom-user-attributes"
import {
  markIntercomMessengerReady,
  markIntercomMessengerShutdown,
  registerIntercomHideOnClose,
  resetIntercomHideOnCloseRegistration,
} from "@/lib/intercom-messenger"
import { scheduleAfterIdle } from "@/lib/schedule-after-idle"

type IntercomRegion = "us" | "eu" | "ap"

function parseIntercomRegion(raw: string | undefined): IntercomRegion {
  const r = (raw ?? "us").trim().toLowerCase()
  if (r === "eu") return "eu"
  if (r === "ap" || r === "au") return "ap"
  return "us"
}

function intercomAppIdFromEnv(): string {
  return (
    process.env.NEXT_PUBLIC_INTERCOM_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_INTERCOM_APPID?.trim() ||
    ""
  )
}

type IntercomAuthResult =
  | { ok: true; mode: "jwt"; token: string }
  | { ok: true; mode: "legacy" }
  | { ok: false; status: number }

async function fetchIntercomAuth(): Promise<IntercomAuthResult> {
  const res = await fetch("/api/intercom/jwt", { credentials: "include", cache: "no-store" })
  if (res.status === 503) return { ok: true, mode: "legacy" }
  if (res.status === 401) return { ok: false, status: 401 }
  if (!res.ok) return { ok: false, status: res.status }
  const data = (await res.json()) as { token?: string }
  if (typeof data.token !== "string") return { ok: false, status: 500 }
  return { ok: true, mode: "jwt", token: data.token }
}

function bootPayload(
  appId: string,
  region: IntercomRegion,
  user: User,
  auth: Extract<IntercomAuthResult, { ok: true }>,
) {
  const base = {
    app_id: appId,
    region,
    /** Only open from header Support chat; no persistent launcher bubble. */
    hide_default_launcher: true,
  }
  if (auth.mode === "jwt") {
    return {
      ...base,
      intercom_user_jwt: auth.token,
      /** Align Messenger cookie TTL with a 24h app session; optional – see Intercom Messenger settings. */
      session_duration: 86_400_000,
    }
  }
  return {
    ...base,
    ...intercomJwtPayloadFromUser(user),
  }
}

function updatePayload(user: User, auth: Extract<IntercomAuthResult, { ok: true }>) {
  if (auth.mode === "jwt") {
    return {
      intercom_user_jwt: auth.token,
      session_duration: 86_400_000,
      hide_default_launcher: true,
    }
  }
  return {
    ...intercomJwtPayloadFromUser(user),
    hide_default_launcher: true,
  }
}

/**
 * Intercom Messenger for signed-in business users (client-only).
 * When `INTERCOM_MESSENGER_API_SECRET` is set on the server, sessions use Messenger Security (JWT).
 * @see https://www.intercom.com/help/en/articles/10589769-authenticating-users-in-the-messenger-with-json-web-tokens-jwts
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

  const prevUserIdRef = React.useRef<string | null>(null)
  const userRef = React.useRef<User | null>(null)
  const [bootAllowed, setBootAllowed] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    return scheduleAfterIdle(() => setBootAllowed(true), 2500)
  }, [])

  React.useEffect(() => {
    userRef.current = user

    if (typeof window === "undefined") return
    if (!bootAllowed) return

    if (!appId) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[Intercom] Missing NEXT_PUBLIC_INTERCOM_APP_ID – add it to business/.env.local and Vercel env, then redeploy.",
        )
      }
      return
    }

    if (isLoading) return

    if (!user) {
      shutdown()
      markIntercomMessengerShutdown()
      resetIntercomHideOnCloseRegistration()
      prevUserIdRef.current = null
      return
    }

    const expectedUserId = user.id
    let cancelled = false

    void (async () => {
      const auth = await fetchIntercomAuth()
      if (cancelled) return
      const current = userRef.current
      if (!current || current.id !== expectedUserId) return

      if (!auth.ok) {
        if (auth.status === 401) {
          shutdown()
          prevUserIdRef.current = null
        } else if (process.env.NODE_ENV === "development") {
          console.warn("[Intercom] Could not load Messenger auth:", auth.status)
        }
        return
      }

      if (auth.mode === "legacy" && process.env.NODE_ENV === "development") {
        console.warn(
          "[Intercom] Messenger is not JWT-secured – set INTERCOM_MESSENGER_API_SECRET (see .env.example) and enforce security in Intercom.",
        )
      }

      // Same user: attribute updates only.
      if (prevUserIdRef.current === current.id) {
        update(updatePayload(current, auth))
        return
      }

      if (prevUserIdRef.current) {
        shutdown()
        markIntercomMessengerShutdown()
        resetIntercomHideOnCloseRegistration()
      }
      prevUserIdRef.current = current.id

      Intercom(bootPayload(appId, region, current, auth))
      registerIntercomHideOnClose()
      hide()
      markIntercomMessengerReady()
    })()

    return () => {
      cancelled = true
    }
  }, [appId, bootAllowed, region, user, isLoading])

  return null
}
