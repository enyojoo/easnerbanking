"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import { clearBrowserQueryClient } from "@/lib/query/query-client"
import { clearAllOfficeBrowserState } from "@/lib/query/web-persist"

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

interface AuthContextType {
  user: User | null
  isAdmin: boolean
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
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
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false

    const syncSession = async (session: Session | null) => {
      setLoading(true)
      const u = session?.user ?? null
      setUser(u)
      if (!u) {
        setIsAdmin(false)
        if (!cancelled) setLoading(false)
        return
      }
      const admin = await resolveOfficeAdmin(session)
      if (cancelled) return
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

  const signOut = async () => {
    clearAllOfficeBrowserState(user?.id ?? null)
    clearBrowserQueryClient()
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
