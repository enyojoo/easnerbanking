/**
 * @deprecated Product no longer overrides Noah bank processing_seconds.
 * Sync corridors from Noah instead:
 *   cd business && node --env-file=.env.local --import tsx scripts/apply-payout-corridor-schemas.ts
 * To fix rows previously patched to 50, run restore-noah-bank-processing-seconds.ts (includes ZA).
 */
console.error(
  "patch-gh-za-processing-seconds.ts is deprecated. Use apply-payout-corridor-schemas.ts or restore-noah-bank-processing-seconds.ts.",
)
process.exit(1)
