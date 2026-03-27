"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    const supabase = createSupabaseBrowser()
    const code = searchParams.get("code")
    const tokenHash = searchParams.get("token_hash")
    const type = searchParams.get("type")

    ;(async () => {
      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        } else if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            type: type as EmailOtpType,
            token_hash: tokenHash,
          })
          if (verifyError) throw verifyError
        } else {
          throw new Error("Invalid confirmation link")
        }

        if (type === "recovery") {
          router.replace("/auth/reset-password")
          return
        }

        const { data } = await supabase.auth.getSession()
        if (data.session) {
          router.replace("/dashboard")
        } else {
          router.replace("/auth/login?message=Email confirmed. Please sign in.")
        }
      } catch {
        if (!active) return
        setError("This link is invalid or expired. Please request a new one.")
      }
    })()

    return () => {
      active = false
    }
  }, [router, searchParams])

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Completing authentication</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Please wait...</p>}
      </CardContent>
    </Card>
  )
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Suspense fallback={null}>
        <AuthCallbackContent />
      </Suspense>
    </div>
  )
}

