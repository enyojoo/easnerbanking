/** Web: decorative enter is always skipped (stack uses fade/instant). Avoid useRoute — PIN overlay renders outside navigator. */
export function useScreenDecorativeEnter(): { shouldAnimateEnter: boolean } {
  return { shouldAnimateEnter: false }
}
