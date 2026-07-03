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
