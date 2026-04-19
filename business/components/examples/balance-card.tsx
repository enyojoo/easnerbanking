"use client"

import * as React from 'react'
import { ArrowUpRight, Eye, EyeOff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BalanceSparkline } from '@/components/charts/chart-primitives'
import { cn } from '@/lib/utils'

/**
 * BalanceCard — the hero balance moment on web.
 *
 * Design intent: private-bank, editorial, tactile.
 *   - Ivory surface in light, carbon in dark.
 *   - Amount rendered in Playfair Display (serif) with tabular figures.
 *   - Delta renders in emerald for positive, graphite for flat/negative.
 *   - No bright fintech colors, no rainbow gradients.
 */
export interface BalanceCardProps {
  label?: string
  amount: number
  currency?: string
  deltaPct?: number
  trend?: Array<{ v: number }>
  className?: string
  onHide?: () => void
  hidden?: boolean
  primaryAction?: { label: string; onClick: () => void }
}

const MASK = '••••••'

export function BalanceCard({
  label = 'Total balance',
  amount,
  currency = 'USD',
  deltaPct,
  trend,
  className,
  onHide,
  hidden = false,
  primaryAction,
}: BalanceCardProps) {
  const formatted = React.useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount),
    [amount, currency],
  )

  const deltaTone: 'positive' | 'muted' | 'negative' =
    typeof deltaPct === 'number'
      ? deltaPct > 0
        ? 'positive'
        : deltaPct < 0
          ? 'negative'
          : 'muted'
      : 'muted'

  return (
    <Card elevation="card" className={cn('gap-8', className)}>
      <div className="flex items-start justify-between px-8">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </span>
          {typeof deltaPct === 'number' ? (
            <Badge
              variant={deltaTone === 'positive' ? 'emerald' : deltaTone === 'negative' ? 'oxblood' : 'slate'}
            >
              {deltaPct > 0 ? '+' : ''}
              {deltaPct.toFixed(2)}%
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {onHide ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={hidden ? 'Show balance' : 'Hide balance'}
              onClick={onHide}
            >
              {hidden ? <Eye /> : <EyeOff />}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-8">
        <div className="font-serif text-[44px] leading-[52px] font-medium tracking-tight text-foreground tabular-nums">
          {hidden ? MASK : formatted}
        </div>
      </div>

      {trend && trend.length > 1 ? (
        <div className="px-8">
          <BalanceSparkline data={trend} tone={deltaTone} height={48} />
        </div>
      ) : null}

      {primaryAction ? (
        <div className="flex items-center justify-between border-t border-border/60 px-8 pt-6">
          <span className="text-xs text-muted-foreground">30-day view</span>
          <Button variant="primary" size="sm" onClick={primaryAction.onClick}>
            {primaryAction.label}
            <ArrowUpRight />
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
