import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * `/auth/callback` should not render a UI route.
 *
 * We forward to `/dashboard` immediately while preserving search + hash so the
 * client auth layer can exchange the OAuth code or set the session.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=/dashboard${url.search}" />
    <title>Redirecting…</title>
  </head>
  <body>
    <script>
      (function () {
        try {
          var target = '/dashboard' + window.location.search + window.location.hash;
          window.location.replace(target);
        } catch (e) {
          window.location.href = '/dashboard' + (window.location.search || '');
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

