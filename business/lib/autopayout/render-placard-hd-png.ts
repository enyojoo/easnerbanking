import QRCode from "qrcode"
import sharp from "sharp"
import {
  PLACARD_HD_PNG_H,
  PLACARD_HD_PNG_W,
  AUTOPAYOUT_CTA_TEXT,
} from "./constants"
import { escSvg } from "./svg-escape"

export type RenderPlacardHdPngInput = {
  label: string | null
  assetTicker: string
  networkDisplay: string
  depositAddress: string
  depositMemo: string | null
  qrPayload: string
  /** Optional data URI or base64 without prefix for Easner Business logo */
  logoImageHref?: string | null
}

const W = PLACARD_HD_PNG_W
const H = PLACARD_HD_PNG_H

export async function renderAutopayPlacardHdPng(input: RenderPlacardHdPngInput): Promise<Buffer> {
  const qrBuf = await QRCode.toBuffer(input.qrPayload, {
    width: 920,
    margin: 2,
    errorCorrectionLevel: "H",
    type: "png",
    color: { dark: "#0F1110", light: "#F6F3EB" },
  })
  const qrB64 = qrBuf.toString("base64")

  const chip = `${input.assetTicker} · ${input.networkDisplay}`
  const addrLines = chunkAddress(input.depositAddress, 18)
  const addrTspans = addrLines
    .map((line, i) => {
      if (i === 0) {
        return `<tspan x="${W / 2}" y="1588">${escSvg(line)}</tspan>`
      }
      return `<tspan x="${W / 2}" dy="34">${escSvg(line)}</tspan>`
    })
    .join("")

  const logoBlock =
    input.logoImageHref ?
      `<image href="${escSvg(input.logoImageHref)}" x="140" y="${H - 120}" width="220" height="44" preserveAspectRatio="xMinYMid meet"/>`
    : ""

  const memoLine =
    input.depositMemo?.trim() ?
      `<text x="${W / 2}" y="2620" text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="24">Memo: ${escSvg(input.depositMemo.trim())}</text>`
    : ""

  const labelLine =
    input.label?.trim() ?
      `<text x="${W / 2}" y="2685" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="22">${escSvg(input.label.trim())}</text>`
    : ""

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1C201E"/>
      <stop offset="55%" style="stop-color:#151817"/>
      <stop offset="100%" style="stop-color:#0F1110"/>
    </linearGradient>
    <filter id="soft" x="-5%" y="-5%" width="110%" height="110%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" rx="48" ry="48" fill="url(#bg)"/>
  <text x="120" y="100" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="38" font-weight="600">We accept</text>
  <g transform="translate(1220, 58)">
    <rect x="0" y="0" width="112" height="56" rx="12" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
    <text x="56" y="38" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="26" font-weight="700">${escSvg(input.assetTicker)}</text>
  </g>
  <rect x="120" y="150" rx="18" ry="18" width="560" height="64" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
  <text x="400" y="192" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="28" font-weight="600">${escSvg(chip)}</text>
  <text x="${W / 2}" y="330" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="64" font-weight="800">Pay with Stablecoin</text>
  <text x="${W / 2}" y="420" text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="30">Scan the QR with your wallet on ${escSvg(input.networkDisplay)}</text>
  <rect x="${(W - 960) / 2}" y="500" width="960" height="960" rx="40" fill="#F6F3EB" filter="url(#soft)"/>
  <image href="data:image/png;base64,${qrB64}" x="${(W - 920) / 2}" y="520" width="920" height="920" preserveAspectRatio="xMidYMid meet"/>
  <text x="${W / 2}" y="1540" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="24" font-weight="600" letter-spacing="1">WALLET ADDRESS</text>
  <text text-anchor="middle" fill="rgba(255,255,255,0.9)" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="26" font-weight="500">${addrTspans}</text>
  ${memoLine}
  ${labelLine}
  <line x1="120" y1="${H - 160}" x2="${W - 120}" y2="${H - 160}" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
  <text x="140" y="${H - 118}" fill="rgba(255,255,255,0.55)" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="20" font-weight="600">POWERED BY</text>
  ${logoBlock}
  <text x="${W - 140}" y="${H - 130}" text-anchor="end" fill="rgba(255,255,255,0.55)" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="20">Want one of these?</text>
  <text x="${W - 140}" y="${H - 98}" text-anchor="end" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="22" font-weight="700">${escSvg(AUTOPAYOUT_CTA_TEXT)}</text>
</svg>`

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}

function chunkAddress(addr: string, chunk: number): string[] {
  const clean = addr.replace(/^0x/i, "0x")
  const parts: string[] = []
  for (let i = 0; i < clean.length; i += chunk) {
    parts.push(clean.slice(i, i + chunk))
  }
  return parts.length ? parts : [addr]
}
