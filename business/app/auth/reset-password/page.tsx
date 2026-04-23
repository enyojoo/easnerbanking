"use client"

import type React from "react"
import { Suspense, useMemo, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Eye, EyeOff } from "lucide-react"

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [newPassword, setNewPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const tokenFromQuery = searchParams.get("token") || ""
  const emailFromQuery = searchParams.get("email") || ""

  const { token, email } = useMemo(() => {
    if (tokenFromQuery && emailFromQuery) {
      return { token: tokenFromQuery, email: emailFromQuery }
    }
    if (typeof window === "undefined") return { token: "", email: "" }
    return {
      token: sessionStorage.getItem("reset-token") || "",
      email: sessionStorage.getItem("reset-email") || "",
    }
  }, [emailFromQuery, tokenFromQuery])

  useEffect(() => {
    let active = true

    ;(async () => {
      try {
        if (!token || !email) throw new Error("No reset token")
        if (!active) return
        setReady(true)
        setError("")
      } catch {
        if (!active) return
        setReady(false)
        setError("Invalid or expired reset session. Please request a new password reset.")
      }
    })()

    return () => {
      active = false
    }
  }, [email, token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email,
          newPassword,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Failed to reset password.")
      }
      try {
        sessionStorage.removeItem("reset-token")
        sessionStorage.removeItem("reset-email")
      } catch {
        // ignore
      }
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
