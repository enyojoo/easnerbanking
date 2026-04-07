"use client"

import { Skeleton } from "@/components/ui/skeleton"

const ROWS = 6

const HEADER_LABELS = [
  "Created",
  "Ref",
  "Fiat",
  "Min. crypto",
  "Asset / network",
  "Status",
  "Actions",
]

export function TerminalSessionsTableSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[960px] table-fixed">
        <colgroup>
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead className="border-b">
          <tr>
            {HEADER_LABELS.map((label) => (
              <th
                key={label}
                className="p-4 text-left align-middle text-xs font-medium text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {Array.from({ length: ROWS }, (_, i) => (
            <tr key={i}>
              <td className="p-4 align-middle">
                <Skeleton className="h-4 w-24" />
              </td>
              <td className="p-4 align-middle">
                <Skeleton className="h-4 w-14" />
              </td>
              <td className="p-4 align-middle">
                <Skeleton className="h-4 w-20" />
              </td>
              <td className="p-4 align-middle">
                <Skeleton className="h-4 w-28" />
              </td>
              <td className="p-4 align-middle space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </td>
              <td className="p-4 align-middle">
                <Skeleton className="h-4 w-20" />
              </td>
              <td className="p-4 align-middle">
                <Skeleton className="h-4 w-16" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
