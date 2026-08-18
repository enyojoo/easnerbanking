"use client"

import { useRef, useState } from "react"
import { Download, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PayrollSubpageShell } from "@/components/payroll/payroll-subpage-shell"
import { useImportPayrollPeople } from "@/hooks/mutations/use-payroll"

export default function ImportPayrollPeoplePage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const mutation = useImportPayrollPeople()
  const [result, setResult] = useState<{ imported: number; invalid: unknown[] } | null>(null)
  return <PayrollSubpageShell
    backHref="/payroll/people"
    backLabel="Back to People"
    section="People"
    current="Import"
    title="Import people"
    description="Upload a CSV to add payroll people in bulk. You can review readiness before creating a run."
  >
    <Card className="shadow-card"><CardContent className="p-6 sm:p-8">
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-4 font-semibold">Upload your people CSV</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Use the template so names, classifications, amounts, and receiving details are mapped correctly. Amounts use your Payroll source account currency.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="outline" asChild><a href="/api/business/payroll/people/import" download><Download className="mr-2 h-4 w-4" />Download template</a></Button>
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={mutation.isPending}>{mutation.isPending ? "Importing…" : "Choose CSV"}</Button>
        </div>
        <input ref={fileRef} className="hidden" type="file" accept=".csv,text/csv" onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          mutation.mutate(file, { onSuccess: (data) => { setResult(data); toast.success(`Imported ${data.imported} people`) }, onError: (error) => toast.error(error.message) })
          e.target.value = ""
        }} />
      </div>
      {result ? <div className="mt-6 rounded-xl bg-muted p-4 text-sm"><p className="font-medium">{result.imported} people imported</p><p className="mt-1 text-muted-foreground">{result.invalid.length ? `${result.invalid.length} rows need correction.` : "Every row was imported successfully."}</p></div> : null}
    </CardContent></Card>
  </PayrollSubpageShell>
}
