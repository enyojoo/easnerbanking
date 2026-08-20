"use client"

/**
 * Easner chart primitives – executive, monochrome, expensive-looking.
 *
 * Use these wrappers for treasury dashboards, cash-flow charts, and balance
 * sparklines. They intentionally hide rainbow palettes, aggressive gridlines,
 * and "startup-demo" styling. One or two accent series only.
 */

import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 *  Shared chart token references (pulled from CSS variables)
 * ------------------------------------------------------------------ */

export const easnerChartColors = {
  emerald: 'hsl(var(--chart-1))',
  graphite: 'hsl(var(--chart-2))',
  stone: 'hsl(var(--chart-3))',
  amber: 'hsl(var(--chart-4))',
  slate: 'hsl(var(--chart-5))',
} as const

export const easnerChartAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: {
    fill: 'hsl(var(--muted-foreground))',
    fontSize: 11,
  },
} as const

function EasnerChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border/60 bg-card/95 px-3 py-2 shadow-[var(--shadow-card)] backdrop-blur-md">
      {label != null ? (
        <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {String(label)}
        </div>
      ) : null}
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-medium tabular-nums text-foreground">
              {typeof entry.value === 'number'
                ? entry.value.toLocaleString()
                : String(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  TreasuryAreaChart – soft emerald gradient on graphite baseline
 * ------------------------------------------------------------------ */

export interface TreasuryAreaChartProps {
  data: Array<Record<string, number | string>>
  xKey: string
  yKey: string
  className?: string
  height?: number
  formatYAxis?: (value: number) => string
}

export function TreasuryAreaChart({
  data,
  xKey,
  yKey,
  className,
  height = 240,
  formatYAxis,
}: TreasuryAreaChartProps) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="easner-area-emerald" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={easnerChartColors.emerald} stopOpacity={0.2} />
              <stop offset="100%" stopColor={easnerChartColors.emerald} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="hsl(var(--border))"
            strokeDasharray="4 4"
            strokeOpacity={0.45}
          />
          <XAxis dataKey={xKey} {...easnerChartAxisProps} dy={6} />
          <YAxis
            {...easnerChartAxisProps}
            width={56}
            tickFormatter={formatYAxis}
          />
          <Tooltip content={<EasnerChartTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={easnerChartColors.emerald}
            strokeWidth={1.5}
            fill="url(#easner-area-emerald)"
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  CashFlowBarChart – two-series bars (inflow graphite, outflow stone)
 * ------------------------------------------------------------------ */

export interface CashFlowBarChartProps {
  data: Array<Record<string, number | string>>
  xKey: string
  /** Series definitions – keep to 2 for executive clarity */
  series: Array<{ key: string; label: string; tone?: 'emerald' | 'graphite' | 'stone' | 'amber' }>
  className?: string
  height?: number
  formatYAxis?: (value: number) => string
}

export function CashFlowBarChart({
  data,
  xKey,
  series,
  className,
  height = 240,
  formatYAxis,
}: CashFlowBarChartProps) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: 4 }} barCategoryGap={18}>
          <CartesianGrid
            vertical={false}
            stroke="hsl(var(--border))"
            strokeDasharray="4 4"
            strokeOpacity={0.45}
          />
          <XAxis dataKey={xKey} {...easnerChartAxisProps} dy={6} />
          <YAxis
            {...easnerChartAxisProps}
            width={56}
            tickFormatter={formatYAxis}
          />
          <Tooltip content={<EasnerChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={easnerChartColors[s.tone ?? 'graphite']}
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  BalanceSparkline – inline trend line, no axes, minimal footprint
 * ------------------------------------------------------------------ */

export interface BalanceSparklineProps {
  data: Array<{ v: number }>
  /** 'positive' tints emerald, 'muted' tints slate, 'negative' tints oxblood */
  tone?: 'positive' | 'muted' | 'negative'
  className?: string
  height?: number
}

export function BalanceSparkline({
  data,
  tone = 'muted',
  className,
  height = 40,
}: BalanceSparklineProps) {
  const stroke =
    tone === 'positive'
      ? easnerChartColors.emerald
      : tone === 'negative'
        ? 'hsl(var(--destructive))'
        : easnerChartColors.slate

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
