"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import { clearBrowserQueryClient } from "@/lib/query/query-client"
import { clearAllOfficeBrowserState, probeStoredOfficeUserId } from "@/lib/query/web-persist"

/** Office admin access is DB-backed (public.admin_users), not JWT metadata. */
async function resolveOfficeAdmin(session: Session | null): Promise<boolean> {
  const id = session?.user?.id
  if (!id) return false
  const { data, error } = await supabase
    .from("admin_users")
    .select("status")
    .eq("id", id)
    .maybeSingle()
  if (error || !data) return false
  return data.status === "active"
}

/**
 * Last-verified-admin cache: the DB check above is a network round trip that
 * used to gate EVERY page paint behind a skeleton on every reload. A user we
 * verified as admin recently paints immediately; the check still runs in the
 * background and demotes (→ sign-out path in consumers) if revoked. Every
 * data request is independently authorized server-side regardless.
 */
const ADMIN_OK_KEY_PREFIX = "easner_office_admin_ok_v1_"
const ADMIN_OK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function readCachedAdminOk(userId: string | null): boolean {
  if (!userId || typeof window === "undefined") return false
  try {
    const raw = window.localStorage.getItem(`${ADMIN_OK_KEY_PREFIX}${userId}`)
    if (!raw) return false
    const at = Number.parseInt(raw, 10)
    return Number.isFinite(at) && Date.now() - at < ADMIN_OK_MAX_AGE_MS
  } catch {
    return false
  }
}

function writeCachedAdminOk(userId: string, ok: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (ok) {
      window.localStorage.setItem(`${ADMIN_OK_KEY_PREFIX}${userId}`, String(Date.now()))
    } else {
      window.localStorage.removeItem(`${ADMIN_OK_KEY_PREFIX}${userId}`)
    }
  } catch {
    // ignore
  }
}

interface AuthContextType {
  user: User | null
  isAdmin: boolean
  loading: boolean
  /**
   * True once supabase has actually resolved the stored session. During the
   * cached-admin fast boot `loading` is false while `user` is still null —
   * that window means "hydrating", NOT "signed out". Redirect-to-login
   * decisions must wait for this flag, or every reload bounces through
   * /auth/login before the session lands.
   */
  sessionResolved: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  sessionResolved: false,
  signOut: async () => {},
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  // Fast boot: a recently-verified admin with a stored session paints the
  // shell + cached data immediately instead of a skeleton on every reload.
  const [bootAdminOk] = useState<boolean>(() => readCachedAdminOk(probeStoredOfficeUserId()))
  const [loading, setLoading] = useState(!bootAdminOk)
  const [isAdmin, setIsAdmin] = useState(bootAdminOk)
  const [sessionResolved, setSessionResolved] = useState(false)

  useEffect(() => {
    let cancelled = false

    const syncSession = async (session: Session | null) => {
      const u = session?.user ?? null
      setUser(u)
      setSessionResolved(true)
      if (!u) {
        setIsAdmin(false)
        if (!cancelled) setLoading(false)
        return
      }
      // Recently-verified admins keep painting while the DB check runs in
      // the background; unknown users wait (loading stays true from boot).
      const cachedOk = readCachedAdminOk(u.id)
      if (cachedOk && !cancelled) {
        setIsAdmin(true)
        setLoading(false)
      }
      const admin = await resolveOfficeAdmin(session)
      if (cancelled) return
      writeCachedAdminOk(u.id, admin)
      setIsAdmin(admin)
      setLoading(false)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void syncSession(session)
      }
    )

    void supabase.auth.getSession().then(({ data: { session } }) => syncSession(session))

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const userIdRef = useRef<string | null>(null)
  userIdRef.current = user?.id ?? null

  const signOut = useCallback(async () => {
    if (userIdRef.current) writeCachedAdminOk(userIdRef.current, false)
    clearAllOfficeBrowserState(userIdRef.current)
    clearBrowserQueryClient()
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
  }, [])

  // Identity-stable value: every useAuth() consumer re-renders when this
  // changes, and this provider sits above the whole app.
  const value = useMemo(
    () => ({ user, isAdmin, loading, sessionResolved, signOut }),
    [user, isAdmin, loading, sessionResolved, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
