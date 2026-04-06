import { PLACARD_TEMPLATE_VERSION, AUTOPAYOUT_PLACARD_BUCKET } from "./constants"

export { AUTOPAYOUT_PLACARD_BUCKET }

export function autopayoutPlacardObjectPaths(businessId: string, autopayoutId: string) {
  const base = `${businessId}/${autopayoutId}/v${PLACARD_TEMPLATE_VERSION}`
  return {
    png: `${base}/placard-hd.png`,
    pdf: `${base}/placard.pdf`,
  }
}
