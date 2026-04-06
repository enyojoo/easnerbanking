/** Logical design size; HD PNG uses 2× export. */
export const PLACARD_LAYOUT_W = 1200
export const PLACARD_LAYOUT_H = 1800
export const PLACARD_PNG_EXPORT_SCALE = 2
export const PLACARD_HD_PNG_W = PLACARD_LAYOUT_W * PLACARD_PNG_EXPORT_SCALE
export const PLACARD_HD_PNG_H = PLACARD_LAYOUT_H * PLACARD_PNG_EXPORT_SCALE

/** PDF print size (points), 4×6 in @ 72pt/in — same 2∶3 aspect as PNG. */
export const PLACARD_PDF_W_PT = 288
export const PLACARD_PDF_H_PT = 432

export const AUTOPAYOUT_PLACARD_BUCKET = "autopayout-placards"

/** Bump when placard visual template changes (invalidates cached assets). */
export const PLACARD_TEMPLATE_VERSION = 1

export const AUTOPAYOUT_CTA_TEXT = "easner.com/autopayout"
