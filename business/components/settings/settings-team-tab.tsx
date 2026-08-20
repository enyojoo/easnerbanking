"use client"

import { useCallback, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Trash2, Users } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { CACHE_KEYS } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { SETTINGS_CARD_COPY } from "@/lib/copy/business-ui-copy"
import { SETTINGS_INPUT_CLASS, SETTINGS_SELECT_TRIGGER_BASE, SETTINGS_SELECT_TRIGGER_CLASS } from "@/lib/settings-control-surface"
import { cn } from "@/lib/utils"

type TeamMember = {
  id: string
  membershipId?: string
  fullName: string
  email: string
  role: "Owner" | "Admin" | "Member" | "Viewer"
  status?: "active" | "invited"
  isSelf?: boolean
  initials?: string
}

type InviteDraft = {
  fullName: string
  email: string
  role: "Admin" | "Member" | "Viewer"
}

const TEAM_MEMBERS_CACHE_TTL_MS = 60 * 60 * 1000

/** Membership row id for API calls; invited rows may omit `membershipId` in cached payloads but `id` is the row id when `user_id` is null. */
function membershipIdForRow(member: TeamMember): string | undefined {
  if (member.membershipId) return member.membershipId
  if (member.status === "invited" && member.id) return member.id
  return undefined
}

