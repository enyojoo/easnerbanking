import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  StyleSheet,
} from "@react-pdf/renderer"
import type { Invoice } from "@/lib/b2b/types"
import { businessInfo as defaultBusinessInfo } from "@/lib/business-info"
import type { InvoicePdfIssuer } from "@/lib/invoices/issuer"
import {
  customerPaymentDisplayTitle,
  pdfPaymentSectionLines,
  type InvoicePdfPaymentSection,
} from "@/lib/invoices/invoice-payment-copy"
import { formatDate, formatCurrency } from "@/lib/utils"
import { getInvoiceDiscountAmount } from "@/lib/b2b/invoice-totals"

import { invoiceStatusLabel } from "@/lib/invoices/invoice-status"

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  businessInfo: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  issuerLogo: {
    width: 48,
    height: 48,
    objectFit: "contain",
    marginBottom: 8,
  },
  businessName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  businessText: {
    fontSize: 9,
    color: "#6F756F",
    marginBottom: 2,
  },
  invoiceHeader: {
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "right",
  },
  invoiceNumber: {
    fontSize: 9,
    color: "#6F756F",
    marginBottom: 4,
    textAlign: "right",
  },
  statusBadge: {
    backgroundColor: "#E9E4D8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-end",
  },
  statusText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  grid: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 24,
  },
  gridCol: {
    flex: 1,
  },
  gridColEmpty: {
    flex: 1,
  },
  gridColRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#6F756F",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  sectionTitleRight: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#6F756F",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: "right",
  },
  sectionTextRight: {
    fontSize: 10,
    marginBottom: 2,
    textAlign: "right",
  },
  sectionText: {
    fontSize: 10,
    marginBottom: 2,
  },
  sectionTextMuted: {
    fontSize: 9,
    color: "#6F756F",
    marginBottom: 2,
  },
  table: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E9E4D8",
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#EFECE2",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E9E4D8",
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#6F756F",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E9E4D8",
  },
  tableCell: {
    fontSize: 10,
  },
  colDesc: { width: "40%" },
  colQty: { width: "15%", textAlign: "right" },
  colPrice: { width: "22%", textAlign: "right" },
  colAmount: { width: "23%", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  totalBox: {
    alignItems: "flex-end",
  },
  totalSubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: 140,
    marginBottom: 4,
  },
  totalSubLabel: {
    fontSize: 9,
    color: "#6F756F",
  },
  totalSubAmount: {
    fontSize: 10,
    textAlign: "right",
  },
  totalLabel: {
    fontSize: 9,
    color: "#6F756F",
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "bold",
  },
  paymentSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E9E4D8",
  },
  paymentSectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
  },
  paymentLinkBox: {
    borderWidth: 1,
    borderColor: "#E9E4D8",
    borderRadius: 6,
    backgroundColor: "#F8F6F0",
    padding: 14,
  },
  paymentLinkLine: {
    fontSize: 9,
    color: "#1A1A1A",
    marginBottom: 6,
    lineHeight: 1.45,
  },
  paymentLinkUrl: {
    fontSize: 9,
    color: "#007ACC",
    marginBottom: 6,
    lineHeight: 1.45,
  },
  footer: {
    position: "absolute",
    bottom: 12,
    left: 40,
    right: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 9,
    color: "#6F756F",
  },
  footerLogo: {
    width: 90,
    height: 36,
    objectFit: "contain",
    flexShrink: 0,
  },
})

interface InvoicePDFDocumentProps {
  invoice: Invoice
  /** Link-first payment block — bank/stablecoin details live on the web invoice view. */
  paymentSection?: InvoicePdfPaymentSection
  /** When omitted, uses static `business-info` defaults. */
  issuer?: InvoicePdfIssuer
  /** Easner mark in the PDF footer. */
  logoUrl: string
  /** Business logo above issuer name (data URL preferred). */
  issuerLogoSrc?: string | null
}

