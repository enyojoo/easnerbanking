"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { OtpCodeInput } from "@/components/otp-code-input"

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "otp">("email")
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [resendCooldown, setResendCooldown] = useState(0)

  const router = useRouter()

  useEffect(() => {
    if (step !== "otp" || resendCooldown <= 0) return
    const t = window.setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [resendCooldown, step])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    setMessage("")

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) throw new Error("Request failed")

      setStep("otp")
      setOtp("")
      setResendCooldown(60)
      setMessage("")
    } catch {
      setError("Unable to send verification code. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    setMessage("")
    try {
      const digits = otp.replace(/\D/g, "")
      if (digits.length !== 6) {
        setError("Enter the 6-digit code from your email.")
        return
      }
      const res = await fetch("/api/auth/verify-reset-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: digits }),
      })
      const json = (await res.json().catch(() => ({}))) as { resetToken?: string; error?: string }
      if (!res.ok || !json.resetToken) {
        setError(typeof json.error === "string" ? json.error : "Invalid or expired verification code.")
        return
      }
      sessionStorage.setItem("reset-token", json.resetToken)
      sessionStorage.setItem("reset-email", email.trim())
      router.push("/auth/reset-password")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setIsLoading(true)
    setError("")
    setMessage("")
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) throw new Error("Request failed")
      setMessage("New code sent to your email address.")
      setResendCooldown(60)
    } catch {
      setError("Failed to resend code. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl sm:text-2xl font-bold">
          {step === "email" ? "Forgot Password" : "Enter verification code"}
        </CardTitle>
        <CardDescription>
          {step === "email"
            ? "Enter your email to receive a 6-digit reset code."
            : `We've sent a 6-digit code to ${email}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 sm:space-y-5">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {message && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl">
              <p className="text-sm text-primary">{message}</p>
            </div>
          )}

          {step === "email" ? (
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

              <Button type="submit" className="w-full h-10 sm:h-11" disabled={isLoading || !email.trim()}>
                {isLoading ? "Sending..." : "Send verification code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <OtpCodeInput
                id="reset-otp"
                value={otp}
                onChange={setOtp}
                autoFocus
                disabled={isLoading}
              />

              <Button
                type="submit"
                className="mt-2 w-full h-10 sm:h-11"
                disabled={isLoading || otp.replace(/\D/g, "").length !== 6}
              >
                {isLoading ? "Verifying..." : "Verify code"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={isLoading || resendCooldown > 0}
                onClick={() => void handleResend()}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
              </Button>
            </form>
          )}

          <div className="mt-6 flex flex-col gap-2 text-center">
            <button
              type="button"
              onClick={() => {
                if (step === "otp") {
                  setStep("email")
                  setOtp("")
                  setError("")
                  setMessage("")
                  setResendCooldown(0)
                  return
                }
                router.push("/auth/login")
              }}
              className="inline-flex items-center justify-center gap-2 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              {step === "otp" ? "Back to email" : "Back to Sign In"}
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
