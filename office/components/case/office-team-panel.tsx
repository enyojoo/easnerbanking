"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { OfficeTeamMember } from "@/lib/case/types"
import { OfficeSection } from "./office-detail-grid"

export function OfficeTeamPanel({
  members,
  loading,
  error,
}: {
  members: OfficeTeamMember[]
  loading: boolean
  error?: string | null
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No team members on file.</p>
  }
  return (
    <OfficeSection title="Team" divide={false}>
      {members.map((member) => (
        <div
          key={member.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/40 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email || "–"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{member.role}</Badge>
            {member.status === "invited" ? <Badge variant="amber">Invited</Badge> : null}
            <Link href={`/users/${member.id}`} className="text-sm text-primary underline-offset-2 hover:underline">
              Open person
            </Link>
          </div>
        </div>
      ))}
    </OfficeSection>
  )
}
