"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const router = useRouter()

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    setMessage("")

    try {
      const supabase = createSupabaseBrowser()
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const { error: supaError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/auth/callback`,
      })
      if (supaError) throw supaError

      setMessage("Check your email for a password reset link.")
    } catch {
      setError("Unable to send reset email. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl sm:text-2xl font-bold">Forgot Password</CardTitle>
        <CardDescription>Enter your email to receive a password reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 sm:space-y-5">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {message && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
              <p className="text-sm text-green-700 dark:text-green-400">{message}</p>
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 sm:h-11"
                required
                disabled={isLoading}
              />
            </div>

            <Button type="submit" className="w-full h-10 sm:h-11" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send reset email"}
            </Button>
          </form>

          <div className="mt-6 flex flex-col gap-2 text-center">
            <button
              type="button"
              onClick={() => {
                router.push("/auth/login")
              }}
              className="inline-flex items-center justify-center gap-2 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sign In
            </button>
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/auth/signup" className="text-primary font-medium hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
