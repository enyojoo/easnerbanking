"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  emptyGridKybCompanyDraft,
  filterResolvedGridKybErrorPointers,
  firstGridKybErrorSection,
  gridKybApplicationIsEditable,
  gridKybWizardReadiness,
  mergeGridKybCompanyDraft,
  type GridKybCompanyDraft,
  type GridKybFormSection,
  type GridKybWizardReadiness,
} from "@easner/shared"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ensureBusinessOperationalAddressCountryRegistered } from "@/lib/address/register-lib-address-countries"
import { GRID_KYB_WIZARD_COPY } from "@/lib/copy/business-ui-copy"
import { cn } from "@/lib/utils"
import type { KybDocumentPacket, KybPacket } from "@/lib/grid/kyb-packet-types"
import { fetchKybPacket, KYB_PACKET_QUERY_KEY } from "@/lib/grid/kyb-packet-query"
import { useQueryClient } from "@tanstack/react-query"
import { GridKybCompanyStep } from "./grid-kyb-company-step"
import { GridKybPeopleStep } from "./grid-kyb-people-step"
import { GridKybDocumentsStep } from "./grid-kyb-documents-step"

type Props = {
  onClose: () => void
  initialCompany?: GridKybCompanyDraft
  initialPacket: KybPacket
  initialInReview?: boolean
}

const SECTIONS: { id: GridKybFormSection; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "people", label: "People" },
  { id: "documents", label: "Documents" },
]

export function GridKybWizard({ onClose, initialCompany, initialPacket, initialInReview = false }: Props) {
  const queryClient = useQueryClient()
  const [packet, setPacketState] = useState<KybPacket>(initialPacket)
  const [company, setCompany] = useState<GridKybCompanyDraft>(() =>
    mergeGridKybCompanyDraft(
      initialCompany ?? emptyGridKybCompanyDraft(),
      initialPacket.company,
      "prefer-incoming",
    ),
  )
  const [section, setSection] = useState<GridKybFormSection>(() =>
    initialPacket.errorPointers?.length ? firstGridKybErrorSection(initialPacket.errors) : "company",
  )
  const [pendingCta, setPendingCta] = useState<"exit" | "next" | "complete" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const companyDirtyRef = useRef(false)
  const hydratedSectionRef = useRef(Boolean(initialPacket.errorPointers?.length))

  const setPacket = useCallback(
    (next: KybPacket | ((prev: KybPacket) => KybPacket)) => {
      setPacketState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next
        queryClient.setQueryData(KYB_PACKET_QUERY_KEY, resolved)
        return resolved
      })
    },
    [queryClient],
  )

  const load = useCallback(async () => {
    const json = await fetchKybPacket()
    setPacket(json)
    if (!companyDirtyRef.current) {
      setCompany((prev) => mergeGridKybCompanyDraft(prev, json.company, "prefer-incoming"))
    }
    if (!hydratedSectionRef.current && json.errorPointers?.length) {
      setSection(firstGridKybErrorSection(json.errors))
    }
    hydratedSectionRef.current = true
    return json
  }, [setPacket])

  useEffect(() => {
    if (!initialCompany || companyDirtyRef.current) return
    setCompany((prev) => mergeGridKybCompanyDraft(prev, initialCompany, "fill-empty"))
  }, [initialCompany])

  useEffect(() => {
    const code = (company.addressCountry || company.country).trim()
    if (code) void ensureBusinessOperationalAddressCountryRegistered(code)
  }, [company.addressCountry, company.country])

  const status = packet?.status ?? (initialInReview ? "in_review" : null)
  const editable = gridKybApplicationIsEditable(status)
  const pointers = useMemo(() => {
    return filterResolvedGridKybErrorPointers({
      pointers: packet?.errorPointers ?? [],
      company,
      people: packet?.people ?? [],
      documents: packet?.documents ?? [],
    })
  }, [packet, company])
  const counts = useMemo(() => {
    return {
      company: pointers.filter((row) => row.section === "company").length,
      people: pointers.filter((row) => row.section === "people").length,
      documents: pointers.filter((row) => row.section === "documents").length,
    }
  }, [pointers])
  const readiness = useMemo(() => {
    const documents = packet?.documents ?? []
    return gridKybWizardReadiness({
      status,
      remainingPointers: pointers.length,
      company,
      peopleCount: packet?.people.length ?? 0,
      hasIdentityDocument: documents.some((row) => row.category === "identity"),
      hasCompanyDocument: documents.some((row) => !row.personId),
    })
  }, [status, pointers.length, company, packet])

  async function saveCompany() {
    const res = await fetch("/api/grid/kyb/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(company),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(json.error || "Could not save company details")
    setPacket((prev) => ({ ...prev, company }))
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

  function rememberDocument(doc: KybDocumentPacket) {
    setPacket((prev) => {
      if (prev.documents.some((row) => row.id === doc.id)) return prev
      return { ...prev, documents: [...prev.documents, doc] }
    })
  }

  function forgetDocument(id: string) {
    setPacket((prev) => ({ ...prev, documents: prev.documents.filter((row) => row.id !== id) }))
  }

  async function reloadQuiet() {
    try {
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load verification")
    }
  }

  async function removeDocument(id: string) {
    const res = await fetch(`/api/grid/kyb/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      const message = json.error || "Could not remove document"
      setError(message)
      throw new Error(message)
    }
    forgetDocument(id)
  }

  if ((status === "in_review" || status === "submitted") && !editable) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-2 py-2 sm:px-4">
          <Button type="button" variant="ghost" size="sm" className="h-8 min-w-[8.5rem] justify-start gap-1 px-2" onClick={onClose}>
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
          <span />
          <GridKybReadinessLabel readiness="in_review" />
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
        <Button type="button" variant="ghost" size="sm" className="h-8 min-w-[8.5rem] justify-start gap-1 px-2" onClick={onClose}>
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
        <GridKybReadinessLabel readiness={readiness} />
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
              documents={packet?.documents ?? []}
              errors={pointers}
              disabled={!editable}
              onReload={reloadQuiet}
              onDocumentAdded={rememberDocument}
              onRemoveDocument={removeDocument}
            />
          ) : null}
          {section === "documents" ? (
            <GridKybDocumentsStep
              documents={packet?.documents ?? []}
              errors={pointers}
              disabled={!editable}
              onReload={reloadQuiet}
              onUploaded={rememberDocument}
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
              disabled={!editable || readiness !== "ready_to_submit" || pendingCta === "complete"}
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

function GridKybReadinessLabel({ readiness }: { readiness: GridKybWizardReadiness }) {
  const copy = {
    not_submitted: GRID_KYB_WIZARD_COPY.readinessNotSubmitted,
    needs_attention: GRID_KYB_WIZARD_COPY.readinessNeedsAttention,
    ready_to_submit: GRID_KYB_WIZARD_COPY.readinessReady,
    in_review: GRID_KYB_WIZARD_COPY.readinessInReview,
    approved: GRID_KYB_WIZARD_COPY.readinessApproved,
  }[readiness]
  return (
    <p
      className={cn(
        "min-w-[8.5rem] text-right text-xs font-medium",
        readiness === "needs_attention" && "text-amber-700 dark:text-amber-400",
        readiness === "ready_to_submit" && "text-emerald-700 dark:text-emerald-400",
        (readiness === "not_submitted" || readiness === "in_review") && "text-muted-foreground",
        readiness === "approved" && "text-emerald-700 dark:text-emerald-400",
      )}
    >
      {copy}
    </p>
  )
}
