"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Key, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SETTINGS_INPUT_CLASS } from "@/lib/settings-control-surface"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { useAuth } from "@/lib/auth-context"
import { fetchWithSession } from "@/lib/fetch-with-session"

const MIN_PASSWORD_LEN = 8
const PASSWORD_UPDATED_LOGIN_MESSAGE =
  "Password updated. Sign in again on all devices."

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const router = useRouter()
  const { logout } = useAuth()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reset = () => {
    setCurrent("")
    setNext("")
    setConfirm("")
    setError(null)
    setSuccess(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (next.length < MIN_PASSWORD_LEN) {
      setError(`New password must be at least ${MIN_PASSWORD_LEN} characters.`)
      return
    }
    if (next !== confirm) {
      setError("New password and confirmation do not match.")
      return
    }
    if (next === current) {
      setError("New password must be different from your current password.")
      return
    }

    setSubmitting(true)
    try {
      const supabase = createSupabaseBrowser()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const email = session?.user?.email?.trim()
      if (!email) {
        setError("No active session. Please sign in again.")
        return
      }

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      })
      if (signErr) {
        setError("Current password is incorrect.")
        return
      }

      const { error: updErr } = await supabase.auth.updateUser({ password: next })
      if (updErr) {
        setError(updErr.message || "Could not update password.")
        return
      }

      void fetchWithSession("/api/notifications/security-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertType: "password_changed" }),
      }).catch(() => {})

      setSuccess("Password updated. Signing you out everywhere…")
      setCurrent("")
      setNext("")
      setConfirm("")
      onOpenChange(false)
      await logout({ scope: "global" })
      router.replace(`/auth/login?message=${encodeURIComponent(PASSWORD_UPDATED_LOGIN_MESSAGE)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Change password
          </DialogTitle>
          <DialogDescription>
            Enter your current password, then choose a new one. Changing it signs you out on every
            device so you must sign in again.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
              {success}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="cp-current">Current password</Label>
            <div className="relative">
              <Input
                id="cp-current"
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                className={cn(SETTINGS_INPUT_CLASS, "pr-10")}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={showCurrent ? "Hide password" : "Show password"}
              >
                {showCurrent ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-new">New password</Label>
            <div className="relative">
              <Input
                id="cp-new"
                type={showNext ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                className={cn(SETTINGS_INPUT_CLASS, "pr-10")}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNext(!showNext)}
                aria-label={showNext ? "Hide new password" : "Show new password"}
              >
                {showNext ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <div className="relative">
              <Input
                id="cp-confirm"
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className={cn(SETTINGS_INPUT_CLASS, "pr-10")}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !current || !next || !confirm}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Update password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
