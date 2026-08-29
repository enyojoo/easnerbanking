import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Font } from "@react-pdf/renderer"

/**
 * Literal `import.meta.url` targets so the bundler copies these into the
 * serverless function. Avoid `fileURLToPath` at module scope — webpack can
 * emit asset URLs that break during Next.js page-data collection.
 */
const FONT_REGULAR = new URL("../../assets/statement-fonts/Geist-Regular.ttf", import.meta.url)
const FONT_BOLD = new URL("../../assets/statement-fonts/Geist-Bold.ttf", import.meta.url)

let registered = false
let registerPromise: Promise<void> | null = null

async function loadFont(url: URL, fallbackRel: string): Promise<Buffer> {
  const candidates: string[] = []
  try {
    candidates.push(fileURLToPath(url))
  } catch {
    // webpack may emit a non-file URL; fall through to cwd copies
  }
  const cwd = process.cwd()
  candidates.push(join(cwd, fallbackRel), join(cwd, "business", fallbackRel))

  for (const path of candidates) {
    try {
      return await readFile(path)
    } catch {
      continue
    }
  }

  throw new Error(`Statement font not found: ${fallbackRel}`)
}

function fontDataUrl(buffer: Buffer): string {
  return `data:font/truetype;base64,${buffer.toString("base64")}`
}

/** Geist includes ₦ and other local-currency glyphs Helvetica drops. */
export async function registerStatementFonts(): Promise<void> {
  if (registered) return
  if (!registerPromise) {
    registerPromise = (async () => {
      const [regular, bold] = await Promise.all([
        loadFont(FONT_REGULAR, "assets/statement-fonts/Geist-Regular.ttf"),
        loadFont(FONT_BOLD, "assets/statement-fonts/Geist-Bold.ttf"),
      ])
      Font.register({
        family: "StatementSans",
        fonts: [
          { src: fontDataUrl(regular), fontWeight: 400 },
          { src: fontDataUrl(bold), fontWeight: 700 },
        ],
      })
      registered = true
    })()
  }
  await registerPromise
}
