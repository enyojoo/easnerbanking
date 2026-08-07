"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { getPendingTeamInvite, setPendingTeamInvite } from "@/lib/team-invite-storage"

export type TeamInvitePreview = {
  businessName: string
  role: string
  email: string
  fullName: string | null
}

/** Resolve pending team invite from legacy `?membership=` query or localStorage (set on `/auth/join/{id}`). */
export function useTeamInviteContext() {
  const searchParams = useSearchParams()
  const queryMembership = searchParams.get("membership")?.trim() ?? ""
  const [membershipId, setMembershipId] = useState("")
  const [invitePreview, setInvitePreview] = useState<TeamInvitePreview | null>(null)

  useEffect(() => {
    const fromStorage = getPendingTeamInvite()?.membershipId ?? ""
    const resolved = queryMembership || fromStorage
    if (queryMembership) {
      setPendingTeamInvite({ membershipId: queryMembership })
    }
    setMembershipId(resolved)
    if (!resolved) {
      setInvitePreview(null)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/auth/invite-preview?membership=${encodeURIComponent(resolved)}`)
        const json = (await res.json().catch(() => ({}))) as Partial<TeamInvitePreview>
        if (
          !cancelled &&
          res.ok &&
          json.businessName &&
          json.role &&
          typeof json.email === "string" &&
          json.email.trim()
        ) {
          setInvitePreview({
            businessName: json.businessName,
            role: json.role,
            email: json.email.trim().toLowerCase(),
            fullName: typeof json.fullName === "string" ? json.fullName.trim() || null : null,
          })
        } else if (!cancelled) {
          setInvitePreview(null)
        }
      } catch {
        if (!cancelled) setInvitePreview(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [queryMembership])

  return {
    membershipId,
    isTeamInvite: Boolean(membershipId),
    invitePreview,
    inviteEmail: invitePreview?.email ?? "",
  }
}
