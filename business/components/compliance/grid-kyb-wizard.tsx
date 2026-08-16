"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  emptyGridKybCompanyDraft,
  firstGridKybErrorSection,
  gridKybApplicationIsEditable,
  type GridKybCompanyDraft,
  type GridKybFormSection,
} from "@easner/shared"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GRID_KYB_WIZARD_COPY } from "@/lib/copy/business-ui-copy"
import { cn } from "@/lib/utils"
import type { KybPacket } from "@/lib/grid/kyb-packet-types"
import { GridKybCompanyStep } from "./grid-kyb-company-step"
import { GridKybPeopleStep } from "./grid-kyb-people-step"
import { GridKybDocumentsStep } from "./grid-kyb-documents-step"

type Props = {
  onClose: () => void
  initialCompany?: GridKybCompanyDraft
  initialInReview?: boolean
}

const SECTIONS: { id: GridKybFormSection; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "people", label: "People" },
  { id: "documents", label: "Documents" },
]

export function GridKybWizard({ onClose, initialCompany, initialInReview = false }: Props) {
  const [packet, setPacket] = useState<KybPacket | null>(null)
  const [company, setCompany] = useState<GridKybCompanyDraft>(
    () => initialCompany ?? emptyGridKybCompanyDraft(),
  )
  const [section, setSection] = useState<GridKybFormSection>("company")
  const [pendingCta, setPendingCta] = useState<"exit" | "next" | "complete" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const companyDirtyRef = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/grid/kyb/packet")
    const json = (await res.json().catch(() => ({}))) as KybPacket & { error?: string }
    if (!res.ok) throw new Error(json.error || "Could not load verification")
    setPacket(json)
    if (!companyDirtyRef.current) {
      setCompany(json.company)
    }
    if (json.errorPointers?.length) {
      setSection(firstGridKybErrorSection(json.errors))
    }
    return json
  }, [])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load verification"))
  }, [load])

  const status = packet?.status ?? (initialInReview ? "in_review" : null)
  const editable = gridKybApplicationIsEditable(status)
  const pointers = packet?.errorPointers ?? []
  const counts = useMemo(() => {
    return {
      company: pointers.filter((row) => row.section === "company").length,
      people: pointers.filter((row) => row.section === "people").length,
      documents: pointers.filter((row) => row.section === "documents").length,
    }
  }, [pointers])

  async function saveCompany() {
    if (!packet) await load()
    const res = await fetch("/api/grid/kyb/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(company),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(json.error || "Could not save company details")
  }

  async function goNext() {
    if (pendingCta === "next") return
    if (section === "people") {
      setSection("documents")
      return
    }
    setPendingCta("next")
    setError(null)
    try {
      await saveCompany()
      setSection("people")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save company details")
    } finally {
      setPendingCta(null)
    }
  }

  async function complete() {
    if (pendingCta === "complete") return
    setPendingCta("complete")
    setError(null)
    try {
      await saveCompany()
      const res = await fetch("/api/grid/kyb/complete", { method: "POST" })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        status?: string
        errors?: KybPacket["errors"]
      }
      if (!res.ok) throw new Error(json.error || "Could not submit verification")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit verification")
    } finally {
      setPendingCta(null)
    }
  }

  async function saveAndExit() {
    if (pendingCta === "exit") return
    setPendingCta("exit")
    setError(null)
    try {
      await saveCompany()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save company details")
      setPendingCta(null)
    }
  }

  async function removeDocument(id: string) {
    const res = await fetch(`/api/grid/kyb/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      setError(json.error || "Could not remove document")
      return
    }
    await load()
  }

  if (status === "in_review" && !editable) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex items-center border-b px-2 py-2 sm:px-4">
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2" onClick={onClose}>
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
        </div>
        <div className="mx-auto flex min-h-0 flex-1 max-w-xl flex-col justify-center px-6 py-16 text-center">
          <h2 className="text-xl font-semibold">{GRID_KYB_WIZARD_COPY.waitingTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{GRID_KYB_WIZARD_COPY.waitingBody}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-2 py-2 sm:px-4">
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2" onClick={onClose}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
        <nav className="flex justify-center gap-1.5 sm:gap-2">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                "rounded-full px-2.5 py-1.5 text-sm sm:px-3",
                section === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {item.label}
              {counts[item.id] ? ` (${counts[item.id]})` : ""}
            </button>
          ))}
        </nav>
        <span className="invisible pointer-events-none h-8 w-[4.25rem]" aria-hidden />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {section === "company" ? (
            <GridKybCompanyStep
              company={company}
              onChange={(patch) => {
                companyDirtyRef.current = true
                setCompany((prev) => ({ ...prev, ...patch }))
              }}
              errors={pointers}
              disabled={!editable}
            />
          ) : null}
          {section === "people" ? (
            <GridKybPeopleStep
              people={packet?.people ?? []}
              errors={pointers}
              disabled={!editable}
              onReload={async () => {
                await load()
              }}
            />
          ) : null}
          {section === "documents" ? (
            <GridKybDocumentsStep
              documents={packet?.documents ?? []}
              errors={pointers}
              disabled={!editable}
              onReload={async () => {
                await load()
              }}
              onRemove={removeDocument}
            />
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-background px-4 py-3 sm:px-6">
        <Button type="button" variant="outline" size="sm" disabled={pendingCta === "exit"} onClick={() => void saveAndExit()}>
          {pendingCta === "exit" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {GRID_KYB_WIZARD_COPY.saveAndExit}
        </Button>
        <div className="flex gap-2">
          {section !== "documents" ? (
            <Button type="button" size="sm" disabled={!editable || pendingCta === "next"} onClick={() => void goNext()}>
              {pendingCta === "next" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {GRID_KYB_WIZARD_COPY.continue}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!editable || pendingCta === "complete"}
              onClick={() => void complete()}
            >
              {pendingCta === "complete" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {GRID_KYB_WIZARD_COPY.complete}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
