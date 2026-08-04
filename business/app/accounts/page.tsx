"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getCurrencySymbol } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CurrencyDepositDialog } from "@/components/currency-deposit-dialog"
import { StatementDownloadDialog } from "@/components/statement-download-dialog"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { MoreVertical, FileText, Ban, Trash2 } from "lucide-react"
import { VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import { useIncomingBalances } from "@/hooks/queries/use-incoming-balance"
import { OpenCurrencyAccountDialog } from "@/components/accounts/open-currency-account-dialog"

export default function AccountsPage() {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const {
    accountRows,
    loading,
    profileLoading,
    refreshAccounts,
    noahHeaders,
    accountsProvisioning,
    tier1Complete,
  } = useBusinessAccountRows()
  const incomingQuery = useIncomingBalances()

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-currency accounts powered by stablecoins
          </p>
        </div>
        {profileLoading ? (
          <Skeleton className="h-9 w-44 shrink-0 rounded-md" />
        ) : (
          <OpenCurrencyAccountDialog onAdded={() => void refreshAccounts()} />
        )}
      </div>

      {tier1Complete && accountsProvisioning ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            {VERIFICATION_SECTION_COPY.accountsProvisioning}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading && accountRows.length === 0 ? (
          <>
            <Card>
              <CardContent className="space-y-6 p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-[35px] w-[35px] rounded-full" />
                  <Skeleton className="h-6 w-16" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-40" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-9" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-6 p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-[35px] w-[35px] rounded-full" />
                  <Skeleton className="h-6 w-16" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-40" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-9" />
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          accountRows.map((account) => (
            <Card key={account.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex h-full flex-col">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <CurrencyFlagCircle currency={account.currency} size={35} />
                        <div>
                          <h3 className="text-lg font-semibold">{account.currency}</h3>
                        </div>
                      </div>
                    </div>

                    <div className="mb-10">
                      <p className="mb-1 text-xs text-muted-foreground">Available Balance</p>
                      <p className="text-[2rem] font-semibold leading-tight tracking-tight">
                        {getCurrencySymbol(account.currency)}
                        {account.balance.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      {(() => {
                        const incoming = Number(
                          incomingQuery.data?.[account.currency.toUpperCase()] ?? 0,
                        )
                        if (!Number.isFinite(incoming) || incoming <= 0) return null
                        return (
                          <div className="mt-3">
                            <p className="mb-0.5 text-xs text-muted-foreground">Incoming</p>
                            <p className="text-sm font-medium tabular-nums text-foreground">
                              {getCurrencySymbol(account.currency)}
                              {incoming.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <CurrencyDepositDialog
                      account={account}
                      copiedField={copiedField}
                      onCopy={copyToClipboard}
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="bg-transparent px-2">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <StatementDownloadDialog
                          noahScopeHeader={noahHeaders}
                          accountCurrency={account.currency}
                          trigger={
                            <DropdownMenuItem
                              className="gap-2"
                              onSelect={(e) => e.preventDefault()}
                            >
                              <FileText className="h-4 w-4" />
                              Download Statement
                            </DropdownMenuItem>
                          }
                        />
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2">
                          <Ban className="h-4 w-4" />
                          Disable Account
                        </DropdownMenuItem>
                        {account.currency !== "USD" && account.currency !== "EUR" ? (
                          <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4" />
                            Delete Account
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
