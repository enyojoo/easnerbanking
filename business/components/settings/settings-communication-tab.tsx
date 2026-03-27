"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Mail } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export function SettingsCommunicationTab() {
  const { isLoading } = useAuth()
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Communication Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-14 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-14 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-14 w-full animate-pulse rounded-md bg-muted" />
            </div>
          ) : (
          <>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Product updates</Label>
              <p className="text-sm text-muted-foreground">Receive emails about new features and improvements</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Security alerts</Label>
              <p className="text-sm text-muted-foreground">Get notified about important security updates</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Marketing emails</Label>
              <p className="text-sm text-muted-foreground">News, tips, and promotional offers</p>
            </div>
            <Switch />
          </div>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
