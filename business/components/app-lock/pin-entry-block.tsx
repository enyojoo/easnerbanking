"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { PinDotsRow } from "./pin-dots-row"
import { PinKeypad } from "./pin-keypad"

function digitFromKeyboard(e: globalThis.KeyboardEvent): string | null {
  if (e.key.length === 1 && e.key >= "0" && e.key <= "9") return e.key
  const d = /^Digit([0-9])$/.exec(e.code)
  if (d) return d[1]
  const n = /^Numpad([0-9])$/.exec(e.code)
  if (n) return n[1]
  return null
}

function keyboardTargetIsTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const t = target.tagName
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT"
}

export function PinEntryBlock({
  pin,
  onChangePin,
  error,
  message,
  shake,
  disabled,
}: {
  pin: string
  onChangePin: (next: string) => void
  error?: string | null
  /** Rendered in the same slot as `error` when `error` is not present. */
  message?: ReactNode
  shake?: boolean
  disabled?: boolean
}) {
  const pinRef = useRef(pin)
  const disabledRef = useRef(!!disabled)
  const onChangePinRef = useRef(onChangePin)
  pinRef.current = pin
  disabledRef.current = !!disabled
  onChangePinRef.current = onChangePin

  const onDigit = (d: string) => {
    if (disabled || pin.length >= 4) return
    onChangePin(pin + d)
  }

  const onBackspace = () => {
    if (disabled || pin.length === 0) return
    onChangePin(pin.slice(0, -1))
  }

  useEffect(() => {
    const onDoc = (e: globalThis.KeyboardEvent) => {
      if (disabledRef.current) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (keyboardTargetIsTextField(e.target)) return

      const digit = digitFromKeyboard(e)
      if (digit !== null) {
        e.preventDefault()
        const p = pinRef.current
        if (p.length >= 4) return
        onChangePinRef.current(p + digit)
        return
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault()
        const p = pinRef.current
        if (p.length === 0) return
        onChangePinRef.current(p.slice(0, -1))
      }
    }
    document.addEventListener("keydown", onDoc)
    return () => document.removeEventListener("keydown", onDoc)
  }, [])

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className={cn(shake && "animate-pin-shake")}>
        <PinDotsRow filledLength={pin.length} />
      </div>
      <div className="min-h-5">
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : message ?? null}
      </div>
      <PinKeypad onDigit={onDigit} onBackspace={onBackspace} disabled={disabled} />
    </div>
  )
}
