"use client"

import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCommercialMetrics } from "@/hooks/use-commercial-metrics"

export default function CommercialMetricsPage() {
  const { metrics, loading, error, refresh } = useCommercialMetrics()

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Commercial Metrics</h1>
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading metrics...</p>
        ) : metrics ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Gross Revenue ({metrics.window})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.metrics.grossRevenue.toFixed(2)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Take Rate (BPS)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.metrics.takeRateBps.toFixed(2)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Contribution Margin Proxy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.metrics.contributionMarginProxy.toFixed(2)}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Failed Transfer Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold">{(metrics.metrics.failedTransferRate * 100).toFixed(2)}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Requote/Expired Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold">{(metrics.metrics.requoteOrExpiredRate * 100).toFixed(2)}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Webhook Failure Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold">{(metrics.metrics.webhookFailureRate * 100).toFixed(2)}%</div>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Strategy Mode Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.entries(metrics.strategy?.strategyModeCounts || {}).length ? (
                    <ul className="space-y-1 text-sm">
                      {Object.entries(metrics.strategy?.strategyModeCounts || {}).map(([mode, count]) => (
                        <li key={mode}>
                          {mode}: <span className="font-semibold">{count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No strategy data yet.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Repricing Reasons</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.entries(metrics.strategy?.repricingReasonCounts || {}).length ? (
                    <ul className="space-y-1 text-sm">
                      {Object.entries(metrics.strategy?.repricingReasonCounts || {}).map(([reason, count]) => (
                        <li key={reason}>
                          {reason}: <span className="font-semibold">{count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No repricing data yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Margin by Amount Band</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.entries(metrics.strategy?.marginByAmountBand || {}).length ? (
                    <ul className="space-y-1 text-sm">
                      {Object.entries(metrics.strategy?.marginByAmountBand || {}).map(([band, data]) => (
                        <li key={band}>
                          {band}: <span className="font-semibold">{data.netRevenue.toFixed(2)}</span> ({data.count})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No amount-band margin data yet.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Margin by Corridor</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.entries(metrics.strategy?.marginByCorridor || {}).length ? (
                    <ul className="space-y-1 text-sm">
                      {Object.entries(metrics.strategy?.marginByCorridor || {})
                        .slice(0, 8)
                        .map(([corridor, data]) => (
                          <li key={corridor}>
                            {corridor}: <span className="font-semibold">{data.netRevenue.toFixed(2)}</span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No corridor margin data yet.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Conversion by Strategy</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.entries(metrics.strategy?.conversionByStrategyMode || {}).length ? (
                    <ul className="space-y-1 text-sm">
                      {Object.entries(metrics.strategy?.conversionByStrategyMode || {}).map(([mode, pct]) => (
                        <li key={mode}>
                          {mode}: <span className="font-semibold">{(pct * 100).toFixed(2)}%</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No strategy conversion data yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Alert Flags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  Webhook retry exhaustion risk: <span className="font-semibold">{String(metrics.alerts?.webhookRetryExhaustionRisk ?? false)}</span>
                </p>
                <p>
                  Margin compression risk: <span className="font-semibold">{String(metrics.alerts?.marginCompressionRisk ?? false)}</span>
                </p>
                <p>
                  Requote spike risk: <span className="font-semibold">{String(metrics.alerts?.requoteSpikeRisk ?? false)}</span>
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No metrics available.</p>
        )}
      </div>
    </OfficeDashboardLayout>
  )
}
