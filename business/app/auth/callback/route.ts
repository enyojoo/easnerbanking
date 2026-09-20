import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getProductSwitchPath } from "@/lib/app-surface"
import {
  APP_SURFACE_COOKIE_NAME,
  parseAppSurfaceCookieValue,
} from "@/lib/app-surface-cookie"

/**
 * `/auth/callback` should not render a UI route.
 *
 * Forward to the last Banking / Dev home while preserving search + hash so the
 * client auth layer can exchange the OAuth code or set the session.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const home = getProductSwitchPath(
    parseAppSurfaceCookieValue(request.cookies.get(APP_SURFACE_COOKIE_NAME)?.value),
  )

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=${home}${url.search}" />
    <title>Redirecting…</title>
  </head>
  <body>
    <script>
      (function () {
        var home = ${JSON.stringify(home)};
        try {
          var target = home + window.location.search + window.location.hash;
          window.location.replace(target);
        } catch (e) {
          window.location.href = home + (window.location.search || '');
        }
      })();
    </script>
  </body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
