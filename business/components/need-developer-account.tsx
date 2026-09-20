"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BusinessLogo } from "@/components/brand/business-logo"
import { openBusinessSupport } from "@/lib/intercom-messenger"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { patchCachedBusinessProfile } from "@/lib/use-business-profile"

export function NeedDeveloperAccountPage() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getApiAccess = async () => {
    setPending(true)
    setError(null)
    try {
      const res = await fetchWithSession("/api/platform/self-enable", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(body.error || "Could not enable API access.")
        return
      }
      patchCachedBusinessProfile({ devPlatformEnabled: true })
      router.push("/console")
    } catch {
      setError("Could not enable API access. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-card shadow-soft">
        <KeyRound className="h-5 w-5 text-primary" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Build with the Easner API</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Get a test key and start integrating in minutes — no approval needed for test mode.
      </p>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <Button type="button" className="mt-6 gap-2" onClick={() => void getApiAccess()} disabled={pending}>
        <KeyRound className="h-4 w-4" />
        {pending ? "Setting up…" : "Get API access"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="mt-2 gap-2 text-muted-foreground"
        onClick={() => {
          void openBusinessSupport()
        }}
      >
        <MessageCircle className="h-4 w-4" />
        Contact support
      </Button>
      <div className="mt-10">
        <BusinessLogo size="sm" href="/" />
      </div>
    </div>
  )
}
