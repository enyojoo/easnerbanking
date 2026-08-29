import { fileURLToPath } from "node:url"
import { Font } from "@react-pdf/renderer"

let registered = false

const REGULAR = fileURLToPath(
  new URL("../../assets/statement-fonts/Geist-Regular.ttf", import.meta.url),
)
const BOLD = fileURLToPath(
  new URL("../../assets/statement-fonts/Geist-Bold.ttf", import.meta.url),
)

/** Geist includes ₦ and other local-currency glyphs Helvetica drops. */
export function registerStatementFonts(): void {
  if (registered) return
  registered = true
  Font.register({
    family: "StatementSans",
    fonts: [
      { src: REGULAR, fontWeight: 400 },
      { src: BOLD, fontWeight: 700 },
    ],
  })
}
