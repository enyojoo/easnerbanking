"use client"

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Line,
  Polyline,
} from "@react-pdf/renderer"
import { buildTransactionEmailDetailRows, filterTransactionReceiptDetailRows } from "@easner/shared"
import type { Transaction } from "@/lib/finance-types"
import { formatCurrency } from "@/lib/utils"

/** Business palette — matches the original PDF tokens (blue primary, neutral text/borders). */
const palette = {
  primary: "#007ACC",
  primaryTint: "#EAF4FB",
  textPrimary: "#0F1110",
  textSecondary: "#6F756F",
  textTertiary: "#6F756F",
  border: "#D9D4C7",
  white: "#FFFFFF",
  pageBg: "#F8F6F0",
  statusBadgeBg: "#EFEDE6",
  statusBadgeText: "#3D403D",
} as const

/**
 * Direction glyph — react-pdf/Helvetica can't render Unicode check/arrow marks, so the icon
 * is drawn with SVG. Deposits (credit) point down-left; transfers (debit) point up-right,
 * mirroring the mobile app hero (ArrowDownLeft / ArrowUpRight, brand blue).
 */
function DirectionArrow({ isCredit }: { isCredit: boolean }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      {isCredit ? (
        <>
          <Line
            x1="17"
            y1="7"
            x2="7"
            y2="17"
            stroke={palette.primary}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Polyline
            points="17 17 7 17 7 7"
            fill="none"
            stroke={palette.primary}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <Line
            x1="7"
            y1="17"
            x2="17"
            y2="7"
            stroke={palette.primary}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Polyline
            points="7 7 17 7 17 17"
            fill="none"
            stroke={palette.primary}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  )
}

const statusLabels: Record<string, string> = {
  completed: "Completed",
  pending: "Processing",
  processing: "Processing",
  failed: "Failed",
}

type ReceiptRow = { label: string; value: string }

function parseRecipientReceiptValue(value: string): { name: string; subtitle: string } | null {
  const match = value.match(/^(.+?) \((.+)\)$/)
  if (!match) return null
  const name = match[1].trim()
  const subtitle = match[2].trim()
  if (!name || !subtitle) return null
  return { name, subtitle }
}

function formatReceiptTimestamp(dateInput: string | Date): string {
  const date = new Date(dateInput)
  const month = date.toLocaleString("en-US", { month: "short" })
  const day = date.getDate().toString().padStart(2, "0")
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${month} ${day}, ${year} • ${displayHours}:${minutes} ${ampm}`
}

/**
 * Detail rows only — Transaction ID and hero title are rendered outside this list,
 * matching the mobile `TransactionReceiptCard` layout.
 */
function buildReceiptDetailRows(transaction: Transaction, cardLast4?: string): ReceiptRow[] {
  if (transaction.payoutReview) {
    const snap = transaction.recipientSnapshot
    return filterTransactionReceiptDetailRows(
      buildTransactionEmailDetailRows({
        direction: "out",
        payoutReview: transaction.payoutReview,
        receiveNetwork: transaction.chain,
        recipient: snap
          ? {
              fullName: snap.full_name ?? transaction.counterpartyName ?? null,
              bankName: snap.bank_name ?? null,
              accountNumber: snap.account_number ?? null,
              phone: snap.phone ?? null,
              mobileProvider: snap.mobile_provider ?? null,
              walletNetwork: transaction.chain ?? null,
            }
          : transaction.counterpartyName
            ? { fullName: transaction.counterpartyName }
            : null,
      }),
    )
  }

  const isEnrichedDeposit =
    transaction.direction === "credit" &&
    Boolean(
      transaction.paymentScheme ||
        transaction.postedAmount ||
        transaction.narration ||
        transaction.lifecycle?.length,
    )
  if (isEnrichedDeposit) {
    const depositCurrency =
      transaction.postedCurrency || transaction.displayCurrency || "USD"
    return filterTransactionReceiptDetailRows(
      buildTransactionEmailDetailRows({
        direction: "in",
        deposit: {
          scheme: transaction.paymentScheme ?? null,
          senderDisplay: transaction.counterpartyName ?? null,
          feeAmount: transaction.fee ?? null,
          feeCurrency: transaction.displayCurrency ?? depositCurrency,
          postedAmount: transaction.postedAmount ?? null,
          postedCurrency: depositCurrency,
          narration: transaction.narration ?? null,
        },
      }),
    )
  }

  const rows: ReceiptRow[] = []
  const descriptionLower = transaction.description.toLowerCase()
  const isStablecoin =
    transaction.type === "stablecoin" || descriptionLower.startsWith("stablecoin")
  const isBank = descriptionLower.startsWith("bank")
  const isCard = Boolean(cardLast4) || transaction.type === "card"
  const partyLabel = transaction.direction === "credit" ? "Sender" : "Recipient"

  if (transaction.counterpartyName) {
    rows.push({ label: partyLabel, value: transaction.counterpartyName })
  }
  if (isBank && transaction.paymentRail) {
    rows.push({ label: "Payment Rail", value: transaction.paymentRail.toUpperCase() })
  }
  if (!isStablecoin && !isCard) {
    rows.push({ label: "Type", value: transaction.type.toUpperCase() })
  }
  if (isCard) {
    rows.push({ label: "Card", value: cardLast4 ? `•••• ${cardLast4}` : "-" })
  } else if (transaction.category) {
    rows.push({ label: "Category", value: transaction.category })
  }
  if (!isStablecoin && transaction.reference) {
    rows.push({ label: "Reference", value: transaction.reference })
  }
  if (transaction.fee !== undefined && transaction.fee > 0) {
    rows.push({
      label: "Processing fee",
      value: formatCurrency(transaction.fee, transaction.displayCurrency || "USD"),
    })
  }
  return rows
}

function ReceiptDetailRow({ label, value }: ReceiptRow) {
  if (label === "Recipient") {
    const parsed = parseRecipientReceiptValue(value)
    if (parsed) {
      return (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <View style={styles.rowValueStack}>
            <Text style={styles.rowValue}>{parsed.name}</Text>
            <Text style={styles.rowValueSub}>({parsed.subtitle})</Text>
          </View>
        </View>
      )
    }
  }

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueStack}>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 72,
    fontSize: 10,
    fontFamily: "Helvetica",
    backgroundColor: palette.pageBg,
  },
  card: {
    width: "100%",
    backgroundColor: palette.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  headerLogo: {
    width: 100,
    height: 32,
    objectFit: "contain",
  },
  headerLabel: {
    fontSize: 9,
    color: palette.textTertiary,
  },
  heroBlock: {
    alignItems: "center",
    marginBottom: 20,
  },
  glyph: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  amount: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },
  amountCredit: {
    color: palette.primary,
  },
  amountDebit: {
    color: palette.textPrimary,
  },
  heroTitle: {
    fontSize: 11,
    color: palette.textSecondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 2,
    maxWidth: "85%",
  },
  statusPill: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: palette.statusBadgeBg,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "bold",
    color: palette.statusBadgeText,
  },
  dateText: {
    fontSize: 9,
    color: palette.textTertiary,
    marginTop: 6,
    textAlign: "center",
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    marginBottom: 12,
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  rowLabel: {
    fontSize: 10,
    color: palette.textSecondary,
    flexShrink: 0,
  },
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
  dashedDivider: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.border,
    marginTop: 12,
    marginBottom: 12,
  },
  idBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  idLabel: {
    fontSize: 10,
    color: palette.textSecondary,
  },
  idValue: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Courier",
    color: palette.textPrimary,
    textAlign: "right",
  },
  pageFooter: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    alignItems: "center",
  },
  footerText: {
    fontSize: 9,
    color: palette.textTertiary,
    textAlign: "center",
    marginBottom: 2,
  },
  footerEmail: {
    fontSize: 9,
    color: palette.primary,
    textAlign: "center",
  },
})

interface TransactionReceiptPDFDocumentProps {
  transaction: Transaction
  logoUrl: string
  cardLast4?: string
}

export function TransactionReceiptPDFDocument({
  transaction,
  logoUrl,
  cardLast4,
}: TransactionReceiptPDFDocumentProps) {
  const isCredit = transaction.direction === "credit"

  const heroCurrency = transaction.displayCurrency || transaction.postedCurrency || "USD"
  const amountStr =
    (isCredit ? "+" : "-") + formatCurrency(Math.abs(transaction.amount), heroCurrency)

  const statusLabel = statusLabels[transaction.status] ?? transaction.status
  const dateText = formatReceiptTimestamp(transaction.date)
  const title = transaction.description?.trim() ?? ""
  const detailRows = buildReceiptDetailRows(transaction, cardLast4)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.card}>
          {/* Header — logo left, label right. */}
          <View style={styles.header}>
            <Image style={styles.headerLogo} src={logoUrl} />
            <Text style={styles.headerLabel}>Transaction Receipt</Text>
          </View>

          {/* Hero — direction arrow, amount, title, status pill, date. */}
          <View style={styles.heroBlock}>
            <View style={styles.glyph}>
              <DirectionArrow isCredit={isCredit} />
            </View>
            <Text
              style={[
                styles.amount,
                isCredit ? styles.amountCredit : styles.amountDebit,
              ]}
            >
              {amountStr}
            </Text>
            {title ? <Text style={styles.heroTitle}>{title}</Text> : null}
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
            <Text style={styles.dateText}>{dateText}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.rows}>
            {detailRows.map((row) => (
              <ReceiptDetailRow key={`${row.label}:${row.value}`} {...row} />
            ))}
          </View>

          <View style={styles.dashedDivider} />

          <View style={styles.idBlock}>
            <Text style={styles.idLabel}>Transaction ID</Text>
            <Text style={styles.idValue}>{transaction.id}</Text>
          </View>
        </View>

        <View style={styles.pageFooter} fixed>
          <Text style={styles.footerText}>
            For complaints regarding this transaction,
          </Text>
          <Text style={styles.footerText}>
            please contact our support:{" "}
            <Text style={styles.footerEmail}>support@easner.com</Text>
          </Text>
        </View>
      </Page>
    </Document>
  )
}
