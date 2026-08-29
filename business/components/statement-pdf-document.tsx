import { Document, Page, Text, View, Image, StyleSheet, Link } from "@react-pdf/renderer"
import { STATEMENT_LOGO_DATA_URL } from "@/lib/statement-logo-base64"
import type { AssembledStatement } from "@/lib/statements/types"

const INK = "#1A1C1A"
const MUTED = "#6F756F"
const LINE = "#E9E4D8"
const ACCENT = "#007ACC"

const styles = StyleSheet.create({
  page: {
    paddingTop: 132,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  issuer: {
    marginTop: 8,
  },
  issuerName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  muted: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 1,
  },
  titleBlock: {
    alignItems: "flex-end",
  },
  title: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  statementId: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 4,
  },
  pagePill: {
    fontSize: 8,
    color: MUTED,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 7,
    color: MUTED,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  fieldValue: {
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    marginTop: 4,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    marginVertical: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridCell: {
    width: "50%",
    paddingRight: 12,
    paddingBottom: 10,
  },
  summaryRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  summaryCell: {
    width: "25%",
    paddingRight: 8,
  },
  summaryValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingBottom: 4,
    marginBottom: 2,
  },
  th: {
    fontSize: 7,
    color: MUTED,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#EFECE2",
    paddingVertical: 5,
  },
  colDate: { width: "16%" },
  colType: { width: "14%" },
  colDetails: { width: "38%" },
  colIn: { width: "16%", textAlign: "right" },
  colOut: { width: "16%", textAlign: "right" },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 24,
    textAlign: "center",
  },
  footerText: {
    fontSize: 7,
    color: MUTED,
    textAlign: "center",
    lineHeight: 1.4,
  },
  footerLink: {
    color: ACCENT,
    textDecoration: "none",
  },
  endNote: {
    marginTop: 14,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  continuation: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 10,
  },
})

function Field({ label, value }: { label: string; value?: string | null }) {
  const v = String(value ?? "").trim()
  if (!v) return null
  return (
    <View style={styles.gridCell}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{v}</Text>
    </View>
  )
}

function AccountBlock({ doc }: { doc: AssembledStatement }) {
  const bank = doc.bank
  return (
    <View>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.grid}>
        <Field label="Account holder" value={doc.holderName} />
        <Field label={doc.addressLabel} value={doc.address} />
        <Field label="Currency" value={doc.currency} />
        {bank?.accountNumber ? <Field label="Account number" value={bank.accountNumber} /> : null}
        {bank?.routingNumber ? <Field label="Routing number" value={bank.routingNumber} /> : null}
        {bank?.iban ? <Field label="IBAN" value={bank.iban} /> : null}
        {bank?.bic ? <Field label="BIC" value={bank.bic} /> : null}
        {bank?.bankName ? <Field label="Bank" value={bank.bankName} /> : null}
        {bank?.bankAddress ? <Field label="Bank address" value={bank.bankAddress} /> : null}
      </View>
    </View>
  )
}

function SummaryBlock({ doc }: { doc: AssembledStatement }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Summary</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{doc.openingLabel}</Text>
          <Text style={styles.fieldLabel}>Opening</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{doc.moneyInLabel}</Text>
          <Text style={styles.fieldLabel}>Money in</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{doc.moneyOutLabel}</Text>
          <Text style={styles.fieldLabel}>Money out</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryValue, { color: ACCENT }]}>{doc.availableLabel}</Text>
          <Text style={styles.fieldLabel}>Available</Text>
        </View>
      </View>
    </View>
  )
}

function ActivityTable({ rows }: { rows: AssembledStatement["lines"] }) {
  return (
    <View>
      <View style={styles.tableHeader} fixed>
        <Text style={[styles.th, styles.colDate]}>Date</Text>
        <Text style={[styles.th, styles.colType]}>Type</Text>
        <Text style={[styles.th, styles.colDetails]}>Details</Text>
        <Text style={[styles.th, styles.colIn]}>In</Text>
        <Text style={[styles.th, styles.colOut]}>Out</Text>
      </View>
      {rows.map((row, i) => (
        <View key={`${row.date}-${row.details}-${i}`} style={styles.tr} wrap={false}>
          <Text style={styles.colDate}>{row.date}</Text>
          <Text style={styles.colType}>{row.type}</Text>
          <Text style={styles.colDetails}>{row.details}</Text>
          <Text style={styles.colIn}>{row.moneyIn}</Text>
          <Text style={styles.colOut}>{row.moneyOut}</Text>
        </View>
      ))}
    </View>
  )
}

function Header({ statementId }: { statementId: string }) {
  return (
    <View style={styles.header} fixed>
      <View>
        <Image src={STATEMENT_LOGO_DATA_URL} style={{ width: 114, height: 25, objectFit: "contain" }} />
        <View style={styles.issuer}>
          <Text style={styles.issuerName}>Easner Group, Inc.</Text>
          <Text style={styles.muted}>584 Castro St, Suite 4092</Text>
          <Text style={styles.muted}>San Francisco, CA 94114</Text>
        </View>
      </View>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Account statement</Text>
        <Text style={styles.statementId}>{statementId}</Text>
        <Text
          style={styles.pagePill}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </View>
  )
}

function StatementFooter() {
  return (
    <View style={styles.footer} fixed>
      <View style={{ borderTopWidth: 1, borderTopColor: LINE, marginBottom: 8 }} />
      <Text style={styles.footerText}>
        Easner Group, Inc. ("Easner") is a financial technology company, not a bank. Banking,
        payment, verification, and card services are provided by licensed partners. More here:{" "}
        <Link src="https://www.easner.com/terms" style={styles.footerLink}>
          easner.com/terms
        </Link>
      </Text>
    </View>
  )
}

export function StatementPDFDocument({ doc }: { doc: AssembledStatement }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Header statementId={doc.statementId} />
        <View style={styles.metaRow}>
          <View>
            <Text style={styles.fieldLabel}>Period</Text>
            <Text style={styles.fieldValue}>{doc.periodLabel}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.fieldLabel}>Available as of</Text>
            <Text style={styles.fieldValue}>{doc.availableAsOfLabel}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <AccountBlock doc={doc} />
        <View style={styles.divider} />
        <SummaryBlock doc={doc} />
        <Text style={styles.sectionTitle}>Activity</Text>
        <ActivityTable rows={doc.lines} />
        <Text style={styles.endNote}>End of statement</Text>
        <StatementFooter />
      </Page>
    </Document>
  )
}
