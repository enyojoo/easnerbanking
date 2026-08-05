"use client"

import { useState, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Copy, Check, Share2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import type { Account } from "@/lib/finance-types"
import type { Invoice } from "@/lib/b2b/types"
import { cn, formatCurrency } from "@/lib/utils"
import { businessInfo } from "@/lib/business-info"
import { buildInvoiceCustomerViewUrl } from "@/lib/invoice-public-url"
import { getPaymentInstructions } from "@/lib/payment-instructions"
import {
  bankPaymentExtraInstruction,
  countPaymentMethods,
  customerPaymentDisplaySubtitle,
  customerPaymentDisplayTitle,
  customerPaymentTabHint,
  invoicePaymentTabLabel,
  stablecoinPaymentExtraInstruction,
  type InvoicePaymentTab,
  type PaymentMethodsFlags,
} from "@/lib/invoices/invoice-payment-copy"
import { InvoiceStripeCheckout } from "@/components/invoice-stripe-checkout"
import type { PublicInvoiceStripeCheckout } from "@/lib/invoices/json-public-invoice-from-row"

interface StablecoinAccount {
  currency: string
  stablecoin: string
  chain: string
  address: string
  memo?: string
}

type PaymentTab = InvoicePaymentTab

interface InvoicePaymentOptionsProps {
  invoice: Invoice
  bankAccount?: Account
  stablecoinAccount?: StablecoinAccount
  /** Overrides “from” name in share text; defaults to static `businessInfo`. */
  businessDisplayName?: string
  /** When true, render without Card wrapper (e.g. inside invoice frame) */
  embedded?: boolean
  /** "customer" = invoice view; "business" = invoice detail page */
  audience?: "customer" | "business"
  /** Controlled tab value - when provided, parent tracks selection */
  value?: PaymentTab
  onValueChange?: (value: PaymentTab) => void
  /** When set, public “view invoice” links use `/invoice/{easetag}/{invoiceNumber}` instead of row id. */
  publicInvoiceEasetag?: string | null
  /** Initial tab when methods shown */
  defaultTab?: PaymentTab
  /** Show Stripe Pay online tab */
  showOnlinePayment?: boolean
  /** Preloaded checkout session from the public invoice payload. */
  stripeCheckout?: PublicInvoiceStripeCheckout | null
}

const audienceDescriptions = {
  business: "Share these details with your customer.",
} as const

function CopyableField({
  label,
  value,
  copiedField,
  fieldId,
  onCopy,
}: {
  label: string
  value: string
  copiedField: string | null
  fieldId: string
  onCopy: (t: string, f: string) => void
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg gap-2">
        <code className="text-sm font-mono break-all flex-1 min-w-0">{value}</code>
        <button
          onClick={() => onCopy(value, fieldId)}
          className="text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors"
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
  extraLines = [],
}: {
  currency: string
  type: "bank" | "stablecoin"
  extraLines?: string[]
}) {
  const lines = [...getPaymentInstructions(currency, type), ...extraLines]
  if (!lines.length) return null

  return (
    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}

function TabHint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

function OnlinePanel({
  invoice,
  audience,
  publicInvoiceEasetag,
  stripeCheckout,
  mountCheckout,
  showTabHint,
}: {
  invoice: Invoice
  audience: "customer" | "business"
  publicInvoiceEasetag?: string | null
  stripeCheckout: PublicInvoiceStripeCheckout | null
  mountCheckout: boolean
  showTabHint: boolean
}) {
  return (
    <div className="space-y-4">
      {showTabHint ? (
        <TabHint>{customerPaymentTabHint("online", invoice.invoiceNumber)}</TabHint>
      ) : null}
      {mountCheckout ? (
        <InvoiceStripeCheckout
          invoice={invoice}
          easetag={publicInvoiceEasetag?.trim() || "preview"}
          initialCheckout={stripeCheckout}
          previewOnly={audience === "business" || !publicInvoiceEasetag?.trim()}
        />
      ) : null}
    </div>
  )
}

function BankPanel({
  invoice,
  bankAccount,
  copiedField,
  onCopy,
  onShare,
  showTabHint,
}: {
  invoice: Invoice
  bankAccount: Account
  copiedField: string | null
  onCopy: (t: string, f: string) => void
  onShare: () => void
  showTabHint: boolean
}) {
  return (
    <div className="space-y-4">
      {showTabHint ? (
        <TabHint>{customerPaymentTabHint("bank", invoice.invoiceNumber)}</TabHint>
      ) : null}
      <div className="space-y-4">
        <CopyableField
          label="Account Name"
          value={bankAccount.accountName}
          copiedField={copiedField}
          fieldId="inv-bank-name"
          onCopy={onCopy}
        />
        {bankAccount.currency === "EUR" && bankAccount.iban ? (
          <>
            <CopyableField
              label="IBAN"
              value={bankAccount.iban}
              copiedField={copiedField}
              fieldId="inv-iban"
              onCopy={onCopy}
            />
            {bankAccount.bic ? (
              <CopyableField
                label="BIC/SWIFT"
                value={bankAccount.bic}
                copiedField={copiedField}
                fieldId="inv-bic"
                onCopy={onCopy}
              />
            ) : null}
          </>
        ) : (
          <>
            <CopyableField
              label="Account Number"
              value={bankAccount.fullAccountNumber}
              copiedField={copiedField}
              fieldId="inv-acc"
              onCopy={onCopy}
            />
            {bankAccount.routingNumber ? (
              <CopyableField
                label="Routing Number"
                value={bankAccount.routingNumber}
                copiedField={copiedField}
                fieldId="inv-routing"
                onCopy={onCopy}
              />
            ) : null}
            {bankAccount.sortCode ? (
              <CopyableField
                label="Sort Code"
                value={bankAccount.sortCode}
                copiedField={copiedField}
                fieldId="inv-sort"
                onCopy={onCopy}
              />
            ) : null}
          </>
        )}
        <CopyableField
          label="Bank Name"
          value={bankAccount.bankName}
          copiedField={copiedField}
          fieldId="inv-bank"
          onCopy={onCopy}
        />
        {bankAccount.bankAddress ? (
          <CopyableField
            label="Address"
            value={bankAccount.bankAddress}
            copiedField={copiedField}
            fieldId="inv-bank-addr"
            onCopy={onCopy}
          />
        ) : null}
      </div>
      <Button variant="outline" size="sm" className="w-full gap-2" onClick={onShare}>
        {copiedField === "share-bank" ? (
          <Check className="h-4 w-4 text-primary" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        {copiedField === "share-bank" ? "Copied" : "Share Account Details"}
      </Button>
      <div className="pt-4 border-t">
        <p className="text-sm font-medium mb-2">Payment Instructions</p>
        <PaymentInstructions
          currency={invoice.currency}
          type="bank"
          extraLines={[bankPaymentExtraInstruction(invoice.invoiceNumber)]}
        />
      </div>
    </div>
  )
}

function StablecoinPanel({
  invoice,
  stablecoinAccount,
  copiedField,
  onCopy,
  onShare,
  showTabHint,
}: {
  invoice: Invoice
  stablecoinAccount: StablecoinAccount
  copiedField: string | null
  onCopy: (t: string, f: string) => void
  onShare: () => void
  showTabHint: boolean
}) {
  return (
    <div className="space-y-4">
      {showTabHint ? (
        <TabHint>{customerPaymentTabHint("stablecoin", invoice.invoiceNumber)}</TabHint>
      ) : null}
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
            {stablecoinAccount.chain === "Solana"
              ? "SOL"
              : stablecoinAccount.chain === "Ethereum"
                ? "ETH"
                : stablecoinAccount.chain}
          </span>
          <span className="text-sm text-muted-foreground"> • </span>
          <span className="text-sm text-muted-foreground">{stablecoinAccount.chain}</span>
        </div>
      </div>
      <CopyableField
        label="Address"
        value={stablecoinAccount.address}
        copiedField={copiedField}
        fieldId="inv-addr"
        onCopy={onCopy}
      />
      <Button variant="outline" size="sm" className="w-full gap-2" onClick={onShare}>
        {copiedField === "share-stablecoin" ? (
          <Check className="h-4 w-4 text-primary" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        {copiedField === "share-stablecoin"
          ? "Copied"
          : `Share ${stablecoinAccount.stablecoin} Details`}
      </Button>
      <div className="pt-4 border-t">
        <p className="text-sm font-medium mb-2">Payment Instructions</p>
        <PaymentInstructions
          currency={invoice.currency}
          type="stablecoin"
          extraLines={[stablecoinPaymentExtraInstruction(invoice.total, invoice.currency)]}
        />
      </div>
    </div>
  )
}

function resolveSingleMethod(flags: PaymentMethodsFlags): PaymentTab {
  if (flags.hasOnline) return "online"
  if (flags.hasBank) return "bank"
  return "stablecoin"
}

function businessPaymentTitle(flags: PaymentMethodsFlags): string {
  if (countPaymentMethods(flags) <= 1) {
    return customerPaymentDisplayTitle(flags)
  }
  return "Invoice payment options"
}

export function InvoicePaymentOptions({
  invoice,
  bankAccount,
  stablecoinAccount,
  businessDisplayName,
  embedded = false,
  audience = "customer",
  value,
  onValueChange,
  publicInvoiceEasetag,
  defaultTab,
  showOnlinePayment = false,
  stripeCheckout = null,
}: InvoicePaymentOptionsProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const hasBank = bankAccount !== undefined
  const hasStablecoin = stablecoinAccount !== undefined
  const hasOnline =
    showOnlinePayment === true && Boolean(publicInvoiceEasetag?.trim() || audience === "business")

  const displayFlags: PaymentMethodsFlags = {
    hasOnline,
    hasBank,
    hasStablecoin,
  }
  const methodCount = countPaymentMethods(displayFlags)
  const showChooser = methodCount > 1
  const singleMethod = methodCount === 1 ? resolveSingleMethod(displayFlags) : null

  const customerTitle =
    audience === "customer" ? customerPaymentDisplayTitle(displayFlags) : null
  const customerSubtitle =
    audience === "customer"
      ? customerPaymentDisplaySubtitle(invoice.invoiceNumber, displayFlags)
      : null
  const businessTitle = audience === "business" ? businessPaymentTitle(displayFlags) : null

  if (methodCount === 0) {
    return null
  }

  const resolvedDefaultTab: PaymentTab =
    defaultTab ?? (hasOnline ? "online" : hasBank ? "bank" : "stablecoin")

  const activeTab = value ?? resolvedDefaultTab
  const brandName = businessDisplayName?.trim() || businessInfo.name

  const copyToClipboard = async (text: string, field?: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textArea = document.createElement("textarea")
        textArea.value = text
        textArea.style.position = "fixed"
        textArea.style.left = "-9999px"
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
      }
      if (field) {
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
      }
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const getShareContent = (type: "bank" | "stablecoin") => {
    const details =
      type === "bank" && bankAccount
        ? [
            `Amount: ${formatCurrency(invoice.total, invoice.currency)}`,
            `Account Name: ${bankAccount.accountName}`,
            bankAccount.iban && `IBAN: ${bankAccount.iban}`,
            bankAccount.bic && `BIC/SWIFT: ${bankAccount.bic}`,
            !bankAccount.iban &&
              bankAccount.fullAccountNumber &&
              `Account Number: ${bankAccount.fullAccountNumber}`,
            bankAccount.routingNumber &&
              `Routing Number: ${bankAccount.routingNumber}`,
            bankAccount.sortCode && `Sort Code: ${bankAccount.sortCode}`,
            `Bank Name: ${bankAccount.bankName}`,
            bankAccount.bankAddress && `Address: ${bankAccount.bankAddress}`,
          ]
            .filter(Boolean)
            .join("\n")
        : stablecoinAccount
          ? [
              `Amount: ${formatCurrency(invoice.total, invoice.currency)}`,
              `Network: ${stablecoinAccount.chain}`,
              `Address: ${stablecoinAccount.address}`,
            ]
              .filter(Boolean)
              .join("\n")
          : ""
    const url =
      typeof window !== "undefined"
        ? buildInvoiceCustomerViewUrl(window.location.origin, publicInvoiceEasetag, invoice)
        : ""
    return { details, url }
  }

  const handleShare = async (type: "bank" | "stablecoin") => {
    const { details, url } = getShareContent(type)
    const body = url ? `${details}\n\nView invoice: ${url}` : details
    const fullText = `Invoice ${invoice.invoiceNumber} from ${brandName}\n\nPayment Details:\n${body}`

    if (navigator.share) {
      try {
        await navigator.share({
          text: fullText,
        })
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          copyToClipboard(fullText, `share-${type}`)
        }
      }
    } else {
      copyToClipboard(fullText, `share-${type}`)
    }
  }

  const renderPanel = (method: PaymentTab, showTabHint: boolean, mountCheckout: boolean) => {
    if (method === "online" && hasOnline) {
      return (
        <OnlinePanel
          invoice={invoice}
          audience={audience}
          publicInvoiceEasetag={publicInvoiceEasetag}
          stripeCheckout={stripeCheckout}
          mountCheckout={mountCheckout}
          showTabHint={showTabHint}
        />
      )
    }
    if (method === "bank" && bankAccount) {
      return (
        <BankPanel
          invoice={invoice}
          bankAccount={bankAccount}
          copiedField={copiedField}
          onCopy={copyToClipboard}
          onShare={() => handleShare("bank")}
          showTabHint={showTabHint}
        />
      )
    }
    if (method === "stablecoin" && stablecoinAccount) {
      return (
        <StablecoinPanel
          invoice={invoice}
          stablecoinAccount={stablecoinAccount}
          copiedField={copiedField}
          onCopy={copyToClipboard}
          onShare={() => handleShare("stablecoin")}
          showTabHint={showTabHint}
        />
      )
    }
    return null
  }

  const sectionTitle =
    audience === "customer" ? customerTitle : businessTitle
  const sectionSubtitle =
    audience === "customer" ? customerSubtitle : audienceDescriptions.business

  const header = (
    <div className={embedded ? "mb-4" : ""}>
      <h3 className="text-lg font-semibold">{sectionTitle}</h3>
      <p className="text-sm text-muted-foreground mt-1">{sectionSubtitle}</p>
    </div>
  )

  const bodyContent =
    showChooser && singleMethod === null ? (
      <Tabs
        {...(value !== undefined && onValueChange
          ? {
              value,
              onValueChange: (v: string) => onValueChange(v as PaymentTab),
            }
          : { defaultValue: resolvedDefaultTab })}
        className="w-full"
      >
        <TabsList
          className={cn(
            "grid w-full h-auto gap-1 p-1",
            methodCount === 3 ? "grid-cols-3" : "grid-cols-2",
          )}
        >
          {hasOnline ? (
            <TabsTrigger
              value="online"
              className="min-w-0 px-1.5 py-2 text-xs sm:px-3 sm:py-1.5 sm:text-sm"
            >
              {invoicePaymentTabLabel("online")}
            </TabsTrigger>
          ) : null}
          {hasBank ? (
            <TabsTrigger
              value="bank"
              className="min-w-0 px-1.5 py-2 text-xs sm:px-3 sm:py-1.5 sm:text-sm"
            >
              {invoicePaymentTabLabel("bank")}
            </TabsTrigger>
          ) : null}
          {hasStablecoin ? (
            <TabsTrigger
              value="stablecoin"
              className="min-w-0 px-1.5 py-2 text-xs sm:px-3 sm:py-1.5 sm:text-sm"
            >
              {invoicePaymentTabLabel("stablecoin")}
            </TabsTrigger>
          ) : null}
        </TabsList>

        {hasOnline ? (
          <TabsContent value="online" className="mt-4">
            {renderPanel("online", audience === "customer", activeTab === "online")}
          </TabsContent>
        ) : null}

        {hasBank ? (
          <TabsContent value="bank" className="mt-4">
            {renderPanel("bank", audience === "customer", false)}
          </TabsContent>
        ) : null}

        {hasStablecoin ? (
          <TabsContent value="stablecoin" className="mt-4">
            {renderPanel("stablecoin", audience === "customer", false)}
          </TabsContent>
        ) : null}
      </Tabs>
    ) : (
      <div className="mt-4">{singleMethod ? renderPanel(singleMethod, false, true) : null}</div>
    )

  if (embedded) {
    return (
      <div className="pt-6 border-t">
        {header}
        {bodyContent}
      </div>
    )
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg">{sectionTitle}</CardTitle>
        <p className="text-sm text-muted-foreground">{sectionSubtitle}</p>
      </CardHeader>
      <CardContent>{bodyContent}</CardContent>
    </Card>
  )
}
