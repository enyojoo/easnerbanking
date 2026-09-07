import type { ComponentProps, ComponentType, ReactNode } from "react"
import { Document, Page, Text, View, Image, StyleSheet, Link } from "@react-pdf/renderer"
import { STATEMENT_LOGO_DATA_URL } from "@/lib/statement-logo-base64"
import type { AssembledStatement, StatementActivityPdfRow } from "@/lib/statements/types"

const INK = "#1A1C1A"
const MUTED = "#6F756F"
const LINE = "#E9E4D8"
const ACCENT = "#007ACC"
const SUCCESS = "#0F8A5F"
const HEADER_FILL = "#F3F0E6"
const STRIPE_FILL = "#F8F6F0"
const ROW_LINE = "#EFECE2"

/**
 * The page must stay exactly A4 (595.28 x 841.89pt), so it wraps natively and
 * react-pdf paginates the activity table. Header and footer are absolutely
 * positioned `fixed` nodes, which means page padding has to reserve their bands
 * by hand — content would otherwise flow underneath them.
 */
const PAGE_PADDING_TOP = 32
const HEADER_BLOCK_HEIGHT = 71 // logo + issuer lines: the taller of the two header variants
const HEADER_GAP = 18
const FOOTER_BOTTOM = 24
const FOOTER_BLOCK_HEIGHT = 29 // rule + two lines of 7pt disclaimer
const FOOTER_GAP = 10

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING_TOP + HEADER_BLOCK_HEIGHT + HEADER_GAP,
    paddingBottom: FOOTER_BOTTOM + FOOTER_BLOCK_HEIGHT + FOOTER_GAP,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "StatementSans",
    color: INK,
  },
  header: {
    position: "absolute",
    top: PAGE_PADDING_TOP,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
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
    width: "33.33%",
    paddingRight: 8,
  },
  summaryValue: {
    fontSize: 11,
    fontFamily: "StatementSans",
    fontWeight: 700,
    marginBottom: 2,
  },
  /**
   * Borders live on the header and the rows, not on an outer shell — a bordered
   * wrapper split across pages leaves an empty stub and squared-off corners at
   * the break.
   */
  tableHeader: {
    flexDirection: "row",
    backgroundColor: HEADER_FILL,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: LINE,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
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
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderLeftColor: LINE,
    borderRightColor: LINE,
    borderBottomWidth: 1,
    borderBottomColor: ROW_LINE,
  },
  trStripe: {
    backgroundColor: STRIPE_FILL,
  },
  trLast: {
    borderBottomColor: LINE,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  colDate: { width: "16%" },
  colType: { width: "14%" },
  colDetails: { width: "38%" },
  colIn: { width: "16%", textAlign: "right" },
  colOut: { width: "16%", textAlign: "right" },
  amountBold: {
    fontFamily: "StatementSans",
    fontWeight: 700,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: FOOTER_BOTTOM,
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
})

/**
 * `ViewProps.render` in @react-pdf/types is typed `{ pageNumber }` only, but the
 * renderer passes `totalPages` too (see `resolvePageIndices` in
 * @react-pdf/layout). Narrow it here rather than threading `any` through JSX.
 */
type PageAwareRender = (props: { pageNumber: number; totalPages: number }) => ReactNode
const PageAwareView = View as ComponentType<
  Omit<ComponentProps<typeof View>, "render"> & { render?: PageAwareRender }
>

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

function ActivityRow({ row, index, last }: { row: StatementActivityPdfRow; index: number; last: boolean }) {
  return (
    <View
      wrap={false}
      style={[styles.tr, index % 2 === 1 ? styles.trStripe : {}, last ? styles.trLast : {}]}
    >
      <Text style={styles.colDate}>{row.date}</Text>
      <Text style={styles.colType}>{row.type}</Text>
      <Text style={styles.colDetails}>{row.details}</Text>
      <Text style={[styles.colIn, row.moneyIn ? styles.amountBold : {}]}>{row.moneyIn}</Text>
      <Text style={[styles.colOut, row.moneyOut ? styles.amountBold : {}]}>{row.moneyOut}</Text>
    </View>
  )
}

function EndNote() {
  return <Text style={styles.endNote}>End of statement</Text>
}

/**
 * Holds the end note so the last row and "End of statement" travel together in
 * one non-wrapping block — otherwise a table that ends flush with the bottom
 * margin leaves the note stranded alone on a final page.
 */
function ActivityTable({ rows }: { rows: StatementActivityPdfRow[] }) {
  const head = rows.slice(0, -1)
  const tail = rows.length > 0 ? rows[rows.length - 1] : null
  return (
    <View>
      {/* `fixed` repeats the column header on every page the table spills onto. */}
      <View style={styles.tableHeader} fixed>
        <Text style={[styles.th, styles.colDate]}>Date</Text>
        <Text style={[styles.th, styles.colType]}>Type</Text>
        <Text style={[styles.th, styles.colDetails]}>Details</Text>
        <Text style={[styles.th, styles.colIn]}>In</Text>
        <Text style={[styles.th, styles.colOut]}>Out</Text>
      </View>
      {head.map((row, i) => (
        <ActivityRow key={`${row.date}-${row.details}-${i}`} row={row} index={i} last={false} />
      ))}
      {tail ? (
        <View wrap={false}>
          <ActivityRow row={tail} index={rows.length - 1} last />
          <EndNote />
        </View>
      ) : (
        <EndNote />
      )}
    </View>
  )
}

/** Full issuer block on page 1, a one-line continuation label after that. */
function StatementHeader({ doc, continuation }: { doc: AssembledStatement; continuation: string }) {
  return (
    <PageAwareView
      style={styles.header}
      fixed
      render={({ pageNumber, totalPages }) => (
        <>
          <View>
            {pageNumber === 1 ? (
              <>
                <Image
                  src={STATEMENT_LOGO_DATA_URL}
                  style={{ width: 114, height: 25, objectFit: "contain" }}
                />
                <View style={styles.issuer}>
                  <Text style={styles.issuerName}>Easner Group, Inc.</Text>
                  <Text style={styles.muted}>584 Castro St, Suite 4092</Text>
                  <Text style={styles.muted}>San Francisco, CA 94114</Text>
                </View>
              </>
            ) : (
              <Text style={styles.muted}>{continuation}</Text>
            )}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Account statement</Text>
            <Text style={styles.statementId}>{doc.statementId}</Text>
            <Text style={styles.pagePill}>{`Page ${pageNumber} of ${totalPages}`}</Text>
          </View>
        </>
      )}
    />
  )
}

/** Disclaimer sits at the foot of the final page only, beside "End of statement". */
function StatementFooter() {
  return (
    <PageAwareView
      style={styles.footer}
      fixed
      render={({ pageNumber, totalPages }) =>
        pageNumber === totalPages ? (
          <>
            <View style={styles.footerRule} />
            <Text style={styles.footerText}>
              Easner Group, Inc. ("Easner") is a financial technology company, not a bank. Banking,
              payment, verification, and card services are provided by licensed partners. More here:{" "}
              <Link src="https://www.easner.com/terms" style={styles.footerLink}>
                easner.com/terms
              </Link>
            </Text>
          </>
        ) : null
      }
    />
  )
}

export function StatementPDFDocument({ doc }: { doc: AssembledStatement }) {
  const continuation = `${doc.holderName} · ${doc.currency} · ${doc.periodLabel}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <StatementHeader doc={doc} continuation={continuation} />
        <StatementFooter />
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
      </Page>
    </Document>
  )
}
