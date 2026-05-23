"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Upload, X, FileText, Loader2 } from "lucide-react"
import { uploadManualSendReceiptFile } from "@/lib/manual-send-receipt-upload"

type Props = {
  referenceCode: string
  onPathChange: (path: string | null) => void
  disabled?: boolean
}

export function ManualSendReceiptUpload({ referenceCode, onPathChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storedPath, setStoredPath] = useState<string | null>(null)

  const handlePick = async (picked: File | null) => {
    setError(null)
    setFile(picked)
    setStoredPath(null)
    onPathChange(null)

    if (!picked) return

    setUploading(true)
    const result = await uploadManualSendReceiptFile(referenceCode, picked)
    setUploading(false)

    if ("error" in result) {
      setError(result.error)
      setFile(null)
      return
    }

    setStoredPath(result.path)
    onPathChange(result.path)
  }

  const handleRemove = () => {
    setFile(null)
    setStoredPath(null)
    setError(null)
    onPathChange(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <Card className="bg-muted/30">
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-medium">Upload transfer receipt (optional)</p>

        {file ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm truncate">{file.name}</span>
              {uploading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
              {storedPath && !uploading && (
                <span className="text-xs text-muted-foreground shrink-0">Uploaded</span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={handleRemove}
              disabled={disabled || uploading}
              aria-label="Remove receipt"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => void handlePick(e.target.files?.[0] ?? null)}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
