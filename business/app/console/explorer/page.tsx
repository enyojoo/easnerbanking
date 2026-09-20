"use client"

import { useMemo, useState } from "react"
import { APP_URLS } from "@easner/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ConsolePageHeader } from "@/components/console/console-page-header"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"
import { EXPLORER_ENDPOINTS } from "@/lib/console/explorer-catalog"

const API_ORIGIN = APP_URLS.api

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
  const [endpointId, setEndpointId] = useState(EXPLORER_ENDPOINTS[0].id)
  const [secretKey, setSecretKey] = useState("")
  const [body, setBody] = useState(() => JSON.stringify(EXPLORER_ENDPOINTS[0].sampleBody ?? {}, null, 2))
  const [sending, setSending] = useState(false)
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const endpoint = EXPLORER_ENDPOINTS.find((e) => e.id === endpointId) ?? EXPLORER_ENDPOINTS[0]
  const groups = useMemo(() => groupByCapability(), [])

  const selectEndpoint = (id: string) => {
    setEndpointId(id)
    const next = EXPLORER_ENDPOINTS.find((e) => e.id === id)
    setBody(JSON.stringify(next?.sampleBody ?? {}, null, 2))
    setResponse(null)
    setError(null)
  }

  const curl =
    endpoint.method === "GET"
      ? `curl ${API_ORIGIN}${endpoint.path} \\\n  -H "Authorization: Bearer ${secretKey || "easner_sk_test_..."}"`
      : `curl ${API_ORIGIN}${endpoint.path} \\\n  -H "Authorization: Bearer ${secretKey || "easner_sk_test_..."}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/\n\s*/g, " ")}'`

  const send = async () => {
    setError(null)
    setResponse(null)
    if (!secretKey.trim()) {
      setError("Paste a test secret key first — mint one on the API keys page.")
      return
    }
    setSending(true)
    try {
      const res = await fetch(`${API_ORIGIN}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${secretKey.trim()}`,
          ...(endpoint.method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        body: endpoint.method === "POST" ? body : undefined,
      })
      const text = await res.text()
      setResponse({ status: res.status, body: text })
    } catch {
      setError("Request failed — check the console for a CORS or network error.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <ConsolePageHeader title={PAGE_COPY.consoleExplorer.title} description={PAGE_COPY.consoleExplorer.intro} />

      <div className="space-y-1.5">
        <Label htmlFor="explorer-key">Your test secret key</Label>
        <Input
          id="explorer-key"
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          placeholder="sk_test_..."
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Never stored — only kept in this tab. Easner can&rsquo;t show you a secret key again after creation, so
          paste one you already have or mint a fresh one on the API keys page.
        </p>
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

      {endpoint.method === "POST" ? (
        <div className="space-y-1.5">
          <Label htmlFor="explorer-body">Request body</Label>
          <Textarea
            id="explorer-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
        </div>
      ) : null}

      <Button type="button" disabled={sending} onClick={() => void send()}>
        {sending ? "Sending…" : "Send request"}
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-1.5">
        <Label>Equivalent curl</Label>
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
          <code>{curl}</code>
        </pre>
      </div>

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
