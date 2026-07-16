"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  buildYcMomoPhoneFromLocal,
  parseYcMomoLocalPhone,
  resolveYcMomoCallingCodeLabel,
  sanitizeYcMomoLocalPhoneInput,
} from "@easner/shared"

type YcMomoPhoneInputProps = {
  countryCode: string
  value: string
  onChange: (internationalPhone: string) => void
  id?: string
  placeholder?: string
  className?: string
}

export function YcMomoPhoneInput({
  countryCode,
  value,
  onChange,
  id,
  placeholder = "712345678",
  className,
}: YcMomoPhoneInputProps) {
  const prefix = resolveYcMomoCallingCodeLabel(countryCode) ?? "+"
  const [localPhone, setLocalPhone] = useState(() => parseYcMomoLocalPhone(value, countryCode))

  useEffect(() => {
    setLocalPhone(parseYcMomoLocalPhone(value, countryCode))
  }, [value, countryCode])

  const onLocalChange = (text: string) => {
    const cleaned = sanitizeYcMomoLocalPhoneInput(text)
    setLocalPhone(cleaned)
    onChange(buildYcMomoPhoneFromLocal(cleaned, countryCode))
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="shrink-0 rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium tabular-nums">
        {prefix}
      </div>
      <Input
        id={id}
        value={localPhone}
        onChange={(e) => onLocalChange(e.target.value)}
        inputMode="numeric"
        placeholder={placeholder}
        autoComplete="tel-national"
        className="flex-1"
      />
    </div>
  )
}
