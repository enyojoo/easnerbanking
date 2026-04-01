import { NextResponse } from "next/server"

const BACKEND_API_URL =
  process.env.OFFICE_BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3000"

async function forward(request: Request, params: { path: string[] }) {
  const incomingUrl = new URL(request.url)
  const joinedPath = params.path.join("/")
  const targetUrl = `${BACKEND_API_URL.replace(/\/$/, "")}/${joinedPath}${incomingUrl.search}`

  const outgoingHeaders = new Headers(request.headers)
  outgoingHeaders.delete("host")
  outgoingHeaders.delete("content-length")

  const method = request.method.toUpperCase()
  const hasBody = method !== "GET" && method !== "HEAD"
  const body = hasBody ? await request.arrayBuffer() : undefined

  const backendResponse = await fetch(targetUrl, {
    method,
    headers: outgoingHeaders,
    body,
    redirect: "manual",
  })

  const responseHeaders = new Headers(backendResponse.headers)
  responseHeaders.delete("content-encoding")
  responseHeaders.delete("transfer-encoding")

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: responseHeaders,
  })
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, await context.params)
}
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, await context.params)
}
export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, await context.params)
}
export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, await context.params)
}
export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, await context.params)
}
