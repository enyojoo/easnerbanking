/**
 * Default Pressable android_ripple configs for consistent Android feedback.
 */
export const ripple = {
  neutral: { color: 'rgba(0, 0, 0, 0.1)', borderless: false as const },
  primaryTint: { color: 'rgba(0, 122, 204, 0.14)', borderless: false as const },
  /** Pairs with `semantic.destructive` (`#DC2626`) — delete / irreversible confirms. */
  destructiveTint: { color: 'rgba(220, 38, 38, 0.22)', borderless: false as const },
  strong: { color: 'rgba(0, 0, 0, 0.14)', borderless: false as const },
  /** White ripple on the blue hero gradient (e.g. eye toggle, send button). */
  heroOnDark: { color: 'rgba(255, 255, 255, 0.18)', borderless: false as const },
  /** Subtle dark ripple for white pills sitting on the blue hero gradient (e.g. Receive). */
  heroOnLight: { color: 'rgba(0, 0, 0, 0.08)', borderless: false as const },
}
