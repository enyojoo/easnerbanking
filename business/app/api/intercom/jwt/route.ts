import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { intercomJwtPayloadFromUser } from "@/lib/intercom-user-attributes"
import { getUserFromApiRequest } from "@/lib/supabase/admin"

/**
 * Mints a short-lived Intercom Messenger JWT (HS256) for the signed-in user.
 * Secret: Intercom → Settings → Messenger → Security → Messenger API / JWT secret.
 * Never expose the secret to the client; only this token is returned.
 */
export async function GET(request: Request) {
  const secret = process.env.INTERCOM_MESSENGER_API_SECRET?.trim()
  if (!secret) {
    return NextResponse.json(
      { error: "Intercom Messenger API secret is not configured" },
      { status: 503 },
    )
  }

  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = intercomJwtPayloadFromUser(user)
  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: "1h",
  })

  return NextResponse.json({ token })
}
