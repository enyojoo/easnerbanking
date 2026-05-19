"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search, MoreVertical, Edit, Trash2, User, Send, Users } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { RecipientForm } from "@/components/recipient-form"
import type { Beneficiary } from "@/lib/recipient-types"
import { CountryFlag, CurrencyFlag } from "@/components/flags"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { coerceBeneficiaryEasenetDisplay, deleteRecipient, listRecipients } from "@/lib/recipients-store"
import { useAuth } from "@/lib/auth-context"
import { useRecipientsCached } from "@/hooks/use-recipients-cached"
import { createSendFlowSeedForRecipient, persistSendFlowState } from "@/lib/send-flow-session"
import { cn } from "@/lib/utils"
import { EasenetRecipientProfileRowHydrated } from "@/components/easenet-recipient-profile-row-hydrated"

export function SettingsRecipientsTab() {
  const router = useRouter()
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedRecipient, setSelectedRecipient] = useState<Beneficiary | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const {
    data: beneficiariesRaw,
    setData: setBeneficiaries,
    loading: isRecipientsLoading,
  } = useRecipientsCached(true)

  const beneficiaries = useMemo(
    () => beneficiariesRaw.map(coerceBeneficiaryEasenetDisplay),
    [beneficiariesRaw],
  )
  const showLoading = isRecipientsLoading && beneficiaries.length === 0

  const reconcileRecipientsFromServer = () => {
    if (!user?.id) return
    void listRecipients(user.id)
      .then((fresh) => setBeneficiaries(fresh))
      .catch((err) => console.error("Recipient cache reconcile failed:", err))
  }

  const recipientMatchesSearch = (recipient: Beneficiary, term: string) => {
    if (!term.trim()) return true
    const q = term.toLowerCase()
    return [
      recipient.name,
      recipient.bankName,
      recipient.country,
      recipient.payeeEasetag ? `@${recipient.payeeEasetag}` : "",
      recipient.accountNumber,
      recipient.fullAccountNumber,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q)
  }

  const filteredBeneficiaries = beneficiaries.filter((recipient) =>
    recipientMatchesSearch(recipient, searchTerm)
  )

  const recipientInitials = (r: Beneficiary) =>
    r.name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"

  const handleEdit = (recipient: Beneficiary) => {
    setSelectedRecipient(recipient)
    setIsEditDialogOpen(true)
  }

  const handleSendMoney = (recipient: Beneficiary) => {
    persistSendFlowState(createSendFlowSeedForRecipient(recipient))
    router.push("/send")
  }

  const handleDelete = (recipientId: string) => {
    void deleteRecipient(recipientId)
      .then(() => {
        setBeneficiaries((prev) => {
          return prev.filter((b) => b.id !== recipientId)
        })
        reconcileRecipientsFromServer()
      })
      .catch((err) => console.error("Delete recipient failed:", err))
  }

  const handleCreateSuccess = () => {
    setIsCreateDialogOpen(false)
  }

  const handleCreateSuccessWithData = (beneficiary: Beneficiary) => {
    setBeneficiaries((prev) => {
      return [beneficiary, ...prev]
    })
    reconcileRecipientsFromServer()
    setIsCreateDialogOpen(false)
  }

  const handleEditSuccess = () => {
    setIsEditDialogOpen(false)
    setSelectedRecipient(null)
  }

  const handleEditSuccessWithData = (beneficiary: Beneficiary) => {
    setBeneficiaries((prev) => {
      return prev.map((b) => (b.id === beneficiary.id ? beneficiary : b))
    })
    reconcileRecipientsFromServer()
    setIsEditDialogOpen(false)
    setSelectedRecipient(null)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 shrink-0" aria-hidden />
                Recipients
              </CardTitle>
              <CardDescription>Manage your saved recipients for quick transfers</CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="shrink-0 self-start sm:self-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Recipient
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Recipient</DialogTitle>
                  <DialogDescription>
                    Enter the recipient&apos;s details to save them for future transfers.
                  </DialogDescription>
                </DialogHeader>
                <RecipientForm onSuccess={handleCreateSuccess} onSuccessWithData={handleCreateSuccessWithData} />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search recipients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
            </div>
          ) : filteredBeneficiaries.length === 0 ? (
            <div className="rounded-lg border p-8 text-center">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="font-medium text-foreground">No recipients found</p>
              <p className="text-sm text-muted-foreground mt-2">
                {searchTerm ? "Try adjusting your search terms" : "Get started by adding your first recipient"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search recipients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              {filteredBeneficiaries.map((recipient) => (
                <div
                  key={recipient.id}
                  className="flex items-center justify-between gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {recipient.payeeEasetag ? (
                        <EasenetRecipientProfileRowHydrated
                          fullName={recipient.name}
                          easetag={recipient.payeeEasetag}
                          accountKind={recipient.payeeAccountKind}
                          avatarUrl={recipient.avatarUrl}
                          className="min-w-0 flex-1"
                          nameClassName="font-semibold text-sm"
                          subtitleClassName="text-xs text-muted-foreground"
                        />
                      ) : (
                        <>
                          <div className="relative mr-1 shrink-0">
                            {recipient.avatarUrl ? (
                              <Avatar className="h-10 w-10 border border-border">
                                <AvatarImage src={recipient.avatarUrl} alt="" />
                                <AvatarFallback>{recipientInitials(recipient)}</AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                <User className="h-5 w-5 text-primary" />
                              </div>
                            )}
                            <div className="absolute -bottom-0.5 -right-0.5 size-5 overflow-hidden rounded-full border-2 border-background">
                              {recipient.countryCode ? (
                                <CountryFlag code={recipient.countryCode} className="size-full rounded-none" />
                              ) : (
                                <CurrencyFlag currency={recipient.currency} className="size-full rounded-none" />
                              )}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold">{recipient.name}</h3>
                            <p className="min-w-0 text-xs text-muted-foreground">
                              {`${recipient.bankName} • ${recipient.fullAccountNumber} • ${recipient.currency}`}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleSendMoney(recipient)}
                      >
                        <Send className="h-3 w-3" />
                        Send
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(recipient)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(recipient.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Recipient</DialogTitle>
            <DialogDescription>Update the recipient&apos;s details.</DialogDescription>
          </DialogHeader>
          <RecipientForm
            recipient={selectedRecipient}
            onSuccess={handleEditSuccess}
            onSuccessWithData={handleEditSuccessWithData}
            isEdit={true}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
