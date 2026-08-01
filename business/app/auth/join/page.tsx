"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AUTH_COPY } from "@/lib/copy/business-ui-copy"

type InvitePreview = {
  businessName: string
  role: string
}

export default function JoinLegacyRedirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const membershipId = searchParams.get("membership")?.trim() ?? ""

  useEffect(() => {
    if (membershipId) {
      router.replace(`/auth/join/${encodeURIComponent(membershipId)}`)
    }
  }, [membershipId, router])

  if (membershipId) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Redirecting…</CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Team invitation</CardTitle>
        <CardDescription>{AUTH_COPY.joinInvalid}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
