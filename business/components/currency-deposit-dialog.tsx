"use client"

import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Copy, Check, Plus, Share2 } from "lucide-react"
import type { Account } from "@/lib/finance-types"
import { QRCodeSVG } from "qrcode.react"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { TIER2_COMPLETE_PLACEHOLDER } from "@/lib/compliance-placeholders"
import {
  getPaymentInstructions,
  getStablecoinPaymentInstructions,
} from "@/lib/payment-instructions"

interface CopyableFieldProps {
  label: string
  value: string
  copiedField: string | null
  fieldId: string
  onCopy: (text: string, field: string) => void
}

function CopyableField({ label, value, copiedField, fieldId, onCopy }: CopyableFieldProps) {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg gap-2">
        <code className="text-sm font-mono break-all flex-1 min-w-0">{value}</code>
        <button
          onClick={() => onCopy(value, fieldId)}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          {copiedField === fieldId ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  )
}

function PaymentInstructions({
  currency,
  type,
  stablecoinToken,
}: {
  currency: string
  type: "bank" | "stablecoin"
  /** When set (e.g. live Noah wallet), overrides USD→USDC / EUR→EURC default. */
  stablecoinToken?: string
}) {
  const lines =
    type === "bank"
      ? getPaymentInstructions(currency, "bank")
      : stablecoinToken === "USDT"
        ? getStablecoinPaymentInstructions("USDT")
        : getPaymentInstructions(currency, "stablecoin")

  if (!lines.length) return null

  return (
    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}

interface CurrencyDepositDialogProps {
  account: Account
  copiedField: string | null
  onCopy: (text: string, field: string) => void
}

export function CurrencyDepositDialog({ account, copiedField, onCopy }: CurrencyDepositDialogProps) {
  const { tier1Complete } = useBusinessProfile()
  const stablecoinAccount =
    account.stablecoinAddress && account.stablecoinToken
      ? {
          currency: account.currency,
          stablecoin: account.stablecoinToken,
          chain: account.stablecoinChain ?? "Solana",
          address: account.stablecoinAddress,
          memo: "",
        }
      : undefined
  const hasStablecoin = stablecoinAccount !== undefined
  const showBankTab = account.showBankDepositTab ?? !tier1Complete
  const showStablecoinTab = hasStablecoin
  const showTabBar = showBankTab && showStablecoinTab
  const defaultTab = showBankTab ? "bank" : "stablecoin"

  const isNgn = account.currency === "NGN"
  const blockedByAfricanTier = isNgn && !TIER2_COMPLETE_PLACEHOLDER
  const hasProvisionedDepositDetails =
    Boolean(account.fullAccountNumber?.trim()) ||
    Boolean(account.stablecoinAddress?.trim()) ||
    account.accountNumber !== "—"
  const blockedByGlobalTier = !isNgn && !tier1Complete && !hasProvisionedDepositDetails
  const depositDetailsBlocked = blockedByAfricanTier || blockedByGlobalTier

  const handleShare = async (type: "bank" | "stablecoin") => {
    const bankDetails = type === "bank"
      ? [
          `Account Name: ${account.accountName}`,
          account.iban && `IBAN: ${account.iban}`,
          account.bic && `BIC/SWIFT: ${account.bic}`,
          !account.iban && account.fullAccountNumber && `Account Number: ${account.fullAccountNumber}`,
          account.routingNumber && `Routing Number: ${account.routingNumber}`,
          account.sortCode && `Sort Code: ${account.sortCode}`,
          `Bank Name: ${account.bankName}`,
        ].filter(Boolean).join("\n")
      : stablecoinAccount
        ? [
            `Network: SOL • Solana`,
            `${stablecoinAccount.stablecoin} Address: ${stablecoinAccount.address}`,
          ].filter(Boolean).join("\n")
        : ""

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${account.currency} Deposit Details`,
          text: bankDetails,
        })
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          onCopy(bankDetails, "share")
        }
      }
    } else {
      onCopy(bankDetails, "share")
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1 bg-transparent gap-2">
          <Plus className="h-4 w-4" />
          Deposit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CurrencyFlagCircle currency={account.currency} size={28} />
            {account.currency} Deposit
          </DialogTitle>
          <DialogDescription>
            {depositDetailsBlocked
              ? blockedByAfricanTier
                ? "African banking verification is required for NGN pay-in details."
                : ""
              : `Deposit funds via bank transfer or stablecoin. Both methods credit your ${account.currency} balance.`}
          </DialogDescription>
        </DialogHeader>

        {depositDetailsBlocked ? (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 p-4 space-y-3 text-sm text-foreground/90">
            <p>
              {blockedByAfricanTier
                ? "Please complete African banking setup for your organization to receive NGN pay-in details and local pay-in/pay-out. This is separate from global account verification."
                : "Please complete your business verification to receive bank and stablecoin deposit information."}
            </p>
            <Link
              href="/settings?tab=business"
              className="inline-block w-full sm:w-auto font-semibold underline underline-offset-2"
            >
              Verify
            </Link>
          </div>
        ) : (
        <Tabs defaultValue={defaultTab} className="w-full">
          {showTabBar ? (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bank">
                {account.currency === "USD" ? "US Bank Account" : account.currency === "EUR" ? "EU Bank Account" : "Bank transfer"}
              </TabsTrigger>
              <TabsTrigger value="stablecoin">Stablecoin</TabsTrigger>
            </TabsList>
          ) : null}

          {showBankTab ? (
          <TabsContent value="bank" className="space-y-4 mt-4">
            <div className="space-y-4">
              <CopyableField
                label="Account Name"
                value={account.accountName}
                copiedField={copiedField}
                fieldId={`bank-name-${account.id}`}
                onCopy={onCopy}
              />

              {account.currency === "EUR" && account.iban ? (
                <>
                  <CopyableField
                    label="IBAN"
                    value={account.iban}
                    copiedField={copiedField}
                    fieldId={`bank-iban-${account.id}`}
                    onCopy={onCopy}
                  />
                  {account.bic && (
                    <CopyableField
                      label="BIC/SWIFT"
                      value={account.bic}
                      copiedField={copiedField}
                      fieldId={`bank-bic-${account.id}`}
                      onCopy={onCopy}
                    />
                  )}
                </>
              ) : (
                <>
                  <CopyableField
                    label="Account Number"
                    value={account.fullAccountNumber}
                    copiedField={copiedField}
                    fieldId={`bank-acc-${account.id}`}
                    onCopy={onCopy}
                  />
                  {account.routingNumber && (
                    <CopyableField
                      label="Routing Number"
                      value={account.routingNumber}
                      copiedField={copiedField}
                      fieldId={`bank-routing-${account.id}`}
                      onCopy={onCopy}
                    />
                  )}
                  {account.sortCode && (
                    <CopyableField
                      label="Sort Code"
                      value={account.sortCode}
                      copiedField={copiedField}
                      fieldId={`bank-sort-${account.id}`}
                      onCopy={onCopy}
                    />
                  )}
                </>
              )}

              <CopyableField
                label="Bank Name"
                value={account.bankName}
                copiedField={copiedField}
                fieldId={`bank-bank-${account.id}`}
                onCopy={onCopy}
              />
            </div>

            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => handleShare("bank")}>
              <Share2 className="h-4 w-4" />
              Share Account Details
            </Button>

            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">Payment Instructions</p>
              <PaymentInstructions currency={account.currency} type="bank" />
            </div>
          </TabsContent>
          ) : null}

          <TabsContent value="stablecoin" className="space-y-4 mt-4">
            {hasStablecoin && stablecoinAccount ? (
              <>
                <div className="flex flex-col items-center">
                  <div className="p-4 bg-white rounded-xl border">
                    <QRCodeSVG value={stablecoinAccount.address} size={200} level="M" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Scan to send {stablecoinAccount.stablecoin}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Network</p>
                  <div className="p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">
                      {stablecoinAccount.chain === "Solana" ? "SOL" : stablecoinAccount.chain === "Ethereum" ? "ETH" : stablecoinAccount.chain}
                    </span>
                    <span className="text-sm text-muted-foreground"> • </span>
                    <span className="text-sm text-muted-foreground">{stablecoinAccount.chain}</span>
                  </div>
                </div>

                <CopyableField
                  label="Address"
                  value={stablecoinAccount.address}
                  copiedField={copiedField}
                  fieldId={`stable-addr-${account.id}`}
                  onCopy={onCopy}
                />

                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => handleShare("stablecoin")}>
                  <Share2 className="h-4 w-4" />
                  Share {stablecoinAccount.stablecoin} Details
                </Button>

                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Payment Instructions</p>
                  <PaymentInstructions
                    currency={account.currency}
                    type="stablecoin"
                    stablecoinToken={stablecoinAccount?.stablecoin}
                  />
                </div>
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Stablecoin deposits for {account.currency} are coming soon.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
