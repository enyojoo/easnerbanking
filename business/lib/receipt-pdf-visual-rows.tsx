import { Image, Text, View, StyleSheet } from "@react-pdf/renderer"
import {
  formatPayoutRecipientSubtitle,
  getTokenIconUrl,
  resolvePayoutCountryCode,
  resolveReceiptCurrencyFlagCode,
  type ReceiptVisualRow,
  type TransactionRecipientDisplay,
} from "@easner/shared"
import { isWalletBeneficiary } from "@/lib/wallet-recipient-display"

const palette = {
  textPrimary: "#0F1110",
  textSecondary: "#6F756F",
  primaryTint: "#EAF4FB",
  primary: "#007ACC",
  border: "#D9D4C7",
} as const

function recipientInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  )
}

function resolveRecipientSubtitle(display: TransactionRecipientDisplay): string {
  if (display.payeeEasetag) {
    return `@${display.payeeEasetag}`
  }
  return (
    formatPayoutRecipientSubtitle({
      bankName: display.bankName,
      accountNumber: display.accountNumber,
      fullAccountNumber: display.accountNumber,
      phone: display.phone,
      mobileProvider: display.mobileProvider,
      walletNetwork: display.walletNetwork,
    }) ?? ""
  )
}

function resolveRecipientImageSrc(
  display: TransactionRecipientDisplay,
  assetBaseUrl: string,
): string | undefined {
  if (display.payeeEasetag) return undefined
  const isWallet = isWalletBeneficiary({
    bankName: display.bankName,
    walletNetwork: display.walletNetwork,
    walletAsset: display.walletAsset,
  })
  if (isWallet) {
    return getTokenIconUrl(display.walletAsset ?? display.currency ?? "USDC")
  }
  const countryCode = resolvePayoutCountryCode(display.countryCode, display.currency)
  return `${assetBaseUrl}/flags/${countryCode.toLowerCase()}.png`
}

function PdfRecipientRow({
  display,
  assetBaseUrl,
}: {
  display: TransactionRecipientDisplay
  assetBaseUrl: string
}) {
  const subtitle = resolveRecipientSubtitle(display)
  const imageSrc = resolveRecipientImageSrc(display, assetBaseUrl)
  const name = display.fullName || (display.payeeEasetag ? `@${display.payeeEasetag}` : "Recipient")

  return (
    <View style={styles.recipientValue}>
      <View style={styles.recipientText}>
        <Text style={styles.rowValue}>{name}</Text>
        {subtitle ? <Text style={styles.rowValueSub}>{subtitle}</Text> : null}
      </View>
      {imageSrc ? (
        <Image src={imageSrc} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitials}>{recipientInitials(name)}</Text>
        </View>
      )}
    </View>
  )
}

function PdfBalanceDestinationRow({
  currency,
  balanceLabel,
  assetBaseUrl,
}: {
  currency: string
  balanceLabel: string
  assetBaseUrl: string
}) {
  const flagCode = resolveReceiptCurrencyFlagCode(currency)
  return (
    <View style={styles.balanceValue}>
      <Image src={`${assetBaseUrl}/flags/${flagCode}.png`} style={styles.avatarImage} />
      <Text style={styles.rowValue}>{balanceLabel}</Text>
    </View>
  )
}

export function PdfReceiptVisualRow({
  row,
  assetBaseUrl,
}: {
  row: ReceiptVisualRow
  assetBaseUrl: string
}) {
  if (row.kind === "recipient") {
    return <PdfRecipientRow display={row.display} assetBaseUrl={assetBaseUrl} />
  }
  if (row.kind === "balanceDestination") {
    return (
      <PdfBalanceDestinationRow
        currency={row.currency}
        balanceLabel={row.balanceLabel}
        assetBaseUrl={assetBaseUrl}
      />
    )
  }
  return (
    <View style={styles.rowValueStack}>
      <Text style={styles.rowValue}>{row.value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  rowValueStack: {
    flex: 1,
    alignItems: "flex-end",
  },
  rowValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: palette.textPrimary,
    textAlign: "right",
  },
  rowValueSub: {
    fontSize: 9,
    color: palette.textSecondary,
    textAlign: "right",
    marginTop: 2,
  },
  recipientValue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  recipientText: {
    alignItems: "flex-end",
    flexShrink: 1,
    minWidth: 0,
  },
  balanceValue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    flex: 1,
  },
  avatarImage: {
    width: 18,
    height: 18,
    borderRadius: 9,
    objectFit: "cover",
  },
  avatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 7,
    fontWeight: "bold",
    color: palette.primary,
  },
})
