"use client"

import * as React from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * TreasuryStatCard – KPI tile for CFO-facing dashboards.
 *
 * Style intent: ivory plate, tabular figures, monochrome delta indicator.
 * Never uses bright red/green – deltas are expressed through direction + emerald.
 */
export interface TreasuryStatCardProps {
  label: string
  value: string | number
  unit?: string
  deltaPct?: number
  deltaLabel?: string
  helper?: string
  className?: string
}

export function TreasuryStatCard({
  label,
  value,
  unit,
  deltaPct,
  deltaLabel,
  helper,
  className,
}: TreasuryStatCardProps) {
  const direction =
    typeof deltaPct === 'number' ? (deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat') : undefined

  const DeltaIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus

  return (
    <Card elevation="soft" padding="none" className={cn('p-6', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        {direction ? (
          <div
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              direction === 'up' && 'bg-primary/10 text-primary',
              direction === 'down' && 'bg-muted text-muted-foreground',
              direction === 'flat' && 'bg-muted text-muted-foreground',
            )}
          >
            <DeltaIcon className="size-3 stroke-[1.75]" />
            {typeof deltaPct === 'number'
              ? `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(2)}%`
              : deltaLabel}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </span>
        {unit ? (
          <span className="text-sm font-medium text-muted-foreground">{unit}</span>
        ) : null}
      </div>

      {helper ? (
        <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </Card>
  )
}
