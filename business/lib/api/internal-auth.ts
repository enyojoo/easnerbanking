import { cronJobsEnabledOnThisProject } from "@/lib/api/cron-project"

export class CronDisabledOnProjectError extends Error {
  readonly code = "CRONS_DISABLED_ON_PROJECT" as const
  constructor() {
    super("Crons are disabled on this Vercel project (EASNER_CRONS_ENABLED=false)")
    this.name = "CronDisabledOnProjectError"
  }
}

/**
 * Shared secret for cron / workers (wallet provisioning, inbox replay batches).
 *
 * - `x-easner-internal-secret: <secret>` – manual / GitHub Actions / curl
 * - `Authorization: Bearer <secret>` – [Vercel Cron](https://vercel.com/docs/cron-jobs) when `CRON_SECRET` matches `EASNER_INTERNAL_CRON_SECRET`
 */
export function assertInternalCronAuthorized(request: Request): void {
  if (!cronJobsEnabledOnThisProject()) {
    throw new CronDisabledOnProjectError()
  }
  const secret = process.env.EASNER_INTERNAL_CRON_SECRET?.trim()
  if (!secret) {
    throw new Error("EASNER_INTERNAL_CRON_SECRET is not configured")
  }
  if (request.headers.get("x-easner-internal-secret") === secret) {
    return
  }
  const auth = request.headers.get("authorization")?.trim() ?? ""
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : ""
  if (bearer && bearer === secret) {
    return
  }
  throw new Error("Unauthorized")
}
