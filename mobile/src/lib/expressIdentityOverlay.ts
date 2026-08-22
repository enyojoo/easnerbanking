type OverlayHandlers =
  | (() => void)
  | {
      onOpen?: () => void
      onClosed: () => void
    }

export function watchExpressIdentityOverlay(_handlers: OverlayHandlers): () => void {
  return () => {}
}