export function SettingsTeamTab() {
  const { isLoading, user } = useAuth()
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [submittingInvites, setSubmittingInvites] = useState(false)
  const [inviteRows, setInviteRows] = useState<InviteDraft[]>([{ fullName: "", email: "", role: "Member" }])
  const [inviteError, setInviteError] = useState("")
  const [membersError, setMembersError] = useState("")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const {
    data: teamData,
    setData: setTeamData,
    loading: teamLoading,
  } = useCachedData<{ members: TeamMember[]; canManageMembers?: boolean }>({
    enabled: !isLoading && Boolean(user?.id),
    cacheKey: user?.id ? CACHE_KEYS.TEAM_MEMBERS(user.id) : null,
    persistKey: user?.id ? `settings_team_${user.id}` : undefined,
    initialData: { members: [], canManageMembers: false },
    ttlMs: TEAM_MEMBERS_CACHE_TTL_MS,
    fetcher: async () => {
      const res = await fetchWithSession("/api/settings/team")
      if (!res.ok) {
        const json = (await res.json().catch(() => ({ error: "Failed to load team members" }))) as { error?: string }
        throw new Error(json.error || "Failed to load team members")
      }
      return (await res.json()) as { members: TeamMember[]; canManageMembers?: boolean }
    },
    onError: (e) => setMembersError(e instanceof Error ? e.message : "Failed to load team members"),
  })

  const reloadTeamFromServer = useCallback(async () => {
    setLoadingMembers(true)
    setMembersError("")
    if (!user?.id) {
      setLoadingMembers(false)
      return
    }
    try {
      const res = await fetchWithSession("/api/settings/team")
      if (!res.ok) {
        const json = (await res.json().catch(() => ({ error: "Failed to load team members" }))) as { error?: string }
        throw new Error(json.error || "Failed to load team members")
      }
      const fresh = (await res.json()) as { members: TeamMember[]; canManageMembers?: boolean }
      setTeamData(fresh)
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : "Failed to load team members")
    } finally {
      setLoadingMembers(false)
    }
  }, [setTeamData, user?.id])

  const members = teamData.members ?? []
  const canManageMembers = Boolean(teamData.canManageMembers)

  const addInviteRow = () => setInviteRows((prev) => [...prev, { fullName: "", email: "", role: "Member" }])
  const removeInviteRow = (idx: number) =>
    setInviteRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))
  const updateInviteRow = <K extends keyof InviteDraft>(idx: number, key: K, value: InviteDraft[K]) =>
    setInviteRows((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row)))

  const submitInvites = async () => {
    setInviteError("")
    const cleaned = inviteRows
      .map((r) => ({ fullName: r.fullName.trim(), email: r.email.trim(), role: r.role }))
      .filter((r) => r.fullName && r.email)

    if (cleaned.length === 0) {
      setInviteError("Add at least one valid invite row.")
      return
    }

    setSubmittingInvites(true)
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setInviteError("Session expired. Please sign in again.")
      setSubmittingInvites(false)
      return
    }
    if (!canManageMembers) {
      setInviteError("Only organization owner can invite members.")
      setSubmittingInvites(false)
      return
    }
    const res = await fetchWithSession("/api/settings/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invites: cleaned }),
    })

    if (!res.ok) {
      const json = (await res.json().catch(() => ({ error: "Failed to invite members" }))) as { error?: string }
      setInviteError(json.error || "Failed to invite members")
      setSubmittingInvites(false)
      return
    }

    await reloadTeamFromServer()
    setSubmittingInvites(false)
    setInviteRows([{ fullName: "", email: "", role: "Member" }])
    setInviteOpen(false)
  }

  const showLoading = (isLoading || teamLoading || loadingMembers) && members.length === 0

  const updateMemberRole = async (member: TeamMember, role: InviteDraft["role"]) => {
    const mid = membershipIdForRow(member)
    if (!mid) return
    setUpdatingId(mid)
    setMembersError("")
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setMembersError("Session expired. Please sign in again.")
      setUpdatingId(null)
      return
    }
    const res = await fetchWithSession("/api/settings/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId: mid, role }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({ error: "Failed to update role" }))) as { error?: string }
      setMembersError(json.error || "Failed to update role")
      setUpdatingId(null)
      return
    }
    await reloadTeamFromServer()
    setUpdatingId(null)
  }

  const removeMember = async (member: TeamMember) => {
    const mid = membershipIdForRow(member)
    if (!mid) return
    setUpdatingId(mid)
    setMembersError("")
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setMembersError("Session expired. Please sign in again.")
      setUpdatingId(null)
      return
    }
    const res = await fetchWithSession(
      `/api/settings/team?membershipId=${encodeURIComponent(mid)}`,
      { method: "DELETE" },
    )
    if (!res.ok) {
      const json = (await res.json().catch(() => ({ error: "Failed to remove member" }))) as { error?: string }
      setMembersError(json.error || "Failed to remove member")
      setUpdatingId(null)
      return
    }
    await reloadTeamFromServer()
    setUpdatingId(null)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
            }
            description={SETTINGS_CARD_COPY.teamMembers}
          />
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <div className="space-y-4">
              <div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              No team members found for this organization.
            </div>
          ) : (
            <div className="space-y-4">
              {membersError ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{membersError}</div> : null}
              {members.map((member) => {
                const rowMembershipId = membershipIdForRow(member)
                return (
                  <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium">{member.initials || "U"}</span>
                      </div>
                      <div>
                        <p className="font-medium">{member.fullName}</p>
                        <p className="text-sm text-muted-foreground">{member.email || "–"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManageMembers && member.role !== "Owner" && rowMembershipId ? (
                        <Select
                          value={member.role}
                          onValueChange={(v) => void updateMemberRole(member, v as InviteDraft["role"])}
                          disabled={updatingId === rowMembershipId}
                        >
                          <SelectTrigger className={cn(SETTINGS_SELECT_TRIGGER_BASE, "w-[110px]")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Admin">Admin</SelectItem>
                            <SelectItem value="Member">Member</SelectItem>
                            <SelectItem value="Viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">{member.role}</span>
                      )}
                      {member.status === "invited" ? (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">Invited</span>
                      ) : null}
                      {canManageMembers && member.role !== "Owner" && rowMembershipId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => void removeMember(member)}
                          disabled={updatingId === rowMembershipId}
                          aria-label={
                            member.status === "invited"
                              ? `Delete invitation for ${member.email || member.fullName}`
                              : `Remove ${member.fullName} from team`
                          }
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
              <div className="mt-4 pt-4 border-t">
                <Button variant="outline" className="w-full" onClick={() => setInviteOpen(true)} disabled={!canManageMembers}>
                  Invite Team Members
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invite Team Members</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {inviteRows.map((row, idx) => (
              <div key={`invite-${idx}`} className="grid grid-cols-1 gap-3 py-1 md:grid-cols-12 md:items-end">
                <div className="md:col-span-4">
                  <Input
                    placeholder="Full name"
                    className={SETTINGS_INPUT_CLASS}
                    value={row.fullName}
                    onChange={(e) => updateInviteRow(idx, "fullName", e.target.value)}
                  />
                </div>
                <div className="md:col-span-5">
                  <Input
                    placeholder="Email"
                    type="email"
                    className={SETTINGS_INPUT_CLASS}
                    value={row.email}
                    onChange={(e) => updateInviteRow(idx, "email", e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Select value={row.role} onValueChange={(v) => updateInviteRow(idx, "role", v as InviteDraft["role"])}>
                    <SelectTrigger className={SETTINGS_SELECT_TRIGGER_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Member">Member</SelectItem>
                      <SelectItem value="Viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-1 flex justify-end md:justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeInviteRow(idx)}
                    disabled={inviteRows.length === 1}
                    aria-label="Remove invite row"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
          </div>
          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button variant="outline" onClick={addInviteRow} disabled={submittingInvites}>
              Add another
            </Button>
            <Button onClick={() => void submitInvites()} disabled={submittingInvites}>
              {submittingInvites ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Send invites
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
