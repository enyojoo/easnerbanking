"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { registerAppLockListener } from "@/lib/app-lock-bus"
import { isPinBlockingWorkspace } from "@/lib/pin-gate"

/** True while the PIN setup or unlock screen owns the workspace. */
export function useAppSoftLocked(): boolean {
  const { user, sessionUserId } = useAuth()
  const uid = user?.id ?? sessionUserId ?? null
  const [locked, setLocked] = useState(() => isPinBlockingWorkspace(uid))

  useEffect(() => {
    const sync = () => setLocked(isPinBlockingWorkspace(uid))
    sync()
    return registerAppLockListener(sync)
  }, [uid])

  return locked
}