import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { ImageResponse } from "next/og"

const OG_BASE_SIZE = { width: 1200, height: 630 } as const
const OG_SCALE = 2

export const OG_SIZE = {
  width: OG_BASE_SIZE.width * OG_SCALE,
  height: OG_BASE_SIZE.height * OG_SCALE,
} as const
export const OG_CONTENT_TYPE = "image/png"

function scale(px: number) {
  return px * OG_SCALE
}

const COLORS = {
  canvas: "#F6F3EB",
  ink: "#0F1110",
  muted: "#5F665F",
} as const

/**
 * Literal `import.meta.url` targets so the bundler copies these into the
 * serverless function. `readFile(join(__dirname, …))` misses them at runtime
 * even though file-convention OG images prerender the same assets at build.
 */
const FONT_UNBOUNDED = new URL("../../assets/og-fonts/unbounded-latin-700-normal.woff", import.meta.url)
const FONT_INTER = new URL("../../assets/og-fonts/inter-latin-400-normal.woff", import.meta.url)
const LOGO_PNG = new URL("../../assets/easner-logo.png", import.meta.url)

export interface OgImageContent {
  headline: string | string[]
  subhead?: string
}

async function loadAsset(url: URL, fallbackRel: string): Promise<Buffer> {
  try {
    return await readFile(fileURLToPath(url))
  } catch {
    // fall through
  }

  try {
    const res = await fetch(url)
    if (res.ok) return Buffer.from(await res.arrayBuffer())
  } catch {
    // fall through
  }

  const cwd = process.cwd()
  const candidates = [join(cwd, fallbackRel), join(cwd, "business", fallbackRel)]
  for (const path of candidates) {
    try {
      return await readFile(path)
    } catch {
      continue
    }
  }

  throw new Error(`OG asset not found: ${fallbackRel}`)
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

function normalizeHeadline(headline: string | string[]) {
  const lines = Array.isArray(headline) ? headline : [headline]
  return lines.map((line) => truncate(line.trim(), 42)).filter(Boolean).slice(0, 3)
}

type OgAssets = { unbounded: Buffer; inter: Buffer; logoSrc: string }

let ogAssetsPromise: Promise<OgAssets> | null = null

function loadOgAssets(): Promise<OgAssets> {
  if (!ogAssetsPromise) {
    ogAssetsPromise = Promise.all([
      loadAsset(FONT_UNBOUNDED, "assets/og-fonts/unbounded-latin-700-normal.woff"),
      loadAsset(FONT_INTER, "assets/og-fonts/inter-latin-400-normal.woff"),
      loadAsset(LOGO_PNG, "assets/easner-logo.png"),
    ]).then(([unbounded, inter, logo]) => ({
      unbounded,
      inter,
      logoSrc: `data:image/png;base64,${logo.toString("base64")}`,
    }))
  }
  return ogAssetsPromise
}

export async function createOgImage({ headline, subhead }: OgImageContent) {
  const { unbounded, inter, logoSrc } = await loadOgAssets()

  const logoHeight = scale(44)
  const logoWidth = Math.round(logoHeight * (2295 / 500))

  const headlineLines = normalizeHeadline(headline)
  const subheadText = subhead ? truncate(subhead, 130) : null

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: COLORS.canvas,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 18% 10%, rgba(0,122,204,0.12), transparent 32%), linear-gradient(180deg, #FFFFFF 0%, rgba(246,243,235,0) 75%)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            padding: `${scale(56)}px ${scale(72)}px`,
          }}
        >
          <img
            src={logoSrc}
            alt="Easner"
            width={logoWidth}
            height={logoHeight}
            style={{
              height: logoHeight,
              width: logoWidth,
              objectFit: "contain",
            }}
          />

          <div
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              justifyContent: "center",
              gap: scale(24),
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: scale(4) }}>
              {headlineLines.map((line, index) => (
                <div
                  key={`${index}-${line}`}
                  style={{
                    fontFamily: "Unbounded",
                    fontSize: scale(headlineLines.length > 1 ? 68 : 72),
                    fontWeight: 700,
                    lineHeight: 1.05,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: COLORS.ink,
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
            {subheadText ? (
              <div
                style={{
                  fontFamily: "Inter",
                  fontSize: scale(28),
                  lineHeight: 1.45,
                  color: COLORS.muted,
                  maxWidth: scale(920),
                }}
              >
                {subheadText}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Content-Type": OG_CONTENT_TYPE,
      },
      fonts: [
        { name: "Unbounded", data: unbounded, weight: 700, style: "normal" },
        { name: "Inter", data: inter, weight: 400, style: "normal" },
      ],
    },
  )
}
