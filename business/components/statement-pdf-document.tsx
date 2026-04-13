/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image is not an HTML img */
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"
import { businessInfo } from "@/lib/business-info"

export type StatementPdfRow = {
  date: string
  description: string
  amount: string
  /** Signed display, e.g. +1,234.56 or -50.00 */
  signedAmount: string
}

export type StatementPdfMeta = {
  periodLabel: string
  /** e.g. "USD" — the account this statement was exported for */
  accountCurrency: string
  generatedAt: string
  accountLabel?: string
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  muted: {
    fontSize: 8,
    color: "#6b7280",
    marginBottom: 2,
  },
  table: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 6,
  },
  colDate: { width: "22%" },
  colDesc: { width: "48%" },
  colAmt: { width: "30%", textAlign: "right" },
  th: {
    flexDirection: "row",
    paddingVertical: 6,
    fontWeight: "bold",
    fontSize: 8,
    color: "#374151",
  },
})

type Props = {
  meta: StatementPdfMeta
  rows: StatementPdfRow[]
  logoUrl?: string
}

export function StatementPDFDocument({ meta, rows, logoUrl = PDF_LOGO_DATA_URL }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Account statement</Text>
            <Text style={styles.muted}>{businessInfo.name}</Text>
            <Text style={styles.muted}>{businessInfo.email}</Text>
          </View>
          {logoUrl ? (
            <Image src={logoUrl} style={{ width: 96, height: 28, objectFit: "contain" }} />
          ) : null}
        </View>

        <Text style={styles.muted}>Period: {meta.periodLabel}</Text>
        <Text style={styles.muted}>Account: {meta.accountCurrency}</Text>
        {meta.accountLabel ? <Text style={styles.muted}>{meta.accountLabel}</Text> : null}
        <Text style={styles.muted}>Generated: {meta.generatedAt}</Text>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.colDate}>Date</Text>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colAmt}>Amount</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={styles.colDate}>{r.date}</Text>
              <Text style={styles.colDesc}>{r.description}</Text>
              <Text style={styles.colAmt}>{r.signedAmount}</Text>
            </View>
          ))}
        </View>

        {rows.length === 0 ? (
          <Text style={{ marginTop: 12, color: "#6b7280" }}>No transactions in this period.</Text>
        ) : null}
      </Page>
    </Document>
  )
}
