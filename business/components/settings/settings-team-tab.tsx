"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

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

export function SettingsTeamTab() {
  const { isLoading, user } = useAuth()
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [submittingInvites, setSubmittingInvites] = useState(false)
  const [inviteRows, setInviteRows] = useState<InviteDraft[]>([{ fullName: "", email: "", role: "Member" }])
  const [inviteError, setInviteError] = useState("")
  const [membersError, setMembersError] = useState("")
  const [canManageMembers, setCanManageMembers] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const loadMembers = async () => {
    setLoadingMembers(true)
    setMembersError("")
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      setLoadingMembers(false)
      return
    }
    const res = await fetch("/api/settings/team", {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({ error: "Failed to load team members" }))) as { error?: string }
      setMembersError(json.error || "Failed to load team members")
      setLoadingMembers(false)
      return
    }
    const json = (await res.json()) as { members?: TeamMember[]; canManageMembers?: boolean }
    setMembers(json.members ?? [])
    setCanManageMembers(Boolean(json.canManageMembers))
    setLoadingMembers(false)
  }

  useEffect(() => {
    if (!user?.id) return
    let active = true

    const safeLoad = async () => {
      if (!active) return
      await loadMembers()
    }

    void safeLoad()
    return () => {
      active = false
    }
  }, [supabase, user?.id])

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
    const token = data.session?.access_token
    if (!token) {
      setInviteError("Session expired. Please sign in again.")
      setSubmittingInvites(false)
      return
    }
    if (!canManageMembers) {
      setInviteError("Only organization owner can invite members.")
      setSubmittingInvites(false)
      return
    }
    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ invites: cleaned }),
    })

    if (!res.ok) {
      const json = (await res.json().catch(() => ({ error: "Failed to invite members" }))) as { error?: string }
      setInviteError(json.error || "Failed to invite members")
      setSubmittingInvites(false)
      return
    }

    await loadMembers()
    setSubmittingInvites(false)
    setInviteRows([{ fullName: "", email: "", role: "Member" }])
    setInviteOpen(false)
  }

  const showLoading = isLoading || loadingMembers

  const updateMemberRole = async (member: TeamMember, role: InviteDraft["role"]) => {
    if (!member.membershipId) return
    setUpdatingId(member.membershipId)
    setMembersError("")
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      setMembersError("Session expired. Please sign in again.")
      setUpdatingId(null)
      return
    }
    const res = await fetch("/api/settings/team", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ membershipId: member.membershipId, role }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({ error: "Failed to update role" }))) as { error?: string }
      setMembersError(json.error || "Failed to update role")
      setUpdatingId(null)
      return
    }
    await loadMembers()
    setUpdatingId(null)
  }

  const removeMember = async (member: TeamMember) => {
    if (!member.membershipId) return
    setUpdatingId(member.membershipId)
    setMembersError("")
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      setMembersError("Session expired. Please sign in again.")
      setUpdatingId(null)
      return
    }
    const res = await fetch(`/api/settings/team?membershipId=${encodeURIComponent(member.membershipId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({ error: "Failed to remove member" }))) as { error?: string }
      setMembersError(json.error || "Failed to remove member")
      setUpdatingId(null)
      return
    }
    await loadMembers()
    setUpdatingId(null)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
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
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium">{member.initials || "U"}</span>
                    </div>
                    <div>
                      <p className="font-medium">{member.fullName}</p>
                      <p className="text-sm text-muted-foreground">{member.email || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageMembers && member.role !== "Owner" && member.membershipId ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) => void updateMemberRole(member, v as InviteDraft["role"])}
                        disabled={updatingId === member.membershipId}
                      >
                        <SelectTrigger className="h-8 w-[110px]">
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
                    {canManageMembers && member.role !== "Owner" && member.membershipId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void removeMember(member)}
                        disabled={updatingId === member.membershipId}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
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
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {inviteRows.map((row, idx) => (
              <div key={`invite-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-4">
                  <Input
                    placeholder="Full name"
                    value={row.fullName}
                    onChange={(e) => updateInviteRow(idx, "fullName", e.target.value)}
                  />
                </div>
                <div className="md:col-span-5">
                  <Input
                    placeholder="Email"
                    type="email"
                    value={row.email}
                    onChange={(e) => updateInviteRow(idx, "email", e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Select value={row.role} onValueChange={(v) => updateInviteRow(idx, "role", v as InviteDraft["role"])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Member">Member</SelectItem>
                      <SelectItem value="Viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-1">
                  <Button variant="ghost" size="sm" onClick={() => removeInviteRow(idx)} disabled={inviteRows.length === 1}>
                    Remove
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
              {submittingInvites ? "Inviting..." : "Send invites"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
