/**
 * Re-export for Metro/EAS – `@easner/shared/warm-flags` subpath breaks when babel aliases
 * `@easner/shared` to the package directory (resolves to `packages/shared/warm-flags`).
 */
export {
  warmBundledFlagCache,
  warmNativeCurrencyAssets,
} from '../../../packages/shared/src/flags/warm-flags.native'
