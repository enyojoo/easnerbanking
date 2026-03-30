"use client"

import { cn } from "@/lib/utils"
import { PinDotsRow } from "./pin-dots-row"
import { PinKeypad } from "./pin-keypad"

export function PinEntryBlock({
  pin,
  onChangePin,
  error,
  shake,
  disabled,
}: {
  pin: string
  onChangePin: (next: string) => void
  error?: string | null
  shake?: boolean
  disabled?: boolean
}) {
  const onDigit = (d: string) => {
    if (disabled || pin.length >= 4) return
    onChangePin(pin + d)
  }

  const onBackspace = () => {
    if (disabled || pin.length === 0) return
    onChangePin(pin.slice(0, -1))
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className={cn(shake && "animate-pin-shake")}>
        <PinDotsRow filledLength={pin.length} />
      </div>
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
      <PinKeypad onDigit={onDigit} onBackspace={onBackspace} disabled={disabled} />
    </div>
  )
}
