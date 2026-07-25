import { renderToBuffer } from "@react-pdf/renderer"
import {
  PayrollStubPDFDocument,
  type PayrollStubPdfMeta,
} from "@/components/payroll-stub-pdf-document"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"

export async function generatePayrollStubPdfBuffer(meta: PayrollStubPdfMeta): Promise<Buffer> {
  return renderToBuffer(<PayrollStubPDFDocument meta={meta} logoUrl={PDF_LOGO_DATA_URL} />)
}
