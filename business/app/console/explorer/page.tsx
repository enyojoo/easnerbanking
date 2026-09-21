"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { EXPLORER_ENDPOINTS } from "@/lib/console/explorer-catalog"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { useCheckoutSettings } from "@/hooks/use-checkout-settings"
import { fetchWithSession } from "@/lib/fetch-with-session"

function groupByCapability() {
  const groups = new Map<string, typeof EXPLORER_ENDPOINTS>()
  for (const endpoint of EXPLORER_ENDPOINTS) {
    const list = groups.get(endpoint.capability) ?? []
    list.push(endpoint)
    groups.set(endpoint.capability, list)
  }
  return groups
}

export default function ConsoleExplorerPage() {
  const searchParams = useSearchParams()
  const { livemode } = useConsoleLivemode()
  const { data } = useCheckoutSettings()
  const keys = (data?.keys ?? []).filter((key) => key.mode === livemode)
  const [endpointId, setEndpointId] = useState(searchParams.get("endpoint") || EXPLORER_ENDPOINTS[0].id)
  const [keyId, setKeyId] = useState("")
  const [body, setBody] = useState(() => JSON.stringify(EXPLORER_ENDPOINTS[0].sampleBody ?? {}, null, 2))
  const [sending, setSending] = useState(false)
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const endpoint = EXPLORER_ENDPOINTS.find((e) => e.id === endpointId) ?? EXPLORER_ENDPOINTS[0]
  const groups = useMemo(() => groupByCapability(), [])

  useEffect(() => {
    const prefill = searchParams.get("endpoint")
    const objectId = searchParams.get("id")
    if (prefill && EXPLORER_ENDPOINTS.some((item) => item.id === prefill)) {
      setEndpointId(prefill)
      const next = EXPLORER_ENDPOINTS.find((item) => item.id === prefill)
      setBody(JSON.stringify({ ...(next?.sampleBody ?? {}), ...(objectId ? { id: objectId } : {}) }, null, 2))
    }
  }, [searchParams])

  useEffect(() => {
    if (!keyId && keys[0]) setKeyId(keys[0].id)
  }, [keyId, keys])

  const selectEndpoint = (id: string) => {
    setEndpointId(id)
    const next = EXPLORER_ENDPOINTS.find((e) => e.id === id)
    setBody(JSON.stringify(next?.sampleBody ?? {}, null, 2))
    setResponse(null)
    setError(null)
  }

  const send = async () => {
    setError(null)
    setResponse(null)
    if (!keyId) {
      setError("Create a key for this mode first.")
      return
    }
    let parsed: Record<string, unknown> = {}
    try {
      parsed = body.trim() ? (JSON.parse(body) as Record<string, unknown>) : {}
    } catch {
      setError("Request body must be JSON.")
      return
    }
    setSending(true)
    try {
      const res = await fetchWithSession("/api/platform/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId, endpointId, body: parsed }),
      })
      const text = await res.text()
      setResponse({ status: res.status, body: text })
    } catch {
      setError("Request failed.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <ConsolePageHeader title={PAGE_COPY.consoleExplorer.title} description={PAGE_COPY.consoleExplorer.intro} />

      <div className="space-y-1.5">
        <Label>Key</Label>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">Mint a {livemode} key in Settings. The secret stays hashed.</p>
        ) : (
          <Select value={keyId} onValueChange={setKeyId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a key" />
            </SelectTrigger>
            <SelectContent>
              {keys.map((key) => (
                <SelectItem key={key.id} value={key.id}>
                  {key.name || "Unnamed key"} · …{key.secret_key_last4}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Endpoint</Label>
        <Select value={endpointId} onValueChange={selectEndpoint}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...groups.entries()].map(([capability, endpoints]) => (
              <div key={capability}>
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{capability}</p>
                {endpoints.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.method} {e.path} — {e.description}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="explorer-body">{endpoint.method === "GET" && !endpoint.path.includes("{") ? "Query JSON (optional)" : "Request JSON"}</Label>
        <Textarea
          id="explorer-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="font-mono text-xs"
        />
      </div>

      <Button type="button" disabled={sending || !keyId} onClick={() => void send()}>
        {sending ? "Sending…" : "Send request"}
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {response ? (
        <div className="space-y-1.5">
          <Label>
            Response <span className="font-mono text-xs text-muted-foreground">HTTP {response.status}</span>
          </Label>
          <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
            <code>{response.body}</code>
          </pre>
        </div>
      ) : null}
    </div>
  )
}
