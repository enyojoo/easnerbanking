import { renderToBuffer } from "@react-pdf/renderer"
import { StatementPDFDocument, type StatementPdfMeta, type StatementPdfRow } from "@/components/statement-pdf-document"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"

export async function generateStatementPdfBuffer(
  meta: StatementPdfMeta,
  rows: StatementPdfRow[],
): Promise<Buffer> {
  return renderToBuffer(
    <StatementPDFDocument meta={meta} rows={rows} logoUrl={PDF_LOGO_DATA_URL} />,
  )
}
