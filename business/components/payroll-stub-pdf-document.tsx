import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"

export type PayrollStubPdfMeta = {
  businessName: string
  payeeName: string
  payeeEmail?: string | null
  personType: "employee" | "contractor"
  payPeriod: string
  paidAt: string
  amount: string
  currency: string
  rail: string
  transferEtid?: string | null
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
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
})

type Props = { meta: PayrollStubPdfMeta; logoUrl?: string }

export function PayrollStubPDFDocument({ meta, logoUrl = PDF_LOGO_DATA_URL }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Payment stub</Text>
            <Text style={styles.muted}>{meta.businessName}</Text>
          </View>
          {logoUrl ? <Image src={logoUrl} style={{ width: 48, height: 48 }} /> : null}
        </View>

        <Text style={styles.muted}>Paid to</Text>
        <Text style={{ fontSize: 14, fontWeight: "bold", marginBottom: 4 }}>{meta.payeeName}</Text>
        {meta.payeeEmail ? <Text style={styles.muted}>{meta.payeeEmail}</Text> : null}

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Type</Text>
            <Text>{meta.personType === "contractor" ? "Contractor" : "Employee"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Pay period</Text>
            <Text>{meta.payPeriod}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Paid on</Text>
            <Text>{meta.paidAt}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Payment method</Text>
            <Text>{meta.rail}</Text>
          </View>
          {meta.transferEtid ? (
            <View style={styles.row}>
              <Text style={styles.label}>Reference</Text>
              <Text>{meta.transferEtid}</Text>
            </View>
          ) : null}
          <Text style={styles.amount}>
            {meta.amount} {meta.currency}
          </Text>
        </View>

        <Text style={styles.disclaimer}>
          Easner moves money you instruct. Your employer remains responsible for employment and tax
          obligations. This stub is not a tax document.
        </Text>
      </Page>
    </Document>
  )
}
