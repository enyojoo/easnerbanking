"use client"

import {
  NG_LOCAL_VERIFICATION_COPY,
  ngSupplementInlinePrompt,
  type NgLocalIdType,
} from "@easner/shared"
import { SETTINGS_NG_LOCAL_FLOW_HREF } from "@/lib/compliance/cutover-comms"
import { cn } from "@/lib/utils"

type Props = {
  /** IDs still needed – drives copy; link always opens the verification hub setup. */
  missingTypes: NgLocalIdType[]
  className?: string
}

export function NgLocalVerificationNotice({ missingTypes, className }: Props) {
  if (missingTypes.length === 0) return null

  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {ngSupplementInlinePrompt(missingTypes)}
      <a
        href={SETTINGS_NG_LOCAL_FLOW_HREF}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {NG_LOCAL_VERIFICATION_COPY.inlineLink}
      </a>
    </p>
  )
}
