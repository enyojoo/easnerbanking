"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { setPendingTeamInvite } from "@/lib/team-invite-storage"

type InvitePreview = {
  businessName: string
  role: string
}

export default function JoinTeamByIdPage() {
  const router = useRouter()
  const params = useParams()
  const membershipId = typeof params.membershipId === "string" ? params.membershipId.trim() : ""

  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [previewError, setPreviewError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!membershipId) {
      setPreviewError("This invitation link is invalid or incomplete.")
      setLoading(false)
      return
    }

    setPendingTeamInvite({ membershipId })

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/auth/invite-preview?membership=${encodeURIComponent(membershipId)}`)
        const json = (await res.json().catch(() => ({}))) as InvitePreview & { error?: string }
        if (cancelled) return
        if (!res.ok) {
          setPreviewError(json.error || "This invitation is no longer valid.")
          return
        }
        setPreview({ businessName: json.businessName, role: json.role })
      } catch {
        if (!cancelled) setPreviewError("Could not load invitation details.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [membershipId])

  const goSignup = () => router.push("/auth/signup")
  const goLogin = () => router.push("/auth/login")

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Team invitation</CardTitle>
        <CardDescription>
          {loading
            ? "Loading invitation…"
            : preview
              ? `Join ${preview.businessName} on Easner Business`
              : "Accept your invitation to continue"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview ? (
          <p className="text-sm text-muted-foreground text-center">
            You&apos;ve been invited as <strong className="text-foreground">{preview.role}</strong>. Use the email
            address that received this invitation when you sign in or create an account.
          </p>
        ) : null}

        {previewError ? <p className="text-sm text-destructive text-center">{previewError}</p> : null}

        {!previewError && membershipId ? (
          <>
            <Button className="w-full" onClick={goSignup} disabled={loading}>
              Create account
            </Button>
            <Button variant="outline" className="w-full" onClick={goLogin} disabled={loading}>
              Sign in
            </Button>
          </>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