export function InvoicePDFDocument({
  invoice,
  paymentSection,
  issuer,
  logoUrl,
  issuerLogoSrc,
}: InvoicePDFDocumentProps) {
  const biz = issuer ?? {
    name: defaultBusinessInfo.name,
    address: defaultBusinessInfo.address,
    city: defaultBusinessInfo.city,
    state: defaultBusinessInfo.state,
    zipCode: defaultBusinessInfo.zipCode,
    country: defaultBusinessInfo.country,
    countryCode: "",
    addressLines: [],
    email: defaultBusinessInfo.email,
    phone: defaultBusinessInfo.phone,
  }
  const isPayable =
    invoice.status === "unpaid" ||
    invoice.status === "sent" ||
    invoice.status === "past_due"
  const showPayCard = isPayable && Boolean(paymentSection?.url)
  const paymentLines = paymentSection
    ? pdfPaymentSectionLines(invoice, paymentSection)
    : []

  const formatDatePdf = (dateString: string) =>
    formatDate(dateString, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.businessInfo}>
            {issuerLogoSrc ? (
              <Image src={issuerLogoSrc} style={styles.issuerLogo} />
            ) : null}
            <Text style={styles.businessName}>{biz.name}</Text>
            {(biz.addressLines.length > 0
              ? biz.addressLines
              : [biz.address, `${biz.city}, ${biz.state} ${biz.zipCode}`.trim(), biz.country].filter(Boolean)
            ).map((line) => (
              <Text key={line} style={styles.businessText}>
                {line}
              </Text>
            ))}
            <Text style={styles.businessText}>{biz.email}</Text>
            <Text style={styles.businessText}>{biz.phone}</Text>
          </View>
          <View style={styles.invoiceHeader}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {invoiceStatusLabel(invoice.status)}
              </Text>
            </View>
          </View>
        </View>

        {/* Bill to & Invoice details */}
        <View style={styles.grid}>
          <View style={styles.gridCol}>
            <Text style={styles.sectionTitle}>Bill to</Text>
            {invoice.billToType === "company" && invoice.customerCompany ? (
              <View>
                <Text style={styles.sectionText}>{invoice.customerCompany}</Text>
                <Text style={styles.sectionTextMuted}>{invoice.customerEmail}</Text>
                {invoice.customerAddress ? (
                  <Text style={styles.sectionTextMuted}>{invoice.customerAddress}</Text>
                ) : null}
                {invoice.customerPhone ? (
                  <Text style={styles.sectionTextMuted}>{invoice.customerPhone}</Text>
                ) : null}
                {invoice.customerName ? (
                  <Text style={[styles.sectionTextMuted, { marginTop: 4 }]}>
                    Attn: {invoice.customerName}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View>
                <Text style={styles.sectionText}>{invoice.customerName}</Text>
                <Text style={styles.sectionTextMuted}>{invoice.customerEmail}</Text>
                {invoice.customerAddress ? (
                  <Text style={styles.sectionTextMuted}>{invoice.customerAddress}</Text>
                ) : null}
                {invoice.customerPhone ? (
                  <Text style={styles.sectionTextMuted}>{invoice.customerPhone}</Text>
                ) : null}
              </View>
            )}
          </View>
          <View style={styles.gridColEmpty} />
          <View style={styles.gridColRight}>
            <Text style={styles.sectionTitleRight}>Invoice details</Text>
            <Text style={styles.sectionTextRight}>
              Due date: {formatDatePdf(invoice.dueDate)}
            </Text>
            <Text style={styles.sectionTextRight}>
              Created: {formatDatePdf(invoice.createdDate)}
            </Text>
          </View>
        </View>

        {invoice.memo?.trim() ? (
          <View style={[styles.grid, { marginBottom: 16 }]}>
            <View style={styles.gridCol}>
              <Text style={styles.sectionTitle}>Memo</Text>
              <Text style={styles.sectionText}>{invoice.memo}</Text>
            </View>
          </View>
        ) : null}

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>
              Description
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>
              Unit Price
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colAmount]}>
              Amount
            </Text>
          </View>
          {invoice.lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colDesc]}>
                {item.description}
              </Text>
              <Text style={[styles.tableCell, styles.colQty]}>
                {item.quantity}
              </Text>
              <Text style={[styles.tableCell, styles.colPrice]}>
                {formatCurrency(item.unitPrice, invoice.currency)}
              </Text>
              <Text style={[styles.tableCell, styles.colAmount]}>
                {formatCurrency(item.amount, invoice.currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* Subtotal, Discount, Tax, Total - always show full breakdown like invoice pages */}
        <View style={styles.totalRow}>
          <View style={styles.totalBox}>
            <View style={styles.totalSubRow}>
              <Text style={styles.totalSubLabel}>Subtotal</Text>
              <Text style={styles.totalSubAmount}>
                {formatCurrency(
                  invoice.subtotal ?? invoice.lineItems.reduce((s, i) => s + i.amount, 0),
                  invoice.currency
                )}
              </Text>
            </View>
            {getInvoiceDiscountAmount(invoice) > 0 ? (
              <View style={styles.totalSubRow}>
                <Text style={styles.totalSubLabel}>
                  Discount
                  {invoice.discountRate != null && invoice.discountRate > 0
                    ? ` (${invoice.discountRate}%)`
                    : ""}
                </Text>
                <Text style={styles.totalSubAmount}>
                  {`-${formatCurrency(getInvoiceDiscountAmount(invoice), invoice.currency)}`}
                </Text>
              </View>
            ) : null}
            <View style={styles.totalSubRow}>
              <Text style={styles.totalSubLabel}>
                Tax{invoice.taxRate != null && invoice.taxRate > 0 ? ` (${invoice.taxRate}%)` : ""}
              </Text>
              <Text style={styles.totalSubAmount}>
                {formatCurrency(invoice.tax ?? 0, invoice.currency)}
              </Text>
            </View>
            <View style={styles.totalSubRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>
                {formatCurrency(invoice.total, invoice.currency)}
              </Text>
            </View>
          </View>
        </View>

        {showPayCard && paymentSection ? (
          <View style={styles.paymentSection} wrap={false}>
            <Text style={styles.paymentSectionTitle}>
              {customerPaymentDisplayTitle(paymentSection)}
            </Text>
            <View style={styles.paymentLinkBox}>
              {paymentLines.map((line, i) =>
                line === "" ? (
                  <View key={`sp-${i}`} style={{ height: 4 }} />
                ) : line === paymentSection.url ? (
                  <Link key={`url-${i}`} src={paymentSection.url}>
                    <Text style={styles.paymentLinkUrl}>{line}</Text>
                  </Link>
                ) : (
                  <Text key={`line-${i}`} style={styles.paymentLinkLine}>
                    {line}
                  </Text>
                ),
              )}
            </View>
          </View>
        ) : null}

        {/* Footer: Powered by Easner Business */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Powered by</Text>
          <Link src="https://www.easner.com/business">
            <Image style={styles.footerLogo} src={logoUrl} />
          </Link>
        </View>
      </Page>
    </Document>
  )
}
