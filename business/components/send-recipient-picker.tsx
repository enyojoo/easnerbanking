"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RecipientForm } from "@/components/recipient-form"
import type { Beneficiary } from "@/lib/recipient-types"
import type { RecipientUpsertInput } from "@/lib/recipients-store"
import { buildDraftBeneficiary } from "@/lib/draft-recipient"
import { Label } from "@/components/ui/label"
import { Search, Plus, ChevronDown, Loader2 } from "lucide-react"
import { SendSelectedRecipientSummary } from "@/components/send/send-selected-recipient-summary"
import { useRecipientsCached } from "@/hooks/use-recipients-cached"
import { fetchEasenetProfileByTag } from "@/lib/easenet-profile"
import { buildDraftEasetagBeneficiary } from "@/lib/draft-easetag-beneficiary"
import { filterBeneficiariesBySearch } from "@/lib/send-hub-recipient-search"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
interface SendRecipientPickerProps {
  selected: Beneficiary | null
  onSelect: (
    recipient: Beneficiary | null,
    options?: { draftRecipientPersist?: RecipientUpsertInput },
  ) => void
  beneficiaries?: Beneficiary[]
  label?: string
}

export function SendRecipientPicker({
  selected,
  onSelect,
  beneficiaries: initialBeneficiaries,
  label = "Recipient",
}: SendRecipientPickerProps) {
  const explicitRecipientList = initialBeneficiaries !== undefined
  const {
    data: cachedBeneficiaries,
    setData: setCachedBeneficiaries,
  } = useRecipientsCached(!explicitRecipientList)

  const [localBeneficiaries, setLocalBeneficiaries] = useState<Beneficiary[]>(() =>
    (initialBeneficiaries ?? []).map(coerceBeneficiaryEasenetDisplay),
  )

  const beneficiariesRaw = explicitRecipientList ? localBeneficiaries : cachedBeneficiaries
  const beneficiaries = useMemo(
    () => beneficiariesRaw.map(coerceBeneficiaryEasenetDisplay),
    [beneficiariesRaw],
  )
  const setBeneficiaries = explicitRecipientList ? setLocalBeneficiaries : setCachedBeneficiaries

  const [searchTerm, setSearchTerm] = useState("")
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  /** Hub search (@…) live lookup — same pattern as mobile send hub. */
  const [hubSearchEasenet, setHubSearchEasenet] = useState<{
    easetag: string
    fullName: string
    avatarUrl: string | null
    accountKind: "business" | "personal"
  } | null>(null)
  const [hubSearchLoading, setHubSearchLoading] = useState(false)
  const [hubSearchError, setHubSearchError] = useState<string | null>(null)

  useEffect(() => {
    if (!explicitRecipientList) return
    setLocalBeneficiaries((initialBeneficiaries ?? []).map(coerceBeneficiaryEasenetDisplay))
  }, [explicitRecipientList, initialBeneficiaries])

  useEffect(() => {
    const t = searchTerm.trim()
    if (!t.startsWith("@")) {
      setHubSearchEasenet(null)
      setHubSearchLoading(false)
      setHubSearchError(null)
      return
    }
    const raw = t.replace(/^@+/, "").trim()
    if (raw.length < 4) {
      setHubSearchEasenet(null)
      setHubSearchLoading(false)
      setHubSearchError(null)
      return
    }
    let cancelled = false
    setHubSearchLoading(true)
    setHubSearchError(null)
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetchEasenetProfileByTag(raw)
        if (cancelled) return
        setHubSearchLoading(false)
        if (res.found) {
          setHubSearchEasenet({
            easetag: res.easetag,
            fullName: res.fullName,
            avatarUrl: res.avatarUrl,
            accountKind: res.accountKind,
          })
          setHubSearchError(null)
        } else {
          setHubSearchEasenet(null)
          setHubSearchError(
            res.reason === "self" ? "You cannot add yourself as a recipient." : "Easetag not found.",
          )
        }
      })()
    }, 450)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchTerm])

  const hubDisplayRecipients = useMemo(
    () => filterBeneficiariesBySearch(beneficiaries, searchTerm),
    [beneficiaries, searchTerm],
  )

  const hubVirtualRecipient = useMemo(() => {
    if (!hubSearchEasenet) return null
    return buildDraftEasetagBeneficiary({
      easetag: hubSearchEasenet.easetag,
      fullName: hubSearchEasenet.fullName,
      avatarUrl: hubSearchEasenet.avatarUrl,
      accountKind: hubSearchEasenet.accountKind,
    })
  }, [hubSearchEasenet])

  const pickerRecipients = useMemo(() => {
    if (!hubVirtualRecipient) return hubDisplayRecipients
    return [hubVirtualRecipient, ...hubDisplayRecipients]
  }, [hubVirtualRecipient, hubDisplayRecipients])

  const handleAddSuccess = (newBeneficiary?: Beneficiary, draftPersist?: RecipientUpsertInput) => {
    if (newBeneficiary) {
      if (!draftPersist) {
        setBeneficiaries((prev) => [...prev, newBeneficiary])
      }
      onSelect(newBeneficiary, draftPersist ? { draftRecipientPersist: draftPersist } : undefined)
    }
    setIsAddDialogOpen(false)
    setIsPickerOpen(false)
  }

  const handleSelect = (b: Beneficiary) => {
    onSelect(coerceBeneficiaryEasenetDisplay(b))
    setIsPickerOpen(false)
  }

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">{label}</Label>
      <button
        type="button"
        onClick={() => setIsPickerOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-input bg-background px-4 py-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-ring"
      >
        {selected ? (
          <SendSelectedRecipientSummary beneficiary={selected} />
        ) : (
          <span className="text-muted-foreground">Select recipient</span>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      <Dialog
        open={isPickerOpen}
        onOpenChange={(open) => {
          setIsPickerOpen(open)
          if (!open) {
            setSearchTerm("")
            setHubSearchEasenet(null)
            setHubSearchLoading(false)
            setHubSearchError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select recipient</DialogTitle>
            <DialogDescription>Choose a saved recipient or add a new one</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search @easetag or recipients"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchTerm.trim().startsWith("@") && hubSearchLoading ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            {searchTerm.trim().startsWith("@") && hubSearchError && !hubSearchLoading ? (
              <p className="text-xs text-destructive">{hubSearchError}</p>
            ) : null}
            <div className="max-h-[280px] overflow-y-auto space-y-1">
              {pickerRecipients.length === 0 ? (
                <div className="px-3 py-6 text-center space-y-1">
                  <p className="text-sm text-muted-foreground font-medium">
                    {searchTerm.trim() ? "No matches" : "No recipients yet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {searchTerm.trim() ? "Try another search" : "Add a recipient to send money"}
                  </p>
                </div>
              ) : null}
              {pickerRecipients.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelect(b)}
                  className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-muted hover:border-input"
                >
                  <SendSelectedRecipientSummary
                    beneficiary={b}
                    subtitleClassName="text-xs text-muted-foreground"
                  />
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setIsPickerOpen(false)
                setIsAddDialogOpen(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add new recipient
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="min-w-0 overflow-x-hidden sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add recipient</DialogTitle>
            <DialogDescription>Enter the recipient&apos;s details</DialogDescription>
          </DialogHeader>
          <RecipientForm
            onValidatedSubmit={async (payload) => {
              const draft = buildDraftBeneficiary(payload)
              handleAddSuccess(draft, payload)
            }}
            onSuccess={() => handleAddSuccess()}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
