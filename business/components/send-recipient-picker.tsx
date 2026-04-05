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
import { Label } from "@/components/ui/label"
import { Search, Plus, User, ChevronDown } from "lucide-react"
import { CountryFlag, CurrencyFlag } from "@/components/flags"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { listRecipients } from "@/lib/recipients-store"
import { useAuth } from "@/lib/auth-context"

interface SendRecipientPickerProps {
  selected: Beneficiary | null
  onSelect: (recipient: Beneficiary | null) => void
  beneficiaries?: Beneficiary[]
  label?: string
}

export function SendRecipientPicker({
  selected,
  onSelect,
  beneficiaries: initialBeneficiaries,
  label = "Recipient",
}: SendRecipientPickerProps) {
  const { user, isLoading } = useAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(
    () => initialBeneficiaries ?? []
  )

  useEffect(() => {
    let isMounted = true
    if (initialBeneficiaries && initialBeneficiaries.length) {
      setBeneficiaries(initialBeneficiaries)
      return
    }
    if (isLoading || !user?.id) return
    void listRecipients(user.id)
      .then((rows) => {
        if (isMounted) setBeneficiaries(rows)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        if (message.toLowerCase().includes("bad request")) {
          if (isMounted) setBeneficiaries([])
          return
        }
        console.error("Failed to load recipients:", message)
      })
    return () => {
      isMounted = false
    }
  }, [initialBeneficiaries, isLoading, user?.id])

  const recipientSearchHaystack = (b: Beneficiary) =>
    [
      b.name,
      b.bankName,
      b.country,
      b.email,
      b.payeeEasetag ? `@${b.payeeEasetag}` : "",
      b.accountNumber,
      b.fullAccountNumber,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

  const filteredBeneficiaries = useMemo(() => {
    if (!searchTerm.trim()) return beneficiaries
    const term = searchTerm.toLowerCase()
    return beneficiaries.filter((b) => recipientSearchHaystack(b).includes(term))
  }, [beneficiaries, searchTerm])

  const handleAddSuccess = (newBeneficiary?: Beneficiary) => {
    if (newBeneficiary) {
      setBeneficiaries((prev) => [...prev, newBeneficiary])
      onSelect(newBeneficiary)
    }
    setIsAddDialogOpen(false)
    setIsPickerOpen(false)
  }

  const handleSelect = (b: Beneficiary) => {
    onSelect(b)
    setIsPickerOpen(false)
  }

  const recipientInitials = (b: Beneficiary) =>
    b.name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">{label}</Label>
      <button
        type="button"
        onClick={() => setIsPickerOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-input bg-background px-4 py-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-ring"
      >
        {selected ? (
          <div className="flex items-center gap-3">
            <div className="relative mr-1 shrink-0">
              {selected.avatarUrl ? (
                <Avatar className="h-10 w-10 border border-border">
                  <AvatarImage src={selected.avatarUrl} alt="" />
                  <AvatarFallback>{recipientInitials(selected)}</AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 overflow-hidden rounded-full border-2 border-background bg-background">
                {selected.countryCode ? (
                  <CountryFlag
                    code={selected.countryCode}
                    size={24}
                    className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-none"
                  />
                ) : (
                  <CurrencyFlag
                    currency={selected.currency}
                    size={24}
                    className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-none"
                  />
                )}
              </div>
            </div>
            <div>
              <p className="font-medium">{selected.name}</p>
              <p className="text-sm text-muted-foreground">
                <span>
                  {selected.payeeEasetag
                    ? `@${selected.payeeEasetag} • ${selected.currency}`
                    : `${selected.currency} • ${selected.fullAccountNumber}`}
                </span>
              </p>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">Select recipient</span>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select recipient</DialogTitle>
            <DialogDescription>Choose a saved recipient or add a new one</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, bank, Easetag, or country..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-[280px] overflow-y-auto space-y-1">
              {filteredBeneficiaries.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelect(b)}
                  className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-muted hover:border-input"
                >
                  <div className="relative mr-1 shrink-0">
                    {b.avatarUrl ? (
                      <Avatar className="h-10 w-10 border border-border">
                        <AvatarImage src={b.avatarUrl} alt="" />
                        <AvatarFallback>{recipientInitials(b)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 overflow-hidden rounded-full border-2 border-background bg-background">
                      {b.countryCode ? (
                        <CountryFlag
                          code={b.countryCode}
                          size={24}
                          className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-none"
                        />
                      ) : (
                        <CurrencyFlag
                          currency={b.currency}
                          size={24}
                          className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-none"
                        />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{b.name}</p>
                    <p className="text-sm text-muted-foreground min-w-0">
                      <span className="truncate">
                        {b.payeeEasetag
                          ? `@${b.payeeEasetag} • ${b.currency}`
                          : `${b.bankName} • ${b.currency}`}
                      </span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add recipient</DialogTitle>
            <DialogDescription>Enter the recipient&apos;s details</DialogDescription>
          </DialogHeader>
          <RecipientForm
            onSuccess={() => handleAddSuccess()}
            onSuccessWithData={(b) => handleAddSuccess(b)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
