import { renderToBuffer } from "@react-pdf/renderer"
import { StatementPDFDocument } from "@/components/statement-pdf-document"
import { registerStatementFonts } from "@/lib/statements/register-fonts"
import type { AssembledStatement } from "@/lib/statements/types"

export async function generateStatementPdfBuffer(doc: AssembledStatement): Promise<Buffer> {
  registerStatementFonts()
  return renderToBuffer(<StatementPDFDocument doc={doc} />)
}
