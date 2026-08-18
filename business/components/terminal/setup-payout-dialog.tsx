"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { TerminalPayoutSetupPanel } from "@/components/terminal/terminal-payout-setup-panel"

export function SetupPayoutDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Setup payout
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg gap-0 p-6 sm:p-8">
        <TerminalPayoutSetupPanel active={open} variant="manage-default" embedded={false} />
      </DialogContent>
    </Dialog>
  )
}
