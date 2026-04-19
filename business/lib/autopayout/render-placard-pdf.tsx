import { Document, Page, View, Text, Image, Link, StyleSheet } from "@react-pdf/renderer"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"
import {
  PLACARD_PDF_W_PT,
  PLACARD_PDF_H_PT,
  AUTOPAYOUT_CTA_TEXT,
} from "./constants"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"
import type { RenderPlacardHdPngInput } from "./render-placard-hd-png"

const CTA_HREF = `https://${AUTOPAYOUT_CTA_TEXT}`

const styles = StyleSheet.create({
  page: {
    width: PLACARD_PDF_W_PT,
    height: PLACARD_PDF_H_PT,
    backgroundColor: "#0F1110",
    fontFamily: "Helvetica",
    color: "#F6F3EB",
    paddingTop: 18,
    paddingHorizontal: 22,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  weAccept: {
    fontSize: 11,
    fontWeight: "bold",
  },
  chipAsset: {
    fontSize: 9,
    fontWeight: "bold",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    color: "#ffffff",
  },
  chipRow: {
    alignSelf: "center",
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chipRowText: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    color: "#ffffff",
  },
  hero: {
    fontSize: 19,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
    color: "#ffffff",
  },
  sub: {
    fontSize: 9,
    textAlign: "center",
    color: "rgba(255,255,255,0.8)",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  qrWrap: {
    alignSelf: "center",
    marginBottom: 14,
    padding: 8,
    backgroundColor: "#F6F3EB",
    borderRadius: 12,
  },
  qr: {
    width: 188,
    height: 188,
  },
  addrLabel: {
    fontSize: 8,
    fontWeight: "bold",
    letterSpacing: 1,
    textAlign: "center",
    color: "rgba(255,255,255,0.65)",
    marginBottom: 4,
  },
  addrLine: {
    fontSize: 8,
    fontFamily: "Courier",
    textAlign: "center",
    color: "rgba(255,255,255,0.9)",
    marginBottom: 2,
  },
  memo: {
    fontSize: 8,
    textAlign: "center",
    color: "rgba(255,255,255,0.75)",
    marginTop: 8,
  },
  labelLine: {
    fontSize: 8,
    textAlign: "center",
    color: "rgba(255,255,255,0.65)",
    marginTop: 4,
  },
  footerRule: {
    marginTop: "auto",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.35)",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  poweredLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.55)",
    marginBottom: 4,
  },
  logo: {
    width: 88,
    height: 18,
    objectFit: "contain",
  },
  footerRight: {
    alignItems: "flex-end",
  },
  want: {
    fontSize: 7,
    color: "rgba(255,255,255,0.55)",
    marginBottom: 2,
  },
  cta: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#ffffff",
  },
})

function chunkAddress(addr: string, chunk: number): string[] {
  const clean = addr.replace(/^0x/i, "0x")
  const parts: string[] = []
  for (let i = 0; i < clean.length; i += chunk) {
    parts.push(clean.slice(i, i + chunk))
  }
  return parts.length ? parts : [addr]
}

type PlacardPdfDocProps = RenderPlacardHdPngInput & { qrDataUrl: string; logoUrl: string }

function AutopayPlacardPdfDocument(props: PlacardPdfDocProps) {
  const chip = `${props.assetTicker} · ${props.networkDisplay}`
  const lines = chunkAddress(props.depositAddress, 18)

  return (
    <Document>
      <Page size={[PLACARD_PDF_W_PT, PLACARD_PDF_H_PT]} style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.weAccept}>We accept</Text>
          <Text style={styles.chipAsset}>{props.assetTicker}</Text>
        </View>
        <View style={styles.chipRow}>
          <Text style={styles.chipRowText}>{chip}</Text>
        </View>
        <Text style={styles.hero}>Pay with Stablecoin</Text>
        <Text style={styles.sub}>
          Scan the QR with your wallet on {props.networkDisplay}
        </Text>
        <View style={styles.qrWrap}>
          <Image src={props.qrDataUrl} style={styles.qr} />
        </View>
        <Text style={styles.addrLabel}>WALLET ADDRESS</Text>
        {lines.map((line, i) => (
          <Text key={i} style={styles.addrLine}>
            {line}
          </Text>
        ))}
        {props.depositMemo?.trim() ?
          <Text style={styles.memo}>Memo: {props.depositMemo.trim()}</Text>
        : null}
        {props.label?.trim() ?
          <Text style={styles.labelLine}>{props.label.trim()}</Text>
        : null}
        <View style={styles.footerRule}>
          <View>
            <Text style={styles.poweredLabel}>POWERED BY</Text>
            <Image src={props.logoUrl} style={styles.logo} />
          </View>
          <View style={styles.footerRight}>
            <Text style={styles.want}>Want one of these?</Text>
            <Link src={CTA_HREF}>
              <Text style={styles.cta}>{AUTOPAYOUT_CTA_TEXT}</Text>
            </Link>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function renderAutopayPlacardPdfBuffer(input: RenderPlacardHdPngInput): Promise<Buffer> {
  const qrBuf = await QRCode.toBuffer(input.qrPayload, {
    width: 760,
    margin: 2,
    errorCorrectionLevel: "H",
    type: "png",
    color: { dark: "#0F1110", light: "#F6F3EB" },
  })
  const qrDataUrl = `data:image/png;base64,${qrBuf.toString("base64")}`
  const logoUrl = input.logoImageHref?.trim() || PDF_LOGO_DATA_URL

  return renderToBuffer(
    <AutopayPlacardPdfDocument {...input} qrDataUrl={qrDataUrl} logoUrl={logoUrl} />,
  )
}
