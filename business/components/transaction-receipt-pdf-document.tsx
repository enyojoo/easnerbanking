"use client"

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import type { Style } from "@react-pdf/types"
import type { Transaction } from "@/lib/finance-types"
import { formatCurrency } from "@/lib/utils"

const statusLabels: Record<string, string> = {
  completed: "Completed",
  pending: "Pending",
  processing: "Processing",
  failed: "Failed",
}

const styles = StyleSheet.create({
  page: {
    padding: 0,
    paddingBottom: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 24,
    marginBottom: 24,
  },
  receiptTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0F1110",
    marginBottom: 2,
  },
  headerLogo: {
    width: 200,
    height: 80,
    objectFit: "contain",
  },
  heroSection: {
    paddingHorizontal: 40,
    marginBottom: 24,
  },
  statusBadge: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  amountBig: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
  },
  amountCredit: {
    color: "#007ACC",
  },
  amountDebit: {
    color: "#0F1110",
  },
  dateText: {
    fontSize: 10,
    color: "#6F756F",
  },
  tableWrapper: {
    marginHorizontal: 40,
    borderWidth: 1,
    borderColor: "#D9D4C7",
    borderRadius: 8,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E9E4D8",
  },
  tableRowLast: {
    flexDirection: "row",
  },
  tableRowFirst: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tableRowLastRounded: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  tableRowEven: {
    backgroundColor: "#F8F6F0",
  },
  tableRowOdd: {
    backgroundColor: "#ffffff",
  },
  tableCell: {
    flex: 1,
    padding: 12,
    fontSize: 10,
    color: "#3D403D",
  },
  tableCellValue: {
    flex: 1.5,
    padding: 12,
    fontSize: 10,
    color: "#0F1110",
    textAlign: "right",
  },
  amountCellCredit: {
    flex: 1.5,
    padding: 12,
    fontSize: 10,
    color: "#007ACC",
    fontWeight: "bold",
    textAlign: "right",
  },
  amountCellDebit: {
    flex: 1.5,
    padding: 12,
    fontSize: 10,
    color: "#0F1110",
    fontWeight: "bold",
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    alignItems: "center",
  },
  footerText: {
    fontSize: 9,
    color: "#6F756F",
    textAlign: "center",
    marginBottom: 2,
  },
  footerTextLink: {
    fontSize: 9,
    color: "#6F756F",
    textAlign: "center",
  },
  footerEmail: {
    fontSize: 9,
    color: "#007ACC",
    textAlign: "center",
  },
})

interface TransactionReceiptPDFDocumentProps {
  transaction: Transaction
  logoUrl: string
  cardLast4?: string
}

function TableRow({
  label,
  value,
  valueStyle,
  isFirst,
  isLast,
  rowStyle,
}: {
  label: string
  value: string
  valueStyle?: Style
  isFirst?: boolean
  isLast?: boolean
  rowStyle?: Style
}) {
  return (
    <View
      style={[
        isLast ? styles.tableRowLast : styles.tableRow,
        ...(isFirst ? [styles.tableRowFirst] : []),
        ...(isLast ? [styles.tableRowLastRounded] : []),
        ...(rowStyle ? [rowStyle] : []),
      ]}
    >
      <Text style={styles.tableCell}>{label}</Text>
      <Text style={valueStyle ?? styles.tableCellValue}>{value}</Text>
    </View>
  )
}

export function TransactionReceiptPDFDocument({
  transaction,
  logoUrl,
  cardLast4,
}: TransactionReceiptPDFDocumentProps) {
  const dateStr = new Date(transaction.date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const amountStr =
    (transaction.direction === "credit" ? "+" : "-") +
    formatCurrency(Math.abs(transaction.amount), "USD")

  const descriptionLower = transaction.description.toLowerCase()
  const isStablecoin = transaction.type === "stablecoin" || descriptionLower.startsWith("stablecoin")
  const isBank = descriptionLower.startsWith("bank")
  const isCard = Boolean(cardLast4) || transaction.type === "card"
  const partyLabel = transaction.direction === "credit" ? "Sender" : "Recipient"

  const rows: { label: string; value: string; valueStyle?: Style }[] = [
    { label: "Transaction", value: transaction.description },
    { label: "Transaction ID", value: transaction.id },
  ]

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
    rows.push({
      label: "Card",
      value: cardLast4 ? `•••• ${cardLast4}` : "-",
    })
  } else if (transaction.category) {
    rows.push({
      label: "Category",
      value: transaction.category,
    })
  }

  if (!isStablecoin && transaction.reference) {
    rows.splice(2, 0, { label: "Reference", value: transaction.reference })
  }
  if (transaction.fee !== undefined && transaction.fee > 0) {
    rows.push({
      label: "Fee",
      value: formatCurrency(transaction.fee, "USD"),
    })
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.receiptTitle}>Transaction</Text>
            <Text style={styles.receiptTitle}>Receipt</Text>
          </View>
          <Image style={styles.headerLogo} src={logoUrl} />
        </View>

        {/* Hero section: status, amount, date */}
        <View style={styles.heroSection}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {statusLabels[transaction.status] ?? transaction.status}
            </Text>
          </View>
          <Text
            style={[
              styles.amountBig,
              transaction.direction === "credit"
                ? styles.amountCredit
                : styles.amountDebit,
            ]}
          >
            {amountStr}
          </Text>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>

        {/* Transaction data table */}
        <View style={styles.tableWrapper}>
          {rows.map((row, i) => (
            <TableRow
              key={row.label}
              label={row.label}
              value={row.value}
              valueStyle={row.valueStyle}
              isFirst={i === 0}
              isLast={i === rows.length - 1}
              rowStyle={i % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}
            />
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            For complaints regarding this transaction,
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "center" }}>
            <Text style={styles.footerTextLink}>
              please contact our support:{" "}
            </Text>
            <Text style={styles.footerEmail}>support@easner.com</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
