import { Document, Page, Text, View, Image, StyleSheet, Link } from "@react-pdf/renderer"
import { STATEMENT_LOGO_DATA_URL } from "@/lib/statement-logo-base64"
import { chunkStatementActivityPages } from "@/lib/statements/paginate"
import type { AssembledStatement, StatementActivityPdfRow } from "@/lib/statements/types"

const INK = "#1A1C1A"
const MUTED = "#6F756F"
const LINE = "#E9E4D8"
const ACCENT = "#007ACC"
const SUCCESS = "#0F8A5F"
const HEADER_FILL = "#F3F0E6"
const STRIPE_FILL = "#F8F6F0"
const ROW_LINE = "#EFECE2"

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "StatementSans",
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
    fontFamily: "StatementSans",
    fontWeight: 700,
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
    fontFamily: "StatementSans",
    fontWeight: 700,
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
    fontSize: 8,
    color: MUTED,
    fontFamily: "StatementSans",
    fontWeight: 700,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 9,
    fontFamily: "StatementSans",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "StatementSans",
    fontWeight: 700,
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
    fontFamily: "StatementSans",
    fontWeight: 700,
    marginBottom: 2,
  },
  tableShell: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: HEADER_FILL,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  th: {
    fontSize: 8,
    color: MUTED,
    fontFamily: "StatementSans",
    fontWeight: 700,
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: ROW_LINE,
  },
  trStripe: {
    backgroundColor: STRIPE_FILL,
  },
  trLast: {
    borderBottomWidth: 0,
  },
  colDate: { width: "16%" },
  colType: { width: "14%" },
  colDetails: { width: "38%" },
  colIn: { width: "16%", textAlign: "right" },
  colOut: { width: "16%", textAlign: "right" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: "center",
  },
  footerRule: {
    width: "58%",
    borderTopWidth: 1,
    borderTopColor: LINE,
    marginBottom: 8,
  },
  footerText: {
    width: "58%",
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
    fontFamily: "StatementSans",
    fontWeight: 700,
    fontSize: 9,
  },
  continuation: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 12,
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
          <Text style={[styles.summaryValue, { color: SUCCESS }]}>{doc.availableLabel}</Text>
          <Text style={styles.fieldLabel}>Available</Text>
        </View>
      </View>
    </View>
  )
}

function ActivityTable({ rows }: { rows: StatementActivityPdfRow[] }) {
  return (
    <View style={styles.tableShell}>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, styles.colDate]}>Date</Text>
        <Text style={[styles.th, styles.colType]}>Type</Text>
        <Text style={[styles.th, styles.colDetails]}>Details</Text>
        <Text style={[styles.th, styles.colIn]}>In</Text>
        <Text style={[styles.th, styles.colOut]}>Out</Text>
      </View>
      {rows.map((row, i) => {
        const last = i === rows.length - 1
        return (
          <View
            key={`${row.date}-${row.details}-${i}`}
            wrap={false}
            style={[
              styles.tr,
              i % 2 === 1 ? styles.trStripe : {},
              last ? styles.trLast : {},
            ]}
          >
            <Text style={styles.colDate}>{row.date}</Text>
            <Text style={styles.colType}>{row.type}</Text>
            <Text style={styles.colDetails}>{row.details}</Text>
            <Text style={styles.colIn}>{row.moneyIn}</Text>
            <Text style={styles.colOut}>{row.moneyOut}</Text>
          </View>
        )
      })}
    </View>
  )
}

function Header({ statementId, pageLabel }: { statementId: string; pageLabel: string }) {
  return (
    <View style={styles.header}>
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
        <Text style={styles.pagePill}>{pageLabel}</Text>
      </View>
    </View>
  )
}

function StatementFooter() {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerRule} />
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
  const pages = chunkStatementActivityPages(doc.lines)
  const totalPages = pages.length
  const continuation = `${doc.holderName} · ${doc.currency} · ${doc.periodLabel}`

  return (
    <Document>
      {pages.map((rows, pageIndex) => {
        const isFirst = pageIndex === 0
        const isLast = pageIndex === totalPages - 1
        return (
          <Page key={`statement-page-${pageIndex}`} size="A4" style={styles.page} wrap={false}>
            <Header
              statementId={doc.statementId}
              pageLabel={`Page ${pageIndex + 1} of ${totalPages}`}
            />
            {isFirst ? (
              <>
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
              </>
            ) : (
              <Text style={styles.continuation}>{continuation}</Text>
            )}
            <ActivityTable rows={rows} />
            {isLast ? <Text style={styles.endNote}>End of statement</Text> : null}
            <StatementFooter />
          </Page>
        )
      })}
    </Document>
  )
}
