"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { getPendingTeamInvite, setPendingTeamInvite } from "@/lib/team-invite-storage"

export type TeamInvitePreview = {
  businessName: string
  role: string
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
        if (!cancelled && res.ok && json.businessName && json.role) {
          setInvitePreview({ businessName: json.businessName, role: json.role })
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
  }
}

const PENDING_TEAM_INVITE_KEY = "easner_pending_team_invite_v1"

export type PendingTeamInviteStorage = {
  membershipId: string
}

export function getPendingTeamInvite(): PendingTeamInviteStorage | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(PENDING_TEAM_INVITE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingTeamInviteStorage
    if (typeof parsed.membershipId !== "string" || !parsed.membershipId.trim()) return null
    return { membershipId: parsed.membershipId.trim() }
  } catch {
    return null
  }
}

export function setPendingTeamInvite(data: PendingTeamInviteStorage): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(
      PENDING_TEAM_INVITE_KEY,
      JSON.stringify({ membershipId: data.membershipId.trim() }),
    )
  } catch {
    // ignore storage errors
  }
}

export function clearPendingTeamInvite(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(PENDING_TEAM_INVITE_KEY)
  } catch {
    // ignore storage errors
  }
}

export function buildTeamInvitePath(membershipId: string): string {
  return `/auth/join/${encodeURIComponent(membershipId.trim())}`
}

/** @deprecated Legacy query links redirect via `/auth/join?membership=` */
export function buildTeamInviteQuery(membershipId: string): string {
  return new URLSearchParams({ membership: membershipId.trim() }).toString()
}
