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
        <Button type="button" variant="outline" size="sm">
          Setup payout
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <TerminalPayoutSetupPanel active={open} variant="manage-default" embedded={false} />
      </DialogContent>
    </Dialog>
  )
}
