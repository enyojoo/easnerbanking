"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface OtpCodeInputProps {
  id?: string
  label?: string
  length?: number
  value: string
  onChange: (digits: string) => void
  autoFocus?: boolean
  disabled?: boolean
  className?: string
  /** Applied to the box row container */
  boxesClassName?: string
}

/**
 * Single hidden input over digit boxes (same pattern as {@link PinDialog}).
 * Digits are visible in each box; suitable for TOTP / SMS OTP.
 */
export function OtpCodeInput({
  id = "otp-code",
  label,
  length = 6,
  value,
  onChange,
  autoFocus,
  disabled,
  className,
  boxesClassName,
}: OtpCodeInputProps) {
  const digits = value.replace(/\D/g, "").slice(0, length)
  /** Next slot while typing; last cell when full — avoids “no highlight” jitter at 6 digits. */
  const activeIndex = Math.min(digits.length, length - 1)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value.replace(/\D/g, "").slice(0, length))
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <div className={cn("relative flex justify-center gap-2 sm:gap-2.5", boxesClassName)}>
        {Array.from({ length }, (_, i) => (
          <div
            key={i}
            className={cn(
              "box-border flex h-12 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-solid bg-background transition-colors duration-150 sm:h-12 sm:w-11",
              activeIndex === i ? "border-primary" : "border-input",
            )}
            aria-hidden
          >
            <span className="pointer-events-none block min-h-[1.25rem] w-full text-center text-xl font-semibold tabular-nums leading-none tracking-normal text-foreground">
              {digits[i] ?? ""}
            </span>
          </div>
        ))}
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          name="one-time-code"
          maxLength={length}
          value={digits}
          onChange={handleChange}
          disabled={disabled}
          className="absolute inset-0 h-full w-full cursor-text text-transparent caret-transparent opacity-0 outline-none ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:!opacity-0 disabled:cursor-not-allowed"
          autoFocus={autoFocus}
          aria-label={label ? undefined : "One-time code"}
          spellCheck={false}
        />
      </div>
    </div>
  )
}
