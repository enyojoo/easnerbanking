"use client"

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import type { Invoice } from "@/lib/b2b/types"
import type { Transaction } from "@/lib/finance-types"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getPaymentRecordDisplay } from "@/lib/deposits"
import { formatPaymentMethodText, paymentMethodIconKey } from "@/lib/stripe/payment-method-display"
import { paymentBrandPngDataUrl } from "@/lib/stripe/payment-brand-png-data"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"

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
    backgroundColor: "#007ACC",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#ffffff",
  },
  amountBig: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
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
  pmValueRow: {
    flex: 1.5,
    padding: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  pmBrandIcon: {
    width: 36,
    height: 24,
    objectFit: "contain",
    marginRight: 6,
  },
  pmValueText: {
    fontSize: 10,
    color: "#0F1110",
    textAlign: "right",
  },
})

function TableRow({
  label,
  value,
  isFirst,
  isLast,
  rowStyle,
  paymentMethod,
}: {
  label: string
  value: string
  isFirst?: boolean
  isLast?: boolean
  rowStyle?: object
  paymentMethod?: StripePaymentMethodDisplay | null
}) {
  const base = isLast ? styles.tableRowLast : styles.tableRow
  return (
    <View
      style={{
        ...base,
        ...(isFirst ? styles.tableRowFirst : {}),
        ...(isLast ? styles.tableRowLastRounded : {}),
        ...(rowStyle && typeof rowStyle === "object" ? rowStyle : {}),
      }}
    >
      <Text style={styles.tableCell}>{label}</Text>
      {paymentMethod ? (
        <View style={styles.pmValueRow}>
          <Image
            style={styles.pmBrandIcon}
            src={paymentBrandPngDataUrl(paymentMethodIconKey(paymentMethod))}
          />
          <Text style={styles.pmValueText}>{value}</Text>
        </View>
      ) : (
        <Text style={styles.tableCellValue}>{value}</Text>
      )}
    </View>
  )
}

interface InvoiceReceiptPDFDocumentProps {
  invoice: Invoice
  logoUrl: string
  /** Ledger rows from GET /api/transactions to resolve Easner payment ids. */
  ledgerTransactions?: Transaction[]
}

export function InvoiceReceiptPDFDocument({
  invoice,
  logoUrl,
  ledgerTransactions = [],
}: InvoiceReceiptPDFDocumentProps) {
  const record = getPaymentRecordDisplay(invoice, ledgerTransactions)

  const heroAmount =
    record?.method === "easner" && record.amount != null && record.currency != null ?
      formatCurrency(record.amount, record.currency)
    : formatCurrency(invoice.total, invoice.currency)

  const heroDateStr =
    record?.method === "easner" && record.date ?
      formatDate(record.date, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : record?.paidAt ?
      formatDate(record.paidAt, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : invoice.paymentInfo ?
      formatDate(invoice.paymentInfo.paidAt, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "-"

  type ReceiptRow = {
    label: string
    value: string
    paymentMethod?: StripePaymentMethodDisplay | null
  }

  const rows: ReceiptRow[] = [
    { label: "Invoice Number", value: invoice.invoiceNumber },
    { label: "Customer", value: invoice.customerName },
  ]

  let paymentSection: ReceiptRow[] = []

  if (invoice.paymentInfo?.method === "cash") {
    paymentSection = [
      {
        label: "Payment Method",
        value: "Cash or other method",
      },
      ...(invoice.paymentInfo.cashNote ?
        [{ label: "Note", value: invoice.paymentInfo.cashNote }]
      : []),
    ]
  } else if (invoice.paymentInfo?.method === "easner" && invoice.paymentInfo.transactionId) {
    if (record?.method === "easner" && record.paymentMethod) {
      paymentSection = [
        { label: "Payment Method", value: record.paymentMethod },
        ...(record.reference ? [{ label: "Reference", value: record.reference }] : []),
        ...(record.description ? [{ label: "Description", value: record.description }] : []),
      ]
    } else {
      paymentSection = [
        {
          label: "Payment Method",
          value: "Easner Banking",
        },
        {
          label: "Transaction ID",
          value: invoice.paymentInfo.transactionId,
        },
      ]
    }
  } else if (invoice.paymentInfo?.method === "stripe") {
    const stripe = invoice.paymentInfo.stripe
    const pmDisplay: StripePaymentMethodDisplay | null = stripe
      ? {
          type: stripe.paymentMethodType || "card",
          brand: stripe.brand,
          last4: stripe.last4,
          wallet: stripe.wallet,
          bankName: stripe.bankName,
        }
      : null
    const pmText = pmDisplay ? formatPaymentMethodText(pmDisplay) : "Card"
    paymentSection = [
      { label: "Payment Method", value: pmText, paymentMethod: pmDisplay },
      ...(stripe?.customerEmail
        ? [{ label: "Email", value: stripe.customerEmail }]
        : []),
      ...(stripe
        ? [
            {
              label: "Amount paid",
              value: formatCurrency((stripe.grossCents ?? 0) / 100, invoice.currency),
            },
            ...(stripe.feeCents > 0
              ? [
                  {
                    label: "Processing fee",
                    value: formatCurrency(stripe.feeCents / 100, invoice.currency),
                  },
                ]
              : []),
            {
              label: "Net to merchant",
              value: formatCurrency((stripe.netCents ?? 0) / 100, invoice.currency),
            },
          ]
        : []),
      ...(invoice.paymentInfo.transactionId
        ? [{ label: "Transaction ID", value: invoice.paymentInfo.transactionId }]
        : []),
    ]
  }

  const allRows = [...rows, ...paymentSection]

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.receiptTitle}>Invoice Receipt</Text>
          </View>
          <Image style={styles.headerLogo} src={logoUrl} />
        </View>

        <View style={styles.heroSection}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Paid</Text>
          </View>
          <Text style={styles.amountBig}>{heroAmount}</Text>
          <Text style={styles.dateText}>{heroDateStr}</Text>
        </View>

        <View style={styles.tableWrapper}>
          {allRows.map((row, i) => (
            <TableRow
              key={row.label}
              label={row.label}
              value={row.value}
              isFirst={i === 0}
              isLast={i === allRows.length - 1}
              rowStyle={i % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}
              paymentMethod={row.paymentMethod}
            />
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            For questions regarding this invoice receipt,
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
