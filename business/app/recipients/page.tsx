"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search, MoreVertical, Edit, Trash2, User, Send } from "lucide-react"
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
import { deleteRecipient, listRecipients } from "@/lib/recipients-store"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"

const RECIPIENTS_CACHE_TTL_MS = 60 * 60 * 1000

export default function RecipientsPage() {
  const { user, isLoading } = useAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedRecipient, setSelectedRecipient] = useState<Beneficiary | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const {
    data: beneficiaries,
    setData: setBeneficiaries,
    loading: isRecipientsLoading,
  } = useCachedData<Beneficiary[]>({
    enabled: !isLoading && Boolean(user?.id),
    cacheKey: user?.id ? CACHE_KEYS.RECIPIENTS(user.id) : null,
    persistKey: user?.id ? `recipients_cache_${user.id}` : undefined,
    initialData: [],
    ttlMs: RECIPIENTS_CACHE_TTL_MS,
    fetcher: async () => listRecipients(user!.id),
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      // Backend schema/cache drift can briefly return 400 for recipient list reads.
      // Treat as empty state and avoid noisy console errors in the UI.
      if (message.toLowerCase().includes("bad request")) {
        setBeneficiaries([])
        return
      }
      console.error("Failed to load recipients:", message)
    },
  })

  const reconcileRecipientsFromServer = () => {
    if (!user?.id) return
    void listRecipients(user.id)
      .then((fresh) => setBeneficiaries(fresh))
      .catch((err) => console.error("Recipient cache reconcile failed:", err))
  }

  const filteredBeneficiaries = beneficiaries.filter((recipient) =>
    recipient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    recipient.bankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    recipient.country.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleEdit = (recipient: Beneficiary) => {
    setSelectedRecipient(recipient)
    setIsEditDialogOpen(true)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Recipients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your saved recipients for quick transfers</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Recipient
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Recipient</DialogTitle>
              <DialogDescription>
                Enter the recipient's details to save them for future transfers.
              </DialogDescription>
            </DialogHeader>
            <RecipientForm onSuccess={handleCreateSuccess} onSuccessWithData={handleCreateSuccessWithData} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isRecipientsLoading ? (
            <div className="space-y-4 p-4">
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
            <div className="py-12 text-center">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No recipients found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchTerm ? "Try adjusting your search terms" : "Get started by adding your first recipient"}
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search recipients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="divide-y">
                {filteredBeneficiaries.map((recipient) => (
                  <div
                    key={recipient.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative mr-1">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 overflow-hidden rounded-full border-2 border-background bg-background">
                          {recipient.countryCode ? (
                            <CountryFlag
                              code={recipient.countryCode}
                              size={24}
                              className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-none"
                            />
                          ) : (
                            <CurrencyFlag
                              currency={recipient.currency}
                              size={24}
                              className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-none"
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm">{recipient.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {recipient.bankName} • {recipient.fullAccountNumber} • {recipient.currency}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="gap-1">
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Recipient</DialogTitle>
            <DialogDescription>
              Update the recipient's details.
            </DialogDescription>
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

