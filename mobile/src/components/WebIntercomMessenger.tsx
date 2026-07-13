import React, { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { isIntercomConfiguredInApp, syncWebIntercomForUser } from '../lib/intercom'

/**
 * Keeps Intercom Messenger booted on Expo web (mirrors business `BusinessIntercom`).
 * Native iOS/Android use `@intercom/intercom-react-native` instead.
 */
export function WebIntercomMessenger() {
  const { user, loading } = useAuth()
  const prevUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || loading || !isIntercomConfiguredInApp()) return

    if (!user?.id) {
      void syncWebIntercomForUser(null)
      prevUserIdRef.current = null
      return
    }

    const expectedUserId = user.id
    let cancelled = false

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled || !session?.user || session.user.id !== expectedUserId) return

      const sameUser = prevUserIdRef.current === expectedUserId
      prevUserIdRef.current = expectedUserId
      await syncWebIntercomForUser(session, { updateOnly: sameUser })
    })()

    return () => {
      cancelled = true
    }
  }, [loading, user?.id])

  return null
}
