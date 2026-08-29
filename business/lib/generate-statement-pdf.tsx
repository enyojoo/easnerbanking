import { renderToBuffer } from "@react-pdf/renderer"
import { StatementPDFDocument } from "@/components/statement-pdf-document"
import type { AssembledStatement } from "@/lib/statements/types"

export async function generateStatementPdfBuffer(doc: AssembledStatement): Promise<Buffer> {
  return renderToBuffer(<StatementPDFDocument doc={doc} />)
}
