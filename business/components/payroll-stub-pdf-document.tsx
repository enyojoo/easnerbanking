/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image does not accept the DOM alt prop. */
import { Document, Page, Text, View, Image, Link, StyleSheet } from "@react-pdf/renderer"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"

export type PayrollStubPdfMeta = {
  documentKind?: "pay_stub" | "payment_reversal"
  businessName: string
  businessLogoUrl?: string | null
  payeeName: string
  payeeEmail?: string | null
  payeeEasetag?: string | null
  residenceCountry?: string | null
  personType: "employee" | "contractor"
  payPeriodStart?: string | null
  payPeriodEnd?: string | null
  payday?: string | null
  paidAt: string
  amount: string
  currency: string
  rail: string
  maskedDestination?: string | null
  runName?: string | null
  payrollReference: string
  documentReference: string
  note?: string | null
  transferEtid?: string | null
}

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 64, fontSize: 10, fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  muted: { fontSize: 9, color: "#6F756F", marginBottom: 3 },
  section: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#E9E4D8" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  label: { color: "#6F756F" },
  amount: { fontSize: 16, fontWeight: "bold", marginTop: 8 },
  disclaimer: { fontSize: 8, color: "#6F756F", marginTop: 32, lineHeight: 1.4 },
  paidBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E7F6EC",
    color: "#176B3A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
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
  footerText: { fontSize: 9, color: "#6F756F" },
  footerLogo: { width: 90, height: 36, objectFit: "contain" },
})

type Props = { meta: PayrollStubPdfMeta; logoUrl?: string }

export function PayrollStubPDFDocument({ meta, logoUrl = PDF_LOGO_DATA_URL }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              {meta.documentKind === "payment_reversal"
                ? "Payroll payment reversal"
                : meta.personType === "contractor"
                  ? "Contractor payment stub"
                  : "Pay stub"}
            </Text>
            <Text style={styles.muted}>{meta.businessName}</Text>
            <Text style={styles.muted}>Document {meta.documentReference}</Text>
          </View>
          <View>
            {meta.businessLogoUrl ? (
              <Image src={meta.businessLogoUrl} style={{ width: 48, height: 48, objectFit: "contain", marginBottom: 8 }} />
            ) : null}
            <Text style={styles.paidBadge}>
              {meta.documentKind === "payment_reversal" ? "Reversed" : "Paid"}
            </Text>
          </View>
        </View>

        <Text style={styles.muted}>Paid to</Text>
        <Text style={{ fontSize: 14, fontWeight: "bold", marginBottom: 4 }}>{meta.payeeName}</Text>
        {meta.payeeEmail ? <Text style={styles.muted}>{meta.payeeEmail}</Text> : null}
        {meta.payeeEasetag ? <Text style={styles.muted}>@{meta.payeeEasetag.replace(/^@/, "")}</Text> : null}
        {meta.residenceCountry ? <Text style={styles.muted}>{meta.residenceCountry}</Text> : null}

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Type</Text>
            <Text>{meta.personType === "contractor" ? "Contractor" : "Employee"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Pay period</Text>
            <Text>
              {meta.payPeriodStart && meta.payPeriodEnd
                ? `${meta.payPeriodStart} – ${meta.payPeriodEnd}`
                : "Not specified"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Payday</Text>
            <Text>{meta.payday || meta.paidAt}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>
              {meta.documentKind === "payment_reversal" ? "Reversed on" : "Paid on"}
            </Text>
            <Text>{meta.paidAt}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Payment method</Text>
            <Text>{meta.maskedDestination ? `${meta.rail} · ${meta.maskedDestination}` : meta.rail}</Text>
          </View>
          {meta.runName ? (
            <View style={styles.row}>
              <Text style={styles.label}>Payroll run</Text>
              <Text>{meta.runName}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>Payroll reference</Text>
            <Text>{meta.payrollReference}</Text>
          </View>
          {meta.transferEtid ? (
            <View style={styles.row}>
              <Text style={styles.label}>Reference</Text>
              <Text>{meta.transferEtid}</Text>
            </View>
          ) : null}
          <Text style={styles.amount}>
            {meta.amount}
          </Text>
        </View>

        {meta.note ? <Text style={styles.disclaimer}>{meta.note}</Text> : null}
        <Text style={styles.disclaimer}>
          {meta.documentKind === "payment_reversal"
            ? "This document records the reversal of a payroll disbursement. It does not replace the original pay stub or constitute a tax document."
            : "Easner moves money you instruct. Your employer remains responsible for employment and tax obligations. This stub is not a tax document."}
        </Text>

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
