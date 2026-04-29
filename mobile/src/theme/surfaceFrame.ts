import { StyleSheet, type ViewStyle } from 'react-native'
import type { Colors } from './colors'
import { shadows } from './shadows'

/** Matches `borderRadius['3xl']` — default raised section trays on canvas */
export const SURFACE_FRAME_RADIUS_DEFAULT = 24

export type SurfaceFrameShadow = 'none' | 'xs' | 'sm'

export type SurfaceFrameOptions = {
  /**
   * Default `'sm'` — same lift as More / Dashboard section trays.
   * Use `'none'` for inset fields (search bars) that sit flush on the canvas.
   */
  shadow?: SurfaceFrameShadow
  /** Default {@link SURFACE_FRAME_RADIUS_DEFAULT} */
  radius?: number
}

/**
 * Canonical “raised frame” shell: `frame` fill + hairline border + neutral shadow.
 * Use for section cards, trays, and hero plates — not for `semantic.card` inset rows.
 */
export function surfaceFrameStyle(c: Colors, options?: SurfaceFrameOptions): ViewStyle {
  const shadowKey = options?.shadow ?? 'sm'
  const radius = options?.radius ?? SURFACE_FRAME_RADIUS_DEFAULT
  const elevation = shadowKey === 'none' ? {} : shadows[shadowKey]

  return {
    backgroundColor: c.frame.background,
    borderRadius: radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.frame.border,
    ...elevation,
  }
}

export type SurfaceChromeCircleOptions = {
  /** Default `'xs'` — subtle lift on circular chrome */
  shadow?: 'none' | 'xs'
}

/**
 * Circular controls (back buttons, header icon wells) using the same frame tokens.
 */
export function surfaceChromeCircleStyle(
  c: Colors,
  size: number,
  options?: SurfaceChromeCircleOptions,
): ViewStyle {
  const r = size / 2
  const shadowKey = options?.shadow ?? 'xs'
  const elevation = shadowKey === 'none' ? {} : shadows[shadowKey]
  return {
    width: size,
    height: size,
    borderRadius: r,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.frame.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.frame.border,
    ...elevation,
  }
}
