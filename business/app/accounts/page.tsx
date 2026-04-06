"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { currencySymbols } from "@/lib/currency-meta"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CurrencyDepositDialog } from "@/components/currency-deposit-dialog"
import { FXConvertDialog } from "@/components/fx-convert-dialog"
import { StatementDownloadDialog } from "@/components/statement-download-dialog"
import { CurrencyFlag } from "@/components/flags"
import { MoreVertical, FileText, Ban, Trash2 } from "lucide-react"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import { OpenCurrencyAccountDialog } from "@/components/accounts/open-currency-account-dialog"

export default function AccountsPage() {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const {
    accountRows,
    loading,
    loadError,
    tier1Complete,
    profileLoading,
    refreshAccounts,
    noahHeaders,
  } = useBusinessAccountRows()

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (profileLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-currency accounts powered by stablecoins
          </p>
        </div>
        <OpenCurrencyAccountDialog onAdded={() => void refreshAccounts()} />
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading account details…</p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accountRows.map((account) => (
          <Card key={account.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex flex-col h-full">
                <div className="flex-1 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <CurrencyFlag currency={account.currency} size={40} className="rounded-md" />
                      <div>
                        <h3 className="text-lg font-semibold">{account.currency}</h3>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {account.status}
                    </Badge>
                  </div>

                  <div className="mb-10">
                    <p className="text-xs text-muted-foreground mb-1">Available Balance</p>
                    <p className="text-3xl font-semibold">
                      {currencySymbols[account.currency]}
                      {account.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <CurrencyDepositDialog
                    account={account}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                  />
                  <FXConvertDialog
                    account={account}
                    destinationCurrencies={accountRows.map((a) => a.currency)}
                    tier1Complete={tier1Complete}
                    noahScopeHeader={noahHeaders}
                    onAfterMove={() => void refreshAccounts()}
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="px-2 bg-transparent">
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
        ))}
      </div>
    </div>
  )
}
