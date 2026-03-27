"use client"

import type React from "react"
import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import type { EmailOtpType } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Eye, EyeOff } from "lucide-react"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [newPassword, setNewPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    const supabase = createSupabaseBrowser()
    const code = searchParams.get("code")
    const tokenHash = searchParams.get("token_hash")
    const otpType = searchParams.get("type")

    ;(async () => {
      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        } else if (tokenHash && otpType === "recovery") {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            type: otpType as EmailOtpType,
            token_hash: tokenHash,
          })
          if (verifyError) throw verifyError
        }
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          throw new Error("No recovery session")
        }
        if (!active) return
        setReady(true)
        setError("")
      } catch {
        if (!active) return
        setReady(false)
        setError("Invalid or expired reset link. Please request a new password reset.")
      }
    })()

    return () => {
      active = false
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const supabase = createSupabaseBrowser()
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError

      await supabase.auth.signOut()
      router.push("/auth/login?message=Password reset successful. Please sign in with your new password.")
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl sm:text-2xl font-bold">Reset Password</CardTitle>
        <CardDescription>Enter your new password below</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 sm:space-y-5">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {ready && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-10 sm:h-11 pr-10"
                    required
                    minLength={8}
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <Button type="submit" className="w-full h-10 sm:h-11" disabled={isLoading}>
                {isLoading ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link href="/auth/login" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
              <ArrowLeft className="h-4 w-4" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
